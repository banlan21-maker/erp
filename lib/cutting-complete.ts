/**
 * 절단 완료/복원 side-effect — complete(PATCH·POST 백필) / restore(DELETE) 공용 로직.
 *
 * 모든 DB 변이는 호출자가 넘긴 트랜잭션 클라이언트(tx)로 수행되어 호출 트랜잭션과
 * 원자적으로 묶인다. (PATCH action="complete", POST 백필완료, DELETE, 돌발삭제에서 재사용)
 */

import type { Prisma } from "@prisma/client";
import { syncDrawingListBySpec, syncDrawingListBySpecs } from "@/lib/sync-drawing-spec";
import { syncProjectStatus } from "@/lib/sync-project-status";

type Tx = Prisma.TransactionClient;

interface CompleteLog {
  id: string;
  drawingListId: string | null;
  drawingNo: string | null;
  projectId: string | null;
  heatNo: string | null;
  selectedHeatId: string | null;
  material: string | null;
  thickness: number | null;
  width: number | null;
  length: number | null;
  endAt: Date | null;
  isUrgent: boolean;
  urgentWorkId: string | null;
}

/**
 * 절단 완료 부작용 — CuttingLog.status 가 이미 COMPLETED 로 세팅된 뒤 호출.
 * DrawingList CUT / SteelPlan 소진 / SteelPlanHeat CUT / 잔재 EXHAUSTED / sync 를 tx 로 수행.
 */
export async function applyCuttingComplete(tx: Tx, log: CompleteLog): Promise<void> {
  // ── DrawingList 상태 CUT으로 변경 + 사용 정보 추출 ────────────────────
  let targetDrawing: {
    id: string;
    block: string | null;
    alternateVesselCode: string | null;
    assignedRemnantId: string | null;
    assignedRemnant: { type: string } | null;
  } | null = null;
  {
    const drawSelect = {
      id: true, block: true, alternateVesselCode: true, assignedRemnantId: true,
      assignedRemnant: { select: { type: true } },
    } as const;
    // 작업자가 실제 선택한 행(drawingListId) 우선 — drawingNo 가 없거나 동일 drawingNo 다수행이어도 정확.
    // 그 행이 없거나 이미 CUT 이면 projectId+drawingNo 첫 WAITING 행으로 폴백(레거시 호환).
    let target = log.drawingListId
      ? await tx.drawingList.findFirst({ where: { id: log.drawingListId, status: "WAITING" }, select: drawSelect })
      : null;
    if (!target && log.drawingNo && log.projectId) {
      target = await tx.drawingList.findFirst({
        where: { projectId: log.projectId, drawingNo: log.drawingNo, status: "WAITING" },
        orderBy: { createdAt: "asc" },
        select: drawSelect,
      });
    }
    if (target) {
      targetDrawing = target;
      await tx.drawingList.update({
        where: { id: target.id },
        data: {
          status: "CUT",
          ...(log.heatNo?.trim() ? { heatNo: log.heatNo.trim() } : {}),
        },
      });
      await tx.cuttingLog.update({
        where: { id: log.id },
        data: { drawingListId: target.id },
      });
      // 잔재(등록/여유/현장) 사용 절단이면 잔재 상태 → EXHAUSTED (타입 무관, 여유원재 포함).
      // 단 출고선별(shipoutMarkedAt)된 잔재는 소진하지 않음 — 절단↔출고 상호배제(원판과 대칭, 이중사용 방지).
      if (target.assignedRemnantId) {
        await tx.remnant.updateMany({
          where: { id: target.assignedRemnantId, shipoutMarkedAt: null },
          data:  { status: "EXHAUSTED" },
        });
      }
      // 이 도면에서 발생한 등록잔재에 원판 판번호 전파 (원재 → 등록잔재 판번호 연속)
      if (log.heatNo?.trim()) {
        await tx.remnant.updateMany({
          where: { drawingListId: target.id, type: "REGISTERED" },
          data:  { heatNo: log.heatNo.trim() },
        });
      }
    }
  }

  // ── 프로젝트 조회 (SteelPlan + SteelPlanHeat 양쪽에서 사용) ────────────
  let project: { projectCode: string } | null = null;
  if (log.projectId) {
    project = await tx.project.findUnique({
      where: { id: log.projectId },
      select: { projectCode: true },
    });
  }

  // ── SteelPlanHeat 상태 → CUT ───────────────────────────────────────
  // 동일 heatNo 가 여러 호선에 있을 수 있으므로 spec 필터 필수. 호선은 effectiveVessel 을
  // "우선" 으로만 쓴다 — 잠금으로 쓰면 호선 유용 시 아무 판도 소진 못 한다(아래 ② 참고).
  const effectiveVessel = targetDrawing?.alternateVesselCode?.trim() || project?.projectCode;
  // 잔재(등록/현장/여유) 사용 절단은 정규원재(SteelPlan/SteelPlanHeat)를 건드리지 않음 — 여유원재는 아래 전용 블록에서 처리
  if (!targetDrawing?.assignedRemnantId) {
    let consumedHeatId: string | null = null;
    // ★ P1: 현장에서 목록에서 고른 바로 그 판번호(재고 id)를 정확히 소진 — 글자대조 없음(타호선·오타·중복 무관).
    if (log.selectedHeatId) {
      const picked = await tx.steelPlanHeat.findFirst({
        where: { id: log.selectedHeatId, status: "WAITING" },
        select: { id: true },
      });
      if (picked) {
        await tx.steelPlanHeat.update({
          where: { id: picked.id },
          data:  { status: "CUT", cutAt: log.endAt ?? new Date() },
        });
        consumedHeatId = picked.id;
      }
    }
    // 폴백 — selectedHeatId 가 없거나(레거시/직접입력) 이미 소진돼 충돌한 경우(수입재 다판 동시절단)
    // heatNo+사양 로 남은 WAITING 형제 1장을 소진. (if/else 아님 — selected 충돌 시에도 반드시 형제 소진)
    if (!consumedHeatId && log.drawingNo && log.heatNo?.trim() && log.material && log.thickness && log.width && log.length) {
      const heatWhere = {
        heatNo: log.heatNo.trim(),
        status: "WAITING" as const,
        material: { equals: log.material.trim().toUpperCase(), mode: "insensitive" as const },
        thickness: log.thickness, width: log.width, length: log.length,
      };
      // ① 작업 호선(또는 대체호선)에서 먼저 찾는다 — 정상 흐름은 여기서 끝난다.
      let heatMatch = effectiveVessel
        ? await tx.steelPlanHeat.findFirst({
            where: { ...heatWhere, vesselCode: effectiveVessel },
            orderBy: { createdAt: "asc" },
            select: { id: true },
          })
        : null;
      // ② 호선 유용 폴백 — 대체호선을 지정하지 않고 옆 호선 실물을 꺼내 쓴 경우.
      //    판번호+사양이 같으면 물리적으로 그 판이 잘린 것이므로 호선이 달라도 소진한다.
      //    (호선으로 잠가두면 아무 판번호도 소진되지 않아 유령 WAITING 이 영구히 남고,
      //     그 사양 재고가 어긋나 현장직접출고에서 "입고 자재 없음" 으로 막힌다 — 실제 31건 발생)
      if (!heatMatch) {
        heatMatch = await tx.steelPlanHeat.findFirst({
          where: heatWhere,
          orderBy: { createdAt: "asc" },
          select: { id: true },
        });
      }
      if (heatMatch) {
        await tx.steelPlanHeat.update({
          where: { id: heatMatch.id },
          data:  { status: "CUT", cutAt: log.endAt ?? new Date() },
        });
        consumedHeatId = heatMatch.id;
      }
    }
    // 실제 소진한 판 id 를 로그에 기록 — 복원 시 그 판을 정확히 되돌리기 위함(selectedHeatId 는 '의도', consumedHeatId 는 '실제').
    if (consumedHeatId) {
      await tx.cuttingLog.update({ where: { id: log.id }, data: { consumedHeatId } });
    }
  }

  // ── 여유원재(SURPLUS) 사용 절단 — 실물 판번호 추적 ─────────────────────
  if (
    targetDrawing?.assignedRemnantId &&
    targetDrawing.assignedRemnant?.type === "SURPLUS" &&
    log.heatNo?.trim() && effectiveVessel &&
    log.material && log.thickness && log.width && log.length
  ) {
    const hn  = log.heatNo.trim();
    const mat = log.material.trim().toUpperCase();
    await tx.remnant.update({
      where: { id: targetDrawing.assignedRemnantId },
      data:  { heatNo: hn },
    });
    const existingHeat = await tx.steelPlanHeat.findFirst({
      where: {
        heatNo: hn, vesselCode: effectiveVessel,
        material: { equals: mat, mode: "insensitive" },
        thickness: log.thickness, width: log.width, length: log.length,
      },
      select: { id: true },
    });
    if (existingHeat) {
      await tx.steelPlanHeat.update({
        where: { id: existingHeat.id },
        data:  { status: "CUT", cutAt: log.endAt ?? new Date() },
      });
    } else {
      // I2: SURPLUS 절단으로 신규 생성되는 판번호 — 절단 취소 시 유령 heat 잔류 방지 마커
      await tx.steelPlanHeat.create({
        data: {
          heatNo: hn, vesselCode: effectiveVessel, material: mat,
          thickness: log.thickness, width: log.width, length: log.length,
          status: "CUT", cutAt: log.endAt ?? new Date(),
          autoCreatedFromSurplusCut: true,
        },
      });
    }
  }

  // ── SteelPlan: 사용된 강재 1장 RECEIVED/ISSUED → COMPLETED ────────────
  if (!targetDrawing?.assignedRemnantId && log.drawingNo && log.material && log.thickness && log.width && log.length && effectiveVessel) {
    const blockCode = targetDrawing?.block ?? "UNKNOWN";
    const newFmt    = project ? `${project.projectCode}/${blockCode}` : null;
    const allowedReservedFor = [
      ...(newFmt ? [newFmt] : []),
      blockCode,
    ];
    const matchBase = {
      vesselCode: effectiveVessel,
      material:   { equals: log.material.trim().toUpperCase(), mode: "insensitive" } as const,
      thickness:  log.thickness,
      width:      log.width,
      length:     log.length,
      status:     { in: ["RECEIVED", "ISSUED"] as ("RECEIVED" | "ISSUED")[] },
      actualHeatNo: null,
      // 출고 선별/예정(shipoutMarkedAt)된 강재는 절단완료 소진 대상에서 제외 (절단↔출고 상호배제)
      shipoutMarkedAt: null,
    };
    // 이 블록에 확정(reservedFor)된 강재만 소진 — 미예약 폴백 없음(정확한 재고 파악, 확정한 강재만 절단).
    //   확정된 강재가 없으면 SteelPlan 소진을 건너뛴다(관리자 수동 매칭). 현장 목록은 확정(WAITING)
    //   도면만 노출하므로 정상 흐름에선 항상 이 매칭이 성공한다.
    const targetPlan = await tx.steelPlan.findFirst({
      where: { ...matchBase, reservedFor: { in: allowedReservedFor } },
      orderBy: { createdAt: "asc" },
    });
    if (targetPlan) {
      await tx.steelPlan.update({
        where: { id: targetPlan.id },
        data: {
          status:           "COMPLETED",
          // 입출고장 투입(출고)을 안 했으면 절단완료일로 출고일 자동 기록. 기존 투입일 있으면 보존.
          ...(targetPlan.issuedAt ? {} : { issuedAt: log.endAt ?? new Date() }),
          actualHeatNo:     log.heatNo?.trim() || null,
          actualVesselCode: effectiveVessel,
          actualDrawingNo:  log.drawingNo,
        },
      });
      // 동일 spec DrawingList 재계산 (alt vessel 기준)
      await syncDrawingListBySpec(
        effectiveVessel, log.material, log.thickness, log.width, log.length, tx,
      );
    }
    // 매칭 실패 시: SteelPlan 갱신 스킵 (관리자 수동 매칭 필요)
  }

  // ── 돌발(UrgentWork) 사용 잔재 소진 → EXHAUSTED ──────────────────────
  // 돌발작업은 DrawingList/SteelPlan 비대상. 연결 잔재(UrgentWork.remnantId)를 소진 처리해야
  // 강재매칭 선별목록 등에서 재선택되지 않는다.
  if (log.isUrgent && log.urgentWorkId) {
    const uw = await tx.urgentWork.findUnique({
      where: { id: log.urgentWorkId },
      select: { remnantId: true },
    });
    if (uw?.remnantId) {
      await tx.remnant.update({
        where: { id: uw.remnantId },
        data:  { status: "EXHAUSTED" },
      });
    }
  }

  // ── 블록(Project) 완료 상태 자동 동기화 ──────────────────────────────
  if (log.projectId) await syncProjectStatus(log.projectId, tx);
}

interface RestoreLog {
  id: string;
  drawingListId: string | null;
  drawingNo: string | null;
  projectId: string | null;
  heatNo: string | null;
  consumedHeatId: string | null;
  material: string | null;
  thickness: number | null;
  width: number | null;
  length: number | null;
  isUrgent: boolean;
  urgentWorkId: string | null;
}

/**
 * 절단 복원 부작용 — 작업로그 삭제(또는 완료 되돌림) 시 강재 상태를 복원.
 * 로그 자체는 삭제하지 않는다(호출자가 삭제). DrawingList CUT→WAITING, SteelPlan COMPLETED→RECEIVED,
 * SteelPlanHeat CUT→WAITING, 잔재 IN_STOCK 복원 + sync 를 tx 로 수행.
 */
export async function applyCuttingRestore(tx: Tx, log: RestoreLog): Promise<void> {
  let drawingSyncSpec: {
    vesselCode: string; material: string; thickness: number; width: number; length: number;
  } | null = null;
  let drawingAltVessel: string | null = null;
  if (log.drawingListId) {
    const drawing = await tx.drawingList.findUnique({
      where: { id: log.drawingListId },
      include: { project: { select: { projectCode: true } } },
    });
    if (drawing) {
      drawingAltVessel = drawing.alternateVesselCode?.trim() || null;
    }
    if (drawing && drawing.status === "CUT") {
      await tx.drawingList.update({
        where: { id: log.drawingListId },
        data: { status: "WAITING", heatNo: null },
      });
      // 등록잔재 사용 절단이면 잔재 상태 복원 → IN_STOCK
      if (drawing.assignedRemnantId) {
        await tx.remnant.update({
          where: { id: drawing.assignedRemnantId },
          data:  { status: "IN_STOCK" },
        });
      }
      // N8: 이 도면 절단완료 시 applyCuttingComplete 가 발생 REGISTERED 잔재에 heatNo 를
      //     전파했으므로, 취소 시에도 대칭적으로 heatNo 를 null 로 되돌려 스테일 데이터 방지.
      await tx.remnant.updateMany({
        where: { drawingListId: log.drawingListId, type: "REGISTERED" },
        data:  { heatNo: null },
      });
      const effectiveVessel = drawing.alternateVesselCode?.trim() || drawing.project.projectCode;
      drawingSyncSpec = {
        vesselCode: effectiveVessel,
        material:   drawing.material,
        thickness:  drawing.thickness, width: drawing.width, length: drawing.length,
      };
    }
  }

  // ── effectiveVessel 폴백 추론 ──────────────────────────────────────────
  let effectiveVesselForLog: string | null = drawingSyncSpec?.vesselCode ?? null;
  if (!effectiveVesselForLog) {
    if (drawingAltVessel) {
      effectiveVesselForLog = drawingAltVessel;
    } else if (log.projectId) {
      const project = await tx.project.findUnique({
        where: { id: log.projectId },
        select: { projectCode: true },
      });
      effectiveVesselForLog = project?.projectCode ?? null;
    }
  }

  // ── SteelPlanHeat 복원 CUT → WAITING ─────────────────────────────────
  // ★ (1) 정확 복원: 완료 때 '실제로' 소진한 판(consumedHeatId)만 되돌림 — 타 로그가 소진한 형제 판은 절대 안 건드림.
  let restoredHeat = false;
  if (log.consumedHeatId) {
    const r = await tx.steelPlanHeat.updateMany({
      where: { id: log.consumedHeatId, status: "CUT" },
      data:  { status: "WAITING", cutAt: null },
    });
    if (r.count > 0) restoredHeat = true;
  }

  // (2) 폴백: consumedHeatId 없는 레거시 로그·여유원재. heatNo+사양 매칭하되
  //     (a) 다른 로그가 정확 소진(consumedHeatId)한 판은 제외, (b) 여러 장 일괄 아닌 1장만 복원(과다복원 방지).
  if (!restoredHeat && log.heatNo?.trim() && effectiveVesselForLog && log.material && log.thickness && log.width && log.length) {
    const others = await tx.cuttingLog.findMany({
      where: { id: { not: log.id }, consumedHeatId: { not: null } },
      select: { consumedHeatId: true },
    });
    const excludeIds = others.map(o => o.consumedHeatId).filter((x): x is string => !!x);
    const heatSpec = {
      heatNo: log.heatNo.trim(),
      status: "CUT" as const,
      vesselCode: effectiveVesselForLog,
      material: { equals: log.material.trim().toUpperCase(), mode: "insensitive" as const },
      thickness: log.thickness, width: log.width, length: log.length,
      ...(excludeIds.length > 0 ? { id: { notIn: excludeIds } } : {}),
    };
    // I2: SURPLUS 절단으로 신규 생성됐던 heat (autoCreatedFromSurplusCut=true) 는 실물이 SURPLUS 원판으로
    //     되살아나므로 삭제(참조 있으면 WAITING 복원). 1장만.
    const surplusHeat = await tx.steelPlanHeat.findFirst({
      where: { ...heatSpec, autoCreatedFromSurplusCut: true },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (surplusHeat) {
      const referenced = await tx.shipmentItem.findFirst({
        where: { steelPlanHeatId: surplusHeat.id },
        select: { id: true },
      });
      if (referenced) {
        await tx.steelPlanHeat.update({ where: { id: surplusHeat.id }, data: { status: "WAITING", cutAt: null } });
      } else {
        await tx.steelPlanHeat.delete({ where: { id: surplusHeat.id } });
      }
      restoredHeat = true;
    }
    // 일반 heat (autoCreatedFromSurplusCut=false) — 1장만 복원
    if (!restoredHeat) {
      const one = await tx.steelPlanHeat.findFirst({
        where: { ...heatSpec, autoCreatedFromSurplusCut: false },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
      if (one) {
        await tx.steelPlanHeat.update({ where: { id: one.id }, data: { status: "WAITING", cutAt: null } });
      }
    }
  }

  // ── SteelPlan 복원: 이 작업으로 COMPLETED 됐던 강재 → RECEIVED ──────────
  let restoredSpec: typeof drawingSyncSpec = null;
  if (log.drawingNo && log.material && log.thickness && log.width && log.length) {
    const matMatch = { equals: log.material.trim().toUpperCase(), mode: "insensitive" as const };
    const specBase = {
      material:        matMatch,
      thickness:       log.thickness,
      width:           log.width,
      length:          log.length,
      status:          "COMPLETED" as const,
      actualDrawingNo: log.drawingNo,
      ...(log.heatNo?.trim() ? { actualHeatNo: log.heatNo.trim() } : {}),
    };

    let target = null;
    if (effectiveVesselForLog) {
      // 1차: actualVesselCode 정확 매칭
      target = await tx.steelPlan.findFirst({
        where: { ...specBase, actualVesselCode: effectiveVesselForLog },
        orderBy: { createdAt: "desc" },
      });
      // 2차: vesselCode 폴백 (구형 데이터)
      if (!target) {
        target = await tx.steelPlan.findFirst({
          where: { ...specBase, vesselCode: effectiveVesselForLog },
          orderBy: { createdAt: "desc" },
        });
      }
    }

    // 3차: vessel 제약 없이 — alt vessel + 도면 삭제 케이스 보호 (후보 정확히 1건일 때만)
    if (!target && log.heatNo?.trim()) {
      const candidates = await tx.steelPlan.findMany({
        where: specBase,
        orderBy: { createdAt: "desc" },
        take: 2,
      });
      if (candidates.length === 1) {
        target = candidates[0];
      }
    }

    if (target) {
      await tx.steelPlan.update({
        where: { id: target.id },
        data: {
          status:           "RECEIVED",
          issuedAt:         null, // 절단완료 시 자동 기록된 출고일 초기화 (미투입 상태로 복원)
          actualHeatNo:     null,
          actualVesselCode: null,
          actualDrawingNo:  null,
        },
      });
      restoredSpec = {
        vesselCode: target.vesselCode,
        material:   log.material,
        thickness:  log.thickness, width: log.width, length: log.length,
      };
    }
  }

  // ── 돌발(UrgentWork) 사용 잔재 복원 → IN_STOCK ───────────────────────
  if (log.isUrgent && log.urgentWorkId) {
    const uw = await tx.urgentWork.findUnique({
      where: { id: log.urgentWorkId },
      select: { remnantId: true },
    });
    if (uw?.remnantId) {
      await tx.remnant.updateMany({
        where: { id: uw.remnantId, status: "EXHAUSTED" },
        data:  { status: "IN_STOCK" },
      });
    }
    // I9: 로그 삭제로 돌발작업이 다시 필요해지면 UrgentWork.status 를 PENDING 으로 복원.
    //     COMPLETED 로 남아있으면 loadUrgentWorks(PENDING/IN_PROGRESS 만) 에서 사라져 재작업 불가.
    await tx.urgentWork.updateMany({
      where: { id: log.urgentWorkId, status: { in: ["IN_PROGRESS", "COMPLETED"] } },
      data:  { status: "PENDING" },
    });
  }

  // ── 통합 sync — DrawingList 복원 spec + SteelPlan 복원 spec ───────────
  const syncSpecs = [
    ...(drawingSyncSpec ? [drawingSyncSpec] : []),
    ...(restoredSpec ? [restoredSpec] : []),
  ];
  if (syncSpecs.length > 0) {
    await syncDrawingListBySpecs(syncSpecs, tx);
  }

  // ── 블록(Project) 완료 상태 자동 동기화 (복원 시 ACTIVE로 되돌림) ──────
  if (log.projectId) await syncProjectStatus(log.projectId, tx);
}

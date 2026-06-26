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
      // 잔재(등록/여유/현장) 사용 절단이면 잔재 상태 → EXHAUSTED (타입 무관, 여유원재 포함)
      if (target.assignedRemnantId) {
        await tx.remnant.update({
          where: { id: target.assignedRemnantId },
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
  // 동일 heatNo 가 여러 호선에 있을 수 있으므로 effectiveVessel + spec 필터 필수
  const effectiveVessel = targetDrawing?.alternateVesselCode?.trim() || project?.projectCode;
  // 잔재(등록/현장/여유) 사용 절단은 정규원재(SteelPlan/SteelPlanHeat)를 건드리지 않음 — 여유원재는 아래 전용 블록에서 처리
  if (!targetDrawing?.assignedRemnantId && log.drawingNo && log.heatNo?.trim() && effectiveVessel && log.material && log.thickness && log.width && log.length) {
    await tx.steelPlanHeat.updateMany({
      where: {
        heatNo: log.heatNo.trim(),
        status: "WAITING",
        vesselCode: effectiveVessel,
        material: { equals: log.material.trim().toUpperCase(), mode: "insensitive" },
        thickness: log.thickness, width: log.width, length: log.length,
      },
      data:  { status: "CUT", cutAt: log.endAt ?? new Date() },
    });
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
      await tx.steelPlanHeat.create({
        data: {
          heatNo: hn, vesselCode: effectiveVessel, material: mat,
          thickness: log.thickness, width: log.width, length: log.length,
          status: "CUT", cutAt: log.endAt ?? new Date(),
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

  // SteelPlanHeat 상태 복원 CUT → WAITING — effectiveVessel + spec 매칭 필수
  if (log.heatNo?.trim() && effectiveVesselForLog && log.material && log.thickness && log.width && log.length) {
    await tx.steelPlanHeat.updateMany({
      where: {
        heatNo: log.heatNo.trim(),
        status: "CUT",
        vesselCode: effectiveVesselForLog,
        material: { equals: log.material.trim().toUpperCase(), mode: "insensitive" },
        thickness: log.thickness, width: log.width, length: log.length,
      },
      data:  { status: "WAITING", cutAt: null },
    });
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

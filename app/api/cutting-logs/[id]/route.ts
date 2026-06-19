/**
 * /api/cutting-logs/[id]
 *
 * 절단 작업일보 단건 수정 및 삭제.
 *
 * ── PATCH action="complete" (절단 종료) ────────────────────────────────────
 * 정규작업(isUrgent=false) 완료 시 아래 순서로 자동 동기화:
 *   1) CuttingLog.status → COMPLETED, endAt 기록
 *   2) DrawingList: 같은 프로젝트+도면번호의 WAITING 첫 항목 → CUT (heatNo 기록)
 *   3) SteelPlan:  vesselCode+스펙 일치하는 RECEIVED(actualHeatNo=null) 첫 항목
 *                  → COMPLETED, actualHeatNo·vesselCode·drawingNo 기록
 *   4) SteelPlanHeat: heatNo 기준 WAITING → CUT (없으면 신규 자동 생성)
 *   5) syncDrawingListBySpec(): 동일 스펙 DrawingList 전체 WAITING/REGISTERED 재계산
 *   6) syncProjectStatus(): 블록 완료 여부 동기화
 *
 * ── PATCH action="pause" (절단 중단) ──────────────────────────────────────
 *   CuttingLog.status → PAUSED, CuttingPause 레코드 생성 (pausedAt=now)
 *   body: { reason: PauseReason, reasonText?: string }
 *
 * ── PATCH action="resume" (절단 재개) ─────────────────────────────────────
 *   CuttingLog.status → STARTED, 최신 CuttingPause.resumedAt = now
 *
 * 돌발작업(isUrgent=true)은 DrawingList·SteelPlan 동기화 없음.
 *
 * ── PATCH (일반 수정) ──────────────────────────────────────────────────────
 * action 없음: 관리자 직접 필드 수정.
 *
 * ── DELETE (삭제 + 강재 상태 복원) ────────────────────────────────────────
 *   1) DrawingList: CUT → WAITING, heatNo 초기화
 *   2) SteelPlan:   COMPLETED → RECEIVED, actual* 필드 초기화
 *   3) SteelPlanHeat: CUT → WAITING
 *   4) CuttingLog 삭제 (CuttingPause는 CASCADE)
 *   5) syncDrawingListBySpec(): DrawingList 재계산
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncDrawingListBySpec, syncDrawingListBySpecs } from "@/lib/sync-drawing-spec";
import { syncProjectStatus } from "@/lib/sync-project-status";

// ─── PATCH ─────────────────────────────────────────────────────────────────────
// action="complete" → 절단 종료 (강재 상태 자동 동기화)
// action 없음       → 관리자 직접 수정 (강재 상태 수동 관리)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { action, memo, heatNo, material, thickness, operator } = body;

    // ── 절단 중단 ────────────────────────────────────────────────────────────
    if (action === "pause") {
      const { reason, reasonText } = body;
      if (!reason) {
        return NextResponse.json({ success: false, error: "중단 사유를 선택하세요." }, { status: 400 });
      }
      await prisma.cuttingLog.update({ where: { id }, data: { status: "PAUSED" } });
      await prisma.cuttingPause.create({
        data: { cuttingLogId: id, reason, reasonText: reasonText?.trim() || null },
      });
      return NextResponse.json({ success: true });
    }

    // ── 절단 재개 ────────────────────────────────────────────────────────────
    if (action === "resume") {
      // 열려있는(resumedAt=null) 가장 최근 중단 기록에 재개 시각 기록
      const openPause = await prisma.cuttingPause.findFirst({
        where:   { cuttingLogId: id, resumedAt: null },
        orderBy: { pausedAt: "desc" },
      });
      if (openPause) {
        await prisma.cuttingPause.update({
          where: { id: openPause.id },
          data:  { resumedAt: new Date() },
        });
      }
      await prisma.cuttingLog.update({ where: { id }, data: { status: "STARTED" } });
      return NextResponse.json({ success: true });
    }

    if (action === "complete") {
      // ── 멱등성 가드 (R4 + R9 CAS) ─────────────────────────────────────
      // 더블탭 / 빠른 재호출 / 동시 더블탭 모두 SteelPlan 추가 소비 (재고 영구
      // 손실) 방지. findUnique+update 비원자(TOCTOU) 대신 updateMany 의
      // where-기반 compare-and-swap 으로 atomic 보호.
      //
      // ⚠️ Phase 3 노트: cuttingLog 외 DrawingList/SteelPlanHeat/SteelPlan
      //    여러 update 가 트랜잭션 없이 순차 실행됨. 중간 실패 시 cuttingLog 만
      //    COMPLETED 인 half-synced 상태 가능 + R4 가드로 인해 재시도 차단.
      //    근본 해결은 prisma.$transaction 으로 전체 묶기.
      const { endAt: completeEndAt, startAt: completeStartAt } = body;
      const casResult = await prisma.cuttingLog.updateMany({
        where: { id, status: { not: "COMPLETED" } },
        data: {
          status: "COMPLETED",
          endAt: completeEndAt ? new Date(completeEndAt) : new Date(),
          ...(completeStartAt ? { startAt: new Date(completeStartAt) } : {}),
          ...(memo !== undefined ? { memo: memo?.trim() || null } : {}),
        },
      });
      if (casResult.count === 0) {
        // 이미 COMPLETED 거나 ID 없음 — 부작용 모두 스킵
        const found = await prisma.cuttingLog.findUnique({ where: { id }, select: { status: true } });
        if (!found) {
          return NextResponse.json({ success: false, error: "기록을 찾을 수 없습니다." }, { status: 404 });
        }
        return NextResponse.json({ success: true, data: { id, status: "COMPLETED", alreadyCompleted: true } });
      }

      // 혹시 PAUSED 상태에서 완료 누른 경우 열린 pause 자동 닫기
      await prisma.cuttingPause.updateMany({
        where: { cuttingLogId: id, resumedAt: null },
        data:  { resumedAt: new Date() },
      });

      // CAS 로 status 가 이미 COMPLETED 됐으므로 후속 조회로 데이터 확보
      const log = await prisma.cuttingLog.findUnique({
        where: { id },
        include: { equipment: { select: { name: true } } },
      });
      if (!log) {
        return NextResponse.json({ success: false, error: "기록 조회 실패" }, { status: 500 });
      }

      // ── DrawingList 상태 CUT으로 변경 + 사용 정보 추출 ────────────────────
      // 같은 프로젝트+도면번호의 WAITING 상태 첫 항목을 CUT으로
      // alt vessel 도면도 정상 매칭되도록 alternateVesselCode 까지 select
      let targetDrawing: {
        id: string;
        block: string | null;
        alternateVesselCode: string | null;
        assignedRemnantId: string | null;
        assignedRemnant: { type: string } | null;
      } | null = null;
      if (log.drawingNo && log.projectId) {
        const target = await prisma.drawingList.findFirst({
          where: {
            projectId: log.projectId,
            drawingNo:  log.drawingNo,
            status:     "WAITING",
          },
          orderBy: { createdAt: "asc" },
          select: {
            id: true, block: true, alternateVesselCode: true, assignedRemnantId: true,
            assignedRemnant: { select: { type: true } },
          },
        });
        if (target) {
          targetDrawing = target;
          await prisma.drawingList.update({
            where: { id: target.id },
            data: {
              status: "CUT",
              ...(log.heatNo?.trim() ? { heatNo: log.heatNo.trim() } : {}),
            },
          });
          await prisma.cuttingLog.update({
            where: { id },
            data: { drawingListId: target.id },
          });
          // 등록잔재 사용 절단이면 잔재 상태 → EXHAUSTED
          if (target.assignedRemnantId) {
            await prisma.remnant.update({
              where: { id: target.assignedRemnantId },
              data:  { status: "EXHAUSTED" },
            });
          }
          // 이 도면에서 발생한 등록잔재에 원판 판번호 전파 (원재 → 등록잔재 판번호 연속)
          // 등록잔재는 블록강재등록 시 drawingListId 로 도면에 연결되어 생성됨 → 절단완료 시 실사용 판번호 기입
          if (log.heatNo?.trim()) {
            await prisma.remnant.updateMany({
              where: { drawingListId: target.id, type: "REGISTERED" },
              data:  { heatNo: log.heatNo.trim() },
            });
          }
        }
      }

      // ── 프로젝트 조회 (SteelPlan + SteelPlanHeat 양쪽에서 사용) ────────────
      let project: { projectCode: string } | null = null;
      if (log.projectId) {
        project = await prisma.project.findUnique({
          where: { id: log.projectId },
          select: { projectCode: true },
        });
      }

      // ── SteelPlanHeat 상태 → CUT ───────────────────────────────────────
      // 동일 heatNo 가 여러 호선에 있을 수 있으므로 effectiveVessel + spec 필터 필수
      // 정보 부족 시 무차별 매칭 안 함 (다른 호선/스펙 CUT 처리 방지)
      // R8: SteelPlan 측 갱신 조건과 대칭 — drawingNo 도 필수
      //     (drawingNo 없으면 SteelPlan/SteelPlanHeat 둘 다 갱신 스킵 → 모순 상태 방지)
      const effectiveVessel = targetDrawing?.alternateVesselCode?.trim() || project?.projectCode;
      // 잔재(등록/현장/여유) 사용 절단은 정규원재(SteelPlan/SteelPlanHeat)를 건드리지 않음 — 여유원재는 아래 전용 블록에서 처리
      if (!targetDrawing?.assignedRemnantId && log.drawingNo && log.heatNo?.trim() && effectiveVessel && log.material && log.thickness && log.width && log.length) {
        await prisma.steelPlanHeat.updateMany({
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
      // 여유원재는 미절단 원판이므로 현장에서 입력한 실물 판번호를
      //   ① 잔재 레코드에 기록  ② 판번호리스트(SteelPlanHeat)에 CUT 으로 등록 (정규원재처럼 추적)
      // 발생 등록잔재로의 판번호 연결은 위 drawingListId 전파(절단완료)에서 처리됨
      if (
        targetDrawing?.assignedRemnantId &&
        targetDrawing.assignedRemnant?.type === "SURPLUS" &&
        log.heatNo?.trim() && effectiveVessel &&
        log.material && log.thickness && log.width && log.length
      ) {
        const hn  = log.heatNo.trim();
        const mat = log.material.trim().toUpperCase();
        await prisma.remnant.update({
          where: { id: targetDrawing.assignedRemnantId },
          data:  { heatNo: hn },
        });
        const existingHeat = await prisma.steelPlanHeat.findFirst({
          where: {
            heatNo: hn, vesselCode: effectiveVessel,
            material: { equals: mat, mode: "insensitive" },
            thickness: log.thickness, width: log.width, length: log.length,
          },
          select: { id: true },
        });
        if (existingHeat) {
          await prisma.steelPlanHeat.update({
            where: { id: existingHeat.id },
            data:  { status: "CUT", cutAt: log.endAt ?? new Date() },
          });
        } else {
          await prisma.steelPlanHeat.create({
            data: {
              heatNo: hn, vesselCode: effectiveVessel, material: mat,
              thickness: log.thickness, width: log.width, length: log.length,
              status: "CUT", cutAt: log.endAt ?? new Date(),
            },
          });
        }
      }

      // ── SteelPlan: 사용된 강재 1장 RECEIVED/ISSUED → COMPLETED ────────────
      // 우선순위 매칭:
      //   1차) 이 블록 reservedFor 매칭 (신규 "호선/블록" + 구형 "블록")
      //   2차) 미예약 (reservedFor=null)
      //   다른 블록 예약된 강재는 절대 선택 안 함 (데이터 손상 방지)
      // alt vessel: targetDrawing.alternateVesselCode 우선
      // R5: log.drawingNo 필수 — DELETE 의 복원 가드(line 353)가 drawingNo 기반이라
      //     비대칭 방지 위해 complete 측도 drawingNo 없으면 SteelPlan 갱신 스킵
      if (!targetDrawing?.assignedRemnantId && log.drawingNo && log.material && log.thickness && log.width && log.length && effectiveVessel) {
        const blockCode = targetDrawing?.block ?? "UNKNOWN";
        const newFmt    = project ? `${project.projectCode}/${blockCode}` : null;
        const allowedReservedFor = [
          ...(newFmt ? [newFmt] : []),
          blockCode,
          // null 도 허용 — Prisma OR 절로 표현
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
        // 1차: 이 블록 예약 매칭
        let targetPlan = await prisma.steelPlan.findFirst({
          where: { ...matchBase, reservedFor: { in: allowedReservedFor } },
          orderBy: { createdAt: "asc" },
        });
        // 2차: 미예약 폴백
        if (!targetPlan) {
          targetPlan = await prisma.steelPlan.findFirst({
            where: { ...matchBase, reservedFor: null },
            orderBy: { createdAt: "asc" },
          });
        }
        if (targetPlan) {
          await prisma.steelPlan.update({
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
            effectiveVessel, log.material, log.thickness, log.width, log.length,
          );
        }
        // 매칭 실패 시: SteelPlan 갱신 스킵 (관리자 수동 매칭 필요)
      }

      // ── 블록(Project) 완료 상태 자동 동기화 ──────────────────────────────
      if (log.projectId) await syncProjectStatus(log.projectId);

      return NextResponse.json({ success: true, data: log });
    }

    // 일반 수정 (관리자 전체 필드 수정 포함)
    const { startAt, endAt, status, equipmentId,
            width, length, qty, drawingNo } = body;
    const log = await prisma.cuttingLog.update({
      where: { id },
      data: {
        ...(equipmentId !== undefined ? { equipmentId } : {}),
        ...(heatNo    !== undefined ? { heatNo:    heatNo?.trim()    || null } : {}),
        ...(material  !== undefined ? { material:  material?.trim()  || null } : {}),
        ...(thickness !== undefined ? { thickness: thickness ? Number(thickness) : null } : {}),
        ...(width     !== undefined ? { width:     width     ? Number(width)     : null } : {}),
        ...(length    !== undefined ? { length:    length    ? Number(length)    : null } : {}),
        ...(qty       !== undefined ? { qty:       qty       ? Number(qty)       : null } : {}),
        ...(drawingNo !== undefined ? { drawingNo: drawingNo?.trim() || null } : {}),
        ...(operator  !== undefined ? { operator:  operator?.trim()  || ""   } : {}),
        ...(memo      !== undefined ? { memo:      memo?.trim()      || null } : {}),
        ...(startAt   !== undefined ? { startAt:   new Date(startAt) } : {}),
        ...(endAt     !== undefined ? { endAt:     endAt ? new Date(endAt) : null } : {}),
        ...(status    !== undefined ? { status } : {}),
      },
      include: {
        equipment: { select: { id: true, name: true, type: true } },
        project:   { select: { projectCode: true, projectName: true } },
      },
    });
    return NextResponse.json({ success: true, data: log });
  } catch (error) {
    console.error("[PATCH /api/cutting-logs/[id]]", error);
    return NextResponse.json(
      { success: false, error: "작업일보 수정 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

// DELETE /api/cutting-logs/[id] - 작업 기록 삭제 (강재 상태 복원 포함)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // 삭제 전 로그 조회 (drawingListId 확인)
    const log = await prisma.cuttingLog.findUnique({ where: { id } });
    if (!log) {
      return NextResponse.json({ success: false, error: "기록을 찾을 수 없습니다." }, { status: 404 });
    }

    // drawingListId가 있으면 해당 강재를 CUT → WAITING으로 복원 (heatNo도 초기화)
    // drawing.alternateVesselCode 까지 select 해서 effectiveVessel 계산에 사용
    let drawingSyncSpec: {
      vesselCode: string; material: string; thickness: number; width: number; length: number;
    } | null = null;
    let drawingAltVessel: string | null = null; // drawingList 살아있을 때 alt 정보
    if (log.drawingListId) {
      const drawing = await prisma.drawingList.findUnique({
        where: { id: log.drawingListId },
        include: { project: { select: { projectCode: true } } },
      });
      if (drawing) {
        drawingAltVessel = drawing.alternateVesselCode?.trim() || null;
      }
      if (drawing && drawing.status === "CUT") {
        await prisma.drawingList.update({
          where: { id: log.drawingListId },
          data: { status: "WAITING", heatNo: null },
        });
        // 등록잔재 사용 절단이면 잔재 상태 복원 → IN_STOCK
        if (drawing.assignedRemnantId) {
          await prisma.remnant.update({
            where: { id: drawing.assignedRemnantId },
            data:  { status: "IN_STOCK" },
          });
        }
        // sync 대상 spec 기록 (SteelPlan 복원 실패 여부와 무관하게 sync 필요)
        const effectiveVessel = drawing.alternateVesselCode?.trim() || drawing.project.projectCode;
        drawingSyncSpec = {
          vesselCode: effectiveVessel,
          material:   drawing.material,
          thickness:  drawing.thickness, width: drawing.width, length: drawing.length,
        };
      }
    }

    // ── effectiveVessel 폴백 추론 ──────────────────────────────────────────
    // drawingSyncSpec 가 null 이어도 (drawing.status!='CUT' 또는 drawing 삭제됨) 호선 추론:
    //   1) drawingAltVessel (도면 살아있음)
    //   2) log.projectId → project.projectCode
    let effectiveVesselForLog: string | null = drawingSyncSpec?.vesselCode ?? null;
    if (!effectiveVesselForLog) {
      if (drawingAltVessel) {
        effectiveVesselForLog = drawingAltVessel;
      } else if (log.projectId) {
        const project = await prisma.project.findUnique({
          where: { id: log.projectId },
          select: { projectCode: true },
        });
        effectiveVesselForLog = project?.projectCode ?? null;
      }
    }

    // SteelPlanHeat 상태 복원 CUT → WAITING — effectiveVessel + spec 매칭 필수
    // 무차별 폴백 제거: heatNo 만으로 매칭하면 다른 호선/스펙 CUT 까지 복원 위험
    if (log.heatNo?.trim() && effectiveVesselForLog && log.material && log.thickness && log.width && log.length) {
      await prisma.steelPlanHeat.updateMany({
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
    // effectiveVessel/spec 없으면 스킵 — 무차별 복원하지 않음

    // ── SteelPlan 복원: 이 작업으로 COMPLETED 됐던 강재 → RECEIVED ──────────
    // 복원 식별 단서 3단계 폴백:
    //   1차) actualVesselCode = effectiveVesselForLog (가장 정확)
    //   2차) vesselCode = effectiveVesselForLog (구형 데이터 호환)
    //   3차) vessel 제약 없이 actualHeatNo + actualDrawingNo + spec (alt vessel 도면이 삭제된 케이스 보호)
    //        — 후보 정확히 1건일 때만 복원 (모호하면 안전하게 스킵)
    // R5 와 동기화: complete 측이 drawingNo 필수 → DELETE 도 drawingNo 필수 유지 (대칭)
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
        target = await prisma.steelPlan.findFirst({
          where: { ...specBase, actualVesselCode: effectiveVesselForLog },
          orderBy: { createdAt: "desc" },
        });
        // 2차: vesselCode 폴백 (구형 데이터)
        if (!target) {
          target = await prisma.steelPlan.findFirst({
            where: { ...specBase, vesselCode: effectiveVesselForLog },
            orderBy: { createdAt: "desc" },
          });
        }
      }

      // 3차: vessel 제약 없이 — alt vessel + 도면 삭제 케이스 보호
      // (단, heatNo 가 있어야 식별력 충분. 후보 정확히 1건일 때만 복원)
      if (!target && log.heatNo?.trim()) {
        const candidates = await prisma.steelPlan.findMany({
          where: specBase,
          orderBy: { createdAt: "desc" },
          take: 2, // 모호성 검사용
        });
        if (candidates.length === 1) {
          target = candidates[0];
        }
      }

      if (target) {
        await prisma.steelPlan.update({
          where: { id: target.id },
          data: {
            status:           "RECEIVED",
            actualHeatNo:     null,
            actualVesselCode: null,
            actualDrawingNo:  null,
          },
        });
        // 복원된 SteelPlan 의 vesselCode 기준 sync (alt 호선이면 그쪽 도면 영향)
        restoredSpec = {
          vesselCode: target.vesselCode,
          material:   log.material,
          thickness:  log.thickness, width: log.width, length: log.length,
        };
      }
    }

    await prisma.cuttingLog.delete({ where: { id } });

    // ── 통합 sync — DrawingList 복원 spec + SteelPlan 복원 spec ───────────
    // SteelPlan 복원 실패해도 DrawingList sync 는 무조건 수행 (가드 완화)
    const syncSpecs = [
      ...(drawingSyncSpec ? [drawingSyncSpec] : []),
      ...(restoredSpec ? [restoredSpec] : []),
    ];
    if (syncSpecs.length > 0) {
      await syncDrawingListBySpecs(syncSpecs);
    }

    // ── 블록(Project) 완료 상태 자동 동기화 (복원 시 ACTIVE로 되돌림) ──────
    if (log.projectId) await syncProjectStatus(log.projectId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/cutting-logs/[id]]", error);
    return NextResponse.json(
      { success: false, error: "삭제 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

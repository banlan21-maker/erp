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
 *
 * 돌발작업(isUrgent=true)은 DrawingList·SteelPlan 동기화 없음.
 * (heatNo가 있어도 projectId가 없으면 SteelPlan 매칭 불가)
 *
 * ── PATCH (일반 수정) ──────────────────────────────────────────────────────
 * action 없음: 관리자 직접 필드 수정 (status·날짜·수량 등).
 * 강재 상태는 자동으로 반영되지 않으므로 관리자가 직접 확인 필요.
 *
 * ── DELETE (삭제 + 강재 상태 복원) ────────────────────────────────────────
 *   1) DrawingList: CUT → WAITING, heatNo 초기화
 *   2) SteelPlan:   COMPLETED → RECEIVED, actual* 필드 초기화
 *   3) SteelPlanHeat: CUT → WAITING
 *   4) CuttingLog 삭제
 *   5) syncDrawingListBySpec(): DrawingList 재계산
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncDrawingListBySpec } from "@/lib/sync-drawing-spec";

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

    if (action === "complete") {
      // 절단 종료 처리 (endAt/startAt 명시 시 관리자 지정값 사용)
      const { endAt: completeEndAt, startAt: completeStartAt } = body;
      const log = await prisma.cuttingLog.update({
        where: { id },
        data: {
          status: "COMPLETED",
          endAt: completeEndAt ? new Date(completeEndAt) : new Date(),
          ...(completeStartAt ? { startAt: new Date(completeStartAt) } : {}),
          ...(memo !== undefined ? { memo: memo?.trim() || null } : {}),
        },
        include: { equipment: { select: { name: true } } },
      });

      // ── DrawingList 상태 CUT으로 변경 ─────────────────────────────────────
      // 같은 프로젝트+도면번호의 WAITING 상태 첫 항목을 CUT으로
      let drawingListId: string | null = null;
      if (log.drawingNo && log.projectId) {
        const target = await prisma.drawingList.findFirst({
          where: {
            projectId: log.projectId,
            drawingNo:  log.drawingNo,
            status:     "WAITING",
          },
          orderBy: { createdAt: "asc" },
        });
        if (target) {
          await prisma.drawingList.update({
            where: { id: target.id },
            data: {
              status: "CUT",
              ...(log.heatNo?.trim() ? { heatNo: log.heatNo.trim() } : {}),
            },
          });
          drawingListId = target.id;
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

      // ── SteelPlanHeat 상태 → CUT (없으면 신규 등록) ───────────────────────
      if (log.heatNo?.trim()) {
        const heatResult = await prisma.steelPlanHeat.updateMany({
          where: { heatNo: log.heatNo.trim(), status: "WAITING" },
          data:  { status: "CUT" },
        });

        // 판번호 목록에 없는 경우: 자동 등록 안 함 (강재입고관리에서 사전 등록 필수)
      }

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
    if (log.drawingListId) {
      const drawing = await prisma.drawingList.findUnique({ where: { id: log.drawingListId } });
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
      }
    }

    // SteelPlanHeat 상태 복원 CUT → WAITING
    if (log.heatNo?.trim()) {
      await prisma.steelPlanHeat.updateMany({
        where: { heatNo: log.heatNo.trim(), status: "CUT" },
        data:  { status: "WAITING" },
      });
    }

    await prisma.cuttingLog.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/cutting-logs/[id]]", error);
    return NextResponse.json(
      { success: false, error: "삭제 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

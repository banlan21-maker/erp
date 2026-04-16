import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncDrawingListBySpec } from "@/lib/sync-drawing-spec";

// PATCH /api/cutting-logs/[id] - 절단 종료 또는 수정
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { action, memo, heatNo, material, thickness, operator } = body;

    if (action === "complete") {
      // 절단 종료 처리
      const log = await prisma.cuttingLog.update({
        where: { id },
        data: {
          status: "COMPLETED",
          endAt: new Date(),
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

      // ── SteelPlan 실사용 기록 + COMPLETED 처리 ────────────────────────────
      let steelPlanVesselCode: string | null = null;
      let steelPlanMaterial: string | null = null;
      let steelPlanThickness: number | null = null;
      let steelPlanWidth: number | null = null;
      let steelPlanLength: number | null = null;

      if (project && log.heatNo?.trim() && log.material && log.thickness && log.width && log.length) {
        const steelPlan = await prisma.steelPlan.findFirst({
          where: {
            vesselCode: project.projectCode,
            material:   log.material,
            thickness:  log.thickness,
            width:      log.width,
            length:     log.length,
            status:     "RECEIVED",
            actualHeatNo: null,
          },
          orderBy: { createdAt: "asc" },
        });
        if (steelPlan) {
          await prisma.steelPlan.update({
            where: { id: steelPlan.id },
            data: {
              actualHeatNo:     log.heatNo.trim(),
              actualVesselCode: project.projectCode,
              actualDrawingNo:  log.drawingNo?.trim() || null,
              status:           "COMPLETED",
            },
          });
          steelPlanVesselCode = project.projectCode;
          steelPlanMaterial   = log.material;
          steelPlanThickness  = log.thickness;
          steelPlanWidth      = log.width;
          steelPlanLength     = log.length;
        }
      }

      // ── SteelPlanHeat 상태 → CUT (없으면 신규 등록) ───────────────────────
      if (log.heatNo?.trim()) {
        const heatResult = await prisma.steelPlanHeat.updateMany({
          where: { heatNo: log.heatNo.trim(), status: "WAITING" },
          data:  { status: "CUT" },
        });

        // 판번호 목록에 없는 신규 판번호 → 자동 등록(CUT 상태)
        if (heatResult.count === 0 && project && log.material && log.thickness && log.width && log.length) {
          await prisma.steelPlanHeat.create({
            data: {
              vesselCode: project.projectCode,
              material:   log.material,
              thickness:  log.thickness,
              width:      log.width,
              length:     log.length,
              heatNo:     log.heatNo.trim(),
              status:     "CUT",
            },
          });
        }
      }

      // ── DrawingList 재계산 (COMPLETED 증가 → WAITING 감소 반영) ───────────
      if (steelPlanVesselCode && steelPlanMaterial && steelPlanThickness && steelPlanWidth && steelPlanLength) {
        await syncDrawingListBySpec(
          steelPlanVesselCode, steelPlanMaterial,
          steelPlanThickness, steelPlanWidth, steelPlanLength,
        );
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
      }
    }

    // SteelPlan 실사용 기록 초기화 + 상태 COMPLETED → RECEIVED 복원
    let steelPlanVesselCode: string | null = null;
    let steelPlanMaterial: string | null = null;
    let steelPlanThickness: number | null = null;
    let steelPlanWidth: number | null = null;
    let steelPlanLength: number | null = null;

    if (log.heatNo?.trim()) {
      // 복원할 SteelPlan 정보 먼저 조회 (syncDrawingListBySpec 인자용)
      const affectedPlans = await prisma.steelPlan.findMany({
        where: { actualHeatNo: log.heatNo.trim() },
        select: { vesselCode: true, material: true, thickness: true, width: true, length: true },
      });
      if (affectedPlans.length > 0) {
        const p = affectedPlans[0];
        steelPlanVesselCode = p.vesselCode;
        steelPlanMaterial   = p.material;
        steelPlanThickness  = p.thickness;
        steelPlanWidth      = p.width;
        steelPlanLength     = p.length;
      }

      // actualHeatNo 초기화 + status COMPLETED → RECEIVED 복원
      await prisma.steelPlan.updateMany({
        where: { actualHeatNo: log.heatNo.trim() },
        data:  { actualHeatNo: null, actualVesselCode: null, actualDrawingNo: null, status: "RECEIVED" },
      });
      // SteelPlanHeat 상태 복원 CUT → WAITING
      await prisma.steelPlanHeat.updateMany({
        where: { heatNo: log.heatNo.trim(), status: "CUT" },
        data:  { status: "WAITING" },
      });
    }

    await prisma.cuttingLog.delete({ where: { id } });

    // DrawingList 재계산 (삭제 후 WAITING/REGISTERED 상태 재동기화)
    if (steelPlanVesselCode && steelPlanMaterial && steelPlanThickness && steelPlanWidth && steelPlanLength) {
      await syncDrawingListBySpec(
        steelPlanVesselCode, steelPlanMaterial,
        steelPlanThickness, steelPlanWidth, steelPlanLength,
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/cutting-logs/[id]]", error);
    return NextResponse.json(
      { success: false, error: "삭제 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

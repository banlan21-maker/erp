import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncDrawingListBySpec } from "@/lib/sync-drawing-spec";

export const dynamic = "force-dynamic";

// POST /api/drawings/reserve-bulk
// REGISTERED 상태 행에 대해 SteelPlan 확정 처리 후 DrawingList 상태 동기화
export async function POST(request: NextRequest) {
  try {
    const { projectId } = await request.json();
    if (!projectId) {
      return NextResponse.json({ success: false, error: "projectId가 필요합니다." }, { status: 400 });
    }

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      return NextResponse.json({ success: false, error: "프로젝트를 찾을 수 없습니다." }, { status: 404 });
    }
    const vesselCode = project.projectCode;

    // 등록잔재 사용 행: SteelPlan 매칭 없이 바로 WAITING 확정
    const assignedRows = await prisma.drawingList.findMany({
      where: { projectId, status: "REGISTERED", assignedRemnantId: { not: null } },
      select: { id: true },
    });
    if (assignedRows.length > 0) {
      await prisma.drawingList.updateMany({
        where: { id: { in: assignedRows.map(r => r.id) } },
        data: { status: "WAITING" },
      });
    }

    // 원재사용 행만 SteelPlan 매칭 확정
    const pendingRows = await prisma.drawingList.findMany({
      where: { projectId, status: "REGISTERED", assignedRemnantId: null },
      select: { id: true, material: true, thickness: true, width: true, length: true, block: true, alternateVesselCode: true },
    });

    // 규격+블록+대체호선별 그룹화
    const grouped = new Map<string, {
      material: string; thickness: number; width: number; length: number; block: string; steelVessel: string; needed: number;
    }>();
    for (const row of pendingRows) {
      const blockCode = row.block ?? "UNKNOWN";
      const steelVessel = row.alternateVesselCode?.trim() || vesselCode;
      const key = `${row.material}|${row.thickness}|${row.width}|${row.length}|${blockCode}|${steelVessel}`;
      if (!grouped.has(key)) {
        grouped.set(key, { material: row.material, thickness: row.thickness, width: row.width, length: row.length, block: blockCode, steelVessel, needed: 0 });
      }
      grouped.get(key)!.needed++;
    }

    let confirmed = 0;
    let skipped = 0;
    // 동기화할 스펙 수집 (예약 완료 후 일괄 sync)
    const specsToSync = new Map<string, { material: string; thickness: number; width: number; length: number }>();

    for (const spec of grouped.values()) {
      const { material, thickness, width, length, block: blockCode, steelVessel, needed } = spec;
      const reservedFor = `${vesselCode}/${blockCode}`;

      // 이미 이 호선 재고에서 이 블록으로 확정된 수량 (호선별로 구분)
      const alreadyNew = await prisma.steelPlan.count({
        where: { vesselCode: steelVessel, material, thickness, width, length, status: "RECEIVED", reservedFor },
      });
      const alreadyOld = alreadyNew === 0 ? await prisma.steelPlan.count({
        where: { vesselCode: steelVessel, material, thickness, width, length, status: "RECEIVED", reservedFor: blockCode },
      }) : 0;
      const alreadyCount = alreadyNew + alreadyOld;

      const toConfirm = needed - alreadyCount;
      if (toConfirm <= 0) { skipped += needed; continue; }

      const plans = await prisma.steelPlan.findMany({
        where: { vesselCode: steelVessel, material, thickness, width, length, status: "RECEIVED", reservedFor: null },
        take: toConfirm,
        orderBy: { createdAt: "asc" },
      });

      for (const plan of plans) {
        await prisma.steelPlan.update({
          where: { id: plan.id },
          data: { reservedFor },
        });
        confirmed++;
      }
      skipped += toConfirm - plans.length;

      // sync 대상 스펙 수집 (예약이 모두 끝난 후 실행)
      const specKey = `${material}|${thickness}|${width}|${length}`;
      if (!specsToSync.has(specKey)) {
        specsToSync.set(specKey, { material, thickness, width, length });
      }
    }

    // 모든 예약 완료 후 스펙별 DrawingList 상태 동기화
    for (const spec of specsToSync.values()) {
      await syncDrawingListBySpec(vesselCode, spec.material, spec.thickness, spec.width, spec.length);
    }

    return NextResponse.json({ success: true, data: { confirmed, skipped } });
  } catch (error) {
    console.error("[POST /api/drawings/reserve-bulk]", error);
    return NextResponse.json({ success: false, error: "일괄 확정 중 오류가 발생했습니다." }, { status: 500 });
  }
}

// DELETE /api/drawings/reserve-bulk
// 해당 프로젝트의 확정 전체 취소 후 DrawingList 상태 동기화
export async function DELETE(request: NextRequest) {
  try {
    const { projectId } = await request.json();
    if (!projectId) {
      return NextResponse.json({ success: false, error: "projectId가 필요합니다." }, { status: 400 });
    }

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      return NextResponse.json({ success: false, error: "프로젝트를 찾을 수 없습니다." }, { status: 404 });
    }
    const vesselCode = project.projectCode;

    // 이 프로젝트의 고유 블록코드 + 스펙 목록
    const allRows = await prisma.drawingList.findMany({
      where: { projectId },
      select: { material: true, thickness: true, width: true, length: true, block: true },
    });

    const blockCodes = [...new Set(allRows.map((r) => r.block ?? "UNKNOWN"))];
    // 신규 형식: "호선/블록" + 구형 형식: 블록만
    const newFmtCodes = blockCodes.map((b) => `${vesselCode}/${b}`);

    // 등록잔재 사용 행 확정 취소: WAITING → REGISTERED (CUT 제외)
    await prisma.drawingList.updateMany({
      where: { projectId, status: "WAITING", assignedRemnantId: { not: null } },
      data: { status: "REGISTERED" },
    });

    // 원재사용 행: SteelPlan 예약 해제
    const { count: cancelledNew } = await prisma.steelPlan.updateMany({
      where: { status: "RECEIVED", reservedFor: { in: newFmtCodes } },
      data: { reservedFor: null },
    });
    const { count: cancelledOld } = await prisma.steelPlan.updateMany({
      where: { vesselCode, status: "RECEIVED", reservedFor: { in: blockCodes } },
      data: { reservedFor: null },
    });
    const cancelled = cancelledNew + cancelledOld;

    // 고유 스펙별 DrawingList 상태 동기화
    const uniqueSpecs = new Map<string, { material: string; thickness: number; width: number; length: number }>();
    for (const row of allRows) {
      const key = `${row.material}|${row.thickness}|${row.width}|${row.length}`;
      if (!uniqueSpecs.has(key)) uniqueSpecs.set(key, { material: row.material, thickness: row.thickness, width: row.width, length: row.length });
    }
    for (const spec of uniqueSpecs.values()) {
      await syncDrawingListBySpec(vesselCode, spec.material, spec.thickness, spec.width, spec.length);
    }

    return NextResponse.json({ success: true, data: { cancelled } });
  } catch (error) {
    console.error("[DELETE /api/drawings/reserve-bulk]", error);
    return NextResponse.json({ success: false, error: "일괄 확정 취소 중 오류가 발생했습니다." }, { status: 500 });
  }
}

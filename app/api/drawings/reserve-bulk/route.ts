import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// POST /api/drawings/reserve-bulk
// body: { projectId: string }
// WAITING 상태 전체 행에 대해 확정 처리

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

    // WAITING 행을 규격+블록 조합으로 그룹화
    const waitingRows = await prisma.drawingList.findMany({
      where: { projectId, status: "WAITING" },
    });

    // 규격+블록별 필요 확정 수 집계
    const grouped = new Map<string, {
      material: string; thickness: number; width: number; length: number; block: string; needed: number;
    }>();
    for (const row of waitingRows) {
      const blockCode = row.block ?? "UNKNOWN";
      const key = `${row.material}|${row.thickness}|${row.width}|${row.length}|${blockCode}`;
      if (!grouped.has(key)) {
        grouped.set(key, { material: row.material, thickness: row.thickness, width: row.width, length: row.length, block: blockCode, needed: 0 });
      }
      grouped.get(key)!.needed++;
    }

    let confirmed = 0;
    let skipped = 0;

    for (const spec of grouped.values()) {
      const { material, thickness, width, length, block: blockCode, needed } = spec;

      // 이미 이 블록으로 확정된 수량
      const alreadyCount = await prisma.steelPlan.count({
        where: { vesselCode, material, thickness, width, length, status: "RECEIVED", reservedFor: blockCode },
      });

      const toConfirm = needed - alreadyCount;
      if (toConfirm <= 0) { skipped += needed; continue; }

      // 미확정 판 toConfirm개 한 번에 조회
      const plans = await prisma.steelPlan.findMany({
        where: { vesselCode, material, thickness, width, length, status: "RECEIVED", reservedFor: null },
        take: toConfirm,
        orderBy: { createdAt: "asc" },
      });

      for (const plan of plans) {
        await prisma.steelPlan.update({
          where: { id: plan.id },
          data: { reservedFor: blockCode },
        });
        confirmed++;
      }
      skipped += toConfirm - plans.length;
    }

    return NextResponse.json({ success: true, data: { confirmed, skipped } });
  } catch (error) {
    console.error("[POST /api/drawings/reserve-bulk]", error);
    return NextResponse.json({ success: false, error: "일괄 확정 중 오류가 발생했습니다." }, { status: 500 });
  }
}

// DELETE /api/drawings/reserve-bulk
// body: { projectId: string }
// 해당 프로젝트의 WAITING 행 전체 확정 취소
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

    const waitingRows = await prisma.drawingList.findMany({
      where: { projectId, status: "WAITING" },
    });

    let cancelled = 0;
    for (const drawing of waitingRows) {
      const { material, thickness, width, length, block } = drawing;
      const blockCode = block ?? "UNKNOWN";

      const { count } = await prisma.steelPlan.updateMany({
        where: { vesselCode, material, thickness, width, length, status: "RECEIVED", reservedFor: blockCode },
        data: { reservedFor: null },
      });
      cancelled += count;
    }

    return NextResponse.json({ success: true, data: { cancelled } });
  } catch (error) {
    console.error("[DELETE /api/drawings/reserve-bulk]", error);
    return NextResponse.json({ success: false, error: "일괄 확정 취소 중 오류가 발생했습니다." }, { status: 500 });
  }
}

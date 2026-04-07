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

    // WAITING 행 전체 조회
    const waitingRows = await prisma.drawingList.findMany({
      where: { projectId, status: "WAITING" },
    });

    let confirmed = 0;
    let skipped = 0;

    for (const drawing of waitingRows) {
      const { material, thickness, width, length, block } = drawing;
      const blockCode = block ?? "UNKNOWN";

      // 이미 이 블록으로 확정된 판이 있는지 확인 (중복 방지)
      const alreadyReserved = await prisma.steelPlan.findFirst({
        where: { vesselCode, material, thickness, width, length, status: "RECEIVED", reservedFor: blockCode },
      });
      if (alreadyReserved) { skipped++; continue; }

      // 미확정 판 찾기
      const steelPlan = await prisma.steelPlan.findFirst({
        where: { vesselCode, material, thickness, width, length, status: "RECEIVED", reservedFor: null },
      });
      if (!steelPlan) { skipped++; continue; }

      await prisma.steelPlan.update({
        where: { id: steelPlan.id },
        data: { reservedFor: blockCode },
      });
      confirmed++;
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

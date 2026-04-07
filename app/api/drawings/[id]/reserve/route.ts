import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// POST /api/drawings/[id]/reserve  - 스케줄 확정
// DELETE /api/drawings/[id]/reserve - 확정 취소

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // DrawingList 행 조회
    const drawing = await prisma.drawingList.findUnique({
      where: { id },
      include: { project: { select: { projectCode: true } } },
    });
    if (!drawing) {
      return NextResponse.json({ success: false, error: "항목을 찾을 수 없습니다." }, { status: 404 });
    }
    if (drawing.status !== "WAITING") {
      return NextResponse.json({ success: false, error: "입고(WAITING) 상태인 항목만 확정할 수 있습니다." }, { status: 400 });
    }

    const { material, thickness, width, length } = drawing;
    const vesselCode = drawing.project.projectCode;
    const block = drawing.block ?? "UNKNOWN";

    // 같은 규격의 RECEIVED SteelPlan 중 미확정(reservedFor가 null) 판 1개 찾기
    const steelPlan = await prisma.steelPlan.findFirst({
      where: {
        vesselCode,
        material,
        thickness,
        width,
        length,
        status: "RECEIVED",
        reservedFor: null,
      },
    });
    if (!steelPlan) {
      return NextResponse.json(
        { success: false, error: "확정 가능한 입고 판재가 없습니다. (이미 모두 확정됨)" },
        { status: 400 }
      );
    }

    await prisma.steelPlan.update({
      where: { id: steelPlan.id },
      data: { reservedFor: block },
    });

    return NextResponse.json({ success: true, reservedSteelPlanId: steelPlan.id, block });
  } catch (error) {
    console.error("[POST /api/drawings/[id]/reserve]", error);
    return NextResponse.json({ success: false, error: "확정 처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const drawing = await prisma.drawingList.findUnique({
      where: { id },
      include: { project: { select: { projectCode: true } } },
    });
    if (!drawing) {
      return NextResponse.json({ success: false, error: "항목을 찾을 수 없습니다." }, { status: 404 });
    }

    const { material, thickness, width, length } = drawing;
    const vesselCode = drawing.project.projectCode;
    const block = drawing.block ?? "UNKNOWN";

    // 이 블록으로 확정된 같은 규격 SteelPlan 1개 찾아서 reservedFor 초기화
    const steelPlan = await prisma.steelPlan.findFirst({
      where: {
        vesselCode,
        material,
        thickness,
        width,
        length,
        status: "RECEIVED",
        reservedFor: block,
      },
    });
    if (!steelPlan) {
      return NextResponse.json(
        { success: false, error: "이 블록으로 확정된 판재를 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    await prisma.steelPlan.update({
      where: { id: steelPlan.id },
      data: { reservedFor: null },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/drawings/[id]/reserve]", error);
    return NextResponse.json({ success: false, error: "확정 취소 중 오류가 발생했습니다." }, { status: 500 });
  }
}

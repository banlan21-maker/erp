import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// POST /api/mgmt-inspection/[id]/complete
// 검사 완료 처리: 최종 검사일 업데이트 + 이력 누적
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { completedAt, memo } = await request.json();

    if (!completedAt) {
      return NextResponse.json({ success: false, error: "완료일은 필수입니다." }, { status: 400 });
    }

    const item = await prisma.mgmtInspectionItem.findUnique({ where: { id } });
    if (!item) {
      return NextResponse.json({ success: false, error: "검사 항목을 찾을 수 없습니다." }, { status: 404 });
    }

    const completedDate = new Date(completedAt);
    const nextDate = new Date(completedDate);
    nextDate.setMonth(nextDate.getMonth() + item.periodMonth);

    const [updatedItem, log] = await prisma.$transaction([
      prisma.mgmtInspectionItem.update({
        where: { id },
        data: {
          lastInspectedAt: completedDate,
          nextInspectAt: nextDate,
        },
      }),
      prisma.mgmtInspectionLog.create({
        data: {
          itemId: id,
          completedAt: completedDate,
          memo: memo?.trim() || null,
        },
      }),
    ]);

    return NextResponse.json({ success: true, data: { item: updatedItem, log } });
  } catch (error) {
    console.error("[POST /api/mgmt-inspection/[id]/complete]", error);
    return NextResponse.json({ success: false, error: "검사 완료 처리 오류" }, { status: 500 });
  }
}

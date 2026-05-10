import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { count, memo } = await request.json();
    const record = await prisma.mealRecord.update({
      where: { id },
      data: {
        ...(count !== undefined ? { count: Number(count) } : {}),
        ...(memo !== undefined ? { memo: memo?.trim() || null } : {}),
      },
    });
    return NextResponse.json({ success: true, data: record });
  } catch (error) {
    console.error("[PATCH /api/meal-record/[id]]", error);
    return NextResponse.json({ success: false, error: "수정 오류" }, { status: 500 });
  }
}

export async function DELETE(
  _: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.mealRecord.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/meal-record/[id]]", error);
    return NextResponse.json({ success: false, error: "삭제 오류" }, { status: 500 });
  }
}

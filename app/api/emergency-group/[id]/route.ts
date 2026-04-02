import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// PATCH /api/emergency-group/[id] — 그룹 수정 (이름, 순서)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { name, sortOrder } = await request.json();
    const group = await prisma.emergencyGroup.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name: name.trim() } : {}),
        ...(sortOrder !== undefined ? { sortOrder: Number(sortOrder) } : {}),
      },
    });
    return NextResponse.json({ success: true, data: group });
  } catch (error) {
    console.error("[PATCH /api/emergency-group/[id]]", error);
    return NextResponse.json({ success: false, error: "수정 오류" }, { status: 500 });
  }
}

// DELETE /api/emergency-group/[id] — 그룹 삭제 (항목 cascade)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.emergencyGroup.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/emergency-group/[id]]", error);
    return NextResponse.json({ success: false, error: "삭제 오류" }, { status: 500 });
  }
}

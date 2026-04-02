import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// PATCH /api/emergency-contact/[id] — 항목 수정 (순서, 정보)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const contact = await prisma.emergencyContact.update({
      where: { id },
      data: {
        ...(body.sortOrder !== undefined ? { sortOrder: Number(body.sortOrder) } : {}),
        ...(body.directName !== undefined ? { directName: body.directName?.trim() || null } : {}),
        ...(body.directPhone !== undefined ? { directPhone: body.directPhone?.trim() || null } : {}),
        ...(body.groupId !== undefined ? { groupId: body.groupId } : {}),
      },
    });
    return NextResponse.json({ success: true, data: contact });
  } catch (error) {
    console.error("[PATCH /api/emergency-contact/[id]]", error);
    return NextResponse.json({ success: false, error: "수정 오류" }, { status: 500 });
  }
}

// DELETE /api/emergency-contact/[id] — 항목 삭제
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.emergencyContact.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/emergency-contact/[id]]", error);
    return NextResponse.json({ success: false, error: "삭제 오류" }, { status: 500 });
  }
}

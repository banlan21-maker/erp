import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// PATCH /api/workers/[id]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { name, nationality, birthDate, phone, role, position, joinDate, bloodType, shoeSize, winterTop, winterBottom, summerTop, summerBottom } = await request.json();

    if (!name?.trim()) {
      return NextResponse.json({ success: false, error: "이름은 필수입니다." }, { status: 400 });
    }

    const updated = await prisma.worker.update({
      where: { id },
      data: {
        name: name.trim(),
        nationality: nationality?.trim() || null,
        birthDate: birthDate ? new Date(birthDate) : null,
        phone: phone?.trim() || null,
        role: role?.trim() || null,
        position: position?.trim() || null,
        joinDate: joinDate ? new Date(joinDate) : null,
        bloodType: bloodType?.trim() || null,
        shoeSize: shoeSize?.toString().trim() || null,
        winterTop: winterTop?.trim() || null,
        winterBottom: winterBottom?.trim() || null,
        summerTop: summerTop?.trim() || null,
        summerBottom: summerBottom?.trim() || null,
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("[PATCH /api/workers/[id]]", error);
    return NextResponse.json({ success: false, error: "수정 오류" }, { status: 500 });
  }
}

// DELETE /api/workers/[id]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.worker.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/workers/[id]]", error);
    return NextResponse.json({ success: false, error: "삭제 오류" }, { status: 500 });
  }
}

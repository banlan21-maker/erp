import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// PATCH /api/equipment/[id]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { name, type, status, memo } = await request.json();

    if (!name?.trim()) {
      return NextResponse.json({ success: false, error: "장비명은 필수입니다." }, { status: 400 });
    }

    const updated = await prisma.equipment.update({
      where: { id },
      data: {
        name:   name.trim(),
        type:   type   || undefined,
        status: status || undefined,
        memo:   memo?.trim() || null,
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("[PATCH /api/equipment/[id]]", error);
    return NextResponse.json({ success: false, error: "수정 오류" }, { status: 500 });
  }
}

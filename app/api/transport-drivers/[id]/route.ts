import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

// PATCH /api/transport-drivers/[id]
// — type 자체는 수정 불가 (REGULAR ↔ CHARTER 전환은 새로 등록)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();

    const data: Record<string, unknown> = {};
    if (body.name      !== undefined) {
      const v = String(body.name).trim();
      if (!v) return NextResponse.json({ success: false, error: "이름은 비울 수 없습니다." }, { status: 400 });
      data.name = v;
    }
    if (body.vehicleNo !== undefined) data.vehicleNo = (typeof body.vehicleNo === "string" ? body.vehicleNo.trim() : "") || null;
    if (body.phoneNo   !== undefined) data.phoneNo   = (typeof body.phoneNo   === "string" ? body.phoneNo.trim()   : "") || null;
    if (body.memo      !== undefined) data.memo      = (typeof body.memo      === "string" ? body.memo.trim()      : "") || null;

    const updated = await prisma.transportDriver.update({ where: { id }, data });
    return NextResponse.json({
      success: true,
      data: { ...updated, createdAt: updated.createdAt.toISOString(), updatedAt: updated.updatedAt.toISOString() },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json({ success: false, error: "동일한 종류·이름의 운전자가 이미 등록되어 있습니다." }, { status: 409 });
    }
    const msg = err instanceof Error ? err.message : "수정 실패";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

// DELETE /api/transport-drivers/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.transportDriver.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "삭제 실패";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

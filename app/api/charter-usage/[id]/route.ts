import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// PATCH /api/charter-usage/[id]
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();

    const data: Record<string, unknown> = {};
    if (body.date         !== undefined) data.date        = new Date(body.date);
    if (body.driverName   !== undefined) data.driverName  = String(body.driverName).trim();
    if (body.driverPhone  !== undefined) data.driverPhone = body.driverPhone?.trim() || null;
    if (body.vehicleNo    !== undefined) data.vehicleNo   = body.vehicleNo?.trim()   || null;
    if (body.items        !== undefined) data.items       = body.items?.trim()       || null;
    if (body.departure    !== undefined) data.departure   = body.departure?.trim()   || null;
    if (body.destination  !== undefined) data.destination = body.destination?.trim() || null;
    if (body.departTime   !== undefined) data.departTime  = body.departTime || null;
    if (body.cost         !== undefined) data.cost        = body.cost != null && body.cost !== "" ? Number(body.cost) : null;
    if (body.memo         !== undefined) data.memo        = body.memo?.trim() || null;

    const updated = await prisma.charterUsage.update({ where: { id }, data });
    return NextResponse.json({
      success: true,
      data: { ...updated, date: updated.date.toISOString().split("T")[0], createdAt: updated.createdAt.toISOString() },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "수정 실패";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

// DELETE /api/charter-usage/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.charterUsage.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "삭제 실패";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

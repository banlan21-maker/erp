import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const num = (v: unknown) => (v === "" || v == null ? null : Number(v));

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const b = await request.json();
    const rec = await prisma.gasFacilityCheck.update({
      where: { id },
      data: {
        ...(b.date !== undefined ? { date: b.date } : {}),
        ...(b.time !== undefined ? { time: b.time } : {}),
        ...(b.o2Pressure  !== undefined ? { o2Pressure:  num(b.o2Pressure) }  : {}),
        ...(b.o2Charge    !== undefined ? { o2Charge:    num(b.o2Charge) }    : {}),
        ...(b.lpgPressure !== undefined ? { lpgPressure: num(b.lpgPressure) } : {}),
        ...(b.lpgCharge   !== undefined ? { lpgCharge:   num(b.lpgCharge) }   : {}),
        ...(b.co2Pressure !== undefined ? { co2Pressure: num(b.co2Pressure) } : {}),
        ...(b.co2Charge   !== undefined ? { co2Charge:   num(b.co2Charge) }   : {}),
        ...(b.memo        !== undefined ? { memo: b.memo?.trim() || null } : {}),
        ...(b.recordedBy  !== undefined ? { recordedBy: b.recordedBy?.trim() || null } : {}),
      },
    });
    return NextResponse.json({ success: true, data: rec });
  } catch (error) {
    console.error("[PATCH /api/facility/gas/[id]]", error);
    return NextResponse.json({ success: false, error: "수정 오류" }, { status: 500 });
  }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await prisma.gasFacilityCheck.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/facility/gas/[id]]", error);
    return NextResponse.json({ success: false, error: "삭제 오류" }, { status: 500 });
  }
}

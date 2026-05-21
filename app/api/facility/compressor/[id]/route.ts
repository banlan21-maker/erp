import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const num = (v: unknown) => (v === "" || v == null ? null : Number(v));

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const b = await request.json();
    const numFields = ["runtime1","runtime2","runtime3","pressure1","pressure2","pressure3","temp1","temp2","temp3"] as const;
    const strFields = ["visual1","visual2","visual3"] as const;
    const data: Record<string, unknown> = {};
    if (b.date !== undefined) data.date = b.date;
    if (b.time !== undefined) data.time = b.time;
    for (const f of numFields) if (b[f] !== undefined) data[f] = num(b[f]);
    for (const f of strFields) if (b[f] !== undefined) data[f] = b[f]?.trim() || null;
    if (b.memo       !== undefined) data.memo = b.memo?.trim() || null;
    if (b.recordedBy !== undefined) data.recordedBy = b.recordedBy?.trim() || null;

    const rec = await prisma.compressorCheck.update({ where: { id }, data });
    return NextResponse.json({ success: true, data: rec });
  } catch (error) {
    console.error("[PATCH /api/facility/compressor/[id]]", error);
    return NextResponse.json({ success: false, error: "수정 오류" }, { status: 500 });
  }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await prisma.compressorCheck.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/facility/compressor/[id]]", error);
    return NextResponse.json({ success: false, error: "삭제 오류" }, { status: 500 });
  }
}

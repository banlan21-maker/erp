export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// PATCH /api/billing/clients/[id]
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const b = await req.json();
    const num = (v: unknown) => { if (v === "" || v == null) return null; const n = Number(v); return Number.isFinite(n) ? n : null; };
    const data: Record<string, unknown> = {};
    for (const k of ["name", "bizNo", "ceo", "address", "bizType", "bizItem", "phone", "memo"] as const) {
      if (b?.[k] !== undefined) data[k] = String(b[k]).trim() || (k === "name" ? undefined : null);
    }
    if (data.name === undefined && b?.name !== undefined) return NextResponse.json({ success: false, error: "상호는 비울 수 없습니다." }, { status: 400 });
    if (b?.unit !== undefined) data.unit = b.unit === "KG" ? "KG" : "TON";
    if (b?.rateMode !== undefined) data.rateMode = b.rateMode === "FLAT" ? "FLAT" : "BLOCK";
    if (b?.defaultRate !== undefined) data.defaultRate = num(b.defaultRate);
    if (b?.addCutRate !== undefined) data.addCutRate = num(b.addCutRate);
    if (b?.bomStartRow !== undefined) data.bomStartRow = Math.max(1, parseInt(b.bomStartRow) || 3);
    for (const [k, col] of [["bomColHo", b?.bomColHo], ["bomColBlock", b?.bomColBlock], ["bomColQty", b?.bomColQty], ["bomColWeight", b?.bomColWeight]] as const) {
      if (col !== undefined && String(col).trim()) data[k] = String(col).trim().toUpperCase();
    }

    const updated = await prisma.billingClient.update({ where: { id }, data });
    return NextResponse.json({ success: true, data: updated });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

// DELETE /api/billing/clients/[id]
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const cnt = await prisma.billingStatement.count({ where: { clientId: id } });
    if (cnt > 0) return NextResponse.json({ success: false, error: `기성청구 ${cnt}건이 있어 삭제할 수 없습니다. 먼저 청구서를 삭제하세요.` }, { status: 400 });
    await prisma.billingClient.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

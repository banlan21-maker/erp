export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/billing/clients — 원청 목록
export async function GET() {
  try {
    const data = await prisma.billingClient.findMany({ orderBy: { name: "asc" } });
    return NextResponse.json({ success: true, data });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

// POST /api/billing/clients — 원청 생성
export async function POST(req: NextRequest) {
  try {
    const b = await req.json();
    const name = String(b?.name ?? "").trim();
    if (!name) return NextResponse.json({ success: false, error: "원청 상호를 입력하세요." }, { status: 400 });
    const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n !== 0 ? n : null; };
    const created = await prisma.billingClient.create({
      data: {
        name,
        bizNo:   b?.bizNo?.trim() || null,
        ceo:     b?.ceo?.trim() || null,
        address: b?.address?.trim() || null,
        bizType: b?.bizType?.trim() || null,
        bizItem: b?.bizItem?.trim() || null,
        phone:   b?.phone?.trim() || null,
        unit:     b?.unit === "KG" ? "KG" : "TON",
        rateMode: b?.rateMode === "FLAT" ? "FLAT" : "BLOCK",
        defaultRate: num(b?.defaultRate),
        addCutRate:  num(b?.addCutRate),
        memo:    b?.memo?.trim() || null,
      },
    });
    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

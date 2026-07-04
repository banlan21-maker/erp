export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/billing/statements?ym=YYYY-MM&clientId=  — 월별·업체별 목록
export async function GET(req: NextRequest) {
  try {
    const sp = new URL(req.url).searchParams;
    const where: Record<string, unknown> = {};
    const ym = sp.get("ym"); if (ym) where.ym = ym;
    const clientId = sp.get("clientId"); if (clientId) where.clientId = clientId;

    const data = await prisma.billingStatement.findMany({
      where,
      include: { client: { select: { id: true, name: true } }, _count: { select: { items: true } } },
      orderBy: [{ ym: "desc" }, { createdAt: "desc" }],
    });
    return NextResponse.json({ success: true, data });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

// POST /api/billing/statements  { clientId, ym, title? } — 빈 기성청구 생성
export async function POST(req: NextRequest) {
  try {
    const b = await req.json();
    const clientId = String(b?.clientId ?? "");
    const ym = String(b?.ym ?? "");
    if (!clientId) return NextResponse.json({ success: false, error: "원청을 선택하세요." }, { status: 400 });
    if (!/^\d{4}-\d{2}$/.test(ym)) return NextResponse.json({ success: false, error: "청구월(YYYY-MM)을 선택하세요." }, { status: 400 });
    const client = await prisma.billingClient.findUnique({ where: { id: clientId } });
    if (!client) return NextResponse.json({ success: false, error: "원청을 찾을 수 없습니다." }, { status: 400 });

    const created = await prisma.billingStatement.create({
      data: { clientId, ym, title: b?.title?.trim() || "기성청구서" },
    });
    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

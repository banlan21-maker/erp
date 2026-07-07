export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/billing/authors — 작성자 목록
export async function GET() {
  try {
    const data = await prisma.billingAuthor.findMany({ orderBy: { createdAt: "asc" } });
    return NextResponse.json({ success: true, data });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

// POST /api/billing/authors  { name, title }
export async function POST(req: NextRequest) {
  try {
    const b = await req.json();
    const name = String(b?.name ?? "").trim();
    if (!name) return NextResponse.json({ success: false, error: "이름을 입력하세요." }, { status: 400 });
    const created = await prisma.billingAuthor.create({ data: { name, title: b?.title?.trim() || null } });
    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

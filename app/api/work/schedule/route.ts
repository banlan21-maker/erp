export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ymdToDate, monthRange, isYmd, isYearMonth } from "@/lib/work-date";

// GET /api/work/schedule?month=YYYY-MM  → 그 달 일정
export async function GET(req: NextRequest) {
  try {
    const month = new URL(req.url).searchParams.get("month");
    if (month && !isYearMonth(month)) return NextResponse.json({ success: false, error: "month(YYYY-MM) 형식 오류" }, { status: 400 });
    const where = month ? (() => { const { start, end } = monthRange(month); return { date: { gte: start, lt: end } }; })() : {};
    const items = await prisma.workSchedule.findMany({
      where,
      include: { user: { select: { id: true, name: true, color: true } } },
      orderBy: { date: "asc" },
    });
    return NextResponse.json({ success: true, data: items });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

// POST /api/work/schedule  { date, title, color?, userId? }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const date = body?.date;
    const title = String(body?.title ?? "").trim();
    if (!isYmd(date)) return NextResponse.json({ success: false, error: "날짜 형식 오류" }, { status: 400 });
    if (!title) return NextResponse.json({ success: false, error: "일정 내용을 입력하세요." }, { status: 400 });
    let userId: string | null = null;
    if (body?.userId) {
      userId = String(body.userId);
      const u = await prisma.workUser.findUnique({ where: { id: userId }, select: { id: true } });
      if (!u) return NextResponse.json({ success: false, error: "선택한 사용자를 찾을 수 없습니다." }, { status: 400 });
    }
    const item = await prisma.workSchedule.create({
      data: {
        date: ymdToDate(date), title,
        color:  body?.color ? String(body.color).trim() || null : null,
        userId,
      },
      include: { user: { select: { id: true, name: true, color: true } } },
    });
    return NextResponse.json({ success: true, data: item }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

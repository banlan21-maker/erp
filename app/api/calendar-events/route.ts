/**
 * 랜딩 페이지 달력 일정 — 월 단위 조회/등록
 *
 * GET  /api/calendar-events?year=YYYY&month=MM
 * POST /api/calendar-events  { date: "YYYY-MM-DD", registrar, content }
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const startOfMonth = (y: number, m: number) => new Date(y, m - 1, 1);
const startOfNextMonth = (y: number, m: number) => new Date(y, m, 1);

export async function GET(req: NextRequest) {
  try {
    const sp = new URL(req.url).searchParams;
    const y = parseInt(sp.get("year") ?? "");
    const m = parseInt(sp.get("month") ?? "");
    if (!y || !m) {
      return NextResponse.json({ success: false, error: "year, month 가 필요합니다." }, { status: 400 });
    }
    const list = await prisma.calendarEvent.findMany({
      where: { date: { gte: startOfMonth(y, m), lt: startOfNextMonth(y, m) } },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    });
    return NextResponse.json({
      success: true,
      data: list.map(e => ({
        ...e,
        date: e.date.toISOString().split("T")[0],
        createdAt: e.createdAt.toISOString(),
        updatedAt: e.updatedAt.toISOString(),
      })),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "조회 실패";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const dateStr   = typeof body?.date      === "string" ? body.date.trim()      : "";
    const registrar = typeof body?.registrar === "string" ? body.registrar.trim() : "";
    const content   = typeof body?.content   === "string" ? body.content.trim()   : "";

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return NextResponse.json({ success: false, error: "날짜 형식이 올바르지 않습니다. (YYYY-MM-DD)" }, { status: 400 });
    }
    if (!registrar) return NextResponse.json({ success: false, error: "등록자를 입력해주세요." }, { status: 400 });
    if (!content)   return NextResponse.json({ success: false, error: "일정 내용을 입력해주세요." }, { status: 400 });

    // YYYY-MM-DD → 해당 일자 자정 (UTC 기준) 으로 저장
    const [y, m, d] = dateStr.split("-").map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));

    const created = await prisma.calendarEvent.create({
      data: { date, registrar, content },
    });
    return NextResponse.json({
      success: true,
      data: {
        ...created,
        date: created.date.toISOString().split("T")[0],
        createdAt: created.createdAt.toISOString(),
        updatedAt: created.updatedAt.toISOString(),
      },
    }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "등록 실패";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

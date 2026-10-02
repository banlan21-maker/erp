export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isYmd, ymdToDate, dateToYmd } from "@/lib/work-date";
import { parseLine, type LineStatus } from "@/lib/work-line-status";
import { shiftYmd7 } from "@/lib/weekly-report";

/**
 * 주간보고 — 업무일지·일정에서 보고서에 넣을 항목 고르기 (2026-10-02)
 *
 * GET ?from&to
 *   logs   : 그 주 업무일지 줄(사람별). 같은 줄이 여러 날 반복되면 한 줄로 합치고 마지막 날 상태를 쓴다.
 *            '내일 계획'은 사람별 그 주 마지막 일지에서만(kind=plan).
 *   events : 이번 주 · 다음 주 일정 — 첫 화면 달력(CalendarEvent) + 업무 대시보드 일정(WorkSchedule)
 * 고르는 건 화면에서 하고, 고른 줄은 업무보고 글칸에 덧붙여 그 글과 함께 저장된다(따로 저장하지 않음).
 */

type LogItem = { text: string; status: LineStatus; kind: "today" | "plan"; dates: string[] };
type EventItem = { date: string; text: string; who: string | null; week: "this" | "next" };

// 비교용 — 앞머리 "- "·"· "·번호, 공백 차이는 같은 줄로 본다
const clean = (s: string) => s.replace(/^\s*(?:[-·•*]|\d+[.)])\s*/, "").trim();
const norm = (s: string) => clean(s).replace(/\s+/g, " ");

export async function GET(req: NextRequest) {
  try {
    const sp = new URL(req.url).searchParams;
    const from = sp.get("from") ?? "", to = sp.get("to") ?? "";
    if (!isYmd(from) || !isYmd(to) || from > to) return NextResponse.json({ success: false, error: "기간이 올바르지 않습니다." }, { status: 400 });
    const nFrom = shiftYmd7(from, 7), nTo = shiftYmd7(to, 7);
    const gte = ymdToDate(from), lte = ymdToDate(to);

    const logs = await prisma.workLog.findMany({
      where: { date: { gte, lte } },
      include: { user: { select: { name: true, active: true } } },
      orderBy: [{ date: "asc" }],
    });

    const byUser = new Map<string, Map<string, LogItem>>();
    const lastPlan = new Map<string, { date: string; plan: string }>();
    for (const l of logs) {
      const ymd = dateToYmd(l.date);
      const name = l.user.name;
      if (!byUser.has(name)) byUser.set(name, new Map());
      const m = byUser.get(name)!;
      for (const raw of l.todayWork.split(/\r?\n/)) {
        const { status, text } = parseLine(raw);
        const t = clean(text);
        if (!t) continue;
        const key = norm(text);
        const cur = m.get(key);
        if (cur) { cur.status = status; cur.text = t; if (!cur.dates.includes(ymd)) cur.dates.push(ymd); }
        else m.set(key, { text: t, status, kind: "today", dates: [ymd] });
      }
      if (l.tomorrowPlan.trim()) lastPlan.set(name, { date: ymd, plan: l.tomorrowPlan });
    }
    for (const [name, { date, plan }] of lastPlan) {
      const m = byUser.get(name)!;
      for (const raw of plan.split(/\r?\n/)) {
        const { status, text } = parseLine(raw);
        const t = clean(text);
        if (!t || m.has(`plan|${norm(text)}`)) continue;
        m.set(`plan|${norm(text)}`, { text: t, status, kind: "plan", dates: [date] });
      }
    }

    const evWhere = { date: { gte, lte: ymdToDate(nTo) } };
    const [cal, sch] = await Promise.all([
      prisma.calendarEvent.findMany({ where: evWhere, orderBy: [{ date: "asc" }, { createdAt: "asc" }] }),
      prisma.workSchedule.findMany({ where: evWhere, include: { user: { select: { name: true } } }, orderBy: { date: "asc" } }),
    ]);
    const events: EventItem[] = [
      ...cal.map(e => ({ date: dateToYmd(e.date), text: e.content.trim(), who: e.registrar || null })),
      ...sch.map(e => ({ date: dateToYmd(e.date), text: e.title.trim(), who: e.user?.name ?? null })),
    ]
      .filter(e => e.text && (e.date <= to || (e.date >= nFrom && e.date <= nTo)))
      .map(e => ({ ...e, week: (e.date <= to ? "this" : "next") as EventItem["week"] }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return NextResponse.json({
      success: true,
      logs: [...byUser].map(([user, m]) => ({ user, items: [...m.values()] })).filter(g => g.items.length),
      events,
    });
  } catch (e) {
    console.error("[GET /api/weekly-report/sources]", e);
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "조회 오류" }, { status: 500 });
  }
}

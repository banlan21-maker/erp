export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isYmd, ymdToDate, dateToYmd } from "@/lib/work-date";
import { buildAuto, buildOps, defaultPlan, defaultThisWeek, PLAN_ROWS, rangeLabel, shiftYmd7, type PlanKey, type PlanRow } from "@/lib/weekly-report";

/**
 * 주간보고 — 업무관리 > 보고서 > 주간보고 (2026-10-02)
 *
 * GET ?from=YYYY-MM-DD&to=YYYY-MM-DD
 *   → { ops(가동현황, 작업일보에서 계산), auto(숫자 칸), form(저장값 또는 초안), saved, prevExists }
 * PUT { from, to, writer, writtenAt, opsNotes, plan, report } → 저장(기간 시작일 기준 1건)
 */

type Report = { thisWeek: string; nextWeek: string; problems: string; requests: string; thisRange: string; nextRange: string };

export async function GET(req: NextRequest) {
  try {
    const sp = new URL(req.url).searchParams;
    const from = sp.get("from") ?? "", to = sp.get("to") ?? "";
    if (!isYmd(from) || !isYmd(to) || from > to) return NextResponse.json({ success: false, error: "기간이 올바르지 않습니다." }, { status: 400 });

    const saved = await prisma.weeklyReport.findUnique({ where: { periodFrom: ymdToDate(from) } });
    const notes = (saved?.opsNotes ?? {}) as Record<string, string>;
    const ops = await buildOps(from, to, notes);
    const auto = await buildAuto(from, to, ops);

    const dPlan = defaultPlan(auto);
    const sPlan = (saved?.plan ?? null) as { rows?: Partial<Record<PlanKey, PlanRow>>; special?: string } | null;
    const rows = Object.fromEntries(PLAN_ROWS.map(r => [r.key, sPlan?.rows?.[r.key] ?? dPlan[r.key]])) as Record<PlanKey, PlanRow>;
    const sRep = (saved?.report ?? null) as Partial<Report> | null;
    const report: Report = {
      thisWeek:  sRep?.thisWeek  ?? defaultThisWeek(auto),
      nextWeek:  sRep?.nextWeek  ?? "",
      problems:  sRep?.problems  ?? "",
      requests:  sRep?.requests  ?? "",
      thisRange: sRep?.thisRange ?? rangeLabel(from, to),
      nextRange: sRep?.nextRange ?? rangeLabel(shiftYmd7(from, 7), shiftYmd7(to, 7)),
    };
    const prev = await prisma.weeklyReport.findFirst({ where: { periodFrom: { lt: ymdToDate(from) } }, orderBy: { periodFrom: "desc" }, select: { periodFrom: true } });

    return NextResponse.json({
      success: true,
      ops, auto,
      form: {
        writer: saved?.writer ?? "",
        writtenAt: saved?.writtenAt ? dateToYmd(saved.writtenAt) : "",
        plan: { rows, special: sPlan?.special ?? "" },
        report,
      },
      saved: saved ? { updatedAt: saved.updatedAt } : null,
      prev: prev ? dateToYmd(prev.periodFrom) : null,
    });
  } catch (e) {
    console.error("[GET /api/weekly-report]", e);
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "조회 오류" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const b = await req.json();
    const from = String(b?.from ?? ""), to = String(b?.to ?? "");
    if (!isYmd(from) || !isYmd(to) || from > to) return NextResponse.json({ success: false, error: "기간이 올바르지 않습니다." }, { status: 400 });
    const data = {
      periodTo: ymdToDate(to),
      writer: String(b.writer ?? "").trim() || null,
      writtenAt: isYmd(b.writtenAt) ? ymdToDate(b.writtenAt) : null,
      opsNotes: (b.opsNotes ?? {}) as Prisma.InputJsonValue,
      plan: (b.plan ?? {}) as Prisma.InputJsonValue,
      report: (b.report ?? {}) as Prisma.InputJsonValue,
    };
    const r = await prisma.weeklyReport.upsert({
      where: { periodFrom: ymdToDate(from) },
      create: { periodFrom: ymdToDate(from), ...data },
      update: data,
    });
    return NextResponse.json({ success: true, updatedAt: r.updatedAt });
  } catch (e) {
    console.error("[PUT /api/weekly-report]", e);
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "저장 오류" }, { status: 500 });
  }
}

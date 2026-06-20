export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ymdToDate, shiftYmd, monthRange, isYmd, isYearMonth } from "@/lib/work-date";

/**
 * GET /api/work/logs
 *   ?userId=&date=YYYY-MM-DD  → 그 날짜의 일지 + 어제(전일 오늘업무) 자동
 *   ?userId=&month=YYYY-MM    → 그 달의 일지 목록 (달력 마커용)
 *
 * PUT /api/work/logs  { userId, date, todayWork, tomorrowPlan }  → upsert
 */
export async function GET(req: NextRequest) {
  try {
    const sp = new URL(req.url).searchParams;
    const userId = sp.get("userId") ?? "";
    if (!userId) return NextResponse.json({ success: false, error: "userId 가 필요합니다." }, { status: 400 });

    const month = sp.get("month");
    if (month) {
      if (!isYearMonth(month)) return NextResponse.json({ success: false, error: "month(YYYY-MM) 형식 오류" }, { status: 400 });
      const { start, end } = monthRange(month);
      const logs = await prisma.workLog.findMany({
        where: { userId, date: { gte: start, lt: end } },
        orderBy: { date: "asc" },
      });
      return NextResponse.json({ success: true, data: logs });
    }

    const date = sp.get("date");
    if (!isYmd(date)) return NextResponse.json({ success: false, error: "date(YYYY-MM-DD) 가 필요합니다." }, { status: 400 });

    const [log, prev] = await Promise.all([
      prisma.workLog.findUnique({ where: { userId_date: { userId, date: ymdToDate(date) } } }),
      prisma.workLog.findUnique({ where: { userId_date: { userId, date: ymdToDate(shiftYmd(date, -1)) } } }),
    ]);
    return NextResponse.json({
      success: true,
      data: {
        log,                                       // 그 날짜 일지 (없으면 null)
        yesterdayWork: prev?.todayWork ?? "",      // 어제 칸 = 전일 오늘업무 (읽기전용)
      },
    });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const userId = String(body?.userId ?? "");
    const date = body?.date;
    if (!userId) return NextResponse.json({ success: false, error: "사용자를 선택하세요." }, { status: 400 });
    if (!isYmd(date)) return NextResponse.json({ success: false, error: "날짜 형식 오류" }, { status: 400 });
    const todayWork    = typeof body?.todayWork    === "string" ? body.todayWork    : "";
    const tomorrowPlan = typeof body?.tomorrowPlan === "string" ? body.tomorrowPlan : "";
    const d = ymdToDate(date);

    const exists = await prisma.workUser.findUnique({ where: { id: userId }, select: { id: true } });
    if (!exists) return NextResponse.json({ success: false, error: "선택한 사용자를 찾을 수 없습니다." }, { status: 400 });

    let log;
    try {
      log = await prisma.workLog.upsert({
        where:  { userId_date: { userId, date: d } },
        update: { todayWork, tomorrowPlan },
        create: { userId, date: d, todayWork, tomorrowPlan },
      });
    } catch (e) {
      // 동시 호출 race — upsert 가 INSERT 충돌(P2002) 나면 이미 행이 생겼으므로 UPDATE 폴백
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        log = await prisma.workLog.update({ where: { userId_date: { userId, date: d } }, data: { todayWork, tomorrowPlan } });
      } else throw e;
    }
    return NextResponse.json({ success: true, data: log });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

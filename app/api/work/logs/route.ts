export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ymdToDate, dateToYmd, shiftYmd, monthRange, isYmd, isYearMonth } from "@/lib/work-date";

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

    // 팀 전체 — 특정 날짜의 모든 사용자 일지 (업무 대시보드 좌측 리스트)
    if (sp.get("all") === "true") {
      const date = sp.get("date");
      if (!isYmd(date)) return NextResponse.json({ success: false, error: "date(YYYY-MM-DD) 가 필요합니다." }, { status: 400 });
      const logs = await prisma.workLog.findMany({
        where: { date: ymdToDate(date) },
        include: { user: { select: { id: true, name: true, color: true, dept: true, active: true } } },
        orderBy: { updatedAt: "desc" },
      });
      return NextResponse.json({ success: true, data: logs });
    }

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

    // 어제 칸 = '직전 근무일' 일지. 전날(D-1) 고정이 아니라 **가장 최근에 작성된 이전 일지**를 찾는다.
    // (주말·연휴·휴가 다음 근무일에 진행중 업무 이어받기가 끊기던 문제 — 2026-08-12)
    // 무한 소급 방지를 위해 14일 이내로 제한하고, 내용이 완전히 빈 행은 건너뛴다.
    const [log, prev] = await Promise.all([
      prisma.workLog.findUnique({ where: { userId_date: { userId, date: ymdToDate(date) } } }),
      prisma.workLog.findFirst({
        where: {
          userId,
          date: { lt: ymdToDate(date), gte: ymdToDate(shiftYmd(date, -14)) },
          NOT: { AND: [{ todayWork: "" }, { tomorrowPlan: "" }] },
        },
        orderBy: { date: "desc" },
      }),
    ]);
    return NextResponse.json({
      success: true,
      data: {
        log,                                          // 그 날짜 일지 (없으면 null)
        yesterdayWork: prev?.todayWork ?? "",         // 어제 칸 = 직전 근무일 오늘업무
        prevTomorrowPlan: prev?.tomorrowPlan ?? "",   // 직전 근무일 내일계획 → 자동 이어받기용
        prevDate: prev ? dateToYmd(prev.date) : null, // 어제 칸이 실제로 어느 날짜인지 (저장 대상)
        // 낙관적 잠금 기준 시각 — 저장 시 되돌려 보내 다른 탭/기기의 변경 덮어쓰기를 막는다
        updatedAt: log?.updatedAt ?? null,
        prevUpdatedAt: prev?.updatedAt ?? null,
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
    // 부분 업데이트 — 제공된 필드만 갱신(어제 칸 저장 시 todayWork만 보내 그날 tomorrowPlan 보존)
    const todayWork    = typeof body?.todayWork    === "string" ? body.todayWork    : undefined;
    const tomorrowPlan = typeof body?.tomorrowPlan === "string" ? body.tomorrowPlan : undefined;
    if (todayWork === undefined && tomorrowPlan === undefined) {
      return NextResponse.json({ success: false, error: "저장할 내용이 없습니다." }, { status: 400 });
    }
    const d = ymdToDate(date);
    const updateData: { todayWork?: string; tomorrowPlan?: string } = {};
    if (todayWork    !== undefined) updateData.todayWork    = todayWork;
    if (tomorrowPlan !== undefined) updateData.tomorrowPlan = tomorrowPlan;

    const exists = await prisma.workUser.findUnique({ where: { id: userId }, select: { id: true } });
    if (!exists) return NextResponse.json({ success: false, error: "선택한 사용자를 찾을 수 없습니다." }, { status: 400 });

    // 낙관적 잠금 — 화면을 불러온 뒤 다른 탭/기기에서 같은 날짜가 저장되었으면 덮어쓰지 않는다.
    // expectedUpdatedAt: ISO 문자열(= 불러올 때의 updatedAt) 또는 null(= 그때 행이 없었음).
    // 아예 보내지 않으면 검사 생략(구버전 클라이언트 호환).
    if (body?.expectedUpdatedAt !== undefined) {
      const cur = await prisma.workLog.findUnique({
        where: { userId_date: { userId, date: d } }, select: { updatedAt: true },
      });
      const expected = body.expectedUpdatedAt === null ? null : new Date(String(body.expectedUpdatedAt)).getTime();
      const actual   = cur ? cur.updatedAt.getTime() : null;
      if (expected !== actual) {
        return NextResponse.json({
          success: false, conflict: true,
          error: "이 날짜 일지가 다른 탭·기기에서 변경되었습니다. 새로고침해 최신 내용을 확인한 뒤 다시 저장하세요.",
        }, { status: 409 });
      }
    }

    let log;
    try {
      log = await prisma.workLog.upsert({
        where:  { userId_date: { userId, date: d } },
        update: updateData,
        create: { userId, date: d, todayWork: todayWork ?? "", tomorrowPlan: tomorrowPlan ?? "" },
      });
    } catch (e) {
      // 동시 호출 race — upsert 가 INSERT 충돌(P2002) 나면 이미 행이 생겼으므로 UPDATE 폴백
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        log = await prisma.workLog.update({ where: { userId_date: { userId, date: d } }, data: updateData });
      } else throw e;
    }
    return NextResponse.json({ success: true, data: log });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

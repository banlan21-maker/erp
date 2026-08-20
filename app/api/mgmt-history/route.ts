import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * GET /api/mgmt-history?year=YYYY[&month=MM]
 *
 * 장비 이력(수선·검사)을 한 번에 조회한다 — 이력통계 탭 전용.
 *   · summary : 그 해 12개월 요약 (건수 · 비용 · 비가동시간)
 *   · repairs / inspections : month 를 지정하면 그 달 상세, 없으면 그 해 전체
 *
 * ⚠ 검사는 '이력(완료된 것)' 을 본다 — MgmtInspectionLog.completedAt 기준.
 *   기존 /api/mgmt-inspection 의 GET 은 MgmtInspectionItem.nextInspectAt(= 검사 예정일)로
 *   조회해서 "앞으로 할 검사" 를 돌려준다. 지난 이력을 보려는 이 화면과는 축이 다르다.
 */

// 월 경계는 한국시간 기준 — 서버(도커)가 UTC 라 그냥 Date 를 쓰면 하루가 밀린다.
const kstMonthRange = (year: number, month: number) => {
  const start = new Date(`${year}-${String(month).padStart(2, "0")}-01T00:00:00.000+09:00`);
  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);
  return { start, end };
};

export async function GET(request: NextRequest) {
  try {
    const sp = new URL(request.url).searchParams;
    const year = parseInt(sp.get("year") ?? "", 10);
    const monthRaw = sp.get("month");
    const month = monthRaw && monthRaw !== "ALL" ? parseInt(monthRaw, 10) : null;

    if (!Number.isFinite(year)) {
      return NextResponse.json({ success: false, error: "연도가 필요합니다." }, { status: 400 });
    }

    const yearStart = kstMonthRange(year, 1).start;
    const yearEnd = kstMonthRange(year + 1, 1).start;

    const eqSelect = { select: { id: true, name: true, code: true, kind: true, managementNo: true, location: true } };

    // 그 해 전체를 한 번에 읽고 월별 집계는 메모리에서 — 12번 왕복하면 원격 DB 라 느리다
    const [yearRepairs, yearInspections] = await Promise.all([
      prisma.mgmtRepairLog.findMany({
        where: { repairedAt: { gte: yearStart, lt: yearEnd } },
        orderBy: [{ repairedAt: "asc" }, { createdAt: "asc" }],
        include: { equipment: eqSelect, costs: { orderBy: { sortOrder: "asc" } } },
      }),
      prisma.mgmtInspectionLog.findMany({
        where: { completedAt: { gte: yearStart, lt: yearEnd } },
        orderBy: [{ completedAt: "asc" }, { createdAt: "asc" }],
        include: {
          item: {
            select: {
              id: true, itemName: true, periodMonth: true, inspector: true,
              nextInspectAt: true, equipment: eqSelect,
            },
          },
        },
      }),
    ]);

    // 한국시간 기준으로 몇 월인지 — UTC 로 판정하면 매월 1일 09시 이전 건이 전달로 밀린다
    const kstMonth = (d: Date) =>
      Number(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", month: "2-digit" }).format(d));

    const costOf = (r: (typeof yearRepairs)[number]) =>
      r.costs.length > 0 ? r.costs.reduce((s, c) => s + c.amount, 0) : (r.cost ?? 0);

    const summary = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      repairCount: 0,
      repairCost: 0,
      downtimeMinutes: 0,
      inspectionCount: 0,
    }));
    for (const r of yearRepairs) {
      const m = summary[kstMonth(r.repairedAt) - 1];
      m.repairCount++;
      m.repairCost += costOf(r);
      m.downtimeMinutes += r.downtimeMinutes ?? 0;
    }
    for (const g of yearInspections) summary[kstMonth(g.completedAt) - 1].inspectionCount++;

    // 상세 — month 지정 시 그 달만
    const inMonth = <T,>(rows: T[], pick: (x: T) => Date) =>
      month ? rows.filter(x => kstMonth(pick(x)) === month) : rows;

    const repairs = inMonth(yearRepairs, r => r.repairedAt).map(r => ({
      id: r.id,
      date: r.repairedAt,
      equipment: r.equipment,
      cause: r.cause,
      content: r.content,
      contractor: r.contractor,
      cost: costOf(r),
      costs: r.costs,
      downtimeMinutes: r.downtimeMinutes,
      memo: r.memo,
    }));

    const inspections = inMonth(yearInspections, g => g.completedAt).map(g => ({
      id: g.id,
      date: g.completedAt,
      equipment: g.item.equipment,
      itemName: g.item.itemName,
      periodMonth: g.item.periodMonth,
      inspector: g.item.inspector,
      nextInspectAt: g.item.nextInspectAt,
      memo: g.memo,
    }));

    return NextResponse.json({
      success: true,
      data: {
        year,
        month,
        summary,
        repairs,
        inspections,
        totals: {
          repairCount: repairs.length,
          repairCost: repairs.reduce((s, r) => s + r.cost, 0),
          downtimeMinutes: repairs.reduce((s, r) => s + (r.downtimeMinutes ?? 0), 0),
          inspectionCount: inspections.length,
          yearRepairCount: yearRepairs.length,
          yearRepairCost: yearRepairs.reduce((s, r) => s + costOf(r), 0),
          yearDowntimeMinutes: yearRepairs.reduce((s, r) => s + (r.downtimeMinutes ?? 0), 0),
          yearInspectionCount: yearInspections.length,
        },
      },
    });
  } catch (error) {
    console.error("[GET /api/mgmt-history]", error);
    return NextResponse.json({ success: false, error: "조회 오류" }, { status: 500 });
  }
}

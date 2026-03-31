import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * GET /api/schedules/load?from=YYYY-MM-DD&to=YYYY-MM-DD
 * 일별 CNC 부하 데이터
 * 부하 = 해당 날짜에 진행 중인 스케줄 수
 * 부하율 = 진행 블록 수 ÷ 4 (플라즈마 4대 기준)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const fromStr = searchParams.get("from");
    const toStr   = searchParams.get("to");

    if (!fromStr || !toStr) {
      return NextResponse.json(
        { success: false, error: "from, to 파라미터가 필요합니다." },
        { status: 400 }
      );
    }

    const from = new Date(fromStr);
    const to   = new Date(toStr);

    // 기간 내 활성 스케줄 전체 조회
    const schedules = await prisma.cncSchedule.findMany({
      where: {
        status: { notIn: ["CANCELLED", "COMPLETED"] },
        plannedStart: { lte: to },
        plannedEnd:   { gte: from },
      },
      select: {
        id: true,
        vesselCode: true,
        blockName: true,
        plannedStart: true,
        plannedEnd: true,
        status: true,
        priority: true,
      },
    });

    // 날짜별 부하 집계
    const loadMap: Record<string, { date: string; count: number; schedules: string[] }> = {};

    const cursor = new Date(from);
    while (cursor <= to) {
      const dateKey = cursor.toISOString().slice(0, 10);
      loadMap[dateKey] = { date: dateKey, count: 0, schedules: [] };
      cursor.setDate(cursor.getDate() + 1);
    }

    for (const s of schedules) {
      if (!s.plannedStart || !s.plannedEnd) continue;
      const start = new Date(s.plannedStart);
      const end   = new Date(s.plannedEnd);
      const cur   = new Date(Math.max(start.getTime(), from.getTime()));

      while (cur <= end && cur <= to) {
        const key = cur.toISOString().slice(0, 10);
        if (loadMap[key]) {
          loadMap[key].count++;
          loadMap[key].schedules.push(`[${s.vesselCode}] ${s.blockName}`);
        }
        cur.setDate(cur.getDate() + 1);
      }
    }

    const result = Object.values(loadMap).map(d => ({
      ...d,
      loadRate: Math.round((d.count / 4) * 100), // 플라즈마 4대 기준
    }));

    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

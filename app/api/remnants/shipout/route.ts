/**
 * 잔재 외부출고 선별 — 선별목록(출고 예약 풀) 추가/제거 + 조회
 *
 * GET  /api/remnants/shipout
 *   선별목록에 올라온(shipoutMarkedAt != null) 잔재 목록. 정식 출고된(EXHAUSTED) 것은 제외.
 *
 * POST /api/remnants/shipout  { action: "mark" | "unmark", ids: string[] }
 *   mark   : 잔재를 선별목록에 추가 (shipoutMarkedAt 마킹). status 는 그대로 둠(되돌리기 가능).
 *   unmark : 선별목록에서 제거 (마킹 해제).
 *
 * 강재(SteelPlan)의 shipout-mark 와 동일한 "마킹만, 상태 유지" 모델.
 */
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const remnants = await prisma.remnant.findMany({
      // 절단확정(reservedFor)된 잔재는 선별목록에서 제외 — steel-match 커버리지·출고검증과 대칭(절단↔출고 상호배제).
      where: { shipoutMarkedAt: { not: null }, status: { not: "EXHAUSTED" }, reservedFor: null },
      include: {
        sourceProject: { select: { projectCode: true, projectName: true } },
      },
      orderBy: { shipoutMarkedAt: "desc" },
    });
    return NextResponse.json({ success: true, data: remnants });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = body?.action === "unmark" ? "unmark" : "mark";
    const ids: string[] = Array.isArray(body?.ids) ? body.ids.filter((x: unknown): x is string => typeof x === "string") : [];
    if (ids.length === 0) {
      return NextResponse.json({ success: false, error: "대상 잔재가 없습니다." }, { status: 400 });
    }

    if (action === "mark") {
      // 출고 가능한 재고(IN_STOCK)만 선별 — 원판이 RECEIVED 만 선별하는 것과 대칭.
      //  · status != IN_STOCK (PENDING 미절단 / EXHAUSTED 소진) 제외
      //  · reservedFor 채워진(절단확정) 잔재 제외 — 절단↔출고 상호배제 (원판 shipout-mark 와 동일)
      //  · shipoutMarkedAt null (이미 선별된 것 제외)
      const result = await prisma.remnant.updateMany({
        where: { id: { in: ids }, status: "IN_STOCK", reservedFor: null, shipoutMarkedAt: null },
        data:  { shipoutMarkedAt: new Date() },
      });
      return NextResponse.json({ success: true, count: result.count, requested: ids.length });
    }

    // unmark
    const result = await prisma.remnant.updateMany({
      where: { id: { in: ids } },
      data:  { shipoutMarkedAt: null },
    });
    return NextResponse.json({ success: true, count: result.count, requested: ids.length });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

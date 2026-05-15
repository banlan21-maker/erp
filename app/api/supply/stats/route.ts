import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

interface ItemAggregate {
  item: unknown;
  inboundCurrent: number;
  inboundPrev:    number;
  outboundCurrent: number;
  outboundPrev:    number;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get("month"); // 'YYYY-MM'

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ success: false, error: "달력(month) 값이 필요합니다." }, { status: 400 });
    }

    const [y, m] = month.split("-");
    const currentStart = new Date(Number(y), Number(m) - 1, 1);
    const currentEnd   = new Date(Number(y), Number(m), 1);
    const prevStart    = new Date(Number(y), Number(m) - 2, 1);
    const prevEnd      = new Date(Number(y), Number(m) - 1, 1);

    const [currentIns, prevIns, currentOuts, prevOuts] = await Promise.all([
      prisma.supplyInbound.findMany({
        where: { receivedAt: { gte: currentStart, lt: currentEnd }, item: { category: "CONSUMABLE" } },
        include: { item: true },
      }),
      prisma.supplyInbound.findMany({
        where: { receivedAt: { gte: prevStart, lt: prevEnd }, item: { category: "CONSUMABLE" } },
      }),
      prisma.supplyOutbound.findMany({
        where: { usedAt: { gte: currentStart, lt: currentEnd }, item: { category: "CONSUMABLE" } },
        include: { item: true },
      }),
      prisma.supplyOutbound.findMany({
        where: { usedAt: { gte: prevStart, lt: prevEnd }, item: { category: "CONSUMABLE" } },
      }),
    ]);

    const statsMap = new Map<number, ItemAggregate>();
    const ensure = (itemId: number, item: unknown) => {
      if (!statsMap.has(itemId)) {
        statsMap.set(itemId, {
          item,
          inboundCurrent: 0, inboundPrev: 0,
          outboundCurrent: 0, outboundPrev: 0,
        });
      }
      const cur = statsMap.get(itemId)!;
      if (item) cur.item = item;
      return cur;
    };

    currentIns.forEach(row  => { ensure(row.itemId, row.item).inboundCurrent  += row.qty; });
    prevIns.forEach(row     => { ensure(row.itemId, null).inboundPrev          += row.qty; });
    currentOuts.forEach(row => { ensure(row.itemId, row.item).outboundCurrent += row.qty; });
    prevOuts.forEach(row    => { ensure(row.itemId, null).outboundPrev         += row.qty; });

    // item 정보가 없는 행(이전월에만 활동) → 별도 조회
    const missingIds = Array.from(statsMap.entries())
      .filter(([, v]) => !v.item)
      .map(([id]) => id);
    if (missingIds.length > 0) {
      const items = await prisma.supplyItem.findMany({ where: { id: { in: missingIds } } });
      items.forEach(it => { const s = statsMap.get(it.id); if (s) s.item = it; });
    }

    const result = Array.from(statsMap.values())
      .filter(s => s.item)
      .map(s => ({
        item: s.item,
        inboundCurrent:  s.inboundCurrent,
        inboundDiff:     s.inboundCurrent  - s.inboundPrev,
        outboundCurrent: s.outboundCurrent,
        outboundDiff:    s.outboundCurrent - s.outboundPrev,
      }))
      .sort((a, b) => (b.outboundCurrent + b.inboundCurrent) - (a.outboundCurrent + a.inboundCurrent));

    return NextResponse.json({ success: true, data: result });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "오류";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

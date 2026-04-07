import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get("month"); // 'YYYY-MM'
    const type = searchParams.get("type") || "outbound"; // 'outbound' | 'inbound'

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ success: false, error: "달력(month) 값이 필요합니다." }, { status: 400 });
    }

    const [y, m] = month.split("-");
    const currentStart = new Date(Number(y), Number(m) - 1, 1);
    const currentEnd   = new Date(Number(y), Number(m), 1);
    const prevStart    = new Date(Number(y), Number(m) - 2, 1);
    const prevEnd      = new Date(Number(y), Number(m) - 1, 1);

    const statsMap = new Map<number, any>();

    if (type === "inbound") {
      const [currentIns, prevIns] = await Promise.all([
        prisma.supplyInbound.findMany({
          where: { receivedAt: { gte: currentStart, lt: currentEnd }, item: { category: "CONSUMABLE" } },
          include: { item: true }
        }),
        prisma.supplyInbound.findMany({
          where: { receivedAt: { gte: prevStart, lt: prevEnd }, item: { category: "CONSUMABLE" } }
        })
      ]);

      currentIns.forEach(row => {
        if (!statsMap.has(row.itemId)) {
          statsMap.set(row.itemId, { item: row.item, currentQty: 0, prevQty: 0 });
        }
        statsMap.get(row.itemId).currentQty += row.qty;
      });
      prevIns.forEach(row => {
        if (!statsMap.has(row.itemId)) return;
        statsMap.get(row.itemId).prevQty += row.qty;
      });
    } else {
      const [currentOuts, prevOuts] = await Promise.all([
        prisma.supplyOutbound.findMany({
          where: { usedAt: { gte: currentStart, lt: currentEnd }, item: { category: "CONSUMABLE" } },
          include: { item: true }
        }),
        prisma.supplyOutbound.findMany({
          where: { usedAt: { gte: prevStart, lt: prevEnd }, item: { category: "CONSUMABLE" } }
        })
      ]);

      currentOuts.forEach(row => {
        if (!statsMap.has(row.itemId)) {
          statsMap.set(row.itemId, { item: row.item, currentQty: 0, prevQty: 0 });
        }
        statsMap.get(row.itemId).currentQty += row.qty;
      });
      prevOuts.forEach(row => {
        if (!statsMap.has(row.itemId)) return;
        statsMap.get(row.itemId).prevQty += row.qty;
      });
    }

    const result = Array.from(statsMap.values()).map(stat => ({
      item: stat.item,
      currentQty: stat.currentQty,
      prevQty: stat.prevQty,
      diff: stat.currentQty - stat.prevQty
    })).sort((a, b) => b.currentQty - a.currentQty);

    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

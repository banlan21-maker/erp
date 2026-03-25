import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      consumableCount,
      fixtureCount,
      monthlyOutboundCount,
      reorderItemsQuery,
      recentInbounds,
      recentOutbounds
    ] = await Promise.all([
      prisma.supplyItem.count({ where: { category: "CONSUMABLE" } }),
      prisma.supplyItem.count({ where: { category: "FIXTURE" } }),
      prisma.supplyOutbound.count({
        where: { usedAt: { gte: startOfMonth } }
      }),
      // 발주점(reorderPoint)이 존재하는 소모품만 1차로 로드
      prisma.supplyItem.findMany({
        where: { category: "CONSUMABLE", reorderPoint: { not: null } }
      }),
      prisma.supplyInbound.findMany({
        take: 5,
        orderBy: { receivedAt: "desc" },
        include: { item: true, vendor: true }
      }),
      prisma.supplyOutbound.findMany({
        take: 5,
        orderBy: { usedAt: "desc" },
        include: { item: true }
      })
    ]);

    // stockQty <= reorderPoint 조건 필터링 및 재고 부족한 순서로 정렬 (API 측 처리)
    const filteredReorderItems = reorderItemsQuery
      .filter((item) => item.stockQty <= (item.reorderPoint || 0))
      .sort((a, b) => a.stockQty - b.stockQty);

    return NextResponse.json({
      success: true,
      data: {
        needReorderCount: filteredReorderItems.length,
        consumableCount,
        fixtureCount,
        monthlyOutboundCount,
        reorderItems: filteredReorderItems,
        recentInbounds,
        recentOutbounds
      }
    });

  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "서버 통신 오류" },
      { status: 500 }
    );
  }
}

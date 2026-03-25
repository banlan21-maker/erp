import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get("month"); // 'YYYY-MM' 형식
    
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
       return NextResponse.json({ success: false, error: "달력(month) 값이 필요합니다." }, { status: 400 });
    }

    const [y, m] = month.split("-");
    
    // 타겟 월 (이번 달)
    const currentStart = new Date(Number(y), Number(m) - 1, 1);
    const currentEnd = new Date(Number(y), Number(m), 1);
    
    // 이전 월 (지난 달)
    const prevStart = new Date(Number(y), Number(m) - 2, 1);
    const prevEnd = new Date(Number(y), Number(m) - 1, 1);

    // 1. 쿼리 병렬 수행: 이번달 소모품 출고, 이전달 소모품 출고
    const [currentOuts, prevOuts] = await Promise.all([
      prisma.supplyOutbound.findMany({
        where: {
          usedAt: { gte: currentStart, lt: currentEnd },
          item: { category: "CONSUMABLE" } // 소모품 전용 집계
        },
        include: { item: true }
      }),
      prisma.supplyOutbound.findMany({
        where: {
          usedAt: { gte: prevStart, lt: prevEnd },
          item: { category: "CONSUMABLE" }
        }
      })
    ]);

    // 2. 집계 객체 만들기 (JS 메모리 그룹핑)
    // - itemId별로 current/prev 출고량 합산
    const statsMap = new Map<number, any>();

    // 今回의 달 데이터 집계
    currentOuts.forEach(out => {
      if (!statsMap.has(out.itemId)) {
        statsMap.set(out.itemId, {
          item: out.item,
          currentQty: 0,
          prevQty: 0
        });
      }
      statsMap.get(out.itemId).currentQty += out.qty;
    });

    // 이전 달 데이터 집계 (차이 계산용)
    prevOuts.forEach(out => {
      // 이번 달엔 쓰지 않았지만 이전 달에 쓴 내역까지 원한다면 set 추가
      // (현 요구사항: 해당 달의 소모품별 집계에서 증감을 보여줌, 만약 해당 달이 0이면 리스트에 안 나올 수 있음. 여기선 둘 다 포괄)
      if (!statsMap.has(out.itemId)) return; // 이번달 사용된 품목에 대해서만 증감 보여주기로 의도
      statsMap.get(out.itemId).prevQty += out.qty;
    });

    // 3. 포맷팅 및 정렬 (출고량 많은 순)
    const result = Array.from(statsMap.values()).map(stat => {
      const diff = stat.currentQty - stat.prevQty;
      return {
        item: stat.item,
        currentQty: stat.currentQty,
        prevQty: stat.prevQty,
        diff
      };
    }).sort((a, b) => b.currentQty - a.currentQty);

    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

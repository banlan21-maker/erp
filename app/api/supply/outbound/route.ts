import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { recomputeStockHistory } from "@/lib/recalc-supply-stock";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get("month");
    const search = searchParams.get("search");
    const subCategory = searchParams.get("subCategory");

    const where: any = {};
    
    if (month && /^\d{4}-\d{2}$/.test(month)) {
      const [y, m] = month.split("-");
      const start = new Date(Number(y), Number(m) - 1, 1);
      const end = new Date(Number(y), Number(m), 1);
      where.usedAt = { gte: start, lt: end };
    }

    if (search) {
      where.item = { name: { contains: search } };
    }
    
    if (subCategory && subCategory !== "all") {
      where.item = { ...where.item, subCategory };
    }

    const outbounds = await prisma.supplyOutbound.findMany({
      where,
      orderBy: { usedAt: "desc" },
      include: {
        item: true
      }
    });

    return NextResponse.json({ success: true, data: outbounds });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { itemId, qty, usedBy, memo, usedAt } = body;

    if (!itemId || !qty || !usedBy) {
      return NextResponse.json({ success: false, error: "필수 값이 누락되었습니다." }, { status: 400 });
    }

    const nQty = Number(qty);
    if (nQty <= 0) {
      return NextResponse.json({ success: false, error: "수량은 1 이상이어야 합니다." }, { status: 400 });
    }

    const usedDate = usedAt ? new Date(usedAt) : new Date();

    // 트랜잭션 처리: 출고 이력 추가 + 재고 수량 차감
    // 백데이트 대응: 이력 기록 후 시간순으로 stockQtyAfter 재계산
    const result = await prisma.$transaction(async (tx) => {
      // 1. 재고 체크 (현재 라이브 재고 기준)
      const currentItem = await tx.supplyItem.findUnique({ where: { id: Number(itemId) } });
      if (!currentItem) throw new Error("품목을 찾을 수 없습니다.");
      if (currentItem.stockQty < nQty) {
        throw new Error(`재고가 부족합니다. (현재 재고: ${currentItem.stockQty})`);
      }

      // 2. 재고 차감
      await tx.supplyItem.update({
        where: { id: Number(itemId) },
        data:  { stockQty: { decrement: nQty } },
      });

      // 3. 출고 이력 insert — stockQtyAfter는 임시값 (이후 recompute에서 확정)
      const outbound = await tx.supplyOutbound.create({
        data: {
          itemId:        Number(itemId),
          qty:           nQty,
          stockQtyAfter: 0,
          usedBy,
          memo,
          usedAt:        usedDate,
        },
      });

      // 4. 시간순 재계산 (백데이트 시 전·후 이력의 스냅샷도 보정)
      const finalQty = await recomputeStockHistory(tx, Number(itemId));

      // 5. 발주 기준점 경고 계산 (재계산된 최종 재고 기준)
      const isWarning = currentItem.category === "CONSUMABLE" &&
                        currentItem.reorderPoint !== null &&
                        finalQty <= currentItem.reorderPoint;

      const refreshed = await tx.supplyOutbound.findUnique({ where: { id: outbound.id } });
      return { outbound: refreshed ?? outbound, isWarning, updatedStockQty: finalQty };
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

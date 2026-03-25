import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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
    const { itemId, qty, usedBy, memo } = body;

    if (!itemId || !qty || !usedBy) {
      return NextResponse.json({ success: false, error: "필수 값이 누락되었습니다." }, { status: 400 });
    }

    const nQty = Number(qty);
    if (nQty <= 0) {
      return NextResponse.json({ success: false, error: "수량은 1 이상이어야 합니다." }, { status: 400 });
    }

    // 트랜잭션 처리: 출고 이력 추가 + 재고 수량 차감
    const result = await prisma.$transaction(async (tx) => {
      // 1. 재고 체크
      const currentItem = await tx.supplyItem.findUnique({ where: { id: Number(itemId) } });
      if (!currentItem) throw new Error("품목을 찾을 수 없습니다.");
      if (currentItem.stockQty < nQty) {
        throw new Error(`재고가 부족합니다. (현재 재고: ${currentItem.stockQty})`);
      }

      // 2. 이력 생성
      const outbound = await tx.supplyOutbound.create({
        data: {
          itemId: Number(itemId),
          qty: nQty,
          usedBy,
          memo
        }
      });

      // 3. 재고 차감 (안전하게 기존 수량 검증 끝난 후)
      const updatedItem = await tx.supplyItem.update({
        where: { id: Number(itemId) },
        data: { stockQty: { decrement: nQty } }
      });

      // 4. 발주 기준점 경고 계산 
      // (소모품이면서 reorderPoint 이하로 떨어졌을 때 토스트를 띄우기 위해 응답 객체에 플래그 전달)
      const isWarning = currentItem.category === "CONSUMABLE" && 
                        updatedItem.reorderPoint !== null && 
                        updatedItem.stockQty <= updatedItem.reorderPoint;

      return { outbound, isWarning, updatedStockQty: updatedItem.stockQty };
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

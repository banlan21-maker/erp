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
      where.item = { name: { contains: search, mode: "insensitive" } };
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

    const user = typeof usedBy === "string" ? usedBy.trim() : "";
    if (!itemId || !qty || !user) {
      return NextResponse.json({ success: false, error: "필수 값이 누락되었습니다." }, { status: 400 });
    }

    const nQty = Number(qty);
    // 소수·문자는 여기서 막는다 — 전에는 1.5 나 오타가 통과해 영문 시스템 오류로 튕겼다
    if (!Number.isInteger(nQty) || nQty <= 0) {
      return NextResponse.json({ success: false, error: "수량은 1 이상의 정수여야 합니다." }, { status: 400 });
    }

    const usedDate = usedAt ? new Date(usedAt) : new Date();

    // 트랜잭션 처리: 출고 이력 추가 + 재고 수량 차감
    // 백데이트 대응: 이력 기록 후 시간순으로 stockQtyAfter 재계산
    const result = await prisma.$transaction(async (tx) => {
      const currentItem = await tx.supplyItem.findUnique({ where: { id: Number(itemId) } });
      if (!currentItem) throw new Error("품목을 찾을 수 없습니다.");

      // 재고 확인과 차감을 한 문장으로 — 전에는 읽고 나서 따로 뺐다.
      //   두 사람이 동시에 출고하면 둘 다 차감 전 재고를 보고 검사를 통과해
      //   재고가 음수가 됐다(10개에서 8개씩 두 건 → -6). 뒤에 도는 재계산도
      //   '컬럼과 이력이 둘 다 -6' 이라 정합으로 보고 넘어간다.
      //   조건부 갱신으로 바꾸면 늦게 온 쪽만 0건 갱신 → 재고 부족으로 거절된다.
      const taken = await tx.supplyItem.updateMany({
        where: { id: Number(itemId), stockQty: { gte: nQty } },
        data:  { stockQty: { decrement: nQty } },
      });
      if (taken.count !== 1) {
        throw new Error(`재고가 부족합니다. (현재 재고: ${currentItem.stockQty})`);
      }

      // 3. 출고 이력 insert — stockQtyAfter는 임시값 (이후 recompute에서 확정)
      const outbound = await tx.supplyOutbound.create({
        data: {
          itemId:        Number(itemId),
          qty:           nQty,
          stockQtyAfter: 0,
          usedBy:        user,
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

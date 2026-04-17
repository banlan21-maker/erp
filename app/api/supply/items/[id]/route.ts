import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { recomputeStockHistory } from "@/lib/recalc-supply-stock";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const item = await prisma.supplyItem.findUnique({
      where: { id: Number(id) },
    });
    if (!item) return NextResponse.json({ success: false, error: "품목을 찾을 수 없습니다." }, { status: 404 });
    return NextResponse.json({ success: true, data: item });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, department, subCategory, unit, reorderPoint, location, memo, stockQty } = body;

    // stockQty만 수정하는 경우 — 차이값을 입고/출고 조정 이력으로 기록
    // 이슈#3 대응: 절대값 write 대신 delta increment로 변경해 동시성 안전
    // 이슈#2 대응: 기록 후 시간순 재계산으로 히스토리 스냅샷 일관성 보장
    if (stockQty !== undefined && name === undefined) {
      const newQty = Number(stockQty);
      if (!Number.isFinite(newQty) || newQty < 0) {
        return NextResponse.json({ success: false, error: "재고 수량은 0 이상이어야 합니다." }, { status: 400 });
      }
      const result = await prisma.$transaction(async (tx) => {
        const current = await tx.supplyItem.findUnique({ where: { id: Number(id) } });
        if (!current) throw new Error("품목을 찾을 수 없습니다.");
        const diff = newQty - current.stockQty;

        if (diff === 0) {
          return current;
        }

        // delta increment 적용 (동시성 안전)
        if (diff > 0) {
          await tx.supplyItem.update({
            where: { id: Number(id) },
            data:  { stockQty: { increment: diff } },
          });
          await tx.supplyInbound.create({
            data: {
              itemId:        Number(id),
              qty:           diff,
              stockQtyAfter: 0,
              receivedBy:    "재고조정",
              memo:          "수동 재고 조정",
            },
          });
        } else {
          await tx.supplyItem.update({
            where: { id: Number(id) },
            data:  { stockQty: { decrement: Math.abs(diff) } },
          });
          await tx.supplyOutbound.create({
            data: {
              itemId:        Number(id),
              qty:           Math.abs(diff),
              stockQtyAfter: 0,
              usedBy:        "재고조정",
              memo:          "수동 재고 조정",
            },
          });
        }

        // 시간순 재계산
        await recomputeStockHistory(tx, Number(id));
        return tx.supplyItem.findUnique({ where: { id: Number(id) } });
      });
      return NextResponse.json({ success: true, data: result });
    }

    if (!name || !unit) {
      return NextResponse.json({ success: false, error: "품명, 단위는 필수입니다." }, { status: 400 });
    }

    const updatedItem = await prisma.supplyItem.update({
      where: { id: Number(id) },
      data: {
        name,
        ...(department && { department }),
        subCategory,
        unit,
        reorderPoint: reorderPoint ? Number(reorderPoint) : null,
        location,
        memo
      }
    });

    return NextResponse.json({ success: true, data: updatedItem });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

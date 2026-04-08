import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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
    if (stockQty !== undefined && name === undefined) {
      const newQty = Number(stockQty);
      const result = await prisma.$transaction(async (tx) => {
        const current = await tx.supplyItem.findUnique({ where: { id: Number(id) } });
        if (!current) throw new Error("품목을 찾을 수 없습니다.");
        const diff = newQty - current.stockQty;
        const updatedItem = await tx.supplyItem.update({
          where: { id: Number(id) },
          data: { stockQty: newQty },
        });
        if (diff > 0) {
          await tx.supplyInbound.create({
            data: {
              itemId: Number(id),
              qty: diff,
              stockQtyAfter: newQty,
              receivedBy: "재고조정",
              memo: "수동 재고 조정",
            },
          });
        } else if (diff < 0) {
          await tx.supplyOutbound.create({
            data: {
              itemId: Number(id),
              qty: Math.abs(diff),
              stockQtyAfter: newQty,
              usedBy: "재고조정",
              memo: "수동 재고 조정",
            },
          });
        }
        return updatedItem;
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

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get("month");
    const search = searchParams.get("search");
    const vendorId = searchParams.get("vendorId");
    const subCategory = searchParams.get("subCategory");

    const where: any = {};
    
    if (month && /^\d{4}-\d{2}$/.test(month)) {
      const [y, m] = month.split("-");
      const start = new Date(Number(y), Number(m) - 1, 1);
      const end = new Date(Number(y), Number(m), 1);
      where.receivedAt = { gte: start, lt: end };
    }

    if (search) {
      where.item = { name: { contains: search } };
    }
    
    // 서브카테고리 필터가 있다면 AND 조건으로 추가
    if (subCategory && subCategory !== "all") {
      where.item = { ...where.item, subCategory };
    }

    if (vendorId && vendorId !== "all") {
      where.vendorId = Number(vendorId);
    }

    const inbounds = await prisma.supplyInbound.findMany({
      where,
      orderBy: { receivedAt: "desc" },
      include: {
        item: true,
        vendor: true
      }
    });

    return NextResponse.json({ success: true, data: inbounds });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { itemId, vendorId, qty, receivedBy, memo, receivedAt } = body;

    if (!itemId || !vendorId || !qty || !receivedBy) {
      return NextResponse.json({ success: false, error: "필수 값이 누락되었습니다." }, { status: 400 });
    }

    const nQty = Number(qty);
    if (nQty <= 0) {
      return NextResponse.json({ success: false, error: "수량은 1 이상이어야 합니다." }, { status: 400 });
    }

    const receivedDate = receivedAt ? new Date(receivedAt) : new Date();

    // 트랜잭션 처리: 입고 이력 추가 + 재고 수량 증가
    const result = await prisma.$transaction(async (tx) => {
      const inbound = await tx.supplyInbound.create({
        data: {
          itemId: Number(itemId),
          vendorId: Number(vendorId),
          qty: nQty,
          receivedBy,
          memo,
          receivedAt: receivedDate,
        }
      });

      await tx.supplyItem.update({
        where: { id: Number(itemId) },
        data: { stockQty: { increment: nQty } }
      });

      return inbound;
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

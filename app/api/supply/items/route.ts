import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category");
    const department = searchParams.get("department");

    const whereClause: any = {};
    if (category) whereClause.category = category;
    if (department) whereClause.department = department;

    const items = await prisma.supplyItem.findMany({
      where: whereClause,
      orderBy: { name: "asc" }
    });

    return NextResponse.json({ success: true, data: items });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, category, department, subCategory, unit, stockQty, reorderPoint, location, memo } = body;

    if (!name || !category || !unit) {
      return NextResponse.json({ success: false, error: "필수 값이 누락되었습니다 (품명/분류/단위)." }, { status: 400 });
    }

    const initialQty = Number(stockQty) || 0;

    // 품목 등록 + 초기재고 이력 자동 생성 (initialQty > 0인 경우)
    // 히스토리의 첫 행으로 "초기재고"가 기록되어야 이후 입출고 내역의 재고 추적이 자연스러움
    const newItem = await prisma.$transaction(async (tx) => {
      const created = await tx.supplyItem.create({
        data: {
          name,
          category,
          department: department || "CUTTING",
          subCategory,
          unit,
          stockQty: initialQty,
          reorderPoint: category === "CONSUMABLE" && reorderPoint ? Number(reorderPoint) : null,
          location,
          memo,
        },
      });

      if (initialQty > 0) {
        await tx.supplyInbound.create({
          data: {
            itemId:        created.id,
            qty:           initialQty,
            stockQtyAfter: initialQty,
            receivedBy:    "초기재고",
            memo:          "품목 등록 시 초기재고",
          },
        });
      }

      return created;
    });

    return NextResponse.json({ success: true, data: newItem });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

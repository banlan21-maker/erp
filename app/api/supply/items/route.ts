import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category");
    
    // 단순 전체 목록 용도 (검색은 클라이언트 사이드에서 필터링하거나 여기서 해도 됨)
    const whereClause: any = {};
    if (category) whereClause.category = category;

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
    const { name, category, subCategory, unit, stockQty, reorderPoint, location, memo } = body;

    if (!name || !category || !unit) {
      return NextResponse.json({ success: false, error: "필수 값이 누락되었습니다 (품명/분류/단위)." }, { status: 400 });
    }

    const newItem = await prisma.supplyItem.create({
      data: {
        name,
        category,
        subCategory,
        unit,
        stockQty: Number(stockQty) || 0,
        reorderPoint: category === "CONSUMABLE" && reorderPoint ? Number(reorderPoint) : null,
        location,
        memo
      }
    });

    return NextResponse.json({ success: true, data: newItem });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

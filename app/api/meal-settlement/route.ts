import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/meal-settlement?month=YYYY-MM[&factory=진교|진동]
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const month   = searchParams.get("month");
    const factory = searchParams.get("factory");
    if (!month) return NextResponse.json({ success: false, error: "month 필요" }, { status: 400 });

    const where = { month, ...(factory ? { factory } : {}) };
    const data = await prisma.mealSettlement.findMany({
      where,
      orderBy: { factory: "asc" },
    });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[GET /api/meal-settlement]", error);
    return NextResponse.json({ success: false, error: "조회 오류" }, { status: 500 });
  }
}

// POST /api/meal-settlement   body: { factory, month, totalCount, totalAmount, confirmedBy? }
export async function POST(request: NextRequest) {
  try {
    const { factory, month, totalCount, totalAmount, confirmedBy } = await request.json();
    if (!factory || !month) {
      return NextResponse.json({ success: false, error: "factory, month 필수" }, { status: 400 });
    }
    const record = await prisma.mealSettlement.upsert({
      where:  { factory_month: { factory, month } },
      create: { factory, month, totalCount: totalCount ?? 0, totalAmount: totalAmount ?? 0, confirmedBy: confirmedBy?.trim() || null },
      update: { totalCount: totalCount ?? 0, totalAmount: totalAmount ?? 0, confirmedAt: new Date(), confirmedBy: confirmedBy?.trim() || null },
    });
    return NextResponse.json({ success: true, data: record });
  } catch (error) {
    console.error("[POST /api/meal-settlement]", error);
    return NextResponse.json({ success: false, error: "저장 오류" }, { status: 500 });
  }
}

// DELETE /api/meal-settlement?factory=X&month=YYYY-MM
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const factory = searchParams.get("factory");
    const month   = searchParams.get("month");
    if (!factory || !month) {
      return NextResponse.json({ success: false, error: "factory, month 필수" }, { status: 400 });
    }
    await prisma.mealSettlement.deleteMany({ where: { factory, month } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/meal-settlement]", error);
    return NextResponse.json({ success: false, error: "삭제 오류" }, { status: 500 });
  }
}

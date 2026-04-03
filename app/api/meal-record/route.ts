import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date");
    const factory = searchParams.get("factory");
    const year = searchParams.get("year");
    const month = searchParams.get("month");

    if (year && month) {
      const ym = `${year}-${month.padStart(2, "0")}`;
      const records = await prisma.mealRecord.findMany({
        where: { date: { startsWith: ym }, ...(factory ? { factory } : {}) },
        orderBy: [{ date: "asc" }, { factory: "asc" }],
      });
      return NextResponse.json({ success: true, data: records });
    }
    if (date) {
      const records = await prisma.mealRecord.findMany({
        where: { date, ...(factory ? { factory } : {}) },
      });
      return NextResponse.json({ success: true, data: records });
    }
    return NextResponse.json({ success: false, error: "파라미터 없음" }, { status: 400 });
  } catch (error) {
    console.error("[GET /api/meal-record]", error);
    return NextResponse.json({ success: false, error: "조회 오류" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { date, factory, mealType, count, memo, registrar, vendorId } = await request.json();
    if (!date || !factory) return NextResponse.json({ success: false, error: "필수 값 누락" }, { status: 400 });
    const mt = mealType || "점심";
    const record = await prisma.mealRecord.upsert({
      where: { date_factory_mealType: { date, factory, mealType: mt } },
      create: { date, factory, mealType: mt, count: count ?? 0, memo: memo?.trim() || null, registrar: registrar?.trim() || null, vendorId: vendorId || null },
      update: { count: count ?? 0, memo: memo?.trim() || null, registrar: registrar?.trim() || null },
    });
    return NextResponse.json({ success: true, data: record });
  } catch (error) {
    console.error("[POST /api/meal-record]", error);
    return NextResponse.json({ success: false, error: "저장 오류" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const vendors = await prisma.mealVendor.findMany({ orderBy: { createdAt: "asc" } });
    return NextResponse.json({ success: true, data: vendors });
  } catch (error) {
    console.error("[GET /api/meal-vendor]", error);
    return NextResponse.json({ success: false, error: "조회 오류" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, factory, phone, pricePerMeal, deadlineHour, deadlineMin, defaultCount, defaultMealType } = body;
    if (!name?.trim()) return NextResponse.json({ success: false, error: "업체명을 입력하세요." }, { status: 400 });
    if (!factory) return NextResponse.json({ success: false, error: "담당 공장을 선택하세요." }, { status: 400 });
    const vendor = await prisma.mealVendor.create({
      data: {
        name: name.trim(), factory,
        phone: phone?.trim() || null,
        pricePerMeal: pricePerMeal ? Number(pricePerMeal) : null,
        token: randomUUID().replace(/-/g, ""),
        deadlineHour: deadlineHour ?? 10,
        deadlineMin: deadlineMin ?? 0,
        defaultCount: defaultCount ?? 0,
        defaultMealType: defaultMealType || "점심",
        isActive: true,
      },
    });
    return NextResponse.json({ success: true, data: vendor }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/meal-vendor]", error);
    return NextResponse.json({ success: false, error: "등록 오류" }, { status: 500 });
  }
}

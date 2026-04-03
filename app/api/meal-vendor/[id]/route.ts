import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { name, factory, phone, pricePerMeal, deadlineHour, deadlineMin, defaultCount, defaultMealType, isActive } = await request.json();
    const updated = await prisma.mealVendor.update({
      where: { id },
      data: {
        name: name?.trim(), factory,
        phone: phone?.trim() || null,
        pricePerMeal: pricePerMeal ? Number(pricePerMeal) : null,
        deadlineHour: deadlineHour ?? 10,
        deadlineMin: deadlineMin ?? 0,
        defaultCount: defaultCount ?? 0,
        defaultMealType: defaultMealType || "점심",
        isActive: isActive !== false,
      },
    });
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("[PATCH /api/meal-vendor/[id]]", error);
    return NextResponse.json({ success: false, error: "수정 오류" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.mealVendor.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/meal-vendor/[id]]", error);
    return NextResponse.json({ success: false, error: "삭제 오류" }, { status: 500 });
  }
}

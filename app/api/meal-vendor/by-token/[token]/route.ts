import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const vendor = await prisma.mealVendor.findUnique({ where: { token } });
    if (!vendor) return NextResponse.json({ success: false, error: "업체를 찾을 수 없습니다." }, { status: 404 });
    return NextResponse.json({
      success: true,
      data: { id: vendor.id, name: vendor.name, factory: vendor.factory, deadlineHour: vendor.deadlineHour, deadlineMin: vendor.deadlineMin, isActive: vendor.isActive },
    });
  } catch (error) {
    console.error("[GET by-token vendor]", error);
    return NextResponse.json({ success: false, error: "조회 오류" }, { status: 500 });
  }
}

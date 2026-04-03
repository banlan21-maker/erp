import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date");
    const year = searchParams.get("year");
    const month = searchParams.get("month");

    const vendor = await prisma.mealVendor.findUnique({ where: { token } });
    if (!vendor) return NextResponse.json({ success: false, error: "업체를 찾을 수 없습니다." }, { status: 404 });

    const factory = vendor.factory;

    if (year && month) {
      const ym = `${year}-${month.padStart(2, "0")}`;
      const records = await prisma.mealRecord.findMany({
        where: { date: { startsWith: ym }, factory },
        orderBy: { date: "asc" },
      });
      return NextResponse.json({ success: true, data: records });
    }

    const queryDate = date || new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
    const records = await prisma.mealRecord.findMany({ where: { date: queryDate, factory } });
    return NextResponse.json({ success: true, data: records });
  } catch (error) {
    console.error("[GET by-token record]", error);
    return NextResponse.json({ success: false, error: "조회 오류" }, { status: 500 });
  }
}

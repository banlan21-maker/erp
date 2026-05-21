import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/card-usage?year=YYYY&month=MM  (월 미지정 시 전체)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const year  = searchParams.get("year");
    const month = searchParams.get("month");

    const where = year && month
      ? { usedDate: { startsWith: `${year}-${month.padStart(2, "0")}` } }
      : {};
    const data = await prisma.cardUsage.findMany({
      where,
      orderBy: [{ usedDate: "asc" }, { createdAt: "asc" }],
    });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[GET /api/card-usage]", error);
    return NextResponse.json({ success: false, error: "조회 오류" }, { status: 500 });
  }
}

// POST /api/card-usage
export async function POST(request: NextRequest) {
  try {
    const b = await request.json();
    if (!b.usedDate || !b.cardNo) return NextResponse.json({ success: false, error: "사용일자·카드번호 필수" }, { status: 400 });
    const rec = await prisma.cardUsage.create({
      data: {
        usedDate: b.usedDate,
        cardNo: String(b.cardNo).trim(),
        detail: b.detail?.trim() || "",
        amount: Math.round(Number(b.amount) || 0),
        userName: b.userName?.trim() || null,
        confirmed: !!b.confirmed,
        memo: b.memo?.trim() || null,
      },
    });
    return NextResponse.json({ success: true, data: rec });
  } catch (error) {
    console.error("[POST /api/card-usage]", error);
    return NextResponse.json({ success: false, error: "저장 오류" }, { status: 500 });
  }
}

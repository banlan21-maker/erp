import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const num = (v: unknown) => (v === "" || v == null ? null : Number(v));

// GET /api/facility/gas?year=YYYY&month=MM   또는  ?date=YYYY-MM-DD
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const year  = searchParams.get("year");
    const month = searchParams.get("month");
    const date  = searchParams.get("date");

    if (year && month) {
      const ym = `${year}-${month.padStart(2, "0")}`;
      const data = await prisma.gasFacilityCheck.findMany({
        where: { date: { startsWith: ym } },
        orderBy: [{ date: "asc" }, { time: "asc" }],
      });
      return NextResponse.json({ success: true, data });
    }
    if (date) {
      const data = await prisma.gasFacilityCheck.findMany({
        where: { date },
        orderBy: { time: "asc" },
      });
      return NextResponse.json({ success: true, data });
    }
    return NextResponse.json({ success: false, error: "파라미터 없음" }, { status: 400 });
  } catch (error) {
    console.error("[GET /api/facility/gas]", error);
    return NextResponse.json({ success: false, error: "조회 오류" }, { status: 500 });
  }
}

// POST /api/facility/gas
export async function POST(request: NextRequest) {
  try {
    const b = await request.json();
    if (!b.date || !b.time) return NextResponse.json({ success: false, error: "날짜·시간 필수" }, { status: 400 });
    const rec = await prisma.gasFacilityCheck.create({
      data: {
        date: b.date, time: b.time,
        o2Pressure: num(b.o2Pressure), o2Charge: num(b.o2Charge),
        lpgPressure: num(b.lpgPressure), lpgCharge: num(b.lpgCharge),
        co2Pressure: num(b.co2Pressure), co2Charge: num(b.co2Charge),
        memo: b.memo?.trim() || null,
        recordedBy: b.recordedBy?.trim() || null,
      },
    });
    return NextResponse.json({ success: true, data: rec });
  } catch (error) {
    console.error("[POST /api/facility/gas]", error);
    return NextResponse.json({ success: false, error: "저장 오류" }, { status: 500 });
  }
}

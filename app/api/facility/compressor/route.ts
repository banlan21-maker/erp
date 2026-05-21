import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const num = (v: unknown) => (v === "" || v == null ? null : Number(v));

// GET /api/facility/compressor?year=YYYY&month=MM  또는  ?date=YYYY-MM-DD
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const year  = searchParams.get("year");
    const month = searchParams.get("month");
    const date  = searchParams.get("date");

    if (year && month) {
      const ym = `${year}-${month.padStart(2, "0")}`;
      const data = await prisma.compressorCheck.findMany({
        where: { date: { startsWith: ym } },
        orderBy: [{ date: "asc" }, { time: "asc" }],
      });
      return NextResponse.json({ success: true, data });
    }
    if (date) {
      const data = await prisma.compressorCheck.findMany({
        where: { date },
        orderBy: { time: "asc" },
      });
      return NextResponse.json({ success: true, data });
    }
    return NextResponse.json({ success: false, error: "파라미터 없음" }, { status: 400 });
  } catch (error) {
    console.error("[GET /api/facility/compressor]", error);
    return NextResponse.json({ success: false, error: "조회 오류" }, { status: 500 });
  }
}

// POST /api/facility/compressor
export async function POST(request: NextRequest) {
  try {
    const b = await request.json();
    if (!b.date || !b.time) return NextResponse.json({ success: false, error: "날짜·시간 필수" }, { status: 400 });
    const rec = await prisma.compressorCheck.create({
      data: {
        date: b.date, time: b.time,
        runtime1: num(b.runtime1), runtime2: num(b.runtime2), runtime3: num(b.runtime3),
        pressure1: num(b.pressure1), pressure2: num(b.pressure2), pressure3: num(b.pressure3),
        temp1: num(b.temp1), temp2: num(b.temp2), temp3: num(b.temp3),
        visual1: b.visual1?.trim() || null, visual2: b.visual2?.trim() || null, visual3: b.visual3?.trim() || null,
        memo: b.memo?.trim() || null,
        recordedBy: b.recordedBy?.trim() || null,
      },
    });
    return NextResponse.json({ success: true, data: rec });
  } catch (error) {
    console.error("[POST /api/facility/compressor]", error);
    return NextResponse.json({ success: false, error: "저장 오류" }, { status: 500 });
  }
}

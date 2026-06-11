import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/charter-usage?year=&month=
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const year  = searchParams.get("year");
    const month = searchParams.get("month");

    const where: { date?: { gte: Date; lt: Date } } = {};
    if (year && month) {
      const y = parseInt(year);
      const m = parseInt(month);
      where.date = { gte: new Date(y, m - 1, 1), lt: new Date(y, m, 1) };
    } else if (year) {
      const y = parseInt(year);
      where.date = { gte: new Date(y, 0, 1), lt: new Date(y + 1, 0, 1) };
    }

    const logs = await prisma.charterUsage.findMany({
      where,
      orderBy: [{ date: "desc" }, { departTime: "asc" }],
    });

    return NextResponse.json({
      success: true,
      data: logs.map(l => ({
        ...l,
        date:      l.date.toISOString().split("T")[0],
        createdAt: l.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "조회 실패";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

// POST /api/charter-usage
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      date, driverName, driverPhone, vehicleNo, items,
      departure, waypoint, destination, departTime, cost, memo,
    } = body;

    if (!date)                  return NextResponse.json({ success: false, error: "날짜를 입력해주세요." },     { status: 400 });
    if (!driverName?.trim())    return NextResponse.json({ success: false, error: "운전자 이름을 입력해주세요." }, { status: 400 });

    const created = await prisma.charterUsage.create({
      data: {
        date:        new Date(date),
        driverName:  driverName.trim(),
        driverPhone: driverPhone?.trim() || null,
        vehicleNo:   vehicleNo?.trim()   || null,
        items:       items?.trim()       || null,
        departure:   departure?.trim()   || null,
        waypoint:    waypoint?.trim()    || null,
        destination: destination?.trim() || null,
        departTime:  departTime          || null,
        cost:        cost != null && cost !== "" ? Number(cost) : null,
        memo:        memo?.trim()        || null,
      },
    });

    return NextResponse.json({
      success: true,
      data: { ...created, date: created.date.toISOString().split("T")[0], createdAt: created.createdAt.toISOString() },
    }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "등록 실패";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

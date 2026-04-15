import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/transport-driving-log?vehicleId=&year=&month=
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const vehicleId = searchParams.get("vehicleId");
    const year      = searchParams.get("year");
    const month     = searchParams.get("month");

    const where: any = {};
    if (vehicleId) where.vehicleId = vehicleId;
    if (year && month) {
      const y = parseInt(year);
      const m = parseInt(month);
      where.date = {
        gte: new Date(y, m - 1, 1),
        lt:  new Date(y, m, 1),
      };
    } else if (year) {
      const y = parseInt(year);
      where.date = {
        gte: new Date(y, 0, 1),
        lt:  new Date(y + 1, 0, 1),
      };
    }

    const logs = await prisma.transportDrivingLog.findMany({
      where,
      include: { vehicle: { select: { id: true, code: true, name: true, plateNo: true } } },
      orderBy: [{ date: "desc" }, { startTime: "asc" }],
    });

    const serialized = logs.map(l => ({
      ...l,
      date:      l.date.toISOString().split("T")[0],
      createdAt: l.createdAt.toISOString(),
    }));

    return NextResponse.json({ success: true, data: serialized });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// POST /api/transport-driving-log
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      vehicleId, date, driver, departure, destination, purpose,
      startTime, endTime, startMileage, endMileage,
      fuelCost, tollCost, memo,
    } = body;

    if (!vehicleId) return NextResponse.json({ success: false, error: "차량을 선택해주세요." }, { status: 400 });
    if (!date)      return NextResponse.json({ success: false, error: "운행일을 입력해주세요." }, { status: 400 });
    if (!driver?.trim()) return NextResponse.json({ success: false, error: "운전자를 입력해주세요." }, { status: 400 });

    const log = await prisma.transportDrivingLog.create({
      data: {
        vehicleId,
        date:         new Date(date),
        driver:       driver.trim(),
        departure:    departure    || null,
        destination:  destination  || null,
        purpose:      purpose      || null,
        startTime:    startTime    || null,
        endTime:      endTime      || null,
        startMileage: startMileage != null && startMileage !== "" ? Number(startMileage) : null,
        endMileage:   endMileage   != null && endMileage   !== "" ? Number(endMileage)   : null,
        fuelCost:     fuelCost     != null && fuelCost     !== "" ? Number(fuelCost)     : null,
        tollCost:     tollCost     != null && tollCost     !== "" ? Number(tollCost)     : null,
        memo:         memo         || null,
      },
      include: { vehicle: { select: { id: true, code: true, name: true, plateNo: true } } },
    });

    return NextResponse.json({
      success: true,
      data: { ...log, date: log.date.toISOString().split("T")[0], createdAt: log.createdAt.toISOString() },
    }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

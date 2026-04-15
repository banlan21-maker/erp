import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// PATCH /api/transport-driving-log/[id]
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const {
      date, driver, departure, destination, purpose,
      startTime, endTime, startMileage, endMileage,
      fuelCost, tollCost, memo,
    } = body;

    const data: any = {};
    if (date         !== undefined) data.date         = new Date(date);
    if (driver       !== undefined) data.driver       = driver.trim();
    if (departure    !== undefined) data.departure    = departure    || null;
    if (destination  !== undefined) data.destination  = destination  || null;
    if (purpose      !== undefined) data.purpose      = purpose      || null;
    if (startTime    !== undefined) data.startTime    = startTime    || null;
    if (endTime      !== undefined) data.endTime      = endTime      || null;
    if (startMileage !== undefined) data.startMileage = startMileage !== "" && startMileage != null ? Number(startMileage) : null;
    if (endMileage   !== undefined) data.endMileage   = endMileage   !== "" && endMileage   != null ? Number(endMileage)   : null;
    if (fuelCost     !== undefined) data.fuelCost     = fuelCost     !== "" && fuelCost     != null ? Number(fuelCost)     : null;
    if (tollCost     !== undefined) data.tollCost     = tollCost     !== "" && tollCost     != null ? Number(tollCost)     : null;
    if (memo         !== undefined) data.memo         = memo         || null;

    const parsedEnd: number | null = data.endMileage ?? null;

    const log = await prisma.$transaction(async (tx) => {
      // 운행일지 수정
      const updated = await tx.transportDrivingLog.update({
        where: { id },
        data,
        include: { vehicle: { select: { id: true, code: true, name: true, plateNo: true } } },
      });

      // endMileage가 변경됐고 값이 있으면 차량 km 갱신 (현재값보다 클 때만)
      if (endMileage !== undefined && parsedEnd != null) {
        const vehicle = await tx.transportVehicle.findUnique({
          where: { id: updated.vehicleId },
          select: { mileage: true },
        });
        if (vehicle && (vehicle.mileage == null || parsedEnd > vehicle.mileage)) {
          await tx.transportVehicle.update({
            where: { id: updated.vehicleId },
            data: { mileage: parsedEnd },
          });
        }
      }

      return updated;
    });

    return NextResponse.json({
      success: true,
      data: { ...log, date: log.date.toISOString().split("T")[0], createdAt: log.createdAt.toISOString() },
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// DELETE /api/transport-driving-log/[id]
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await prisma.transportDrivingLog.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

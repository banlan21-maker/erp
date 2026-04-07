import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const today = new Date();
    const in90days = new Date(today.getTime() + 90 * 86400000);
    const in60days = new Date(today.getTime() + 60 * 86400000);
    const in30days = new Date(today.getTime() + 30 * 86400000);

    const [alertInspections, transportInspAlerts, consumableAlerts, allConsumables, foreignWorkers] = await Promise.all([
      prisma.mgmtInspectionItem.findMany({
        where: { nextInspectAt: { not: null, lte: in60days } },
        orderBy: { nextInspectAt: "asc" },
        include: { equipment: { select: { id: true, name: true, code: true } } },
      }),
      prisma.transportInspectionItem.findMany({
        where: { nextInspectAt: { not: null, lte: in60days } },
        orderBy: { nextInspectAt: "asc" },
        include: { vehicle: { select: { id: true, name: true, code: true } } },
      }),
      prisma.transportConsumable.findMany({
        where: { OR: [{ nextReplaceAt: { not: null, lte: in30days } }] },
        orderBy: { nextReplaceAt: "asc" },
        include: { vehicle: { select: { id: true, name: true, code: true, mileage: true } } },
      }),
      prisma.transportConsumable.findMany({
        where: { nextReplaceMileage: { not: null } },
        include: { vehicle: { select: { id: true, name: true, code: true, mileage: true } } },
      }),
      prisma.worker.findMany({
        where: { visaExpiry: { not: null } },
        orderBy: { visaExpiry: "asc" },
        select: { id: true, name: true, nickname: true, nationality: true, visaType: true, visaExpiry: true },
      }),
    ]);

    const mileageAlerts = allConsumables.filter(c => {
      if (c.vehicle.mileage == null || c.nextReplaceMileage == null) return false;
      return c.nextReplaceMileage - c.vehicle.mileage <= 1000;
    });
    const consumableAlertIds = new Set(consumableAlerts.map(c => c.id));
    const combinedConsumables = [
      ...consumableAlerts,
      ...mileageAlerts.filter(c => !consumableAlertIds.has(c.id)),
    ];

    return NextResponse.json({
      success: true,
      data: {
        alertInspections,
        transportInspAlerts,
        combinedConsumables,
        foreignWorkers,
        today: today.toISOString(),
        in90days: in90days.toISOString(),
      }
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

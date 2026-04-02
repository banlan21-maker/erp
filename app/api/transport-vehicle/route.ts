import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// VEH-001 자동채번
async function generateCode(): Promise<string> {
  const count = await prisma.transportVehicle.count();
  return `VEH-${String(count + 1).padStart(3, "0")}`;
}

function calcNextReplaceAt(lastDate: Date, intervalMonth: number): Date {
  const d = new Date(lastDate);
  d.setMonth(d.getMonth() + intervalMonth);
  return d;
}

function calcNextReplaceMileage(lastMileage: number, intervalKm: number): number {
  return lastMileage + intervalKm;
}

function calcNextInspect(lastDate: Date, periodMonth: number): Date {
  const d = new Date(lastDate);
  d.setMonth(d.getMonth() + periodMonth);
  return d;
}

// GET /api/transport-vehicle
export async function GET() {
  try {
    const vehicles = await prisma.transportVehicle.findMany({
      orderBy: { createdAt: "asc" },
      include: {
        specs: { orderBy: { sortOrder: "asc" } },
        consumables: { orderBy: { sortOrder: "asc" } },
        inspections: true,
      },
    });
    return NextResponse.json({ success: true, data: vehicles });
  } catch (error) {
    console.error("[GET /api/transport-vehicle]", error);
    return NextResponse.json({ success: false, error: "조회 오류" }, { status: 500 });
  }
}

// POST /api/transport-vehicle
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      vehicleType, name, plateNo, maker, modelName, madeYear,
      acquiredAt, acquiredCost, factory, factoryLocation, manager, usage, memo,
      // 일반차량 전용
      fuelType, displacement, mileage, insuranceExpiry, inspExpiry,
      // 운송장비 전용
      equipSubType, maxLoad, powerType, mastHeight,
      // 관계형
      specs, consumables, inspections,
    } = body;

    if (!name?.trim()) {
      return NextResponse.json({ success: false, error: "차량/장비명은 필수입니다." }, { status: 400 });
    }
    if (!vehicleType) {
      return NextResponse.json({ success: false, error: "종류는 필수입니다." }, { status: 400 });
    }
    if (!factory) {
      return NextResponse.json({ success: false, error: "보관 공장은 필수입니다." }, { status: 400 });
    }

    const code = await generateCode();

    const vehicle = await prisma.transportVehicle.create({
      data: {
        code,
        vehicleType,
        name: name.trim(),
        plateNo: plateNo?.trim() || null,
        maker: maker?.trim() || null,
        modelName: modelName?.trim() || null,
        madeYear: madeYear ? Number(madeYear) : null,
        acquiredAt: acquiredAt ? new Date(acquiredAt) : null,
        acquiredCost: acquiredCost ? Number(acquiredCost) : null,
        factory,
        factoryLocation: factoryLocation?.trim() || null,
        manager: manager?.trim() || null,
        usage: usage || "IN_USE",
        memo: memo?.trim() || null,
        // 일반차량 전용
        fuelType: vehicleType === "VEHICLE" ? (fuelType || null) : null,
        displacement: vehicleType === "VEHICLE" && displacement ? Number(displacement) : null,
        mileage: vehicleType === "VEHICLE" && mileage ? Number(mileage) : null,
        insuranceExpiry: vehicleType === "VEHICLE" && insuranceExpiry ? new Date(insuranceExpiry) : null,
        inspExpiry: vehicleType === "VEHICLE" && inspExpiry ? new Date(inspExpiry) : null,
        // 운송장비 전용
        equipSubType: vehicleType === "EQUIPMENT" ? (equipSubType || null) : null,
        maxLoad: vehicleType === "EQUIPMENT" && maxLoad ? Number(maxLoad) : null,
        powerType: vehicleType === "EQUIPMENT" ? (powerType || null) : null,
        mastHeight: vehicleType === "EQUIPMENT" && mastHeight ? Number(mastHeight) : null,
        // 사양 (운송장비)
        specs: {
          create: (specs || [])
            .filter((s: { specKey: string; specValue: string }) => s.specKey?.trim())
            .map((s: { specKey: string; specValue: string }, i: number) => ({
              specKey: s.specKey.trim(),
              specValue: s.specValue?.trim() || "",
              sortOrder: i,
            })),
        },
        // 소모품 (일반차량)
        consumables: {
          create: (consumables || [])
            .filter((c: { itemName: string }) => c.itemName?.trim())
            .map((c: {
              itemName: string; basis: string; intervalKm?: number; intervalMonth?: number;
              lastReplacedAt?: string; lastReplacedMileage?: number;
            }, i: number) => {
              const lastDate = c.lastReplacedAt ? new Date(c.lastReplacedAt) : null;
              const lastKm = c.lastReplacedMileage ? Number(c.lastReplacedMileage) : null;
              const nextAt = lastDate && c.intervalMonth ? calcNextReplaceAt(lastDate, Number(c.intervalMonth)) : null;
              const nextKm = lastKm != null && c.intervalKm ? calcNextReplaceMileage(lastKm, Number(c.intervalKm)) : null;
              return {
                itemName: c.itemName.trim(),
                basis: c.basis || "BOTH",
                intervalKm: c.intervalKm ? Number(c.intervalKm) : null,
                intervalMonth: c.intervalMonth ? Number(c.intervalMonth) : null,
                lastReplacedAt: lastDate,
                lastReplacedMileage: lastKm,
                nextReplaceMileage: nextKm,
                nextReplaceAt: nextAt,
                sortOrder: i,
              };
            }),
        },
        // 검사 항목 (운송장비)
        inspections: {
          create: (inspections || [])
            .filter((ins: { itemName: string }) => ins.itemName?.trim())
            .map((ins: {
              itemName: string; periodMonth: number;
              lastInspectedAt?: string; inspector?: string; memo?: string;
            }) => {
              const last = ins.lastInspectedAt ? new Date(ins.lastInspectedAt) : null;
              const next = last ? calcNextInspect(last, Number(ins.periodMonth)) : null;
              return {
                itemName: ins.itemName.trim(),
                periodMonth: Number(ins.periodMonth),
                lastInspectedAt: last,
                nextInspectAt: next,
                inspector: ins.inspector?.trim() || null,
                memo: ins.memo?.trim() || null,
              };
            }),
        },
      },
      include: {
        specs: { orderBy: { sortOrder: "asc" } },
        consumables: { orderBy: { sortOrder: "asc" } },
        inspections: true,
      },
    });

    return NextResponse.json({ success: true, data: vehicle }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/transport-vehicle]", error);
    return NextResponse.json({ success: false, error: "등록 오류" }, { status: 500 });
  }
}

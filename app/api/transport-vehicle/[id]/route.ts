import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

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

// GET /api/transport-vehicle/[id]
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const vehicle = await prisma.transportVehicle.findUnique({
      where: { id },
      include: {
        specs: { orderBy: { sortOrder: "asc" } },
        consumables: {
          orderBy: { sortOrder: "asc" },
          include: { logs: { orderBy: { replacedAt: "desc" } } },
        },
        inspections: {
          include: { logs: { orderBy: { completedAt: "desc" } } },
        },
        repairs: { orderBy: { repairedAt: "desc" } },
      },
    });
    if (!vehicle) {
      return NextResponse.json({ success: false, error: "차량/장비를 찾을 수 없습니다." }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: vehicle });
  } catch (error) {
    console.error("[GET /api/transport-vehicle/[id]]", error);
    return NextResponse.json({ success: false, error: "조회 오류" }, { status: 500 });
  }
}

// PATCH /api/transport-vehicle/[id]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const {
      vehicleType, name, plateNo, maker, modelName, madeYear,
      acquiredAt, acquiredCost, factory, factoryLocation, manager, usage, memo,
      fuelType, displacement, mileage, insuranceExpiry, inspExpiry,
      equipSubType, maxLoad, powerType, mastHeight,
      specs, consumables, inspections,
    } = body;

    if (!name?.trim()) {
      return NextResponse.json({ success: false, error: "차량/장비명은 필수입니다." }, { status: 400 });
    }

    const updated = await prisma.$transaction(async (tx) => {
      // 사양 교체
      await tx.transportVehicleSpec.deleteMany({ where: { vehicleId: id } });

      // 소모품: 새 목록에 없는 항목 삭제 (이력 있는 항목은 유지)
      const existingConsumables = await tx.transportConsumable.findMany({ where: { vehicleId: id } });
      const incomingConsIds = (consumables || []).map((c: { id?: string }) => c.id).filter(Boolean);
      for (const ec of existingConsumables) {
        if (!incomingConsIds.includes(ec.id)) {
          await tx.transportConsumableLog.deleteMany({ where: { consumableId: ec.id } });
          await tx.transportConsumable.delete({ where: { id: ec.id } });
        }
      }

      // 검사 항목: 새 목록에 없는 항목 삭제 (이력 있는 항목은 유지)
      const existingInspections = await tx.transportInspectionItem.findMany({ where: { vehicleId: id } });
      const incomingInspIds = (inspections || []).map((i: { id?: string }) => i.id).filter(Boolean);
      for (const ei of existingInspections) {
        if (!incomingInspIds.includes(ei.id)) {
          await tx.transportInspectionLog.deleteMany({ where: { itemId: ei.id } });
          await tx.transportInspectionItem.delete({ where: { id: ei.id } });
        }
      }

      // 기본정보 + 사양 업데이트
      const v = await tx.transportVehicle.update({
        where: { id },
        data: {
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
          fuelType: vehicleType === "VEHICLE" ? (fuelType || null) : null,
          displacement: vehicleType === "VEHICLE" && displacement ? Number(displacement) : null,
          mileage: vehicleType === "VEHICLE" && mileage !== undefined ? Number(mileage) : undefined,
          insuranceExpiry: vehicleType === "VEHICLE" && insuranceExpiry ? new Date(insuranceExpiry) : null,
          inspExpiry: vehicleType === "VEHICLE" && inspExpiry ? new Date(inspExpiry) : null,
          equipSubType: vehicleType === "EQUIPMENT" ? (equipSubType || null) : null,
          maxLoad: vehicleType === "EQUIPMENT" && maxLoad ? Number(maxLoad) : null,
          powerType: vehicleType === "EQUIPMENT" ? (powerType || null) : null,
          mastHeight: vehicleType === "EQUIPMENT" && mastHeight ? Number(mastHeight) : null,
          specs: {
            create: (specs || [])
              .filter((s: { specKey: string }) => s.specKey?.trim())
              .map((s: { specKey: string; specValue: string }, i: number) => ({
                specKey: s.specKey.trim(),
                specValue: s.specValue?.trim() || "",
                sortOrder: i,
              })),
          },
        },
        include: { specs: { orderBy: { sortOrder: "asc" } } },
      });

      // 소모품 upsert
      for (let i = 0; i < (consumables || []).length; i++) {
        const c = consumables[i];
        if (!c.itemName?.trim()) continue;
        const lastDate = c.lastReplacedAt ? new Date(c.lastReplacedAt) : null;
        const lastKm = c.lastReplacedMileage != null ? Number(c.lastReplacedMileage) : null;
        const nextAt = lastDate && c.intervalMonth ? calcNextReplaceAt(lastDate, Number(c.intervalMonth)) : null;
        const nextKm = lastKm != null && c.intervalKm ? calcNextReplaceMileage(lastKm, Number(c.intervalKm)) : null;
        const data = {
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
        if (c.id) {
          await tx.transportConsumable.update({ where: { id: c.id }, data });
        } else {
          await tx.transportConsumable.create({ data: { vehicleId: id, ...data } });
        }
      }

      // 검사 항목 upsert
      for (let i = 0; i < (inspections || []).length; i++) {
        const ins = inspections[i];
        if (!ins.itemName?.trim()) continue;
        const last = ins.lastInspectedAt ? new Date(ins.lastInspectedAt) : null;
        const next = last ? calcNextInspect(last, Number(ins.periodMonth)) : null;
        const data = {
          itemName: ins.itemName.trim(),
          periodMonth: Number(ins.periodMonth),
          lastInspectedAt: last,
          nextInspectAt: next,
          inspector: ins.inspector?.trim() || null,
          memo: ins.memo?.trim() || null,
        };
        if (ins.id) {
          await tx.transportInspectionItem.update({ where: { id: ins.id }, data });
        } else {
          await tx.transportInspectionItem.create({ data: { vehicleId: id, ...data } });
        }
      }

      return v;
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("[PATCH /api/transport-vehicle/[id]]", error);
    return NextResponse.json({ success: false, error: "수정 오류" }, { status: 500 });
  }
}

// DELETE /api/transport-vehicle/[id]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.transportVehicle.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/transport-vehicle/[id]]", error);
    return NextResponse.json({ success: false, error: "삭제 오류" }, { status: 500 });
  }
}

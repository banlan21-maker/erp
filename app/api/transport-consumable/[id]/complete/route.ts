import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// POST /api/transport-consumable/[id]/complete — 소모품 교체 완료 처리
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { replacedAt, mileageAt, memo } = await request.json();

    if (!replacedAt) {
      return NextResponse.json({ success: false, error: "교체일은 필수입니다." }, { status: 400 });
    }

    const consumable = await prisma.transportConsumable.findUnique({ where: { id } });
    if (!consumable) {
      return NextResponse.json({ success: false, error: "소모품 항목을 찾을 수 없습니다." }, { status: 404 });
    }

    const replacedDate = new Date(replacedAt);
    const km = mileageAt != null ? Number(mileageAt) : null;

    // 다음 교체 예정일 / 예정 주행거리 재계산
    let nextAt: Date | null = null;
    let nextKm: number | null = null;

    if (consumable.intervalMonth && (consumable.basis === "PERIOD" || consumable.basis === "BOTH")) {
      nextAt = new Date(replacedDate);
      nextAt.setMonth(nextAt.getMonth() + consumable.intervalMonth);
    }
    if (km != null && consumable.intervalKm && (consumable.basis === "MILEAGE" || consumable.basis === "BOTH")) {
      nextKm = km + consumable.intervalKm;
    }

    const [updatedConsumable, log] = await prisma.$transaction([
      prisma.transportConsumable.update({
        where: { id },
        data: {
          lastReplacedAt: replacedDate,
          lastReplacedMileage: km,
          nextReplaceAt: nextAt,
          nextReplaceMileage: nextKm,
        },
      }),
      prisma.transportConsumableLog.create({
        data: {
          consumableId: id,
          vehicleId: consumable.vehicleId,
          replacedAt: replacedDate,
          mileageAt: km,
          memo: memo?.trim() || null,
        },
      }),
    ]);

    return NextResponse.json({ success: true, data: { consumable: updatedConsumable, log } });
  } catch (error) {
    console.error("[POST /api/transport-consumable/[id]/complete]", error);
    return NextResponse.json({ success: false, error: "교체 완료 처리 오류" }, { status: 500 });
  }
}

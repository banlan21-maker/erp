import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// PATCH /api/transport-vehicle/[id]/mileage — 주행거리 업데이트 + 소모품 알림 재계산
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { mileage } = await request.json();

    if (mileage == null || isNaN(Number(mileage))) {
      return NextResponse.json({ success: false, error: "주행거리는 필수입니다." }, { status: 400 });
    }

    const newMileage = Number(mileage);

    // 주행거리 업데이트
    const vehicle = await prisma.transportVehicle.update({
      where: { id },
      data: { mileage: newMileage },
      include: { consumables: true },
    });

    // 소모품 nextReplaceMileage 재계산은 이미 저장된 값 기준 — 별도 업데이트 불필요
    // (nextReplaceMileage = lastReplacedMileage + intervalKm 으로 이미 계산됨)

    return NextResponse.json({ success: true, data: vehicle });
  } catch (error) {
    console.error("[PATCH /api/transport-vehicle/[id]/mileage]", error);
    return NextResponse.json({ success: false, error: "주행거리 업데이트 오류" }, { status: 500 });
  }
}

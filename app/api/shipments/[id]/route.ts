import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ShipmentStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

/**
 * 출고장 영구 삭제 — CANCELLED 상태만 허용.
 * 활성(ACTIVE) 인 출고장은 먼저 /cancel 로 취소 절차를 거쳐야 함.
 *
 * 트리거 cascade:
 *   Shipment → ShipmentVehicle → ShipmentItem  (모두 schema 의 onDelete: Cascade)
 * SteelPlan 복원 / SteelPlanHeat 정리는 이미 cancel 단계에서 처리됐으므로 여기서는 불필요.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ship = await prisma.shipment.findUnique({
      where: { id },
      select: { id: true, status: true, shipmentNo: true },
    });
    if (!ship) {
      return NextResponse.json({ success: false, error: "출고장을 찾을 수 없습니다." }, { status: 404 });
    }
    if (ship.status !== ShipmentStatus.CANCELLED) {
      return NextResponse.json({
        success: false,
        error: `취소된 출고장만 삭제할 수 있습니다. (${ship.shipmentNo} 은(는) 현재 활성)`,
      }, { status: 400 });
    }
    await prisma.shipment.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "삭제 실패";
    console.error("[DELETE /api/shipments/[id]]", err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const s = await prisma.shipment.findUnique({
    where: { id },
    include: { vehicles: { orderBy: { sequence: "asc" }, include: { items: true } } },
  });
  if (!s) return NextResponse.json({ success: false, error: "존재하지 않습니다." }, { status: 404 });
  return NextResponse.json({
    success: true,
    data: {
      ...s,
      shippedAt:   s.shippedAt.toISOString(),
      cancelledAt: s.cancelledAt?.toISOString() ?? null,
      createdAt:   s.createdAt.toISOString(),
      updatedAt:   s.updatedAt.toISOString(),
      vehicles: s.vehicles.map(v => ({
        ...v,
        invoicedAt: v.invoicedAt?.toISOString() ?? null,
        createdAt:  v.createdAt.toISOString(),
        updatedAt:  v.updatedAt.toISOString(),
        items: v.items.map(it => ({ ...it, createdAt: it.createdAt.toISOString() })),
      })),
    },
  });
}

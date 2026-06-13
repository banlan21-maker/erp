/**
 * 출고장 취소
 * POST /api/shipments/[id]/cancel  { reason?: string }
 *
 * 트랜잭션:
 *   1. Shipment.status = CANCELLED
 *   2. 각 ShipmentItem 의 SteelPlan 을 RECEIVED 로 복원 (storageLocation은 알 수 없어 null 유지)
 *      · 단, SteelPlan.status 가 이미 SHIPPED_OUT 가 아니면 (다른 사용자가 변경) 건너뛰고 경고
 *   3. autoCreatedFromShipment=true 인 SteelPlanHeat 는 삭제, 그 외는 status 만 원복(WAITING)
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ShipmentStatus, SteelPlanStatus, SteelPlanHeatStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const reason = typeof body?.reason === "string" ? body.reason.trim() : null;

    const ship = await prisma.shipment.findUnique({
      where: { id },
      include: { vehicles: { include: { items: true } } },
    });
    if (!ship) return NextResponse.json({ success: false, error: "출고장을 찾을 수 없습니다." }, { status: 404 });
    if (ship.status === ShipmentStatus.CANCELLED) {
      return NextResponse.json({ success: false, error: "이미 취소된 출고장입니다." }, { status: 400 });
    }

    const warnings: string[] = [];

    const updated = await prisma.$transaction(async (tx) => {
      // 1. 헤더
      await tx.shipment.update({
        where: { id },
        data:  {
          status:       ShipmentStatus.CANCELLED,
          cancelledAt:  new Date(),
          cancelReason: reason || null,
        },
      });

      // 2/3. 자재·판번호 처리
      for (const v of ship.vehicles) {
        for (const item of v.items) {
          // SteelPlan 복원
          const sp = await tx.steelPlan.findUnique({ where: { id: item.steelPlanId } });
          if (sp && sp.status === SteelPlanStatus.SHIPPED_OUT) {
            await tx.steelPlan.update({
              where: { id: sp.id },
              data:  { status: SteelPlanStatus.RECEIVED, issuedAt: null },
            });
          } else if (sp) {
            warnings.push(`${item.steelPlanId} 자재 상태가 SHIPPED_OUT 가 아니라 복원 건너뜀 (현재: ${sp?.status})`);
          }

          // SteelPlanHeat 처리
          if (item.steelPlanHeatId) {
            const h = await tx.steelPlanHeat.findUnique({ where: { id: item.steelPlanHeatId } });
            if (h) {
              if (h.autoCreatedFromShipment) {
                // 다른 ShipmentItem 이 이 heat 를 참조하는지 확인 — 있으면 보존
                const refs = await tx.shipmentItem.count({
                  where: { steelPlanHeatId: h.id, NOT: { vehicle: { shipmentId: id } } },
                });
                if (refs === 0) {
                  await tx.steelPlanHeat.delete({ where: { id: h.id } });
                } else {
                  warnings.push(`판번호 ${h.heatNo} 가 다른 출고장에서 참조 중 — 삭제 안 함`);
                }
              } else if (h.status === SteelPlanHeatStatus.SHIPPED) {
                // 다른 활성 출고장이 SHIPPED 로 잡고 있지 않으면 WAITING 으로 복원
                const otherShipped = await tx.shipmentItem.count({
                  where: {
                    steelPlanHeatId: h.id,
                    NOT: { vehicle: { shipmentId: id } },
                    vehicle: { shipment: { status: ShipmentStatus.ACTIVE } },
                  },
                });
                if (otherShipped === 0) {
                  await tx.steelPlanHeat.update({
                    where: { id: h.id },
                    data:  { status: SteelPlanHeatStatus.WAITING, shippedAt: null },
                  });
                }
              }
            }
          }
        }
      }

      return tx.shipment.findUnique({
        where: { id },
        include: { vehicles: { orderBy: { sequence: "asc" }, include: { items: true } } },
      });
    });

    return NextResponse.json({ success: true, data: updated, warnings });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "취소 실패";
    console.error("[POST /api/shipments/[id]/cancel]", err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

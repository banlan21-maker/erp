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
    const force  = body?.force === true; // 복원 불가 항목이 있어도 강행 취소
    // keepSelection=true(기본): 선별 마킹(shipoutMarkedAt) 유지 → 선별목록에 그대로 남아 바로 재출고 가능.
    //   false: 선별까지 해제 → 강재전체목록 입고 재고로 완전 복귀(자재를 잘못 골랐을 때).
    const keepSelection = body?.keepSelection !== false;

    const ship = await prisma.shipment.findUnique({
      where: { id },
      include: { vehicles: { include: { items: true } } },
    });
    if (!ship) return NextResponse.json({ success: false, error: "출고장을 찾을 수 없습니다." }, { status: 404 });
    if (ship.status === ShipmentStatus.CANCELLED) {
      return NextResponse.json({ success: false, error: "이미 취소된 출고장입니다." }, { status: 400 });
    }

    const warnings: string[] = [];
    const restoreFailures: string[] = []; // 복원 실패(자재 상태가 예상과 다름) — 있으면 취소 롤백

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
          // ── 잔재 출고 복원 — 소진(EXHAUSTED) → 재고(IN_STOCK) ──
          //   keepSelection: 선별 마킹(shipoutMarkedAt) 유지 → 선별목록에 그대로 남음. 아니면 해제(재고 복귀).
          if (item.remnantId) {
            const rem = await tx.remnant.findUnique({ where: { id: item.remnantId } });
            if (rem && rem.status === "EXHAUSTED") {
              await tx.remnant.update({
                where: { id: rem.id },
                data: { status: "IN_STOCK", ...(keepSelection ? { shipoutMarkedAt: rem.shipoutMarkedAt ?? new Date() } : { shipoutMarkedAt: null }) },
              });
            } else if (rem) {
              restoreFailures.push(`잔재 ${rem.remnantNo} 상태가 소진이 아니라 복원 불가 (현재: ${rem.status})`);
            }
            continue; // 잔재는 SteelPlan/Heat 처리 없음
          }

          // ── 원판 복원 ──
          if (!item.steelPlanId) continue;
          // SteelPlan 복원
          const sp = await tx.steelPlan.findUnique({ where: { id: item.steelPlanId } });
          if (sp && sp.status === SteelPlanStatus.SHIPPED_OUT) {
            await tx.steelPlan.update({
              where: { id: sp.id },
              // I7: shipoutLabel 은 유지 (사무실이 '원래 어느 선별 작업 자재였는지' 추적 가능하게).
              //     ※ 라벨은 강재매칭 작업 귀속 키(완전일치 조회)라 절대 변형 금지 — '취소' 표시는 shipoutCancelledAt 로.
              // keepSelection=true(기본): 선별 마킹 재생성 → 선별목록에 남아 바로 재출고 가능(일정변경·차량문제 등).
              //   출고 확정 시 shipoutHeatNo 가 null 로 지워지므로 ShipmentItem.heatNo 스냅샷에서 복원 —
              //   안 하면 재출고 때 판번호가 비어 FIFO 가 엉뚱한 WAITING 판번호를 소진한다.
              //   단, 원래 선별된 적 없는 자재(현장 즉시출고·엑셀출고)는 마킹을 새로 만들지 않음(절단 풀에서 조용히 빠지는 것 방지).
              // keepSelection=false: 선별 해제 → 강재전체목록 입고 재고로 완전 복귀(자재를 잘못 골랐을 때).
              // N20: originStorageLocation 스냅샷이 있으면 storageLocation 로 복원 (원 위치 참고용, 물리 이동은 사용자 확인)
              data:  {
                status: SteelPlanStatus.RECEIVED,
                issuedAt: null,
                // 숨김 해제 — 아카이브된 강재를 출고취소하면 재고로 되살아나는데,
                // 도장이 남으면 강재전체목록·아카이브 어디에도 안 보이면서 소진만 되는 유령이 된다.
                archivedAt: null,
                ...(keepSelection && (sp.shipoutLabel || item.originShipoutLabel || !item.adHocFromField)
                  ? {
                      shipoutMarkedAt: sp.shipoutMarkedAt ?? new Date(),
                      shipoutHeatNo:   sp.shipoutHeatNo ?? item.heatNo ?? null,
                      shipoutCancelledAt: new Date(),
                    }
                  : { shipoutHeatNo: null, shipoutMarkedAt: null, shipoutCancelledAt: null }),
                ...(item.originStorageLocation ? { storageLocation: item.originStorageLocation } : {}),
              },
            });
          } else if (sp) {
            restoreFailures.push(`원판(${item.steelPlanId}) 상태가 SHIPPED_OUT 가 아니라 복원 불가 (현재: ${sp?.status})`);
          }

          // SteelPlanHeat 처리
          if (item.steelPlanHeatId) {
            const h = await tx.steelPlanHeat.findUnique({ where: { id: item.steelPlanHeatId } });
            if (h) {
              if (h.autoCreatedFromShipment) {
                // 다른 ShipmentItem 이 이 heat 를 참조하는지 확인 — 있으면 보존
                const refs = await tx.shipmentItem.count({
                  where: {
                    steelPlanHeatId: h.id,
                    NOT: { vehicle: { shipmentId: id } },
                    // 활성 출고장만 참조로 인정 — 취소된(CANCELLED) 이력 item 이 삭제를 영구 차단(고아)하지 않게.
                    vehicle: { shipment: { status: ShipmentStatus.ACTIVE } },
                  },
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
                    // archivedAt 동반 해제 — 위 원판과 같은 이유(숨겨진 대기 판번호 = 유령)
                    data:  { status: SteelPlanHeatStatus.WAITING, shippedAt: null, archivedAt: null },
                  });
                }
              }
            }
          }
        }
      }

      // 복원 실패가 하나라도 있으면 취소 전체를 롤백 — 부분취소 확정(자재 고아) 방지. force=true 면 강행.
      if (restoreFailures.length > 0 && !force) {
        throw new Error(`취소 불가 — 복원할 수 없는 항목 ${restoreFailures.length}건이 있습니다.\n${restoreFailures.join("\n")}\n자재 상태를 바로잡은 뒤 다시 시도하세요.`);
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

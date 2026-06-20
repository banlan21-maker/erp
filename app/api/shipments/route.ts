/**
 * 출고장 생성 + 이력 목록
 *
 * POST /api/shipments
 *   body: {
 *     shippedAt: "YYYY-MM-DD",
 *     memo?: string,
 *     vehicles: [{
 *       sequence: number,
 *       vehicleNo: string, driverName?, driverPhone?, loadLimit?,
 *       supplierId, supplierSnapshot (JSON), deliveryId, deliverySnapshot (JSON),
 *       items: [{
 *         steelPlanId, vesselCode, material, thickness, width, length, weight,
 *         heatNo?, manualHeatNo: boolean, steelPlanHeatId?: string
 *       }]
 *     }]
 *   }
 *   동작: 트랜잭션으로
 *     1) Shipment + ShipmentVehicle + ShipmentItem 저장
 *     2) heatNo 처리 — 기존 매칭 / 직접입력 시 신규 SteelPlanHeat 생성 (status=SHIPPED)
 *     3) SteelPlan.status = SHIPPED_OUT, issuedAt = shippedAt, storageLocation = null
 *     4) shipmentNo / invoiceNo 자동발번
 *
 * GET  /api/shipments?from=YYYY-MM-DD&to=YYYY-MM-DD&status=ACTIVE|CANCELLED|ALL
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ShipmentStatus, SteelPlanStatus, SteelPlanHeatStatus, Prisma } from "@prisma/client";
import { nextShipmentNo, nextInvoiceNo } from "@/lib/shipment-numbering";

export const dynamic = "force-dynamic";

interface ShipmentItemInput {
  kind?:           "plate" | "remnant";  // 없으면 plate (하위 호환)
  steelPlanId?:    string;               // plate 전용
  remnantId?:      string;               // remnant 전용
  steelPlanHeatId?: string | null;
  vesselCode:      string;
  material:        string;
  thickness:       number;
  width:           number;
  length:          number;
  weight:          number;
  block?:          string | null;
  heatNo?:         string | null;
  manualHeatNo:    boolean;
}
// 항목이 잔재 출고인지 판별 (kind 명시 우선, 아니면 remnantId 유무로)
const isRemnantItem = (i: ShipmentItemInput) => i.kind === "remnant" || (!i.steelPlanId && !!i.remnantId);
interface VehicleInput {
  sequence:        number;
  vehicleNo?:      string;
  driverName?:     string;
  driverPhone?:    string;
  loadLimit?:      number | null;
  supplierId?:     string | null;
  supplierSnapshot?: unknown;
  deliveryId?:     string | null;
  deliverySnapshot?: unknown;
  writerName?:     string;
  writerPhone?:    string;
  items:           ShipmentItemInput[];
}

function isVehicle(v: unknown): v is VehicleInput {
  return !!v && typeof v === "object"
    && typeof (v as VehicleInput).sequence === "number"
    && Array.isArray((v as VehicleInput).items);
}

export async function GET(req: NextRequest) {
  try {
    const sp = new URL(req.url).searchParams;
    const from = sp.get("from");
    const to   = sp.get("to");
    const status = sp.get("status");

    const where: Prisma.ShipmentWhereInput = {};
    if (from || to) {
      where.shippedAt = {};
      if (from) (where.shippedAt as Prisma.DateTimeFilter).gte = new Date(`${from}T00:00:00.000Z`);
      if (to)   (where.shippedAt as Prisma.DateTimeFilter).lte = new Date(`${to}T23:59:59.999Z`);
    }
    if (status === "ACTIVE" || status === "CANCELLED") where.status = status;

    const list = await prisma.shipment.findMany({
      where,
      orderBy: [{ shippedAt: "desc" }, { createdAt: "desc" }],
      include: {
        vehicles: {
          orderBy: { sequence: "asc" },
          include: { items: true },
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: list.map(s => ({
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
          items: v.items.map(it => ({
            ...it,
            createdAt: it.createdAt.toISOString(),
          })),
        })),
      })),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "조회 실패";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const shippedAtStr = typeof body?.shippedAt === "string" ? body.shippedAt : "";
    const vehiclesRaw  = Array.isArray(body?.vehicles) ? body.vehicles : [];

    if (!/^\d{4}-\d{2}-\d{2}$/.test(shippedAtStr)) {
      return NextResponse.json({ success: false, error: "출고일(shippedAt) 형식이 올바르지 않습니다." }, { status: 400 });
    }
    if (vehiclesRaw.length === 0) {
      return NextResponse.json({ success: false, error: "차분이 최소 1대 이상 있어야 합니다." }, { status: 400 });
    }
    const vehicles: VehicleInput[] = [];
    for (const v of vehiclesRaw) {
      if (!isVehicle(v)) return NextResponse.json({ success: false, error: "차분 데이터 형식 오류" }, { status: 400 });
      if (v.items.length === 0) return NextResponse.json({ success: false, error: "각 차분에 자재가 1건 이상 있어야 합니다." }, { status: 400 });
      vehicles.push(v);
    }

    // 원판/잔재 분리
    const allItems = vehicles.flatMap(v => v.items);
    // 항목 형태 검증 — 원판/잔재 정확히 한쪽만 (양쪽 다 비거나 둘 다 채워진 유령 행 차단)
    for (const it of allItems) {
      const hasPlate = !!it.steelPlanId;
      const hasRem   = !!it.remnantId;
      if (hasPlate && hasRem) {
        return NextResponse.json({ success: false, error: "한 자재에 원판과 잔재를 동시에 지정할 수 없습니다." }, { status: 400 });
      }
      if (isRemnantItem(it) ? !hasRem : !hasPlate) {
        return NextResponse.json({ success: false, error: "자재 식별자(원판/잔재 ID)가 없는 항목이 있습니다." }, { status: 400 });
      }
    }
    const allSteelPlanIds = allItems.filter(i => !isRemnantItem(i)).map(i => i.steelPlanId!).filter(Boolean);
    const allRemnantIds   = allItems.filter(i =>  isRemnantItem(i)).map(i => i.remnantId!).filter(Boolean);

    // 중복 배차 차단 (원판·잔재 각각)
    const dupePlan = allSteelPlanIds.find((id, i) => allSteelPlanIds.indexOf(id) !== i);
    if (dupePlan) {
      return NextResponse.json({ success: false, error: `원판이 중복 배차되었습니다: ${dupePlan}` }, { status: 400 });
    }
    const dupeRem = allRemnantIds.find((id, i) => allRemnantIds.indexOf(id) !== i);
    if (dupeRem) {
      return NextResponse.json({ success: false, error: `잔재가 중복 배차되었습니다: ${dupeRem}` }, { status: 400 });
    }

    // ── 원판(SteelPlan) 검증 ────────────────────────────────────────────────
    if (allSteelPlanIds.length > 0) {
      const targets = await prisma.steelPlan.findMany({
        where: { id: { in: allSteelPlanIds } },
        select: { id: true, status: true, vesselCode: true, reservedFor: true },
      });
      if (targets.length !== allSteelPlanIds.length) {
        return NextResponse.json({ success: false, error: "존재하지 않는 원판이 포함되어 있습니다." }, { status: 400 });
      }
      const notReceived = targets.filter(t => t.status !== "RECEIVED");
      if (notReceived.length > 0) {
        return NextResponse.json({
          success: false,
          error: `RECEIVED 가 아닌 원판이 ${notReceived.length}건 있습니다. 새로고침 후 다시 시도하세요.`,
        }, { status: 409 });
      }
      // 블록확정(절단용, reservedFor)된 강재는 외부출고 불가 — 절단 확정취소가 먼저 (절단↔출고 상호배제)
      const blockReserved = targets.filter(t => t.reservedFor);
      if (blockReserved.length > 0) {
        return NextResponse.json({
          success: false,
          error: `블록확정(절단용)된 강재가 ${blockReserved.length}건 있습니다. 블록강재리스트에서 확정취소 후 출고하세요.`,
        }, { status: 409 });
      }
      // 활성(ACTIVE) 출고장에 이미 등록된 자재 확인 — 취소된(CANCELLED) ShipmentItem 은 무시
      const alreadyActive = await prisma.shipmentItem.findMany({
        where: { steelPlanId: { in: allSteelPlanIds }, vehicle: { shipment: { status: "ACTIVE" } } },
        select: { steelPlanId: true, vehicle: { select: { shipment: { select: { shipmentNo: true } } } } },
      });
      if (alreadyActive.length > 0) {
        const sample = alreadyActive.slice(0, 3).map(x => `${x.steelPlanId} (출고장 ${x.vehicle.shipment.shipmentNo})`);
        return NextResponse.json({
          success: false,
          error: `이미 출고된 원판이 ${alreadyActive.length}건 있습니다.\n` + sample.join("\n"),
        }, { status: 409 });
      }
    }

    // ── 잔재(Remnant) 검증 ──────────────────────────────────────────────────
    if (allRemnantIds.length > 0) {
      const rems = await prisma.remnant.findMany({
        where: { id: { in: allRemnantIds } },
        select: { id: true, status: true, remnantNo: true, reservedFor: true },
      });
      if (rems.length !== allRemnantIds.length) {
        return NextResponse.json({ success: false, error: "존재하지 않는 잔재가 포함되어 있습니다." }, { status: 400 });
      }
      // 출고 가능 상태(IN_STOCK)만 — PENDING(미절단)/EXHAUSTED(이미 소진) 차단.
      // (출고원천을 IN_STOCK 으로 고정해야 출고취소 시 IN_STOCK 복원이 정합)
      const notInStock = rems.filter(r => r.status !== "IN_STOCK");
      if (notInStock.length > 0) {
        return NextResponse.json({
          success: false,
          error: `출고 가능한(재고) 상태가 아닌 잔재가 ${notInStock.length}건 있습니다. 새로고침 후 다시 시도하세요.`,
        }, { status: 409 });
      }
      // 블록확정(절단용, reservedFor)된 잔재는 외부출고 불가 — 절단↔출고 상호배제 (원판과 동일)
      const remReserved = rems.filter(r => r.reservedFor);
      if (remReserved.length > 0) {
        return NextResponse.json({
          success: false,
          error: `블록확정(절단용)된 잔재가 ${remReserved.length}건 있습니다. 일괄확정/도면에서 확정취소 후 출고하세요.`,
        }, { status: 409 });
      }
      const remActive = await prisma.shipmentItem.findMany({
        where: { remnantId: { in: allRemnantIds }, vehicle: { shipment: { status: "ACTIVE" } } },
        select: { remnantId: true, vehicle: { select: { shipment: { select: { shipmentNo: true } } } } },
      });
      if (remActive.length > 0) {
        const sample = remActive.slice(0, 3).map(x => `${x.remnantId} (출고장 ${x.vehicle.shipment.shipmentNo})`);
        return NextResponse.json({
          success: false,
          error: `이미 출고된 잔재가 ${remActive.length}건 있습니다.\n` + sample.join("\n"),
        }, { status: 409 });
      }
    }

    const shippedAt = new Date(`${shippedAtStr}T00:00:00.000Z`);

    const created = await prisma.$transaction(async (tx) => {
      const shipmentNo = await nextShipmentNo(tx, shippedAt);

      // Shipment 헤더
      const shipment = await tx.shipment.create({
        data: {
          shipmentNo,
          shippedAt,
          status: ShipmentStatus.ACTIVE,
          memo:   typeof body?.memo === "string" ? body.memo.trim() || null : null,
          createdBy: null, // 로그인 시스템 도입 후 username
        },
      });

      for (const v of vehicles) {
        const invoiceNo = await nextInvoiceNo(tx, shippedAt);
        const totalWeight = v.items.reduce((s, x) => s + (x.weight || 0), 0);

        const vehicle = await tx.shipmentVehicle.create({
          data: {
            shipmentId: shipment.id,
            sequence:   v.sequence,
            vehicleNo:   (v.vehicleNo ?? "").trim(),
            driverName:  v.driverName?.trim()  || null,
            driverPhone: v.driverPhone?.trim() || null,
            loadLimit:   v.loadLimit ?? null,
            totalWeight,
            supplierId: v.supplierId ?? null,
            supplierSnapshot: (v.supplierSnapshot as Prisma.InputJsonValue) ?? Prisma.JsonNull,
            deliveryId: v.deliveryId ?? null,
            deliverySnapshot: (v.deliverySnapshot as Prisma.InputJsonValue) ?? Prisma.JsonNull,
            invoiceNo,
            invoicedAt: new Date(),
            issueDate:   shippedAt,
            writerName:  v.writerName?.trim()  || null,
            writerPhone: v.writerPhone?.trim() || null,
          },
        });

        for (const item of v.items) {
          // ── 잔재 출고 — remnantId 로 ShipmentItem 생성, 잔재 소진(EXHAUSTED) + 선별마킹 정리 ──
          if (isRemnantItem(item)) {
            const remHeatNo = (item.heatNo ?? "").trim() || null;
            await tx.shipmentItem.create({
              data: {
                vehicleId:       vehicle.id,
                steelPlanId:     null,
                remnantId:       item.remnantId!,
                steelPlanHeatId: null,
                vesselCode: item.vesselCode,
                material:   item.material,
                thickness:  item.thickness,
                width:      item.width,
                length:     item.length,
                weight:     item.weight,
                block:      item.block ?? null,
                heatNo:     remHeatNo,
                manualHeatNo: false,
              },
            });
            // 원자적 소진 — IN_STOCK 일 때만 EXHAUSTED 전환. 동시 출고 race 시 한쪽만 성공.
            const exhaust = await tx.remnant.updateMany({
              where: { id: item.remnantId!, status: "IN_STOCK" },
              data:  { status: "EXHAUSTED", shipoutMarkedAt: null },
            });
            if (exhaust.count !== 1) {
              throw new Error(`잔재(${item.remnantId})가 이미 출고/소진되어 처리할 수 없습니다. 새로고침 후 다시 시도하세요.`);
            }
            continue;
          }

          // ── 원판 출고 ── (기존 로직 그대로)
          // 판번호 처리
          let heatId: string | null = item.steelPlanHeatId ?? null;
          const heatNoText = (item.heatNo ?? "").trim() || null;
          if (heatNoText) {
            // 직접입력(manualHeatNo=true) — 같은 사양 + 판번호 일치하는 행이 이미 있는가
            if (item.manualHeatNo) {
              const existing = await tx.steelPlanHeat.findFirst({
                where: {
                  vesselCode: item.vesselCode,
                  material:   item.material,
                  thickness:  item.thickness,
                  width:      item.width,
                  length:     item.length,
                  heatNo:     heatNoText,
                },
              });
              if (existing) {
                heatId = existing.id;
                await tx.steelPlanHeat.update({
                  where: { id: existing.id },
                  data:  { status: SteelPlanHeatStatus.SHIPPED, shippedAt },
                });
              } else {
                const fresh = await tx.steelPlanHeat.create({
                  data: {
                    vesselCode: item.vesselCode,
                    material:   item.material,
                    thickness:  item.thickness,
                    width:      item.width,
                    length:     item.length,
                    heatNo:     heatNoText,
                    status:     SteelPlanHeatStatus.SHIPPED,
                    shippedAt,
                    autoCreatedFromShipment: true,
                  },
                });
                heatId = fresh.id;
              }
            } else if (heatId) {
              // 매칭된 기존 판 — status 만 SHIPPED 전환
              await tx.steelPlanHeat.update({
                where: { id: heatId },
                data:  { status: SteelPlanHeatStatus.SHIPPED, shippedAt },
              });
            }
          }

          await tx.shipmentItem.create({
            data: {
              vehicleId:       vehicle.id,
              steelPlanId:     item.steelPlanId!,
              steelPlanHeatId: heatId,
              vesselCode: item.vesselCode,
              material:   item.material,
              thickness:  item.thickness,
              width:      item.width,
              length:     item.length,
              weight:     item.weight,
              block:      item.block ?? null,
              heatNo:     heatNoText,
              manualHeatNo: item.manualHeatNo,
            },
          });

          await tx.steelPlan.update({
            where: { id: item.steelPlanId! },
            data:  {
              status:          SteelPlanStatus.SHIPPED_OUT,
              issuedAt:        shippedAt,
              storageLocation: null,
              // 출고등록(가벼운 선별 마킹)된 강재가 정식 출고되면 마킹 정리 — 유령 '출고' 배지 방지
              shipoutMarkedAt: null,
              shipoutHeatNo:   null,
              shipoutLabel:    null,
            },
          });
        }
      }

      return tx.shipment.findUnique({
        where: { id: shipment.id },
        include: {
          vehicles: { orderBy: { sequence: "asc" }, include: { items: true } },
        },
      });
    });

    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "출고장 생성 실패";
    console.error("[POST /api/shipments]", err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

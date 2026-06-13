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
  steelPlanId:     string;
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

    // 중복 steelPlanId 차단 (한 차분/차분간)
    const allSteelPlanIds = vehicles.flatMap(v => v.items.map(i => i.steelPlanId));
    const dupe = allSteelPlanIds.find((id, i) => allSteelPlanIds.indexOf(id) !== i);
    if (dupe) {
      return NextResponse.json({ success: false, error: `자재가 중복 배차되었습니다: ${dupe}` }, { status: 400 });
    }

    // 모든 SteelPlan 이 RECEIVED 인지 확인 (낙관적 락은 아니지만 1차 가드)
    const targets = await prisma.steelPlan.findMany({
      where: { id: { in: allSteelPlanIds } },
      select: { id: true, status: true, vesselCode: true },
    });
    if (targets.length !== allSteelPlanIds.length) {
      return NextResponse.json({ success: false, error: "존재하지 않는 자재가 포함되어 있습니다." }, { status: 400 });
    }
    const notReceived = targets.filter(t => t.status !== "RECEIVED");
    if (notReceived.length > 0) {
      return NextResponse.json({
        success: false,
        error: `RECEIVED 가 아닌 자재가 ${notReceived.length}건 있습니다. 새로고침 후 다시 시도하세요.`,
      }, { status: 409 });
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
              steelPlanId:     item.steelPlanId,
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
            where: { id: item.steelPlanId },
            data:  {
              status:          SteelPlanStatus.SHIPPED_OUT,
              issuedAt:        shippedAt,
              storageLocation: null,
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

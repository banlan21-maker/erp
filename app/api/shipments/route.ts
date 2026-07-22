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
  adHocFromField?: boolean;              // 현장직접출고 탭에서 담긴 자재 감사 태그
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
  // 트랜잭션 시간 초과(P2028) 안내에서 쓰려고 catch 밖에서도 보이게 둔다
  let itemCount = 0;
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
    itemCount = allItems.length;
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
    // 원판끼리 같은 판번호(heatNo) 중복 입력 차단 — 물리 1장이 여러 원판에 이중 기록되는 것을 방지.
    // (잔재는 원판 판번호를 공유할 수 있어 원판 항목끼리만 검사)
    const plateHeatNos = allItems
      .filter(i => !isRemnantItem(i) && i.heatNo?.trim())
      .map(i => i.heatNo!.trim().toUpperCase());
    const dupeHeat = plateHeatNos.find((h, i) => plateHeatNos.indexOf(h) !== i);
    if (dupeHeat) {
      return NextResponse.json({ success: false, error: `같은 판번호(${dupeHeat})가 여러 원판에 중복 입력되었습니다.` }, { status: 400 });
    }

    // ── 원판(SteelPlan) 검증 ────────────────────────────────────────────────
    // 원판별 원 shipoutLabel 스냅샷 (I1) + 원 storageLocation 스냅샷 (N20)
    // — 트랜잭션 안에서 ShipmentItem 생성 시 사용
    const shipoutLabelMap    = new Map<string, string | null>();
    const storageLocationMap = new Map<string, string | null>();
    if (allSteelPlanIds.length > 0) {
      const targets = await prisma.steelPlan.findMany({
        where: { id: { in: allSteelPlanIds } },
        // shipoutLabel: 사무실 선별 라벨 (I1) / storageLocation: 원 보관위치 (N20)
        select: { id: true, status: true, vesselCode: true, reservedFor: true, shipoutLabel: true, storageLocation: true },
      });
      for (const t of targets) {
        shipoutLabelMap.set(t.id, t.shipoutLabel);
        storageLocationMap.set(t.id, t.storageLocation);
      }
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
    const remNoMap = new Map<string, string>(); // remnantId → 잔재번호 (거래명세표 스냅샷용)
    if (allRemnantIds.length > 0) {
      const rems = await prisma.remnant.findMany({
        where: { id: { in: allRemnantIds } },
        select: { id: true, status: true, remnantNo: true, reservedFor: true },
      });
      if (rems.length !== allRemnantIds.length) {
        return NextResponse.json({ success: false, error: "존재하지 않는 잔재가 포함되어 있습니다." }, { status: 400 });
      }
      for (const r of rems) remNoMap.set(r.id, r.remnantNo);
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
            // N22: heatNo 저장 시 대문자 정규화 (조회는 이미 case-insensitive)
            const remHeatNo = (item.heatNo ?? "").trim().toUpperCase() || null;
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
                adHocFromField: item.adHocFromField ?? false,
                remnantNo:  remNoMap.get(item.remnantId!) ?? null,
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
          // N22: heatNo 저장 시 대문자 정규화 (조회는 이미 case-insensitive)
          const heatNoText = (item.heatNo ?? "").trim().toUpperCase() || null;
          if (heatNoText) {
            // 직접입력(manualHeatNo=true) — 같은 규격 + 판번호 일치하는 행이 이미 있는가
            //
            // ★ 호선(vesselCode)은 조회 조건에서 뺀다. 판번호는 철판 한 장의 고유번호이고
            //   호선은 입고 예산 꼬리표일 뿐이다. 야드에 자매호선 철판이 섞여 쌓이므로
            //   출고하는 원판의 호선과 실물 판번호의 호선이 다른 경우가 흔한데, 호선으로
            //   잠그면 ① 재고 판번호를 못 찾고 ② 중복 검사도 통과해서 ③ 잘못된 호선으로
            //   같은 판번호를 새로 만들어버린다(유령 판번호). 그러면 진짜 판번호는 WAITING 으로
            //   남아 나중에 절단이나 다른 출고에 다시 소진된다.
            if (item.manualHeatNo) {
              const specWhere = {
                material:  item.material,
                thickness: item.thickness, width: item.width, length: item.length,
                heatNo:    heatNoText,
              };
              // 재고(WAITING) 판번호가 있으면 그걸 출고. 같은 호선 것을 우선하고, 없으면 타 호선.
              const waiting =
                await tx.steelPlanHeat.findFirst({
                  where: { ...specWhere, vesselCode: item.vesselCode, status: SteelPlanHeatStatus.WAITING },
                  orderBy: { createdAt: "asc" },
                })
                ?? await tx.steelPlanHeat.findFirst({
                  where: { ...specWhere, status: SteelPlanHeatStatus.WAITING },
                  orderBy: { createdAt: "asc" },
                });
              if (waiting) {
                // 원자적 SHIPPED 전환 — 조회~제출 사이 상태변경 시 count=0 → 롤백(이중출고/절단오염 차단).
                const moved = await tx.steelPlanHeat.updateMany({
                  where: { id: waiting.id, status: SteelPlanHeatStatus.WAITING },
                  data:  { status: SteelPlanHeatStatus.SHIPPED, shippedAt },
                });
                if (moved.count !== 1) {
                  throw new Error(`판번호(${heatNoText})가 이미 절단/출고 처리되어 출고할 수 없습니다. 새로고침 후 다시 시도하세요.`);
                }
                heatId = waiting.id;
              } else {
                // 재고 판번호 없음 — 이미 사용(절단 CUT/출고 SHIPPED)된 동일 판번호가 있으면 차단, 없으면 신규 SHIPPED 생성.
                // 중복 검사도 호선 무관 — 타 호선에 이미 소진된 같은 판번호가 있는데 신규 생성하면
                // 같은 판번호가 두 줄이 되어 실물 추적이 끊긴다.
                const used = await tx.steelPlanHeat.findFirst({
                  where: specWhere,
                  select: { id: true, vesselCode: true, status: true },
                });
                if (used) {
                  const where = used.vesselCode === item.vesselCode ? "" : ` (${used.vesselCode} 호선 등록분)`;
                  throw new Error(`판번호(${heatNoText})가 이미 절단/출고 처리되어 출고할 수 없습니다${where}. 새로고침 후 다시 시도하세요.`);
                }
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
              // 매칭된 기존 판 — WAITING 일 때만 원자적 SHIPPED 전환.
              // 조회~제출 사이 동시 절단(CUT)/타 출고로 상태가 바뀌면 count=0 → 트랜잭션 롤백.
              // (절단 소진된 판을 통째로 출고하거나, 같은 판번호가 두 출고에 중복 기록되는 것을 차단)
              const moved = await tx.steelPlanHeat.updateMany({
                where: { id: heatId, status: SteelPlanHeatStatus.WAITING },
                data:  { status: SteelPlanHeatStatus.SHIPPED, shippedAt },
              });
              if (moved.count !== 1) {
                throw new Error(`판번호(${heatNoText ?? heatId})가 이미 절단/출고 처리되어 출고할 수 없습니다. 새로고침 후 다시 시도하세요.`);
              }
            }
          } else if (!heatId) {
            // 판번호 미입력 원판 출고 — 강재↔판번호 개수 정합을 위해 같은 사양의 재고(WAITING) 판번호 1장을
            // FIFO 로 함께 소진(SHIPPED). 없으면 그냥 통과(진짜 판번호 미상). 잔류 WAITING heat 가 절단에 재소진되는 유령 방지.
            const fifo = await tx.steelPlanHeat.findFirst({
              where: {
                vesselCode: item.vesselCode, material: item.material,
                thickness: item.thickness, width: item.width, length: item.length,
                status: SteelPlanHeatStatus.WAITING,
              },
              orderBy: { createdAt: "asc" },
            });
            if (fifo) {
              const moved = await tx.steelPlanHeat.updateMany({
                where: { id: fifo.id, status: SteelPlanHeatStatus.WAITING },
                data:  { status: SteelPlanHeatStatus.SHIPPED, shippedAt },
              });
              if (moved.count === 1) heatId = fifo.id;
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
              adHocFromField: item.adHocFromField ?? false,
              // 현장직접출고(adHocFromField=true)이고 원 자재가 사무실 선별(shipoutLabel)되어 있었다면
              // 그 라벨을 스냅샷으로 보존 — 취소해도 유지되어 사후 추적 가능 (I1)
              originShipoutLabel: item.adHocFromField ? (shipoutLabelMap.get(item.steelPlanId!) ?? null) : null,
              // N20: 원 보관위치 스냅샷 — 취소 시 SteelPlan.storageLocation 로 복원
              originStorageLocation: storageLocationMap.get(item.steelPlanId!) ?? null,
            },
          });

          // 원자적 전환 — 사전검증과 동일 상태(RECEIVED·미확정)일 때만 SHIPPED_OUT.
          // 사전검증은 트랜잭션 밖(prisma)이라, 동시 출고/블록확정이 끼면 count=0 → 롤백(이중 출고 차단).
          const flipped = await tx.steelPlan.updateMany({
            where: { id: item.steelPlanId!, status: SteelPlanStatus.RECEIVED, reservedFor: null },
            data:  {
              status:          SteelPlanStatus.SHIPPED_OUT,
              issuedAt:        shippedAt,
              storageLocation: null,
              // 선별 마킹(선별목록 멤버십)만 정리 — 선별목록 쿼리가 shipoutMarkedAt 기준이라 출고분 제외 필요.
              // shipoutLabel 은 보존: 확정정보 "{라벨} 출고" 표시 + 강재매칭이 출고분을 작업에 귀속해 '출고'로 인식.
              shipoutMarkedAt: null,
              shipoutHeatNo:   null,
            },
          });
          if (flipped.count !== 1) {
            throw new Error(`원판(${item.steelPlanId})이 이미 출고되었거나 상태가 변경되었습니다. 새로고침 후 다시 시도하세요.`);
          }
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
    const code = err && typeof err === "object" ? (err as { code?: string }).code : undefined;
    // 발번 동시성 충돌(P2002 unique) — 원시 500 대신 재시도 안내 409
    if (code === "P2002") {
      return NextResponse.json({ success: false, error: "출고장/거래명세서 번호가 동시 생성으로 충돌했습니다. 잠시 후 다시 시도하세요." }, { status: 409 });
    }
    // 트랜잭션 시간 초과(P2028) — 전체가 롤백돼 아무것도 저장되지 않은 상태다.
    // 원시 메시지("Transaction already closed")는 현장에서 해석 불가하므로 조치 가능한 안내로 바꾼다.
    if (code === "P2028") {
      return NextResponse.json({
        success: false,
        error: `자재 ${itemCount}건을 처리하는 데 시간이 초과되어 출고장이 생성되지 않았습니다(저장된 것 없음). `
             + `잠시 후 다시 시도하거나, 자재를 차수로 나눠 진행하세요.`,
      }, { status: 503 });
    }
    const msg = err instanceof Error ? err.message : "출고장 생성 실패";
    console.error("[POST /api/shipments]", err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

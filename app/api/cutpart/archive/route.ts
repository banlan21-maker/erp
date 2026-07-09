export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const calcW = (t: number, w: number, l: number) => parseFloat((t * w * l * 7.85 / 1_000_000).toFixed(1));

// 대상 판정 — 터미널 날짜(절단일/출고일) 우선, 없으면 updatedAt 폴백 (과거 데이터 대응)
const heatWhere = (cutoff: Date) => ({
  archivedAt: null,
  OR: [
    { status: "CUT" as const,     cutAt:     { not: null, lte: cutoff } },
    { status: "CUT" as const,     cutAt:     null, updatedAt: { lte: cutoff } },
    { status: "SHIPPED" as const, shippedAt: { not: null, lte: cutoff } },
    { status: "SHIPPED" as const, shippedAt: null, updatedAt: { lte: cutoff } },
  ],
});
const planWhere = (cutoff: Date) => ({
  archivedAt: null,
  status: { in: ["COMPLETED", "SHIPPED_OUT"] as ("COMPLETED" | "SHIPPED_OUT")[] },
  // 출고일(절단완료일/외부출고일) 우선, 없으면 updatedAt 폴백. updatedAt 은 백필로 밀릴 수 있어 issuedAt 우선.
  OR: [
    { issuedAt: { not: null, lte: cutoff } },
    { issuedAt: null, updatedAt: { lte: cutoff } },
  ],
});

// GET /api/cutpart/archive?months=1[&from=YYYY-MM-DD&to=YYYY-MM-DD&basis=terminal|useDate|outDate|archivedAt]
//   - from/to 미지정 → 실행 대상 수(eligible)만 반환, 리스트는 빈 배열 (초기 진입 시 숨김)
//   - from/to 지정   → 기준일(basis)이 해당 기간에 드는 아카이브 판번호만 반환
export async function GET(req: NextRequest) {
  try {
    const params = new URL(req.url).searchParams;
    const months = Math.max(0, parseInt(params.get("months") ?? "1") || 1);
    const cutoff = new Date(); cutoff.setMonth(cutoff.getMonth() - months);

    // 실행 대상 미리보기: 판번호(CUT/SHIPPED) + 강재(COMPLETED/SHIPPED_OUT), N개월 이상, 미아카이브
    const [eligibleHeats, eligiblePlans] = await Promise.all([
      prisma.steelPlanHeat.count({ where: heatWhere(cutoff) }),
      prisma.steelPlan.count({ where: planWhere(cutoff) }),
    ]);
    const eligible = eligibleHeats + eligiblePlans;

    const fromStr = params.get("from");
    const toStr   = params.get("to");
    // 기간 미지정 → 카운트만 (초기 진입: 리스트 숨김)
    if (!fromStr || !toStr) return NextResponse.json({ success: true, data: [], plans: [], eligible });

    const basis = params.get("basis") ?? "terminal";
    const from = new Date(`${fromStr}T00:00:00`);
    const to   = new Date(`${toStr}T23:59:59.999`);
    if (isNaN(from.getTime()) || isNaN(to.getTime())) {
      return NextResponse.json({ success: false, error: "기간 형식이 올바르지 않습니다." }, { status: 400 });
    }
    const inRange = (d: Date | null) => d != null && d >= from && d <= to;

    const heats = await prisma.steelPlanHeat.findMany({
      where: { archivedAt: { not: null } },
      orderBy: { archivedAt: "desc" },
    });

    const heatNos = [...new Set(heats.map(h => h.heatNo))];
    const heatIds = heats.map(h => h.id);

    // 사용정보 — CuttingLog(COMPLETED) 를 판번호로 조인 (판번호당 첫 절단)
    const cutLogs = await prisma.cuttingLog.findMany({
      where: { status: "COMPLETED", heatNo: { in: heatNos } },
      include: { equipment: { select: { name: true } }, project: { select: { projectCode: true } }, drawingList: { select: { block: true, drawingNo: true } } },
      orderBy: { endAt: "asc" },
    });
    const cutByHeat = new Map<string, (typeof cutLogs)[number]>();
    for (const c of cutLogs) if (!cutByHeat.has(c.heatNo)) cutByHeat.set(c.heatNo, c);

    // 출고정보 — ShipmentItem 을 판번호(steelPlanHeatId) 로 조인
    const shipItems = await prisma.shipmentItem.findMany({
      where: { steelPlanHeatId: { in: heatIds } },
      include: { vehicle: { include: { shipment: { select: { shippedAt: true, shipmentNo: true } } } } },
    });
    const shipByHeat = new Map<string, (typeof shipItems)[number]>();
    for (const si of shipItems) if (si.steelPlanHeatId && !shipByHeat.has(si.steelPlanHeatId)) shipByHeat.set(si.steelPlanHeatId, si);

    const data = heats.map(h => {
      const cut = cutByHeat.get(h.heatNo);
      const ship = shipByHeat.get(h.id);
      const dest = ship ? ((ship.vehicle?.deliverySnapshot as { name?: string } | null)?.name ?? "") : "";
      const useDate = cut?.endAt ?? null;
      const outDate = ship?.vehicle?.shipment?.shippedAt ?? null;
      // 기준일: 지정 basis 우선, terminal = 사용일 ?? 출고일 ?? 아카이브일 (항상 존재)
      const basisDate =
        basis === "useDate"    ? useDate :
        basis === "outDate"    ? outDate :
        basis === "archivedAt" ? h.archivedAt :
                                 (useDate ?? outDate ?? h.archivedAt);
      return {
        row: {
          id: h.id, heatNo: h.heatNo, status: h.status, archivedAt: h.archivedAt,
          inVessel: h.vesselCode, inBlock: "", material: h.material, thickness: h.thickness, width: h.width, length: h.length, weight: calcW(h.thickness, h.width, h.length),
          useVessel: cut?.project?.projectCode ?? "", useBlock: cut?.drawingList?.block ?? "", drawingNo: cut?.drawingNo ?? cut?.drawingList?.drawingNo ?? "", equipment: cut?.equipment?.name ?? "", useDate,
          outVessel: ship?.vesselCode ?? "", outBlock: ship?.block ?? "", dest, outDate,
        },
        basisDate,
      };
    })
      .filter(x => inRange(x.basisDate))
      .map(x => x.row);

    // 강재(사양단위 SteelPlan) — 아카이브 대상은 status COMPLETED/SHIPPED_OUT
    const plansRaw = await prisma.steelPlan.findMany({
      where: { archivedAt: { not: null } },
      orderBy: { archivedAt: "desc" },
    });
    const plans = plansRaw.map(p => {
      // 강재 기준일: archivedAt 외에는 출고/투입일(issuedAt) 우선, 없으면 입고일 ?? 아카이브일
      const basisDate =
        basis === "archivedAt" ? p.archivedAt :
                                 (p.issuedAt ?? p.receivedAt ?? p.archivedAt);
      return {
        row: {
          id: p.id, vesselCode: p.vesselCode, material: p.material, thickness: p.thickness, width: p.width, length: p.length,
          weight: calcW(p.thickness, p.width, p.length), status: p.status, reservedFor: p.reservedFor ?? "",
          receivedAt: p.receivedAt, issuedAt: p.issuedAt, archivedAt: p.archivedAt,
        },
        basisDate,
      };
    })
      .filter(x => inRange(x.basisDate))
      .map(x => x.row);

    return NextResponse.json({ success: true, data, plans, eligible });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

// POST /api/cutpart/archive  { action: "run"|"restore", months?, heatIds?, all? }
export async function POST(req: NextRequest) {
  try {
    const b = await req.json();
    const action = b?.action;

    if (action === "run") {
      const months = Math.max(0, parseInt(b?.months) || 1);
      const cutoff = new Date(); cutoff.setMonth(cutoff.getMonth() - months);
      const now = new Date();
      const [heats, plans] = await Promise.all([
        prisma.steelPlanHeat.updateMany({ where: heatWhere(cutoff), data: { archivedAt: now } }),
        prisma.steelPlan.updateMany({ where: planWhere(cutoff), data: { archivedAt: now } }),
      ]);
      return NextResponse.json({ success: true, archivedHeats: heats.count, archivedPlans: plans.count });
    }

    if (action === "restore") {
      if (b?.all === true) {
        await prisma.$transaction([
          prisma.steelPlanHeat.updateMany({ where: { archivedAt: { not: null } }, data: { archivedAt: null } }),
          prisma.steelPlan.updateMany({ where: { archivedAt: { not: null } }, data: { archivedAt: null } }),
        ]);
        return NextResponse.json({ success: true });
      }
      const heatIds: string[] = Array.isArray(b?.heatIds) ? b.heatIds : [];
      const planIds: string[] = Array.isArray(b?.planIds) ? b.planIds : [];
      if (heatIds.length === 0 && planIds.length === 0) return NextResponse.json({ success: false, error: "복원할 항목이 없습니다." }, { status: 400 });
      const [h, p] = await Promise.all([
        heatIds.length ? prisma.steelPlanHeat.updateMany({ where: { id: { in: heatIds } }, data: { archivedAt: null } }) : Promise.resolve({ count: 0 }),
        planIds.length ? prisma.steelPlan.updateMany({ where: { id: { in: planIds } }, data: { archivedAt: null } }) : Promise.resolve({ count: 0 }),
      ]);
      return NextResponse.json({ success: true, restored: h.count + p.count });
    }

    return NextResponse.json({ success: false, error: "알 수 없는 action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

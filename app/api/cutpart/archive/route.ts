export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const calcW = (t: number, w: number, l: number) => parseFloat((t * w * l * 7.85 / 1_000_000).toFixed(1));

/**
 * 대상 판정 — **업무일자(절단일/출고일)만** 본다.
 *
 * ⚠ 예전에는 터미널 날짜가 없으면 `updatedAt` 을 폴백으로 썼는데, 이게 자기파괴적이었다:
 *   아카이브(archivedAt=now)도 복원(archivedAt=null)도 Prisma @updatedAt 때문에 updatedAt 을
 *   '지금'으로 갱신한다 → 폴백에 의존하던 레코드는 왕복 한 번에 판정에서 이탈하고,
 *   왕복할 때마다 설정 개월 수만큼 뒤로 밀린다. **날짜를 보고 판단하는데 판단 행위가 그 날짜를 망가뜨렸다.**
 *   실측(2026-08-18): cutAt 결측 361건이 그렇게 이탈 → 강재 3,341 vs 판번호 2,980 (360 차이).
 *   361건은 작업일보 기준으로 cutAt 백필(`scripts/backfill-heat-cutat.mjs`)해 결측 0으로 만들고
 *   폴백 자체를 제거했다. 결과: 판번호 3,341 / 강재 3,341 (차이 0).
 *   → 앞으로 터미널 날짜가 없는 레코드는 **아카이브 대상에서 빠진다**(조용히 잘못 숨기는 것보다 안전).
 */
const heatWhere = (cutoff: Date) => ({
  archivedAt: null,
  OR: [
    { status: "CUT" as const,     cutAt:     { not: null, lte: cutoff } },
    { status: "SHIPPED" as const, shippedAt: { not: null, lte: cutoff } },
  ],
});
const planWhere = (cutoff: Date) => ({
  archivedAt: null,
  status: { in: ["COMPLETED", "SHIPPED_OUT"] as ("COMPLETED" | "SHIPPED_OUT")[] },
  issuedAt: { not: null, lte: cutoff },
});

// 유령 청소 대상 — 상태는 재고로 되돌아갔는데 숨김 도장이 남은 행.
// (절단취소·출고취소·상태동기화가 archivedAt 을 안 지우던 시절의 잔재 + 안전망)
const ghostHeatWhere  = { archivedAt: { not: null }, status: { notIn: ["CUT", "SHIPPED"] as ("CUT" | "SHIPPED")[] } };
const ghostPlanWhere  = { archivedAt: { not: null }, status: { notIn: ["COMPLETED", "SHIPPED_OUT"] as ("COMPLETED" | "SHIPPED_OUT")[] } };

// 월말 보정 — 3/31 에 setMonth(-1) 하면 2/31 이 없어 3/3 으로 튄다(아직 1개월 안 된 것까지 대상).
// 목표 월의 말일로 클램프한다.
function cutoffOf(months: number): Date {
  const now = new Date();
  const d = new Date(now);
  d.setDate(1);
  d.setMonth(d.getMonth() - months);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(now.getDate(), lastDay));
  d.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
  return d;
}

// GET /api/cutpart/archive?months=1[&from=YYYY-MM-DD&to=YYYY-MM-DD&basis=terminal|useDate|outDate|archivedAt]
//   - from/to 미지정 → 실행 대상 수(eligible)만 반환, 리스트는 빈 배열 (초기 진입 시 숨김)
//   - from/to 지정   → 기준일(basis)이 해당 기간에 드는 아카이브 판번호만 반환
export async function GET(req: NextRequest) {
  try {
    const params = new URL(req.url).searchParams;
    const months = Math.max(0, parseInt(params.get("months") ?? "1") || 1);
    const cutoff = cutoffOf(months);

    // 실행 대상 미리보기: 판번호(CUT/SHIPPED) + 강재(COMPLETED/SHIPPED_OUT), N개월 이상, 미아카이브
    // + 현재 아카이브 총량(기간 밖도 포함) — 화면에서 "지금 몇 건 숨겨져 있나"를 항상 보여주기 위함
    const [eligibleHeats, eligiblePlans, archivedHeats, archivedPlans] = await Promise.all([
      prisma.steelPlanHeat.count({ where: heatWhere(cutoff) }),
      prisma.steelPlan.count({ where: planWhere(cutoff) }),
      prisma.steelPlanHeat.count({ where: { archivedAt: { not: null } } }),
      prisma.steelPlan.count({ where: { archivedAt: { not: null } } }),
    ]);
    const eligible = eligibleHeats + eligiblePlans;
    const counts = { eligibleHeats, eligiblePlans, archivedHeats, archivedPlans };

    const fromStr = params.get("from");
    const toStr   = params.get("to");
    // 기간 미지정 → 카운트만 (초기 진입: 리스트 숨김)
    if (!fromStr || !toStr) return NextResponse.json({ success: true, data: [], plans: [], eligible, ...counts });

    const basis = params.get("basis") ?? "terminal";
    // 컨테이너 TZ 가 UTC 라 `T00:00:00`(오프셋 없음)은 UTC 자정으로 파싱된다 → 화면(KST 표시)과 9시간 어긋난다.
    // 실측: 강재 issuedAt 5,297건 중 1,353건(25.5%)이 KST 로는 하루 뒤에 속했다. KST 오프셋을 명시한다.
    const from = new Date(`${fromStr}T00:00:00.000+09:00`);
    const to   = new Date(`${toStr}T23:59:59.999+09:00`);
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

    const data0 = heats.map(h => {
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
          inVessel: h.vesselCode, material: h.material, thickness: h.thickness, width: h.width, length: h.length, weight: calcW(h.thickness, h.width, h.length),
          useVessel: cut?.project?.projectCode ?? "", useBlock: cut?.drawingList?.block ?? "", drawingNo: cut?.drawingNo ?? cut?.drawingList?.drawingNo ?? "", equipment: cut?.equipment?.name ?? "", useDate,
          outVessel: ship?.vesselCode ?? "", outBlock: ship?.block ?? "", dest, outDate,
        },
        basisDate,
      };
    });
    // 기준일(basis)이 없는 행은 기간 판정이 불가능해 목록에서 빠진다 — 몇 건인지 알려준다
    const heatNoBasis = data0.filter(x => x.basisDate == null).length;
    const data = data0.filter(x => inRange(x.basisDate)).map(x => x.row);

    // 강재(사양단위 SteelPlan) — 아카이브 대상은 status COMPLETED/SHIPPED_OUT
    const plansRaw = await prisma.steelPlan.findMany({
      where: { archivedAt: { not: null } },
      orderBy: { archivedAt: "desc" },
    });
    const plans0 = plansRaw.map(p => {
      // 강재 기준일 — 판번호와 같은 4갈래를 지원해야 탭을 바꿔도 같은 잣대로 걸러진다.
      //   (예전엔 archivedAt 외 분기가 없어 '사용일자'·'출고일자'를 골라도 강재 탭 결과가 안 바뀌었다)
      //   강재에는 절단완료일 컬럼이 따로 없다 — COMPLETED 는 issuedAt 이 절단완료 시 기록되고,
      //   SHIPPED_OUT 은 issuedAt = shippedAt 이라 둘 다 issuedAt 이 해당 축이다.
      const pUse = p.status === "COMPLETED"   ? p.issuedAt : null;
      const pOut = p.status === "SHIPPED_OUT" ? p.issuedAt : null;
      const basisDate =
        basis === "useDate"    ? pUse :
        basis === "outDate"    ? pOut :
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
    });
    const planNoBasis = plans0.filter(x => x.basisDate == null).length;
    const plans = plans0.filter(x => inRange(x.basisDate)).map(x => x.row);

    return NextResponse.json({ success: true, data, plans, eligible, ...counts, omitted: { heats: heatNoBasis, plans: planNoBasis } });
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
      const cutoff = cutoffOf(months);
      const now = new Date();
      // 한 묶음으로 — 한쪽만 커밋되면 강재는 숨고 판번호는 남는 반쪽 상태가 영구히 남는다.
      // 실행 전에 '유령'(상태는 재고인데 숨김이 남은 행)을 먼저 청소한다.
      const [gh, gp, heats, plans] = await prisma.$transaction([
        prisma.steelPlanHeat.updateMany({ where: ghostHeatWhere, data: { archivedAt: null } }),
        prisma.steelPlan.updateMany({ where: ghostPlanWhere, data: { archivedAt: null } }),
        prisma.steelPlanHeat.updateMany({ where: heatWhere(cutoff), data: { archivedAt: now } }),
        prisma.steelPlan.updateMany({ where: planWhere(cutoff), data: { archivedAt: now } }),
      ]);
      return NextResponse.json({
        success: true,
        archivedHeats: heats.count, archivedPlans: plans.count,
        ghostCleaned: gh.count + gp.count,   // 재고로 되살아났는데 숨겨져 있던 것을 되돌린 수
      });
    }

    if (action === "restore") {
      if (b?.all === true) {
        const [h, p] = await prisma.$transaction([
          prisma.steelPlanHeat.updateMany({ where: { archivedAt: { not: null } }, data: { archivedAt: null } }),
          prisma.steelPlan.updateMany({ where: { archivedAt: { not: null } }, data: { archivedAt: null } }),
        ]);
        return NextResponse.json({ success: true, restoredHeats: h.count, restoredPlans: p.count, restored: h.count + p.count });
      }
      const heatIds: string[] = Array.isArray(b?.heatIds) ? b.heatIds : [];
      const planIds: string[] = Array.isArray(b?.planIds) ? b.planIds : [];
      if (heatIds.length === 0 && planIds.length === 0) return NextResponse.json({ success: false, error: "복원할 항목이 없습니다." }, { status: 400 });
      // 아카이브된 행만 — 비아카이브 행에 쓸데없이 updatedAt 을 밀지 않는다
      const [h, p] = await prisma.$transaction([
        prisma.steelPlanHeat.updateMany({ where: { id: { in: heatIds }, archivedAt: { not: null } }, data: { archivedAt: null } }),
        prisma.steelPlan.updateMany({ where: { id: { in: planIds }, archivedAt: { not: null } }, data: { archivedAt: null } }),
      ]);
      return NextResponse.json({ success: true, restoredHeats: h.count, restoredPlans: p.count, restored: h.count + p.count });
    }

    return NextResponse.json({ success: false, error: "알 수 없는 action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

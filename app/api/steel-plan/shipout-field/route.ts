/**
 * 현장 출고관리 — 판번호로 "선별목록(이미 선별된 강재)" 매칭
 *
 * GET /api/steel-plan/shipout-field?heatNo=XXXX
 *   1) 판번호(heatNo) → WAITING SteelPlanHeat 찾아 규격(재질/두께/폭/길이) 확인
 *   2) 그 규격과 일치하는 선별목록(shipoutMarkedAt 마킹 + RECEIVED 원판) 후보 반환
 *
 *   matched=true  → { spec, candidates: [...] }
 *   matched=false → reason: "NOT_FOUND"(없는 판번호) | "ALREADY_USED"(절단/출고로 소진)
 *
 * PC 출고등록(shipout-match)은 '미선별' 강재를 찾지만, 현장 흐름은 '선별목록'에서 고른다.
 *
 * ── 호선(vesselCode)을 후보 조건에서 뺀 이유 ────────────────────────────────
 * 판번호는 철판 한 장의 고유번호이고, 호선은 "어느 호선 예산으로 입고됐나" 라는 꼬리표일 뿐
 * 실물을 구분하는 정보가 아니다. 야드에는 같은 규격의 1022·1023 철판이 섞여 쌓여 있고,
 * 사무실 선별목록도 호선이 섞인다(예: "Steellist-1022-H10P(태금1-1)" 41장에 1023 철판 포함).
 * 후보를 판번호의 호선으로 잠그면, 현장이 실물을 집어 찍었을 때 그 판번호의 호선과 선별된
 * 강재의 호선이 다르면 "일치하는 선별 강재가 없습니다" 로 막힌다 — 실측 실패율 32%.
 * 따라서 재질+치수로만 매칭하고 호선은 후보에 표시만 한다(현장이 실물과 대조해 선택).
 */
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { findHeatsByNo, heatExists } from "@/lib/heat-lookup";

const TOL = 0.001;
const calcWeight = (t: number, w: number, l: number) => parseFloat(((t * w * l * 7.85) / 1_000_000).toFixed(1));

export async function GET(req: NextRequest) {
  try {
    const heatNo = (new URL(req.url).searchParams.get("heatNo") ?? "").trim();
    if (!heatNo) return NextResponse.json({ success: false, error: "판번호를 입력하세요." }, { status: 400 });

    // 1) 판번호 → 미사용(WAITING) 판재 → 규격
    //    같은 판번호가 여러 호선/규격에 등록된 경우(수입재)를 대비해 전부 가져온다.
    //    입력창이 하이픈을 지워버려도 findHeatsByNo 가 정규화 폴백으로 찾아준다(SUS-4 ↔ SUS4).
    const heats = await findHeatsByNo(heatNo, "WAITING");
    if (heats.length === 0) {
      const exists = await heatExists(heatNo);
      return NextResponse.json({ success: true, matched: false, reason: exists ? "ALREADY_USED" : "NOT_FOUND", heatNo });
    }
    const heat = heats[0];   // 대표 (가장 오래된)

    // 규격 조합 — 호선은 제외. 같은 판번호가 서로 다른 규격에 걸쳐 있으면 전부 후보로 본다.
    const specKey = (h: typeof heats[number]) => `${h.material}|${h.thickness}|${h.width}|${h.length}`;
    const uniqueSpecs = Array.from(new Map(heats.map(h => [specKey(h), h])).values());

    // 2) 같은 규격의 선별목록(원판, shipoutMarkedAt 마킹 + RECEIVED) 후보 — 호선 무관
    const plans = await prisma.steelPlan.findMany({
      where: {
        OR: uniqueSpecs.map(s => ({
          material:  s.material,
          thickness: { gte: s.thickness - TOL, lte: s.thickness + TOL },
          width:     { gte: s.width - TOL,     lte: s.width + TOL },
          length:    { gte: s.length - TOL,    lte: s.length + TOL },
        })),
        status: "RECEIVED",
        shipoutMarkedAt: { not: null },
      },
      orderBy: [{ receivedAt: "asc" }, { createdAt: "asc" }],
      select: {
        id: true, vesselCode: true, material: true, thickness: true, width: true, length: true,
        storageLocation: true, shipoutHeatNo: true, shipoutLabel: true,
      },
    });

    // 판번호와 같은 호선의 강재를 먼저 — 현장이 대개 그걸 집기 때문. 나머지는 뒤에 표시.
    const sorted = [
      ...plans.filter(p => p.vesselCode === heat.vesselCode),
      ...plans.filter(p => p.vesselCode !== heat.vesselCode),
    ];

    return NextResponse.json({
      success: true,
      matched: true,
      // DB 에 등록된 원래 표기를 돌려준다 — 사용자가 하이픈을 빼고 쳐도(SUS4) 출고장·거래명세표에는
      // 실물 라벨과 같은 표기(SUS-4)가 찍히도록.
      heatNo: heat.heatNo,
      heatId: heat.id,   // 이 판번호의 WAITING 판재 — 출고 시 정확히 이 heat 를 SHIPPED 로 전환
      spec: {
        vesselCode: heat.vesselCode, material: heat.material,
        thickness: heat.thickness, width: heat.width, length: heat.length,
      },
      candidates: sorted.map(p => ({
        ...p,
        weight: calcWeight(p.thickness, p.width, p.length),
        // 판번호의 호선과 다른 호선의 강재인가 (현장이 실물 대조 시 주의하도록 UI 에서 표시)
        otherVessel: p.vesselCode !== heat.vesselCode,
      })),
    });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "조회 실패" }, { status: 500 });
  }
}

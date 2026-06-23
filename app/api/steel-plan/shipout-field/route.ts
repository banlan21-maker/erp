/**
 * 현장 출고관리 — 판번호로 "선별목록(이미 선별된 강재)" 매칭
 *
 * GET /api/steel-plan/shipout-field?heatNo=XXXX
 *   1) 판번호(heatNo) → WAITING SteelPlanHeat 찾아 사양(호선/재질/사이즈) 확인
 *   2) 그 사양과 일치하는 선별목록(shipoutMarkedAt 마킹 + RECEIVED 원판) 후보 반환
 *
 *   matched=true  → { spec, candidates: [...] }
 *   matched=false → reason: "NOT_FOUND"(없는 판번호) | "ALREADY_USED"(절단/출고로 소진)
 *
 * PC 출고등록(shipout-match)은 '미선별' 강재를 찾지만, 현장 흐름은 '선별목록'에서 고른다.
 */
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const TOL = 0.001;
const calcWeight = (t: number, w: number, l: number) => parseFloat(((t * w * l * 7.85) / 1_000_000).toFixed(1));

export async function GET(req: NextRequest) {
  try {
    const heatNo = (new URL(req.url).searchParams.get("heatNo") ?? "").trim();
    if (!heatNo) return NextResponse.json({ success: false, error: "판번호를 입력하세요." }, { status: 400 });

    // 1) 판번호 → 미사용(WAITING) 판재 → 사양
    const heat = await prisma.steelPlanHeat.findFirst({ where: { heatNo, status: "WAITING" }, orderBy: { createdAt: "asc" } });
    if (!heat) {
      const exists = await prisma.steelPlanHeat.findFirst({ where: { heatNo }, select: { id: true } });
      return NextResponse.json({ success: true, matched: false, reason: exists ? "ALREADY_USED" : "NOT_FOUND", heatNo });
    }

    // 2) 같은 사양의 선별목록(원판, shipoutMarkedAt 마킹 + RECEIVED) 후보
    const plans = await prisma.steelPlan.findMany({
      where: {
        vesselCode: heat.vesselCode,
        material:   heat.material,
        thickness: { gte: heat.thickness - TOL, lte: heat.thickness + TOL },
        width:     { gte: heat.width - TOL,     lte: heat.width + TOL },
        length:    { gte: heat.length - TOL,    lte: heat.length + TOL },
        status: "RECEIVED",
        shipoutMarkedAt: { not: null },
      },
      orderBy: [{ receivedAt: "asc" }, { createdAt: "asc" }],
      select: {
        id: true, vesselCode: true, material: true, thickness: true, width: true, length: true,
        storageLocation: true, shipoutHeatNo: true, shipoutLabel: true,
      },
    });

    return NextResponse.json({
      success: true,
      matched: true,
      heatNo,
      heatId: heat.id,   // 이 판번호의 WAITING 판재 — 출고 시 정확히 이 heat 를 SHIPPED 로 전환
      spec: { vesselCode: heat.vesselCode, material: heat.material, thickness: heat.thickness, width: heat.width, length: heat.length },
      candidates: plans.map(p => ({ ...p, weight: calcWeight(p.thickness, p.width, p.length) })),
    });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "조회 실패" }, { status: 500 });
  }
}

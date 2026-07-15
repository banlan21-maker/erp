/**
 * 현장 직접 출고 — 사무실 선별지시서(shipoutMarkedAt) 없이도 판번호/사양으로
 * 즉시 담을 수 있는 조회 API.
 *
 * 기존 /api/steel-plan/shipout-field 와의 차이:
 *   - `shipoutMarkedAt: { not: null }` 필터가 없음 → 사무실 선별 여부 무관
 *   - 판번호가 시스템에 없으면 사양 선택으로 폴백 가능
 *
 * 두 가지 조회 모드 (URL 파라미터로 분기):
 *
 * (1) GET ?heatNo=XXXX
 *     판번호로 heat 찾기 → 사양 확인 → 같은 사양의 RECEIVED + reservedFor=null 자재 목록
 *     matched=true               → { spec, candidates }
 *     matched=false, NOT_FOUND   → 이 판번호 시스템에 없음. 프론트가 사양 선택 UI 로 전환
 *     matched=false, ALREADY_USED → 이미 절단/출고로 소진된 판번호
 *
 * (2) GET ?vesselCode=&material=&thickness=&width=&length=
 *     판번호가 시스템에 없거나 신규 판번호일 때 — 사양만으로 후보 조회
 *     candidates 반환
 *
 * 후보 조건 (공통):
 *   - status = RECEIVED
 *   - reservedFor = null (블록확정 = 절단용 예약 X)
 *   - 활성 shipment 중복은 서버 POST 가드에서 재확인
 */
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const TOL = 0.001;
const calcWeight = (t: number, w: number, l: number) =>
  parseFloat(((t * w * l * 7.85) / 1_000_000).toFixed(1));

async function findCandidatesBySpec(spec: {
  vesselCode: string; material: string; thickness: number; width: number; length: number;
}) {
  const plans = await prisma.steelPlan.findMany({
    where: {
      vesselCode: spec.vesselCode,
      material:   spec.material,
      thickness: { gte: spec.thickness - TOL, lte: spec.thickness + TOL },
      width:     { gte: spec.width - TOL,     lte: spec.width + TOL },
      length:    { gte: spec.length - TOL,    lte: spec.length + TOL },
      status:      "RECEIVED",
      reservedFor: null,
    },
    orderBy: [{ receivedAt: "asc" }, { createdAt: "asc" }],
    select: {
      id: true, vesselCode: true, material: true, thickness: true, width: true, length: true,
      storageLocation: true, receivedAt: true,
      shipoutHeatNo: true, shipoutLabel: true, shipoutMarkedAt: true,
    },
  });
  return plans.map((p) => ({
    ...p,
    receivedAt: p.receivedAt?.toISOString() ?? null,
    shipoutMarkedAt: p.shipoutMarkedAt?.toISOString() ?? null,
    weight: calcWeight(p.thickness, p.width, p.length),
  }));
}

export async function GET(req: NextRequest) {
  try {
    const sp = new URL(req.url).searchParams;
    const heatNo    = (sp.get("heatNo") ?? "").trim();
    const vesselCode = (sp.get("vesselCode") ?? "").trim();
    const material   = (sp.get("material") ?? "").trim();
    const t = parseFloat(sp.get("thickness") ?? "");
    const w = parseFloat(sp.get("width")     ?? "");
    const l = parseFloat(sp.get("length")    ?? "");

    // ── (1) 판번호 조회 모드 ──
    if (heatNo) {
      // I10: 같은 heatNo 가 여러 사양(수입재 케이스)에 WAITING 으로 존재할 수 있음.
      //      findFirst 로 첫 사양만 노출하면 사용자가 실물의 다른 사양을 못 찾음 →
      //      전체 조회해서 사양이 여럿이면 응답에 다중 사양 목록 포함 (UI 안내용).
      const heats = await prisma.steelPlanHeat.findMany({
        where: { heatNo, status: "WAITING" },
        orderBy: { createdAt: "asc" },
      });
      if (heats.length === 0) {
        const exists = await prisma.steelPlanHeat.findFirst({ where: { heatNo }, select: { id: true } });
        return NextResponse.json({
          success: true,
          matched: false,
          reason: exists ? "ALREADY_USED" : "NOT_FOUND",
          heatNo,
        });
      }
      // 사양별 그룹핑 (호선/재질/두께/폭/길이 조합 unique)
      const specKey = (h: typeof heats[number]) =>
        `${h.vesselCode}|${h.material}|${h.thickness}|${h.width}|${h.length}`;
      const uniqueSpecs = Array.from(new Map(heats.map(h => [specKey(h), h])).values());
      const heat = heats[0];  // 대표 (가장 오래된)
      const candidates = await findCandidatesBySpec({
        vesselCode: heat.vesselCode, material: heat.material,
        thickness: heat.thickness, width: heat.width, length: heat.length,
      });
      return NextResponse.json({
        success: true,
        matched: true,
        heatNo,
        heatId: heat.id,
        spec: {
          vesselCode: heat.vesselCode, material: heat.material,
          thickness: heat.thickness, width: heat.width, length: heat.length,
        },
        candidates,
        // I10: 사양이 여러 개면 UI 가 "다른 사양으로도 등록된 동일 판번호 N건" 안내
        multiSpecCount: uniqueSpecs.length,
        otherSpecs: uniqueSpecs.length > 1
          ? uniqueSpecs.slice(1).map(h => ({
              vesselCode: h.vesselCode, material: h.material,
              thickness: h.thickness, width: h.width, length: h.length,
            }))
          : [],
      });
    }

    // ── (2) 사양 조회 모드 (판번호가 시스템에 없거나 신규일 때) ──
    if (vesselCode && material && Number.isFinite(t) && Number.isFinite(w) && Number.isFinite(l)) {
      const candidates = await findCandidatesBySpec({ vesselCode, material, thickness: t, width: w, length: l });
      return NextResponse.json({
        success: true,
        matched: true,
        spec: { vesselCode, material, thickness: t, width: w, length: l },
        candidates,
      });
    }

    return NextResponse.json(
      { success: false, error: "heatNo 또는 (vesselCode+material+thickness+width+length) 파라미터가 필요합니다." },
      { status: 400 },
    );
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "조회 실패" },
      { status: 500 },
    );
  }
}

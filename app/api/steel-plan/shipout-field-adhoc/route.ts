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
 *     판번호로 heat 찾기 → 규격 확인 → 같은 규격의 RECEIVED + reservedFor=null 자재 목록.
 *     ★ 호선(vesselCode)은 후보 조건에서 제외한다. 판번호는 철판 한 장의 고유번호이고
 *       호선은 "어느 호선 예산으로 입고됐나" 라는 꼬리표일 뿐 실물을 구분하지 않는다.
 *       야드에는 같은 규격의 1022·1023 철판이 섞여 쌓여 있으므로 호선으로 잠그면 현장이
 *       실물을 집어 찍었을 때 "재고 없음" 으로 막힌다. 판번호와 같은 호선을 목록 앞에 두고,
 *       다른 호선 강재는 otherVessel=true 로 표시해 현장이 실물과 대조하게 한다.
 *     matched=true               → { spec, candidates }
 *     matched=false, NOT_FOUND   → 이 판번호 시스템에 없음. 프론트가 사양 선택 UI 로 전환
 *     matched=false, ALREADY_USED → 이미 절단/출고로 소진된 판번호
 *
 * (2) GET ?vesselCode=&material=&thickness=&width=&length=
 *     판번호가 시스템에 없거나 신규 판번호일 때 — 사양만으로 후보 조회.
 *     이쪽은 사용자가 호선을 명시적으로 입력했으므로 그 호선으로 한정한다.
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

/**
 * 규격이 맞는 출고 가능 강재 후보.
 *
 * @param lockVessel true 면 spec.vesselCode 로 호선을 한정한다(사용자가 사양 폼에서 호선을
 *   직접 지정한 경우). 판번호 조회 모드에서는 false — 판번호는 철판 한 장의 고유번호이고
 *   호선은 "어느 호선 예산으로 입고됐나" 라는 꼬리표일 뿐 실물을 구분하지 않는다. 야드에는
 *   같은 규격의 1022·1023 철판이 섞여 쌓여 있으므로 호선으로 잠그면 현장이 실물을 집어
 *   찍었을 때 "재고 없음" 으로 막힌다.
 */
async function findCandidatesBySpec(
  spec: { vesselCode: string; material: string; thickness: number; width: number; length: number },
  lockVessel = true,
) {
  const plans = await prisma.steelPlan.findMany({
    where: {
      ...(lockVessel ? { vesselCode: spec.vesselCode } : {}),
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
  // 판번호와 같은 호선을 먼저 — 현장이 대개 그걸 집기 때문. 나머지는 뒤에.
  const sorted = lockVessel ? plans : [
    ...plans.filter(p => p.vesselCode === spec.vesselCode),
    ...plans.filter(p => p.vesselCode !== spec.vesselCode),
  ];
  return sorted.map((p) => ({
    ...p,
    receivedAt: p.receivedAt?.toISOString() ?? null,
    shipoutMarkedAt: p.shipoutMarkedAt?.toISOString() ?? null,
    weight: calcWeight(p.thickness, p.width, p.length),
    otherVessel: p.vesselCode !== spec.vesselCode,
  }));
}

/**
 * 후보 0건일 때 — 재질·치수는 같은데 "다른 호선"에 남아 있는 입고 자재를 찾아준다.
 *
 * 호선 간 강재 유용(1022 블록을 1023 강재로 절단)이 실무에서 흔한데, 작업일보에 타 호선
 * 판번호를 입력하면 강재 차감은 작업 호선에서 일어나 재고가 어긋난다. 그 결과 현장이 야드
 * 실물 라벨을 찍으면 "그 호선 재고 없음" 으로 막힌다. 실제 물건은 옆 호선 줄에 살아 있으므로
 * 어느 호선에 몇 장 남았는지 알려주고 원터치로 재검색하게 한다.
 */
async function findOtherVesselStock(spec: {
  vesselCode: string; material: string; thickness: number; width: number; length: number;
}) {
  const rows = await prisma.steelPlan.groupBy({
    by: ["vesselCode"],
    where: {
      vesselCode: { not: spec.vesselCode },
      material:   spec.material,
      thickness: { gte: spec.thickness - TOL, lte: spec.thickness + TOL },
      width:     { gte: spec.width - TOL,     lte: spec.width + TOL },
      length:    { gte: spec.length - TOL,    lte: spec.length + TOL },
      status:      "RECEIVED",
      reservedFor: null,
    },
    _count: { _all: true },
  });
  return rows
    .map((r) => ({ vesselCode: r.vesselCode, count: r._count._all }))
    .sort((a, b) => b.count - a.count);
}

// N10: 후보 0건일 때 원인 세분화 (사용자에게 정확한 다음 액션 제시)
async function countExcludedBySpec(
  spec: { vesselCode: string; material: string; thickness: number; width: number; length: number },
  lockVessel = true,
) {
  const specWhere = {
    ...(lockVessel ? { vesselCode: spec.vesselCode } : {}),
    material:   spec.material,
    thickness: { gte: spec.thickness - TOL, lte: spec.thickness + TOL },
    width:     { gte: spec.width - TOL,     lte: spec.width + TOL },
    length:    { gte: spec.length - TOL,    lte: spec.length + TOL },
  };
  const [reserved, notReceived] = await Promise.all([
    prisma.steelPlan.count({ where: { ...specWhere, status: "RECEIVED", reservedFor: { not: null } } }),
    prisma.steelPlan.count({ where: { ...specWhere, status: { not: "RECEIVED" } } }),
  ]);
  return { reservedCount: reserved, notReceivedCount: notReceived };
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
      const spec = {
        vesselCode: heat.vesselCode, material: heat.material,
        thickness: heat.thickness, width: heat.width, length: heat.length,
      };
      // 호선 잠금 없이 규격으로만 매칭 — 판번호는 철판 고유번호이지 호선 소속이 아니다.
      const candidates = await findCandidatesBySpec(spec, false);
      // N10: 후보 0건일 때 원인 카운트 (사용자에게 정확한 액션 안내)
      const excluded = candidates.length === 0
        ? await countExcludedBySpec(spec, false)
        : { reservedCount: 0, notReceivedCount: 0 };
      return NextResponse.json({
        success: true,
        matched: true,
        heatNo,
        heatId: heat.id,
        spec,
        candidates,
        // 호선 무관 매칭이라 "다른 호선 재고" 안내는 더 이상 필요 없다(후보에 이미 포함).
        otherVesselStock: [],
        // I10: 사양이 여러 개면 UI 가 "다른 사양으로도 등록된 동일 판번호 N건" 안내
        multiSpecCount: uniqueSpecs.length,
        otherSpecs: uniqueSpecs.length > 1
          ? uniqueSpecs.slice(1).map(h => ({
              vesselCode: h.vesselCode, material: h.material,
              thickness: h.thickness, width: h.width, length: h.length,
            }))
          : [],
        // N10: 후보 0건 시 세부 원인
        ...excluded,
      });
    }

    // ── (2) 사양 조회 모드 (판번호가 시스템에 없거나 신규일 때) ──
    if (vesselCode && material && Number.isFinite(t) && Number.isFinite(w) && Number.isFinite(l)) {
      const spec = { vesselCode, material, thickness: t, width: w, length: l };
      const candidates = await findCandidatesBySpec(spec);
      // N10: 후보 0건일 때 원인 세분화
      const excluded = candidates.length === 0 ? await countExcludedBySpec(spec) : { reservedCount: 0, notReceivedCount: 0 };
      const otherVesselStock = candidates.length === 0 ? await findOtherVesselStock(spec) : [];
      return NextResponse.json({
        success: true,
        matched: true,
        spec,
        candidates,
        otherVesselStock,
        ...excluded,
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

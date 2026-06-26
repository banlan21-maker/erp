/**
 * 강재매칭: 사양별 "선별 여부" 계산
 *
 * 선별된 강재 = shipoutMarkedAt 가 찍히고 shipoutLabel 이 해당 매칭이름(job.name)인 SteelPlan.
 * 강재매칭에서 선별지시서를 출력하면 선택 강재가 '{매칭이름} 선별'로 마킹된다.
 *
 * 핵심: 확정정보 필터(NONE)로 선별된 강재가 매칭 풀에서 빠지더라도, 선별 여부는
 *      여기서 라벨 기준으로 별도 산출하므로 항상 정확하다.
 */

export type MatchSpec = { vesselCode: string; material: string; thickness: number; width: number; length: number };
export type MarkedPlate = { vesselCode: string; material: string; thickness: number; width: number; length: number };

const fmtT = (v: number) => parseFloat(v.toFixed(1));
const fmtL = (v: number) => Math.round(v);

// 강재전체목록 매칭과 동일 규칙: 호선 빈칸이면 호선 제외, 나머지는 정확 일치
const specMatchesPlate = (s: MatchSpec, p: MarkedPlate) =>
  (!s.vesselCode || p.vesselCode === s.vesselCode) &&
  p.material.trim().toUpperCase() === s.material.trim().toUpperCase() &&
  fmtT(p.thickness) === fmtT(s.thickness) &&
  fmtL(p.width)     === fmtL(s.width) &&
  fmtL(p.length)    === fmtL(s.length);

// ── 강재 + 잔재(여유원재/등록잔재/현장잔재) 통합 커버리지 ─────────────────────────
// (강재전용 computeSelectionStates 는 computeCoverage 로 일원화되어 제거됨 — 매칭 규칙 단일 소스)
// 잔재 매칭은 호선 무관 + width1/length1 기준(아래 width/length 로 정규화해 전달).
export type MatchRemnant = { material: string; thickness: number; width: number; length: number };
export type SelSource = "plate" | "remnant";
export type Coverage = { state: "shipped" | "selected"; source: SelSource } | null;

// 잔재 매칭: 재질·두께·폭·길이만 (호선 무관)
const specMatchesRemnant = (s: MatchSpec, r: MatchRemnant) =>
  r.material.trim().toUpperCase() === s.material.trim().toUpperCase() &&
  fmtT(r.thickness) === fmtT(s.thickness) &&
  fmtL(r.width)  === fmtL(s.width) &&
  fmtL(r.length) === fmtL(s.length);

/**
 * 사양별 커버리지(출고/선별 + 출처: 강재/잔재) 계산.
 * 우선순위: 출고(강재→잔재) → 선별(강재→잔재). 선별은 강재 먼저 소비(빨강), 없으면 잔재(노랑).
 * 강재는 라벨(=매칭이름) 귀속분, 잔재는 호선·작업 무관 전역 풀(잔재 모델 자체가 전역).
 */
export function computeCoverage(
  specs: MatchSpec[],
  src: { shippedPlates: MarkedPlate[]; markedPlates: MarkedPlate[]; shippedRemnants: MatchRemnant[]; markedRemnants: MatchRemnant[] },
): Coverage[] {
  const cov: Coverage[] = new Array(specs.length).fill(null);
  const consumePlates = (plates: MarkedPlate[], state: "shipped" | "selected") => {
    for (const p of plates) {
      const idx = specs.findIndex((s, i) => cov[i] === null && specMatchesPlate(s, p));
      if (idx >= 0) cov[idx] = { state, source: "plate" };
    }
  };
  const consumeRemnants = (rems: MatchRemnant[], state: "shipped" | "selected") => {
    for (const r of rems) {
      const idx = specs.findIndex((s, i) => cov[i] === null && specMatchesRemnant(s, r));
      if (idx >= 0) cov[idx] = { state, source: "remnant" };
    }
  };
  consumePlates(src.shippedPlates, "shipped");
  consumeRemnants(src.shippedRemnants, "shipped");
  consumePlates(src.markedPlates, "selected");
  consumeRemnants(src.markedRemnants, "selected");
  return cov;
}

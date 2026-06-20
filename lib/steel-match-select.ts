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

/**
 * 각 사양이 '선별됨'인지 boolean[] 반환 (인덱스는 specs 와 동일 순서).
 *
 * 선별된 강재 1장이 사양 1행을 greedy 소비 — 같은 사양이 여러 행이면 선별 장수만큼만 채워진다.
 * (예: 동일 사양 3행 + 선별 2장 → 2행만 true, 1행 false)
 */
export function computeSelectedFlags(specs: MatchSpec[], markedPlates: MarkedPlate[]): boolean[] {
  const consumed: boolean[] = new Array(specs.length).fill(false);
  for (const p of markedPlates) {
    const idx = specs.findIndex((s, i) => !consumed[i] && specMatchesPlate(s, p));
    if (idx >= 0) consumed[idx] = true;
  }
  return consumed;
}

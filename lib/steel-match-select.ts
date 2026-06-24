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

export type SelectionState = "shipped" | "selected" | null;

/**
 * 사양별 상태(출고/선별/미선별) 계산. 인덱스는 specs 와 동일.
 *
 * 출고(SHIPPED_OUT) 강재를 먼저 greedy 소비(→"shipped"), 남은 사양에 선별(shipoutMarkedAt)
 * 강재를 소비(→"selected"). 둘 다 라벨=매칭이름으로 이 작업에 귀속된 것만.
 * → 선별 후 일부가 출고되어도 미선별로 되돌아가지 않고 '출고'로 인식된다.
 */
export function computeSelectionStates(
  specs: MatchSpec[], shippedPlates: MarkedPlate[], markedPlates: MarkedPlate[],
): SelectionState[] {
  const states: SelectionState[] = new Array(specs.length).fill(null);
  const consume = (plates: MarkedPlate[], state: "shipped" | "selected") => {
    for (const p of plates) {
      const idx = specs.findIndex((s, i) => states[i] === null && specMatchesPlate(s, p));
      if (idx >= 0) states[idx] = state;
    }
  };
  consume(shippedPlates, "shipped");
  consume(markedPlates, "selected");
  return states;
}

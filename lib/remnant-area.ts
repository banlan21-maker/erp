/**
 * 잔재 면적·중량 계산 — 단일 진실 함수
 *
 * ── L자형 기준식 (2026-07-31 확정) ────────────────────────────────────────
 *   면적 = (W1 × L1) − ((W1 − W2) × L2)
 *   중량 = 면적 × T × 7.85 / 1,000,000   (kg)
 *
 *   · W1 = 철판의 폭   (좁은 쪽 치수. 예: 1829×10000 이면 1829)
 *   · L1 = 철판의 길이 (긴 쪽 치수. 예: 1829×10000 이면 10000)
 *   · L2 = 잘려나간 구간의 길이
 *   · W2 = 그 구간의 폭 치수 — 이 식에서 실제로 빠지는 면적은 (W1 − W2) × L2 다.
 *          즉 L2 구간에서 폭이 W1 → W2 로 줄어드는 형상으로 계산된다.
 *
 *   기하 형상:
 *        ←──── W1 ────→
 *        ┌─────────────┐  ↑
 *        │             │  │  (L1 − L2) 구간: 폭 W1 그대로
 *        │             │  │
 *        ├──────┐      │  L1
 *        │      │ 잘림  │  │  L2 구간: 폭이 W2 로 줄어듦
 *        └──────┴──────┘  ↓
 *        ← W2 →
 *
 * ── 왜 공용 함수인가 ──────────────────────────────────────────────────────
 *   같은 식이 잔재등록·작업일보관리·절단보고서·돌발작업·강재매칭 5곳에 복붙돼 있었고
 *   강재매칭은 W2/L2 를 아예 무시(W1×L1)해 값이 서로 달랐다. 전부 이 함수를 쓴다.
 */

export const STEEL_DENSITY = 7.85 / 1_000_000; // kg/mm³ (일반강)

/** 잘못된 치수 판정 — L2 가 전체 길이보다 길거나, W2 가 전체 폭보다 크면 형상이 성립하지 않음 */
export function isInvalidLShape(
  w1: number | null | undefined, l1: number | null | undefined,
  w2: number | null | undefined, l2: number | null | undefined,
): boolean {
  if (!w1 || !l1) return false;            // 필수값 자체가 없으면 여기서 판정하지 않음
  if (w2 != null && w2 > w1) return true;  // 폭이 전체 폭 초과
  if (l2 != null && l2 > l1) return true;  // 잘린 길이가 전체 길이 초과
  return false;
}

/**
 * L자형 면적(mm²). W2/L2 중 하나라도 비어 있으면 잘린 부분이 없는 것으로 보고 W1×L1 반환.
 * (한쪽만 입력된 미완성 행에서 면적이 엉뚱하게 깎이는 것 방지)
 */
export function lShapeArea(
  w1: number, l1: number,
  w2: number | null | undefined, l2: number | null | undefined,
): number {
  if (!w2 || !l2) return w1 * l1;
  return w1 * l1 - (w1 - w2) * l2;
}

/** 사각형 면적(mm²) */
export const rectArea = (w: number, l: number) => w * l;

/**
 * 잔재 중량(kg, 소수 1자리). shape 에 따라 면적식을 고르고 두께·비중을 곱한다.
 * 계산 불가(필수값 없음/면적 0 이하)면 null.
 */
export function remnantWeight(
  shape: string,
  thickness: number,
  w1: number, l1: number,
  w2?: number | null, l2?: number | null,
  density: number = STEEL_DENSITY,
): number | null {
  if (!thickness || thickness <= 0 || !w1 || !l1) return null;
  const area = shape === "L_SHAPE" ? lShapeArea(w1, l1, w2, l2) : rectArea(w1, l1);
  if (area <= 0) return null;
  return Math.round(area * thickness * density * 10) / 10;
}

/**
 * 강재(도면행) 중량(kg, 소수 1자리) — 잔재 사용 도면이면 잔재 치수로, 아니면 원판 치수로.
 * 작업일보관리·절단보고서 등 표시용.
 */
export function steelWeightOf(
  thickness: number, w1: number, l1: number,
  w2?: number | null, l2?: number | null,
): number {
  const area = (w2 && l2) ? lShapeArea(w1, l1, w2, l2) : rectArea(w1, l1);
  return Math.round(area * thickness * STEEL_DENSITY * 10) / 10;
}

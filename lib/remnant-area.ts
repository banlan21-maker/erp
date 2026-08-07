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
 *   기하 형상 (폭 W = 좁은 쪽 가로, 길이 L = 긴 쪽 세로):
 *        ←─ W1 ─→
 *       ┌────────┐   ┬
 *       │        │   │
 *       │  철 판  │   │   L1   (L1 − L2) 구간은 폭 W1 그대로
 *       │        │   │
 *       ├─────┬──┤   │
 *       │     │▨▨│   │  ┬
 *       │     │▨▨│   │  │  L2  이 구간은 폭이 W2 로 줄어듦
 *       └─────┴──┘   ┴  ┴
 *       ←─W2─→←──→
 *              W1−W2  ← 실제로 빠지는 폭 (▨ = 잘려나간 부분)
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

/* ── 삼각형 ────────────────────────────────────────────────────────────────
 *  입력은 실측 '세 변'(a·b·c). c 를 비우면 직각삼각형으로 보고 a·b 를 두 직각변으로 계산.
 *  줄자만으로 잴 수 있고 직각 여부를 판단할 필요가 없다(직각삼각형도 헤론과 같은 값).
 */

/** 세 변으로 삼각형이 성립하는가 (양수 + 삼각부등식) */
export function isValidTriangle(a: number, b: number, c?: number | null): boolean {
  if (!a || !b || a <= 0 || b <= 0) return false;
  if (!c) return true;                       // 직각삼각형 모드 (두 직각변)
  if (c <= 0) return false;
  return a + b > c && b + c > a && c + a > b; // 삼각부등식
}

/** 삼각형 면적(mm²). c 있으면 헤론, 없으면 직각삼각형(a·b/2) */
export function triangleArea(a: number, b: number, c?: number | null): number {
  if (!c) return (a * b) / 2;
  const s = (a + b + c) / 2;
  const v = s * (s - a) * (s - b) * (s - c);
  return v > 0 ? Math.sqrt(v) : 0;
}

/**
 * 삼각형의 외접 사각형(폭·길이) — 다른 화면이 쓰는 width1/length1 에 저장할 값.
 *  · 직각삼각형(c 없음): 두 직각변이 곧 외접 사각형
 *  · 일반삼각형: 최장변을 길이로 두고, 그 변에 대한 높이(=2·면적/최장변)를 폭으로.
 *    최장변에 내린 수선의 발은 항상 그 변 안에 떨어지므로 이 사각형이 정확한 외접이다.
 */
export function triangleBoundingBox(a: number, b: number, c?: number | null): { width: number; length: number } {
  const r1 = (n: number) => Math.round(n * 10) / 10;
  if (!c) return { width: r1(Math.min(a, b)), length: r1(Math.max(a, b)) };
  const area = triangleArea(a, b, c);
  const base = Math.max(a, b, c);
  return { width: r1((2 * area) / base), length: r1(base) };
}

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
 * 삼각형 잔재 중량(kg, 소수 1자리) — 실측 세 변으로 계산.
 * c 를 비우면 직각삼각형(a·b 가 두 직각변).
 */
export function triangleWeight(
  thickness: number, a: number, b: number, c?: number | null,
  density: number = STEEL_DENSITY,
): number | null {
  if (!thickness || thickness <= 0 || !isValidTriangle(a, b, c)) return null;
  const area = triangleArea(a, b, c);
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

/**
 * Server-side cascading filters — Prisma WHERE 절 동적 빌드
 *
 * 클라이언트가 distinct API 호출 시 현재 colFilters 를 쿼리스트링으로 전달.
 * 서버는 각 컬럼별 distinct 조회 시 "자기 컬럼 제외" 다른 필터들만 WHERE 적용.
 *
 * 예: thickness distinct 조회 시 → vesselCode/material 필터만 적용, thickness 자체는 제외.
 *
 * 사용처: /api/steel-plan/distinct, /api/steel-plan/heat/distinct, /api/remnants/distinct
 */

/** "a,b,c" 형식 쿼리 파라미터를 string[] 로 파싱 */
export function parseList(v: string | null): string[] {
  if (!v) return [];
  return v.split(",").map(s => s.trim()).filter(Boolean);
}

/**
 * 컬럼 key → Prisma where 조각 빌더 매핑을 받아,
 * excludeKey 를 제외한 나머지 필터들을 AND 결합한 where 객체 반환.
 *
 * @example
 *   const builders = {
 *     vesselCode: vs => ({ vesselCode: { in: vs } }),
 *     material:   vs => ({ material:   { in: vs } }),
 *   };
 *   buildCascadingWhere(builders, { vesselCode: ["RS01"], material: ["AH36"] }, "material")
 *   // → { vesselCode: { in: ["RS01"] } }
 */
export function buildCascadingWhere(
  builders: Record<string, (values: string[]) => Record<string, unknown>>,
  filters: Record<string, string[]>,
  excludeKey?: string,
): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  for (const key of Object.keys(builders)) {
    if (key === excludeKey) continue;
    const values = filters[key];
    if (!values || values.length === 0) continue;
    Object.assign(where, builders[key](values));
  }
  return where;
}

/** NULL 토큰 ("__NULL__") 포함 nullable 컬럼 빌더 헬퍼 */
export function nullableInBuilder(field: string) {
  return (vs: string[]): Record<string, unknown> => {
    const hasNull = vs.includes("__NULL__");
    const rest = vs.filter(x => x !== "__NULL__");
    if (hasNull && rest.length === 0) return { [field]: null };
    if (hasNull) return { OR: [{ [field]: null }, { [field]: { in: rest } }] };
    return { [field]: { in: rest } };
  };
}

/** 날짜 컬럼 (YYYY-MM-DD 매칭) 빌더 헬퍼 */
export function dateRangeBuilder(field: string) {
  return (vs: string[]): Record<string, unknown> => {
    const hasNull = vs.includes("__NULL__");
    const dates = vs.filter(x => x !== "__NULL__");
    const dateOr = dates.map(d => {
      const start = new Date(`${d}T00:00:00.000Z`);
      const end   = new Date(`${d}T23:59:59.999Z`);
      return { [field]: { gte: start, lte: end } };
    });
    if (hasNull && dates.length === 0) return { [field]: null };
    if (hasNull) return { OR: [{ [field]: null }, ...dateOr] };
    if (dates.length === 1) return dateOr[0];
    return { OR: dateOr };
  };
}

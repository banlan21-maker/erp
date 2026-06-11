/**
 * Cascading column filters (누적/연쇄 컬럼 필터)
 *
 * Excel 의 다중 컬럼 필터 동작 — 컬럼 A 에 필터 걸린 상태에서
 * 컬럼 B 의 드롭다운 옵션은 "A 필터 적용 후의 데이터" 에서 unique 값으로 표시.
 *
 * 사용처: ColumnFilterDropdown 이 들어가는 모든 리스트 컴포넌트.
 *
 * 표준 패턴:
 *   const accessors = useMemo<ColumnAccessorMap<Row>>(() => ({
 *     컬럼key: (r) => r.field, ...
 *   }), []);
 *   const distinctValues = useMemo(
 *     () => getAllCascadedOptions(rawRows, colFilters, accessors),
 *     [rawRows, colFilters, accessors],
 *   );
 *   const filteredRows = useMemo(
 *     () => getCascadedFilteredRows(rawRows, colFilters, accessors),
 *     [rawRows, colFilters, accessors],
 *   );
 */

import type { FilterValue } from "@/components/column-filter-dropdown";

export const EMPTY_TOKEN = "__EMPTY__";
export const EMPTY_LABEL = "(값 없음)";

export type ColAccessor<T>     = (row: T) => string | number | null | undefined;
export type ColumnAccessorMap<T> = Record<string, ColAccessor<T>>;
export type ColFilters         = Record<string, string[]>;

// ── 텍스트 조건 필터 (엑셀스타일 통합 드롭다운) ───────────────────────────
export type TextOp =
  | "contains"   // ~ 포함
  | "startsWith" // ~ 로 시작
  | "endsWith"   // ~ 로 끝남
  | "equals"     // ~ 와 같음
  | "notEquals"  // ~ 와 같지 않음
  | "empty"      // 비어있음
  | "notEmpty";  // 비어있지 않음

export interface TextPredicate { op: TextOp; val: string }

/** 한 값이 텍스트 조건을 통과하는가 (대소문자 무시) */
export function applyTextPredicate(value: string, p: TextPredicate): boolean {
  const v = (value ?? "").toString().toLowerCase();
  const q = (p.val ?? "").toLowerCase();
  switch (p.op) {
    case "empty":      return v === "";
    case "notEmpty":   return v !== "";
    case "contains":   return q === "" || v.includes(q);
    case "startsWith": return q === "" || v.startsWith(q);
    case "endsWith":   return q === "" || v.endsWith(q);
    case "equals":     return v === q;
    case "notEquals":  return v !== q;
    default:           return true;
  }
}

/** ColFilters + Text predicate 둘 다 적용한 행 필터링 */
export function getCascadedFilteredRowsWithPredicates<T>(
  rows: T[],
  filters: ColFilters,
  predicates: Record<string, TextPredicate | undefined>,
  accessors: ColumnAccessorMap<T>,
  excludeKey?: string,
): T[] {
  const baseFiltered = getCascadedFilteredRows(rows, filters, accessors, excludeKey);
  const activeKeys = Object.entries(predicates)
    .filter(([k, p]) => k !== excludeKey && p && (
      p.op === "empty" || p.op === "notEmpty" || (p.val ?? "").length > 0
    ))
    .map(([k, p]) => [k, p as TextPredicate] as const);
  if (activeKeys.length === 0) return baseFiltered;
  return baseFiltered.filter(r =>
    activeKeys.every(([k, p]) => {
      const acc = accessors[k];
      if (!acc) return true;
      const raw = acc(r);
      return applyTextPredicate(raw == null ? "" : String(raw), p);
    })
  );
}

/** 단일 행이 단일 컬럼 필터를 통과하는가 */
function passesColumn<T>(row: T, _key: string, values: string[], accessor: ColAccessor<T>): boolean {
  if (!values || values.length === 0) return true;
  const raw = accessor(row);
  const v = raw == null ? "" : String(raw);
  if (v === "") return values.includes(EMPTY_TOKEN);
  return values.includes(v);
}

/**
 * 모든 필터 적용 (혹은 excludeKey 제외 전부).
 *  - excludeKey 미지정: 전체 필터 적용 → 표 본문 데이터
 *  - excludeKey 지정:   그 컬럼만 빼고 적용 → 해당 컬럼 드롭다운 옵션 계산용
 */
export function getCascadedFilteredRows<T>(
  rows: T[],
  filters: ColFilters,
  accessors: ColumnAccessorMap<T>,
  excludeKey?: string,
): T[] {
  const activeKeys = Object.keys(filters).filter(
    k => k !== excludeKey && filters[k] && filters[k].length > 0,
  );
  if (activeKeys.length === 0) return rows;
  return rows.filter(r =>
    activeKeys.every(k => {
      const acc = accessors[k];
      if (!acc) return true;
      return passesColumn(r, k, filters[k], acc);
    }),
  );
}

/**
 * 특정 컬럼의 드롭다운 옵션 (FilterValue[]) 계산.
 * 자기 자신 필터는 무시하고 다른 모든 필터 적용 후 unique.
 */
export function getCascadedOptions<T>(
  rows: T[],
  filters: ColFilters,
  columnKey: string,
  accessors: ColumnAccessorMap<T>,
): FilterValue[] {
  const base = getCascadedFilteredRows(rows, filters, accessors, columnKey);
  const acc = accessors[columnKey];
  if (!acc) return [];
  const set = new Set<string>();
  let hasEmpty = false;
  for (const r of base) {
    const raw = acc(r);
    const v = raw == null ? "" : String(raw);
    if (v === "") hasEmpty = true;
    else set.add(v);
  }
  const arr: FilterValue[] = Array.from(set)
    .sort((a, b) => a.localeCompare(b, "ko", { numeric: true }))
    .map(v => ({ value: v, label: v }));
  if (hasEmpty) arr.push({ value: EMPTY_TOKEN, label: EMPTY_LABEL });
  return arr;
}

/** 전체 컬럼 옵션 일괄 계산 (useMemo 1회용) */
export function getAllCascadedOptions<T>(
  rows: T[],
  filters: ColFilters,
  accessors: ColumnAccessorMap<T>,
): Record<string, FilterValue[]> {
  const out: Record<string, FilterValue[]> = {};
  for (const key of Object.keys(accessors)) {
    out[key] = getCascadedOptions(rows, filters, key, accessors);
  }
  return out;
}

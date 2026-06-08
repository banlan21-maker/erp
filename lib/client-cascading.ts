/**
 * Client-side cascading filter — colFilters 변경 시 distinct API 자동 재호출 훅.
 *
 * 사용법:
 *   const distinct = useCascadingDistinct(
 *     "/api/steel-plan/distinct",
 *     colFilters,
 *     STEEL_PLAN_QS_KEY,
 *   );
 *   // distinct.vesselCode, distinct.material, ... 사용
 *
 * - debounce 200ms: 사용자가 다중 선택 토글 시 마지막 1회만 fetch
 * - AbortController: 직전 요청 중단으로 응답 race 방지
 * - 첫 호출 시 즉시 (debounce 안 함)
 */

import { useEffect, useRef, useState } from "react";

/** colFilters 객체 → URLSearchParams 문자열 직렬화 */
export function serializeColFilters(
  filters: Record<string, string[]>,
  keyMap: Record<string, string>,
): string {
  const sp = new URLSearchParams();
  for (const [k, vs] of Object.entries(filters)) {
    if (!vs || vs.length === 0) continue;
    sp.set(keyMap[k] ?? k, vs.join(","));
  }
  return sp.toString();
}

/**
 * colFilters 변경 시 distinct API 를 debounce 호출.
 * @param endpoint   distinct API 경로 (예: "/api/steel-plan/distinct")
 * @param filters    현재 colFilters 상태
 * @param keyMap     컬럼 key → 쿼리스트링 param 이름 매핑
 * @param debounceMs 디바운스 (기본 200ms, 첫 호출은 즉시)
 */
export function useCascadingDistinct<T extends Record<string, unknown[]>>(
  endpoint: string,
  filters: Record<string, string[]>,
  keyMap: Record<string, string>,
  debounceMs = 200,
): T {
  const [data, setData] = useState<T>({} as T);
  const timer       = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abort       = useRef<AbortController | null>(null);
  const firstCall   = useRef(true);
  const filtersStr  = JSON.stringify(filters);

  useEffect(() => {
    const run = async () => {
      abort.current?.abort();
      const ac = new AbortController();
      abort.current = ac;
      const qs = serializeColFilters(filters, keyMap);
      try {
        const res = await fetch(`${endpoint}${qs ? `?${qs}` : ""}`, { signal: ac.signal });
        if (!res.ok) return;
        const json = await res.json();
        setData(json);
      } catch { /* abort 무시 */ }
    };

    if (firstCall.current) {
      firstCall.current = false;
      run();
      return;
    }

    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(run, debounceMs);
    return () => { if (timer.current) clearTimeout(timer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint, filtersStr, debounceMs]);

  return data;
}

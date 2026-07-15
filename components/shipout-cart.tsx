"use client";

/**
 * 출고 카트 — 페이지 넘어가도 유지되는 임시 영역
 * - SteelPlan(원철판) 들을 누적 선택
 * - 강재전체목록 페이지 마운트하는 동안만 유지 (sessionStorage 백업)
 * - 출고장 만들기 모달이 카트 컨텐츠를 받아 처리
 */

import { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";

export interface ShipoutCartItem {
  // steelPlanId 는 카트의 "고유 키" 로 쓰인다(has/remove/중복제거). cuid 라 테이블이 달라도 충돌 없음.
  //  - 원판(plate): SteelPlan.id
  //  - 잔재(remnant): Remnant.id (remnantId 와 동일)
  steelPlanId:      string;
  kind?:            "plate" | "remnant";  // 없으면 plate (하위 호환)
  remnantId?:       string;               // kind==="remnant" 일 때만
  vesselCode:       string;
  material:         string;
  thickness:        number;
  width:            number;
  length:           number;
  weight:           number;  // kg
  // 엑셀 업로드로 들어온 경우 사용자가 미리 적은 판번호
  prefilledHeatNo?: string;
  // 현장 출고: 판번호 조회로 확정된 SteelPlanHeat.id (정확히 그 heat 를 SHIPPED 전환)
  steelPlanHeatId?: string;
  // 잔재 표시용 (선택) — UI 라벨에만 사용
  remnantNo?:       string;
  // 현장직접출고 탭에서 담긴 자재 (사무실 선별 없이 즉시 담음) — 감사 태그
  adHocFromField?:  boolean;
  // I1: 현장직접출고로 담을 때 원 자재의 사무실 선별 라벨 스냅샷.
  // 출고 확정 시 ShipmentItem.originShipoutLabel 로 저장되어 사후 추적 가능.
  originShipoutLabel?: string | null;
}

// 카트 변경 시마다 값이 바뀌는 "상태"와, 참조가 고정된 "동작"을 분리한다.
// 담기(add)만 쓰는 대형 컴포넌트(강재전체목록 테이블 등)는 Actions 만 구독해
// 카트가 바뀌어도 리렌더되지 않게 → 담을수록 심해지던 버벅임 제거.
interface CartActions {
  add:    (items: ShipoutCartItem[]) => { added: number; duplicates: number };
  remove: (steelPlanId: string) => void;
  clear:  () => void;
}
interface CartState {
  items:       ShipoutCartItem[];
  totalWeight: number;
  has:         (steelPlanId: string) => boolean;
}
type CartContextValue = CartActions & CartState;

const DEFAULT_STORAGE_KEY = "shipout-cart-v1";

const CartActionsCtx = createContext<CartActions | null>(null);
const CartStateCtx   = createContext<CartState | null>(null);

// storageKey 로 흐름별 카트 분리 (PC=기본, 현장=별도) — 같은 탭에서 상호 오염 방지
export function ShipoutCartProvider({ children, storageKey = DEFAULT_STORAGE_KEY }: { children: React.ReactNode; storageKey?: string }) {
  const [items, setItems] = useState<ShipoutCartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // 마운트 시 sessionStorage 복원
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setItems(parsed);
      }
    } catch { /* 무시 */ }
    setHydrated(true);
  }, [storageKey]);

  // 변경 시 sessionStorage 동기화 (hydrated 이후)
  useEffect(() => {
    if (!hydrated) return;
    try { sessionStorage.setItem(storageKey, JSON.stringify(items)); } catch { /* 무시 */ }
  }, [items, hydrated, storageKey]);

  const add: CartContextValue["add"] = useCallback((newItems) => {
    let added = 0, duplicates = 0;
    setItems(prev => {
      const seen = new Set(prev.map(x => x.steelPlanId));
      const merged = [...prev];
      for (const it of newItems) {
        if (seen.has(it.steelPlanId)) { duplicates++; continue; }
        merged.push(it);
        seen.add(it.steelPlanId);
        added++;
      }
      return merged;
    });
    return { added, duplicates };
  }, []);

  const remove = useCallback((steelPlanId: string) => {
    setItems(prev => prev.filter(x => x.steelPlanId !== steelPlanId));
  }, []);

  // 카트 비우기 — setItems 의 비동기 갱신과 useEffect sync 사이에
  // router.push 가 끼면 sessionStorage 가 안 비워질 수 있으므로 직접도 제거
  const clear = useCallback(() => {
    setItems([]);
    try { sessionStorage.removeItem(storageKey); } catch { /* 무시 */ }
  }, [storageKey]);

  const totalWeight = useMemo(
    () => items.reduce((s, x) => s + (x.weight || 0), 0),
    [items],
  );

  const has = useCallback(
    (steelPlanId: string) => items.some(x => x.steelPlanId === steelPlanId),
    [items],
  );

  // add/remove/clear 는 useCallback 으로 고정 → actions 참조는 절대 안 바뀜.
  const actions = useMemo<CartActions>(() => ({ add, remove, clear }), [add, remove, clear]);
  // items 가 바뀔 때만 state 참조 변경 → state 구독자만 리렌더.
  const state = useMemo<CartState>(() => ({ items, totalWeight, has }), [items, totalWeight, has]);
  return (
    <CartActionsCtx.Provider value={actions}>
      <CartStateCtx.Provider value={state}>{children}</CartStateCtx.Provider>
    </CartActionsCtx.Provider>
  );
}

// 상태 + 동작 모두 필요할 때 (담은 목록 표시, 카운트, has 등)
export function useShipoutCart(): CartContextValue {
  const a = useContext(CartActionsCtx);
  const s = useContext(CartStateCtx);
  const merged = useMemo(() => (a && s ? { ...s, ...a } : null), [a, s]);
  if (!merged) throw new Error("useShipoutCart must be used within ShipoutCartProvider");
  return merged;
}

// 담기/삭제 등 "동작"만 필요할 때 — 카트가 바뀌어도 리렌더되지 않는다(참조 고정).
export function useShipoutCartActions(): CartActions {
  const a = useContext(CartActionsCtx);
  if (!a) throw new Error("useShipoutCartActions must be used within ShipoutCartProvider");
  return a;
}

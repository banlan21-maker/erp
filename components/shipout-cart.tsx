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
  // 잔재 표시용 (선택) — UI 라벨에만 사용
  remnantNo?:       string;
}

interface CartContextValue {
  items:       ShipoutCartItem[];
  add:         (items: ShipoutCartItem[]) => { added: number; duplicates: number };
  remove:      (steelPlanId: string) => void;
  clear:       () => void;
  totalWeight: number;
  has:         (steelPlanId: string) => boolean;
}

const STORAGE_KEY = "shipout-cart-v1";

const CartCtx = createContext<CartContextValue | null>(null);

export function ShipoutCartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ShipoutCartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // 마운트 시 sessionStorage 복원
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setItems(parsed);
      }
    } catch { /* 무시 */ }
    setHydrated(true);
  }, []);

  // 변경 시 sessionStorage 동기화 (hydrated 이후)
  useEffect(() => {
    if (!hydrated) return;
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(items)); } catch { /* 무시 */ }
  }, [items, hydrated]);

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
    try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* 무시 */ }
  }, []);

  const totalWeight = useMemo(
    () => items.reduce((s, x) => s + (x.weight || 0), 0),
    [items],
  );

  const has = useCallback(
    (steelPlanId: string) => items.some(x => x.steelPlanId === steelPlanId),
    [items],
  );

  const value: CartContextValue = { items, add, remove, clear, totalWeight, has };
  return <CartCtx.Provider value={value}>{children}</CartCtx.Provider>;
}

export function useShipoutCart(): CartContextValue {
  const v = useContext(CartCtx);
  if (!v) throw new Error("useShipoutCart must be used within ShipoutCartProvider");
  return v;
}

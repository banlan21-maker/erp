"use client";

/**
 * 출고 카트 — 페이지 넘어가도 유지되는 임시 영역
 * - SteelPlan(원철판) 들을 누적 선택
 * - 강재전체목록 페이지 마운트하는 동안만 유지 (sessionStorage 백업)
 * - 출고장 만들기 모달이 카트 컨텐츠를 받아 처리
 */

import { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";

export interface ShipoutCartItem {
  steelPlanId:      string;
  vesselCode:       string;
  material:         string;
  thickness:        number;
  width:            number;
  length:           number;
  weight:           number;  // kg
  // 엑셀 업로드로 들어온 경우 사용자가 미리 적은 판번호
  prefilledHeatNo?: string;
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

  const clear = useCallback(() => setItems([]), []);

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

"use client";

/**
 * 운송장비 등록 후 소모품 교체주기 관리 모달
 * — 일반차량(VEHICLE) 만 사용. PATCH /api/transport-vehicle/[id] 로 부분 업데이트.
 * PATCH 는 specs/consumables/inspections 모두 받아 처리하므로,
 *   GET 으로 전체 상태를 받아온 뒤 consumables 만 사용자가 편집하고
 *   다시 PATCH 에 전체를 그대로 전송 → 다른 데이터 손실 방지.
 */

import { useEffect, useState } from "react";
import { Wrench, X, Plus, Trash2, Save } from "lucide-react";
import type { TransportVehicle, ConsumableItem, ConsumableBasis } from "./transport-main";

interface Props {
  vehicle: TransportVehicle;
  onClose: () => void;
  onSaved: (updated: TransportVehicle) => void;
}

const BASIS_LABEL: Record<ConsumableBasis, string> = {
  MILEAGE: "주행거리",
  PERIOD:  "기간",
  BOTH:    "둘 다",
};

const emptyConsumable = (): ConsumableItem => ({
  itemName:           "",
  basis:              "BOTH",
  intervalKm:         "",
  intervalMonth:      "",
  lastReplacedAt:     "",
  lastReplacedMileage:"",
});

const todayYMD = (iso?: string | null) =>
  iso ? new Date(iso).toISOString().split("T")[0] : "";

export default function TransportConsumableModal({ vehicle, onClose, onSaved }: Props) {
  const [loading, setLoading]       = useState(true);
  const [saving,  setSaving]        = useState(false);
  const [error,   setError]         = useState("");
  // GET 응답 전체 보관 (저장 시 함께 PATCH 로 보내기 위함)
  const [full,    setFull]          = useState<TransportVehicle | null>(null);
  const [items,   setItems]         = useState<ConsumableItem[]>([]);

  // 삭제 확인
  const [pendingDelete, setPendingDelete] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true); setError("");
      try {
        const res = await fetch(`/api/transport-vehicle/${vehicle.id}`);
        const data = await res.json();
        if (cancelled) return;
        if (!data.success) { setError(data.error || "조회 실패"); return; }
        const v = data.data as TransportVehicle;
        setFull(v);
        setItems((v.consumables ?? []).map(c => ({
          ...c,
          intervalKm:          c.intervalKm          ?? "",
          intervalMonth:       c.intervalMonth       ?? "",
          lastReplacedMileage: c.lastReplacedMileage ?? "",
          lastReplacedAt:      todayYMD(c.lastReplacedAt),
        })));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [vehicle.id]);

  const updateItem = (idx: number, patch: Partial<ConsumableItem>) =>
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, ...patch } : it));

  const addItem    = () => setItems(prev => [...prev, emptyConsumable()]);
  const removeItem = (idx: number) => {
    setItems(prev => prev.filter((_, i) => i !== idx));
    setPendingDelete(null);
  };

  const handleSave = async () => {
    if (!full) return;
    // 빈 itemName 행 제외 (서버에서도 필터링 하지만 명확하게)
    const validItems = items.filter(c => c.itemName.trim());
    setSaving(true); setError("");
    try {
      const res = await fetch(`/api/transport-vehicle/${vehicle.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vehicleType:     full.vehicleType,
          name:            full.name,
          plateNo:         full.plateNo,
          maker:           full.maker,
          modelName:       full.modelName,
          madeYear:        full.madeYear,
          acquiredAt:      full.acquiredAt,
          acquiredCost:    full.acquiredCost,
          factory:         full.factory,
          factoryLocation: full.factoryLocation,
          manager:         full.manager,
          usage:           full.usage,
          memo:            full.memo,
          fuelType:        full.fuelType,
          displacement:    full.displacement,
          mileage:         full.mileage,
          insuranceExpiry: full.insuranceExpiry,
          inspExpiry:      full.inspExpiry,
          equipSubType:    full.equipSubType,
          maxLoad:         full.maxLoad,
          powerType:       full.powerType,
          mastHeight:      full.mastHeight,
          // 다른 관계는 그대로 유지
          specs:        full.specs        ?? [],
          inspections:  full.inspections  ?? [],
          // 소모품만 사용자 편집값으로 교체
          consumables:  validItems,
        }),
      });
      const data = await res.json();
      if (!data.success) { setError(data.error || "저장 실패"); return; }
      onSaved(data.data);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center p-4 overflow-y-auto backdrop-blur-sm"
      onClick={() => !saving && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl my-6" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white rounded-t-2xl z-10">
          <h3 className="font-bold text-lg text-gray-800 flex items-center gap-2">
            <Wrench size={18} className="text-amber-600" />
            소모품 교체주기 관리
            <span className="ml-2 text-sm font-normal text-gray-500">
              {vehicle.name}{vehicle.plateNo ? ` · ${vehicle.plateNo}` : ""}
            </span>
          </h3>
          <button onClick={onClose} disabled={saving} className="p-1 hover:bg-gray-100 rounded-full disabled:opacity-50">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {error && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">{error}</div>}

          {loading ? (
            <div className="py-12 text-center text-gray-400 text-sm">불러오는 중…</div>
          ) : (
            <>
              <div className="overflow-x-auto border border-gray-200 rounded-lg">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr className="text-xs text-gray-600">
                      <th className="px-3 py-2 text-left font-semibold">소모품명</th>
                      <th className="px-3 py-2 text-left font-semibold">기준</th>
                      <th className="px-3 py-2 text-right font-semibold">주기(km)</th>
                      <th className="px-3 py-2 text-right font-semibold">주기(개월)</th>
                      <th className="px-3 py-2 text-left font-semibold">최근 교체일</th>
                      <th className="px-3 py-2 text-right font-semibold">교체 시 주행거리</th>
                      <th className="px-3 py-2 text-center font-semibold w-12"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {items.length === 0 ? (
                      <tr><td colSpan={7} className="px-3 py-8 text-center text-gray-400 text-sm">등록된 소모품이 없습니다. 아래 + 소모품 추가 로 시작하세요.</td></tr>
                    ) : items.map((c, i) => (
                      <tr key={c.id ?? `new-${i}`} className="hover:bg-gray-50/60">
                        <td className="px-3 py-2">
                          <input value={c.itemName} onChange={e => updateItem(i, { itemName: e.target.value })}
                            placeholder="예: 엔진오일"
                            className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-amber-500" />
                        </td>
                        <td className="px-3 py-2">
                          <select value={c.basis} onChange={e => updateItem(i, { basis: e.target.value as ConsumableBasis })}
                            className="px-2 py-1.5 text-sm border border-gray-200 rounded bg-white focus:outline-none focus:ring-2 focus:ring-amber-500">
                            {(["MILEAGE","PERIOD","BOTH"] as ConsumableBasis[]).map(b =>
                              <option key={b} value={b}>{BASIS_LABEL[b]}</option>
                            )}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <input type="number" value={c.intervalKm ?? ""} onChange={e => updateItem(i, { intervalKm: e.target.value })}
                            disabled={c.basis === "PERIOD"}
                            placeholder="5000"
                            className="w-24 px-2 py-1.5 text-sm border border-gray-200 rounded text-right focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:bg-gray-100 disabled:text-gray-400" />
                        </td>
                        <td className="px-3 py-2">
                          <input type="number" value={c.intervalMonth ?? ""} onChange={e => updateItem(i, { intervalMonth: e.target.value })}
                            disabled={c.basis === "MILEAGE"}
                            placeholder="6"
                            className="w-20 px-2 py-1.5 text-sm border border-gray-200 rounded text-right focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:bg-gray-100 disabled:text-gray-400" />
                        </td>
                        <td className="px-3 py-2">
                          <input type="date" value={c.lastReplacedAt} onChange={e => updateItem(i, { lastReplacedAt: e.target.value })}
                            className="px-2 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-amber-500" />
                        </td>
                        <td className="px-3 py-2">
                          <input type="number" value={c.lastReplacedMileage ?? ""} onChange={e => updateItem(i, { lastReplacedMileage: e.target.value })}
                            placeholder="km"
                            className="w-28 px-2 py-1.5 text-sm border border-gray-200 rounded text-right focus:outline-none focus:ring-2 focus:ring-amber-500" />
                        </td>
                        <td className="px-3 py-2 text-center">
                          {pendingDelete === i ? (
                            <div className="inline-flex gap-1">
                              <button onClick={() => removeItem(i)} className="p-1 text-red-600 hover:bg-red-50 rounded" title="삭제 확정"><Trash2 size={13} /></button>
                              <button onClick={() => setPendingDelete(null)} className="p-1 text-gray-500 hover:bg-gray-100 rounded" title="취소"><X size={13} /></button>
                            </div>
                          ) : (
                            <button onClick={() => setPendingDelete(i)} className="p-1 text-gray-400 hover:text-red-600 rounded" title="삭제">
                              <Trash2 size={13} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <button
                onClick={addItem}
                className="inline-flex items-center gap-1 px-3 py-2 text-sm font-semibold text-amber-700 border border-dashed border-amber-400 rounded-lg hover:bg-amber-50"
              >
                <Plus size={14} /> 소모품 추가
              </button>

              <p className="text-[11px] text-gray-500 leading-relaxed">
                · 이력이 있는 소모품을 삭제하면 해당 교체 이력도 함께 삭제됩니다.<br />
                · 저장 시 모든 변경(추가·수정·삭제)이 한 번에 반영됩니다.
              </p>
            </>
          )}
        </div>

        <div className="px-6 py-3 border-t border-gray-200 bg-gray-50 flex justify-end gap-2 rounded-b-2xl">
          <button onClick={onClose} disabled={saving} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-white disabled:opacity-50">취소</button>
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50"
          >
            <Save size={14} /> {saving ? "저장 중…" : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}

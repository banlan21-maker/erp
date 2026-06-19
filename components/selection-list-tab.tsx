"use client";

/**
 * 선별 목록 탭 — 출고 선별(shipoutMarkedAt)된 강재 모음(예약 풀).
 * 선택 → 기존 출고 카트에 담기 → 하단 카트바 [출고장 만들기] 마법사로 출고증 발행.
 * (남은 자재는 풀에 그대로 유지 · 카트에서 빼면 배차취소)
 * 선별 취소(unmark)도 여기서 가능.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { RefreshCw, Truck, Undo2 } from "lucide-react";
import { useShipoutCart } from "@/components/shipout-cart";

interface Row {
  id: string;
  vesselCode: string;
  material: string;
  thickness: number;
  width: number;
  length: number;
  storageLocation: string | null;
  shipoutMarkedAt: string | null;
  shipoutHeatNo: string | null;
  shipoutLabel: string | null;
}

const fmtT = (v: number) => parseFloat(v.toFixed(1));
const fmtL = (v: number) => Math.round(v);
const calcWeight = (t: number, w: number, l: number) => parseFloat(((t * w * l * 7.85) / 1_000_000).toFixed(1));
const fmtYMD = (iso: string | null) => {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "-";
  return `${String(d.getFullYear()).slice(2)}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
};

export default function SelectionListTab() {
  const cart = useShipoutCart();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/steel-plan?all=true&shipoutMarked=true");
      const d = await r.json();
      setRows(Array.isArray(d.data) ? d.data : []);
      setSelectedIds(new Set());
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // 카트에 없는 선별 강재만 선택 대상
  const selectableIds = useMemo(() => rows.filter(r => !cart.has(r.id)).map(r => r.id), [rows, cart]);
  const validSelected = useMemo(() => [...selectedIds].filter(id => selectableIds.includes(id)), [selectedIds, selectableIds]);
  const allSelected = selectableIds.length > 0 && selectableIds.every(id => selectedIds.has(id));
  const selWeight = useMemo(
    () => validSelected.reduce((s, id) => { const r = rows.find(x => x.id === id); return s + (r ? calcWeight(r.thickness, r.width, r.length) : 0); }, 0),
    [validSelected, rows],
  );

  const toggleAll = () => setSelectedIds(prev => {
    const n = new Set(prev);
    if (allSelected) selectableIds.forEach(id => n.delete(id));
    else selectableIds.forEach(id => n.add(id));
    return n;
  });
  const toggleOne = (id: string) => setSelectedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const addToCart = () => {
    if (validSelected.length === 0) { alert("출고 카트에 담을 강재를 선택하세요."); return; }
    const items = validSelected.map(id => {
      const r = rows.find(x => x.id === id)!;
      return {
        steelPlanId: r.id,
        vesselCode:  r.vesselCode,
        material:    r.material,
        thickness:   r.thickness,
        width:       r.width,
        length:      r.length,
        weight:      calcWeight(r.thickness, r.width, r.length),
        prefilledHeatNo: r.shipoutHeatNo ?? undefined,
      };
    });
    const { added, duplicates } = cart.add(items);
    setSelectedIds(new Set());
    alert(
      `출고 카트에 ${added}건 담았습니다.${duplicates > 0 ? `\n(이미 담긴 ${duplicates}건 제외)` : ""}\n` +
      `하단 [출고 카트] 바에서 [출고장 만들기]로 출고증을 발행하세요. (남은 자재는 선별 목록에 그대로 유지)`,
    );
  };

  const unmarkSelected = async () => {
    if (validSelected.length === 0) { alert("선별 취소할 강재를 선택하세요."); return; }
    if (!confirm(`선택한 ${validSelected.length}건의 출고 선별을 취소하시겠습니까?\n(강재가 선별 목록에서 빠지고 다시 절단/출고 대상이 됩니다)`)) return;
    const ids = validSelected;
    setBusy(true);
    try {
      setRows(prev => prev.filter(r => !ids.includes(r.id)));   // 낙관적 제거
      setSelectedIds(new Set());
      await fetch("/api/steel-plan/shipout-mark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "unmark", ids }),
      });
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-700">선별 목록 (출고 예약 풀)</h3>
          <p className="text-xs text-gray-500 mt-0.5">선별지시서로 확정된 강재 모음 — 선택해 출고 카트에 담아 출고증을 발행합니다. 상태는 입고 유지.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
            <RefreshCw size={14} /> 새로고침
          </button>
          <button onClick={unmarkSelected} disabled={busy || validSelected.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-red-300 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-40">
            <Undo2 size={14} /> 선별 취소{validSelected.length ? ` (${validSelected.length})` : ""}
          </button>
          <button onClick={addToCart} disabled={validSelected.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-40">
            <Truck size={14} /> 출고 카트에 담기{validSelected.length ? ` (${validSelected.length})` : ""}
          </button>
        </div>
      </div>

      <div className="text-xs text-gray-500">
        선별 {rows.length}장 · 선택 <strong className="text-gray-800">{validSelected.length}</strong>장
        <span className="ml-2">선택중량 <strong className="text-gray-800">{selWeight.toLocaleString()}</strong> kg</span>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs whitespace-nowrap">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-2 py-2 w-9 text-center">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll}
                    disabled={selectableIds.length === 0} className="align-middle accent-purple-600 disabled:opacity-30" />
                </th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">선별</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">호선</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">재질</th>
                <th className="px-3 py-2 text-right font-medium text-gray-600">두께</th>
                <th className="px-3 py-2 text-right font-medium text-gray-600">폭</th>
                <th className="px-3 py-2 text-right font-medium text-gray-600">길이</th>
                <th className="px-3 py-2 text-right font-medium text-gray-600">중량(kg)</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">보관위치</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">판번호</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">선별일</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={11} className="py-8 text-center text-gray-400">불러오는 중...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={11} className="py-8 text-center text-gray-400">선별된 강재가 없습니다. 강재매칭/출고등록에서 선별지시서를 출력하면 여기에 모입니다.</td></tr>
              ) : rows.map((r) => {
                const inCart = cart.has(r.id);
                return (
                  <tr key={r.id} className={`hover:bg-gray-50 ${inCart ? "bg-purple-50/60" : ""}`}>
                    <td className="px-2 py-1.5 text-center">
                      {inCart
                        ? <span className="text-[10px] font-semibold text-purple-600" title="출고 카트에 담김">담김</span>
                        : <input type="checkbox" checked={selectedIds.has(r.id)} onChange={() => toggleOne(r.id)} className="align-middle accent-purple-600" />}
                    </td>
                    <td className="px-3 py-1.5">
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-100 text-red-700">{r.shipoutLabel ?? r.vesselCode} 선별</span>
                    </td>
                    <td className="px-3 py-1.5 font-medium">{r.vesselCode}</td>
                    <td className="px-3 py-1.5">{r.material}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{fmtT(r.thickness)}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{fmtL(r.width)}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{fmtL(r.length)}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{calcWeight(r.thickness, r.width, r.length).toLocaleString()}</td>
                    <td className="px-3 py-1.5 text-gray-600">{r.storageLocation ?? "-"}</td>
                    <td className="px-3 py-1.5 font-mono">{r.shipoutHeatNo ?? "-"}</td>
                    <td className="px-3 py-1.5 text-gray-500 font-mono">{fmtYMD(r.shipoutMarkedAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

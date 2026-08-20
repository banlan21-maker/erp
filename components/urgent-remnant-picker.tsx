"use client";

import { useMemo, useState } from "react";
import { X, Search, Check, Package } from "lucide-react";

/**
 * 돌발작업 사용 강재 선택 모달.
 *
 * 잔재관리에 실재하는 여유원재·등록잔재·현장잔재 중에서만 고르게 한다
 * (돌발은 즉시 작업이라 정규강재는 대상이 아니다 — 확정 절차를 거치지 않는다).
 *
 * 후보 조건은 서버(app/(main)/cutpart/scrap/page.tsx)에서 이미 걸러온다:
 *   재고(IN_STOCK) · 다른 곳에 미확정(reservedFor=null) · 외부출고 미선별
 * 발생예정(PENDING)은 status 조건에서 자연히 빠진다 — 원판이 아직 안 잘려 실물이 없다.
 *
 * 자재가 많을 때 원하는 것을 찾아야 하므로 재질·두께·폭·길이·위치·중량을 표로 보여주고
 * 검색은 쉼표로 여러 조건을 OR 로 받는다(목록 화면의 검색 규약과 동일).
 */

export interface PickerRemnant {
  id: string;
  remnantNo: string;
  type: string;
  shape: string;
  material: string;
  thickness: number;
  width1: number | null;
  length1: number | null;
  width2: number | null;
  length2: number | null;
  weight: number;
  location: string | null;
  heatNo: string | null;
}

const TABS: { key: string; label: string }[] = [
  { key: "SURPLUS",    label: "여유원재" },
  { key: "REGISTERED", label: "등록잔재" },
  { key: "REMNANT",    label: "현장잔재" },
];

const num = (v: number | null) => (v == null ? "-" : v.toLocaleString());

export default function UrgentRemnantPicker({
  remnants,
  usedIds,
  onPick,
  onClose,
}: {
  remnants: PickerRemnant[];
  usedIds: string[];          // 이미 이 요청의 다른 행에서 고른 것 — 중복 선택 방지
  onPick: (r: PickerRemnant) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState("SURPLUS");
  const [q, setQ] = useState("");

  const used = useMemo(() => new Set(usedIds), [usedIds]);

  // 쉼표 = OR. 한 토큰이 잔재번호·재질·판번호·위치·치수 어디에든 걸리면 통과.
  const rows = useMemo(() => {
    const terms = q.split(",").map(t => t.trim().toLowerCase()).filter(Boolean);
    return remnants
      .filter(r => r.type === tab)
      .filter(r => {
        if (terms.length === 0) return true;
        const hay = [
          r.remnantNo, r.material, r.heatNo ?? "", r.location ?? "",
          String(r.thickness), num(r.width1), num(r.length1),
          String(r.width1 ?? ""), String(r.length1 ?? ""),
          String(r.width2 ?? ""), String(r.length2 ?? ""),
        ].join(" ").toLowerCase();
        return terms.some(t => hay.includes(t));
      })
      .sort((a, b) => a.thickness - b.thickness || (a.width1 ?? 0) - (b.width1 ?? 0));
  }, [remnants, tab, q]);

  const showW2 = tab !== "SURPLUS";   // 등록잔재·현장잔재는 L자형이 있어 폭2·길이2를 같이 본다

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[85vh] flex flex-col"
           onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <h3 className="font-bold text-gray-900 flex items-center gap-2">
            <Package size={16} className="text-blue-600" /> 사용 강재 선택
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full"><X size={16} /></button>
        </div>

        <div className="px-5 pt-3 flex items-center gap-3 flex-wrap">
          <div className="flex border border-gray-200 rounded-lg overflow-hidden">
            {TABS.map(t => {
              const n = remnants.filter(r => r.type === t.key && !used.has(r.id)).length;
              return (
                <button key={t.key} type="button" onClick={() => setTab(t.key)}
                  className={`px-3 py-1.5 text-xs font-semibold ${tab === t.key ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>
                  {t.label} <span className={tab === t.key ? "opacity-80" : "text-gray-400"}>{n}</span>
                </button>
              );
            })}
          </div>
          <div className="relative flex-1 min-w-[220px]">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={q} onChange={e => setQ(e.target.value)}
              placeholder="재질·두께·폭·길이·위치·판번호·잔재번호 검색 (쉼표로 여러 조건)"
              className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400" />
          </div>
        </div>

        <div className="flex-1 overflow-auto px-5 py-3">
          {rows.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-10">
              {q ? "검색 조건에 맞는 강재가 없습니다." : "고를 수 있는 강재가 없습니다."}
              <br />
              <span className="text-xs text-gray-400">
                재고 상태이고 다른 곳에 확정되지 않은 것만 나옵니다.
              </span>
            </p>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-gray-500 sticky top-0">
                <tr>
                  <th className="px-2 py-2 text-left font-semibold">잔재번호</th>
                  <th className="px-2 py-2 text-left font-semibold">재질</th>
                  <th className="px-2 py-2 text-right font-semibold">두께</th>
                  <th className="px-2 py-2 text-right font-semibold">폭1</th>
                  <th className="px-2 py-2 text-right font-semibold">길이1</th>
                  {showW2 && <th className="px-2 py-2 text-right font-semibold">폭2</th>}
                  {showW2 && <th className="px-2 py-2 text-right font-semibold">길이2</th>}
                  <th className="px-2 py-2 text-left font-semibold">위치</th>
                  <th className="px-2 py-2 text-right font-semibold">중량(kg)</th>
                  <th className="px-2 py-2 text-left font-semibold">판번호</th>
                  <th className="px-2 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map(r => {
                  const taken = used.has(r.id);
                  return (
                    <tr key={r.id} className={taken ? "bg-gray-50 opacity-50" : "hover:bg-blue-50"}>
                      <td className="px-2 py-1.5 font-mono font-semibold text-blue-700">{r.remnantNo}</td>
                      <td className="px-2 py-1.5">{r.material}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{r.thickness}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{num(r.width1)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{num(r.length1)}</td>
                      {showW2 && <td className="px-2 py-1.5 text-right tabular-nums text-gray-400">{num(r.width2)}</td>}
                      {showW2 && <td className="px-2 py-1.5 text-right tabular-nums text-gray-400">{num(r.length2)}</td>}
                      <td className="px-2 py-1.5 text-gray-600">{r.location ?? "-"}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{r.weight.toLocaleString()}</td>
                      <td className="px-2 py-1.5 font-mono text-gray-500">{r.heatNo ?? "-"}</td>
                      <td className="px-2 py-1.5 text-right">
                        {taken ? (
                          <span className="text-[10px] text-gray-400">이미 선택됨</span>
                        ) : (
                          <button type="button" onClick={() => { onPick(r); onClose(); }}
                            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold bg-blue-600 text-white rounded hover:bg-blue-700">
                            <Check size={11} /> 선택
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="px-5 py-3 border-t border-gray-200 flex justify-between items-center">
          <span className="text-xs text-gray-500">{rows.length}건</span>
          <button type="button" onClick={onClose}
            className="px-4 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">닫기</button>
        </div>
      </div>
    </div>
  );
}

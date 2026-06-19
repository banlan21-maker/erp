"use client";

/**
 * 선별 목록 탭 — 출고 선별(shipoutMarkedAt)된 강재 모음(예약 풀).
 * 선택 → 기존 출고 카트에 담기 → 하단 카트바 [출고장 만들기] 마법사로 출고증 발행.
 * (남은 자재는 풀에 그대로 유지 · 카트에서 빼면 배차취소)
 * 선별 취소(unmark)도 여기서 가능.
 *
 * 컬럼 필터·정렬: 표준 cascading 패턴 (lib/cascading-filters + ColumnFilterDropdown).
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { RefreshCw, Truck, Undo2, Search, Filter } from "lucide-react";
import { useShipoutCart } from "@/components/shipout-cart";
import ColumnFilterDropdown from "@/components/column-filter-dropdown";
import { getAllCascadedOptions, getCascadedFilteredRowsWithPredicates, type ColumnAccessorMap, type TextPredicate } from "@/lib/cascading-filters";

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
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return `${String(d.getFullYear()).slice(2)}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
};

// 필터·정렬 대상 컬럼
const COLUMNS: { key: string; label: string; align: "left" | "right" }[] = [
  { key: "shipout",   label: "선별",     align: "left"  },
  { key: "vessel",    label: "호선",     align: "left"  },
  { key: "material",  label: "재질",     align: "left"  },
  { key: "thickness", label: "두께",     align: "right" },
  { key: "width",     label: "폭",       align: "right" },
  { key: "length",    label: "길이",     align: "right" },
  { key: "weight",    label: "중량(kg)", align: "right" },
  { key: "location",  label: "보관위치", align: "left"  },
  { key: "heatNo",    label: "판번호",   align: "left"  },
  { key: "markedAt",  label: "선별일",   align: "left"  },
];

export default function SelectionListTab() {
  const cart = useShipoutCart();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");

  // 컬럼 필터·정렬 (표준 cascading 패턴)
  const [colFilters, setColFilters] = useState<Record<string, string[]>>({});
  const [predicates, setPredicates] = useState<Record<string, TextPredicate | undefined>>({});
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [openCol, setOpenCol] = useState<string | null>(null);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

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

  // 컬럼별 값 추출 (필터·정렬·드롭다운 옵션 공통)
  const accessors = useMemo<ColumnAccessorMap<Row>>(() => ({
    shipout:   r => `${r.shipoutLabel ?? r.vesselCode} 선별`,
    vessel:    r => r.vesselCode,
    material:  r => r.material,
    thickness: r => fmtT(r.thickness),
    width:     r => fmtL(r.width),
    length:    r => fmtL(r.length),
    weight:    r => calcWeight(r.thickness, r.width, r.length),
    location:  r => r.storageLocation ?? "",
    heatNo:    r => r.shipoutHeatNo ?? "",
    markedAt:  r => fmtYMD(r.shipoutMarkedAt),
  }), []);

  const distinctValues = useMemo(
    () => getAllCascadedOptions(rows, colFilters, accessors),
    [rows, colFilters, accessors],
  );

  // 컬럼필터+텍스트조건 → 검색 → 정렬
  const displayRows = useMemo(() => {
    let r = getCascadedFilteredRowsWithPredicates(rows, colFilters, predicates, accessors);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      r = r.filter(row => `${row.vesselCode} ${row.material} ${row.shipoutHeatNo ?? ""} ${row.shipoutLabel ?? ""} ${row.storageLocation ?? ""}`.toLowerCase().includes(q));
    }
    if (sortKey && accessors[sortKey]) {
      const acc = accessors[sortKey];
      r = [...r].sort((a, b) => {
        const cmp = String(acc(a) ?? "").localeCompare(String(acc(b) ?? ""), "ko", { numeric: true });
        return sortDir === "asc" ? cmp : -cmp;
      });
    }
    return r;
  }, [rows, colFilters, predicates, accessors, search, sortKey, sortDir]);

  const openFilter = (key: string, el: HTMLElement) => {
    if (openCol === key) { setOpenCol(null); setAnchorEl(null); }
    else { setOpenCol(key); setAnchorEl(el); }
  };

  // 카트에 없는 행만 선택 대상. 전체선택은 현재 화면(displayRows) 기준.
  const selectableVisibleIds = useMemo(() => displayRows.filter(r => !cart.has(r.id)).map(r => r.id), [displayRows, cart]);
  const validSelected = useMemo(
    () => [...selectedIds].filter(id => rows.some(r => r.id === id) && !cart.has(id)),
    [selectedIds, rows, cart],
  );
  const allSelected = selectableVisibleIds.length > 0 && selectableVisibleIds.every(id => selectedIds.has(id));
  const selWeight = useMemo(
    () => validSelected.reduce((s, id) => { const r = rows.find(x => x.id === id); return s + (r ? calcWeight(r.thickness, r.width, r.length) : 0); }, 0),
    [validSelected, rows],
  );

  const toggleAll = () => setSelectedIds(prev => {
    const n = new Set(prev);
    if (allSelected) selectableVisibleIds.forEach(id => n.delete(id));
    else selectableVisibleIds.forEach(id => n.add(id));
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
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="호선·재질·판번호·위치 검색"
              className="pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg w-52 focus:outline-none focus:ring-2 focus:ring-purple-400" />
          </div>
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
        선별 {rows.length}장{displayRows.length !== rows.length ? ` · 표시 ${displayRows.length}장` : ""} · 선택 <strong className="text-gray-800">{validSelected.length}</strong>장
        <span className="ml-2">선택중량 <strong className="text-gray-800">{selWeight.toLocaleString()}</strong> kg</span>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs whitespace-nowrap">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-2 py-2 w-9 text-center">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll}
                    disabled={selectableVisibleIds.length === 0} title="화면 전체선택"
                    className="align-middle accent-purple-600 disabled:opacity-30" />
                </th>
                {COLUMNS.map(({ key, label, align }) => {
                  const active = (colFilters[key]?.length ?? 0) > 0 || !!predicates[key];
                  const isSort = sortKey === key;
                  return (
                    <th key={key} className={`px-3 py-2 font-medium text-gray-600 ${align === "right" ? "text-right" : "text-left"}`}>
                      <button onClick={e => openFilter(key, e.currentTarget)}
                        className={`inline-flex items-center gap-1 ${align === "right" ? "ml-auto" : ""} hover:text-gray-800`}>
                        {label}
                        <Filter size={10} className={active || isSort ? "text-purple-500" : "text-gray-300"} fill={active ? "currentColor" : "none"} />
                        {isSort && <span className="text-purple-500 text-[9px]">{sortDir === "asc" ? "▲" : "▼"}</span>}
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={11} className="py-8 text-center text-gray-400">불러오는 중...</td></tr>
              ) : displayRows.length === 0 ? (
                <tr><td colSpan={11} className="py-8 text-center text-gray-400">{rows.length === 0 ? "선별된 강재가 없습니다. 강재매칭/출고등록에서 선별지시서를 출력하면 여기에 모입니다." : "필터 조건에 맞는 강재가 없습니다."}</td></tr>
              ) : displayRows.map((r) => {
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
                    <td className="px-3 py-1.5 text-gray-500 font-mono">{fmtYMD(r.shipoutMarkedAt) || "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 컬럼 필터·정렬 드롭다운 */}
      {openCol && anchorEl && (
        <ColumnFilterDropdown
          anchorEl={anchorEl}
          values={distinctValues[openCol] ?? []}
          selected={colFilters[openCol] ?? []}
          onApply={sel => { setColFilters(f => ({ ...f, [openCol]: sel })); setOpenCol(null); setAnchorEl(null); }}
          onClose={() => { setOpenCol(null); setAnchorEl(null); }}
          sortDir={sortKey === openCol ? sortDir : null}
          onSort={dir => { if (dir === null) setSortKey(null); else { setSortKey(openCol); setSortDir(dir); } setOpenCol(null); setAnchorEl(null); }}
          predicate={predicates[openCol] ?? null}
          onPredicate={p => setPredicates(prev => ({ ...prev, [openCol]: p ?? undefined }))}
        />
      )}
    </div>
  );
}

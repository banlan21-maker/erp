"use client";

/**
 * 선별 목록 탭 — 출고 선별(예약 풀). 원판(SteelPlan)과 잔재(Remnant)를 함께 다룬다.
 *  - 원판: 강재매칭/출고등록에서 선별지시서 출력 시 shipoutMarkedAt 마킹된 것.
 *  - 잔재: [잔재 추가] 모달에서 여유원재/등록잔재/현장잔재를 골라 추가(shipoutMarkedAt 마킹)한 것.
 * 선택 → 출고 카트에 담기 → 하단 카트바 [출고장 만들기] 마법사로 출고증 발행 (원판·잔재 같이 출고).
 * 선별 취소(unmark)도 여기서 가능 (원판/잔재 각각 적절한 API 호출).
 *
 * 컬럼 필터·정렬: 표준 cascading 패턴 (lib/cascading-filters + ColumnFilterDropdown).
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { RefreshCw, Truck, Undo2, Search, Filter, Plus, X, Layers } from "lucide-react";
import { useShipoutCart, type ShipoutCartItem } from "@/components/shipout-cart";
import ColumnFilterDropdown from "@/components/column-filter-dropdown";
import { getAllCascadedOptions, getCascadedFilteredRowsWithPredicates, type ColumnAccessorMap, type TextPredicate } from "@/lib/cascading-filters";

type ItemKind = "plate" | "remnant";

interface Row {
  id: string;            // plate: SteelPlan.id · remnant: Remnant.id
  kind: ItemKind;
  vesselCode: string;
  material: string;
  thickness: number;
  width: number;
  length: number;
  weight: number;        // plate: 계산값 · remnant: 저장값
  storageLocation: string | null;
  shipoutMarkedAt: string | null;
  heatNo: string | null;          // plate: shipoutHeatNo · remnant: heatNo
  shipoutLabel: string | null;    // plate 전용
  remnantNo: string | null;       // remnant 전용
  remnantType: string | null;     // remnant 전용 (REMNANT/SURPLUS/REGISTERED)
}

const REMNANT_TYPE_LABEL: Record<string, string> = {
  REMNANT: "현장잔재", SURPLUS: "여유원재", REGISTERED: "등록잔재",
};
const REMNANT_TYPES: { key: string; label: string }[] = [
  { key: "SURPLUS",    label: "여유원재" },
  { key: "REGISTERED", label: "등록잔재" },
  { key: "REMNANT",    label: "현장잔재" },
];

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
  { key: "kind",      label: "구분",     align: "left"  },
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

/* 원판/잔재 응답 → 공통 Row 매핑 ─────────────────────────────────────────── */
interface PlanApi { id: string; vesselCode: string; material: string; thickness: number; width: number; length: number; storageLocation: string | null; shipoutMarkedAt: string | null; shipoutHeatNo: string | null; shipoutLabel: string | null; }
interface RemnantApi {
  id: string; remnantNo: string; type: string; material: string; thickness: number; weight: number;
  width1: number | null; length1: number | null; location: string | null; heatNo: string | null;
  shipoutMarkedAt: string | null; status: string; reservedFor: string | null;
  sourceVesselName: string | null; sourceBlock: string | null;
  sourceProject?: { projectCode: string; projectName: string } | null;
}

const planToRow = (p: PlanApi): Row => ({
  id: p.id, kind: "plate",
  vesselCode: p.vesselCode, material: p.material, thickness: p.thickness, width: p.width, length: p.length,
  weight: calcWeight(p.thickness, p.width, p.length),
  storageLocation: p.storageLocation,
  shipoutMarkedAt: p.shipoutMarkedAt, heatNo: p.shipoutHeatNo, shipoutLabel: p.shipoutLabel,
  remnantNo: null, remnantType: null,
});
const remnantToRow = (r: RemnantApi): Row => ({
  id: r.id, kind: "remnant",
  vesselCode: r.sourceVesselName || r.sourceProject?.projectCode || "",
  material: r.material, thickness: r.thickness, width: r.width1 ?? 0, length: r.length1 ?? 0,
  weight: r.weight,
  storageLocation: r.location,
  shipoutMarkedAt: r.shipoutMarkedAt, heatNo: r.heatNo, shipoutLabel: null,
  remnantNo: r.remnantNo, remnantType: r.type,
});

export default function SelectionListTab() {
  const cart = useShipoutCart();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);

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
      const [planRes, remRes] = await Promise.all([
        fetch("/api/steel-plan?all=true&shipoutMarked=true").then(r => r.json()).catch(() => ({})),
        fetch("/api/remnants/shipout").then(r => r.json()).catch(() => ({})),
      ]);
      const plates: Row[]   = Array.isArray(planRes?.data) ? planRes.data.map(planToRow) : [];
      const remnants: Row[] = Array.isArray(remRes?.data)  ? remRes.data.map(remnantToRow) : [];
      setRows([...plates, ...remnants]);
      setSelectedIds(new Set());
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const kindLabel = useCallback((r: Row) => r.kind === "plate" ? "원판" : (REMNANT_TYPE_LABEL[r.remnantType ?? ""] ?? "잔재"), []);
  const shipoutLabel = useCallback((r: Row) => r.kind === "plate"
    ? `${r.shipoutLabel ?? r.vesselCode} 선별`
    : `${REMNANT_TYPE_LABEL[r.remnantType ?? ""] ?? "잔재"} 선별`, []);

  // 컬럼별 값 추출 (필터·정렬·드롭다운 옵션 공통)
  const accessors = useMemo<ColumnAccessorMap<Row>>(() => ({
    kind:      r => kindLabel(r),
    shipout:   r => shipoutLabel(r),
    vessel:    r => r.vesselCode,
    material:  r => r.material,
    thickness: r => fmtT(r.thickness),
    width:     r => fmtL(r.width),
    length:    r => fmtL(r.length),
    weight:    r => r.weight,
    location:  r => r.storageLocation ?? "",
    heatNo:    r => r.heatNo ?? "",
    markedAt:  r => fmtYMD(r.shipoutMarkedAt),
  }), [kindLabel, shipoutLabel]);

  const distinctValues = useMemo(
    () => getAllCascadedOptions(rows, colFilters, accessors),
    [rows, colFilters, accessors],
  );

  // 컬럼필터+텍스트조건 → 검색 → 정렬
  const displayRows = useMemo(() => {
    let r = getCascadedFilteredRowsWithPredicates(rows, colFilters, predicates, accessors);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      r = r.filter(row => `${row.vesselCode} ${row.material} ${row.heatNo ?? ""} ${row.shipoutLabel ?? ""} ${row.remnantNo ?? ""} ${row.storageLocation ?? ""}`.toLowerCase().includes(q));
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
    () => validSelected.reduce((s, id) => { const r = rows.find(x => x.id === id); return s + (r ? r.weight : 0); }, 0),
    [validSelected, rows],
  );
  const plateCount   = rows.filter(r => r.kind === "plate").length;
  const remnantCount = rows.filter(r => r.kind === "remnant").length;

  const toggleAll = () => setSelectedIds(prev => {
    const n = new Set(prev);
    if (allSelected) selectableVisibleIds.forEach(id => n.delete(id));
    else selectableVisibleIds.forEach(id => n.add(id));
    return n;
  });
  const toggleOne = (id: string) => setSelectedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const addToCart = () => {
    if (validSelected.length === 0) { alert("출고 카트에 담을 자재를 선택하세요."); return; }
    const items: ShipoutCartItem[] = validSelected.map(id => {
      const r = rows.find(x => x.id === id)!;
      return {
        steelPlanId: r.id,                                   // 카트 고유키
        kind:        r.kind,
        remnantId:   r.kind === "remnant" ? r.id : undefined,
        vesselCode:  r.vesselCode,
        material:    r.material,
        thickness:   r.thickness,
        width:       r.width,
        length:      r.length,
        weight:      r.weight,
        prefilledHeatNo: r.heatNo ?? undefined,
        remnantNo:   r.remnantNo ?? undefined,
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
    if (validSelected.length === 0) { alert("선별 취소할 자재를 선택하세요."); return; }
    if (!confirm(`선택한 ${validSelected.length}건의 출고 선별을 취소하시겠습니까?\n(선별 목록에서 빠집니다. 원판은 다시 절단/출고 대상, 잔재는 잔재관리 재고로 복귀)`)) return;
    const ids = validSelected;
    const plateIds   = ids.filter(id => rows.find(r => r.id === id)?.kind === "plate");
    const remnantIds = ids.filter(id => rows.find(r => r.id === id)?.kind === "remnant");
    setBusy(true);
    try {
      setRows(prev => prev.filter(r => !ids.includes(r.id)));   // 낙관적 제거
      setSelectedIds(new Set());
      await Promise.all([
        plateIds.length ? fetch("/api/steel-plan/shipout-mark", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "unmark", ids: plateIds }),
        }) : Promise.resolve(),
        remnantIds.length ? fetch("/api/remnants/shipout", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "unmark", ids: remnantIds }),
        }) : Promise.resolve(),
      ]);
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-700">선별 목록 (출고 예약 풀)</h3>
          <p className="text-xs text-gray-500 mt-0.5">선별된 원판 + 추가한 잔재 모음 — 선택해 출고 카트에 담아 같이 출고증을 발행합니다. 상태는 유지.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="호선·재질·판번호·잔재번호·위치 검색"
              className="pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg w-56 focus:outline-none focus:ring-2 focus:ring-purple-400" />
          </div>
          <button onClick={load} className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
            <RefreshCw size={14} /> 새로고침
          </button>
          <button onClick={unmarkSelected} disabled={busy || validSelected.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-red-300 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-40">
            <Undo2 size={14} /> 선별 취소{validSelected.length ? ` (${validSelected.length})` : ""}
          </button>
          <button onClick={() => setAddOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-amber-400 text-amber-700 rounded-lg hover:bg-amber-50">
            <Plus size={14} /> 잔재 추가
          </button>
          <button onClick={addToCart} disabled={validSelected.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-40">
            <Truck size={14} /> 출고 카트에 담기{validSelected.length ? ` (${validSelected.length})` : ""}
          </button>
        </div>
      </div>

      <div className="text-xs text-gray-500">
        선별 {rows.length}건 <span className="text-gray-400">(원판 {plateCount} · 잔재 {remnantCount})</span>
        {displayRows.length !== rows.length ? ` · 표시 ${displayRows.length}건` : ""} · 선택 <strong className="text-gray-800">{validSelected.length}</strong>건
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
                <tr><td colSpan={12} className="py-8 text-center text-gray-400">불러오는 중...</td></tr>
              ) : displayRows.length === 0 ? (
                <tr><td colSpan={12} className="py-8 text-center text-gray-400">{rows.length === 0 ? "선별된 자재가 없습니다. 강재매칭/출고등록에서 선별지시서를 출력하거나 [잔재 추가]로 잔재를 담으세요." : "필터 조건에 맞는 자재가 없습니다."}</td></tr>
              ) : displayRows.map((r) => {
                const inCart = cart.has(r.id);
                const isRemnant = r.kind === "remnant";
                return (
                  <tr key={r.id} className={`hover:bg-gray-50 ${inCart ? "bg-purple-50/60" : ""}`}>
                    <td className="px-2 py-1.5 text-center">
                      {inCart
                        ? <span className="text-[10px] font-semibold text-purple-600" title="출고 카트에 담김">담김</span>
                        : <input type="checkbox" checked={selectedIds.has(r.id)} onChange={() => toggleOne(r.id)} className="align-middle accent-purple-600" />}
                    </td>
                    <td className="px-3 py-1.5">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${isRemnant ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"}`}>
                        {kindLabel(r)}
                      </span>
                    </td>
                    <td className="px-3 py-1.5">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${isRemnant ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}`}>{shipoutLabel(r)}</span>
                    </td>
                    <td className="px-3 py-1.5 font-medium">{r.vesselCode || "-"}{isRemnant && r.remnantNo && <span className="ml-1 text-[10px] text-gray-400 font-mono">{r.remnantNo}</span>}</td>
                    <td className="px-3 py-1.5">{r.material}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{fmtT(r.thickness)}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{r.width ? fmtL(r.width) : "-"}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{r.length ? fmtL(r.length) : "-"}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{r.weight.toLocaleString()}</td>
                    <td className="px-3 py-1.5 text-gray-600">{r.storageLocation ?? "-"}</td>
                    <td className="px-3 py-1.5 font-mono">{r.heatNo ?? "-"}</td>
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

      {/* 잔재 추가 모달 */}
      {addOpen && (
        <RemnantPickerModal
          onClose={() => setAddOpen(false)}
          onAdded={() => { setAddOpen(false); load(); }}
        />
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════ */
/* 잔재 추가 모달 — 타입 선택 → 가용 잔재 목록 → 선택 → 선별목록에 추가(mark)     */
/* ════════════════════════════════════════════════════════════════════════ */
function RemnantPickerModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [type, setType] = useState<string>("SURPLUS");
  const [list, setList] = useState<RemnantApi[]>([]);
  const [loading, setLoading] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");

  const loadList = useCallback(async (t: string) => {
    setLoading(true);
    setSel(new Set());
    try {
      const r = await fetch(`/api/remnants?type=${encodeURIComponent(t)}&onlyAvailable=true`);
      const d = await r.json();
      // 가용 잔재만: 재고(IN_STOCK) + 미선별 + 미확정(절단용 reservedFor 없음)
      //  · onlyAvailable=true 로 서버에서 reservedFor:null 1차 필터, 클라에서 한 번 더 방어
      const avail: RemnantApi[] = (Array.isArray(d?.data) ? d.data : [])
        .filter((x: RemnantApi) => x.status === "IN_STOCK" && !x.shipoutMarkedAt && !x.reservedFor);
      setList(avail);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { loadList(type); }, [type, loadList]);

  const filtered = useMemo(() => {
    if (!search.trim()) return list;
    const q = search.trim().toLowerCase();
    return list.filter(x => `${x.remnantNo} ${x.material} ${x.heatNo ?? ""} ${x.location ?? ""} ${x.sourceVesselName ?? ""} ${x.sourceBlock ?? ""}`.toLowerCase().includes(q));
  }, [list, search]);

  const allSel = filtered.length > 0 && filtered.every(x => sel.has(x.id));
  const toggleAll = () => setSel(prev => {
    const n = new Set(prev);
    if (allSel) filtered.forEach(x => n.delete(x.id));
    else filtered.forEach(x => n.add(x.id));
    return n;
  });
  const toggleOne = (id: string) => setSel(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const add = async () => {
    const ids = [...sel];
    if (ids.length === 0) { alert("추가할 잔재를 선택하세요."); return; }
    setBusy(true);
    try {
      const r = await fetch("/api/remnants/shipout", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark", ids }),
      });
      const d = await r.json();
      if (!d.success) { alert(d.error ?? "추가 실패"); return; }
      alert(`${d.count}건을 선별 목록에 추가했습니다.`);
      onAdded();
    } catch (e) {
      alert(e instanceof Error ? e.message : "네트워크 오류");
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col">
        <div className="px-6 py-3 border-b border-gray-200 flex items-center justify-between">
          <h3 className="font-bold text-lg text-gray-900 flex items-center gap-2">
            <Layers size={18} className="text-amber-600" /> 잔재 추가 — 선별 목록
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full"><X size={16} /></button>
        </div>

        {/* 타입 탭 + 검색 */}
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex gap-1.5">
            {REMNANT_TYPES.map(t => (
              <button key={t.key} onClick={() => setType(t.key)}
                className={`px-3 py-1.5 text-sm rounded-lg border ${type === t.key ? "bg-amber-500 border-amber-500 text-white font-semibold" : "border-gray-300 text-gray-600 hover:bg-gray-50"}`}>
                {t.label}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="잔재번호·재질·판번호·위치 검색"
              className="pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg w-56 focus:outline-none focus:ring-2 focus:ring-amber-400" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="border border-gray-200 rounded-lg overflow-x-auto">
            <table className="w-full text-xs whitespace-nowrap">
              <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
                <tr>
                  <th className="px-2 py-2 w-9 text-center">
                    <input type="checkbox" checked={allSel} onChange={toggleAll} disabled={filtered.length === 0} className="accent-amber-600 disabled:opacity-30" />
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">잔재번호</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">재질</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-600">두께</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-600">폭</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-600">길이</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-600">중량(kg)</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">호선/블록</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">판번호</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">위치</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr><td colSpan={10} className="py-8 text-center text-gray-400">불러오는 중...</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={10} className="py-8 text-center text-gray-400">추가할 수 있는 잔재가 없습니다. (이미 선별됐거나 소진된 잔재는 제외)</td></tr>
                ) : filtered.map(x => (
                  <tr key={x.id} className={`hover:bg-amber-50/50 ${sel.has(x.id) ? "bg-amber-50" : ""}`}>
                    <td className="px-2 py-1.5 text-center">
                      <input type="checkbox" checked={sel.has(x.id)} onChange={() => toggleOne(x.id)} className="accent-amber-600" />
                    </td>
                    <td className="px-3 py-1.5 font-mono font-medium">{x.remnantNo}</td>
                    <td className="px-3 py-1.5">{x.material}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{fmtT(x.thickness)}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{x.width1 ? fmtL(x.width1) : "-"}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{x.length1 ? fmtL(x.length1) : "-"}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{x.weight.toLocaleString()}</td>
                    <td className="px-3 py-1.5 text-gray-600">
                      {(x.sourceVesselName || x.sourceProject?.projectCode || "-")}{x.sourceBlock ? ` / ${x.sourceBlock}` : ""}
                    </td>
                    <td className="px-3 py-1.5 font-mono">{x.heatNo ?? "-"}</td>
                    <td className="px-3 py-1.5 text-gray-600">{x.location ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="px-6 py-3 border-t border-gray-200 bg-gray-50 flex items-center justify-between rounded-b-2xl">
          <div className="text-xs text-gray-500">선택 <strong className="text-gray-800">{sel.size}</strong>건</div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} disabled={busy} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-white disabled:opacity-50">취소</button>
            <button onClick={add} disabled={busy || sel.size === 0}
              className="inline-flex items-center gap-1.5 px-5 py-2 text-sm font-semibold bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50">
              <Plus size={14} /> 선별 목록에 추가 ({sel.size})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

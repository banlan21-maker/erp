"use client";

/**
 * 강재매칭 — 잔재(여유원재/등록잔재/현장잔재) 매칭 패널.
 * 강재전체목록 탭과 동일 기능: 사양 매칭(호선 무관) → 선택 → 선별지시서 출력 + '선별' 마킹.
 * 잔재 선별은 /api/remnants/shipout (mark) 로 선별목록에 추가 → 카트 → 출고장 흐름과 연결.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, Printer, Filter } from "lucide-react";
import ColumnFilterDropdown from "@/components/column-filter-dropdown";
import { getAllCascadedOptions, getCascadedFilteredRowsWithPredicates, type ColumnAccessorMap, type TextPredicate } from "@/lib/cascading-filters";

const fmtT = (v: number) => parseFloat(v.toFixed(1));
const fmtL = (v: number) => Math.round(v);

const TYPE_LABEL: Record<string, string> = { SURPLUS: "여유원재", REGISTERED: "등록잔재", REMNANT: "현장잔재" };
const STATUS_LABEL: Record<string, string> = { PENDING: "대기", IN_STOCK: "재고", EXHAUSTED: "소진" };
const SHAPE_LABEL: Record<string, string> = { RECTANGLE: "사각형", L_SHAPE: "L자형", IRREGULAR: "불규칙형" };

interface Spec { vesselCode: string; material: string; thickness: number; width: number; length: number }
interface RemRow {
  id: string; remnantNo: string; shape: string; material: string; thickness: number;
  width1: number | null; length1: number | null; width2: number | null; length2: number | null;
  weight: number; weightCalc: number;
  location: string | null; heatNo: string | null; status: string;
  shipoutMarkedAt: string | null; reservedFor: string | null; vessel: string;
}
interface RemMatchRow { matched: boolean; spec: Spec; remnant: RemRow | null }

const COLUMNS: { key: string; label: string; align: "left" | "right" }[] = [
  { key: "vessel",    label: "출처",     align: "left"  },
  { key: "remnantNo", label: "잔재번호", align: "left"  },
  { key: "material",  label: "재질",     align: "left"  },
  { key: "shape",     label: "형태",     align: "left"  },
  { key: "thickness", label: "두께",     align: "right" },
  { key: "width",     label: "폭",       align: "right" },
  { key: "length",    label: "길이",     align: "right" },
  { key: "weight",    label: "중량(kg)", align: "right" },
  { key: "status",    label: "상태",     align: "left"  },
  { key: "location",  label: "위치",     align: "left"  },
  { key: "heatNo",    label: "판번호",   align: "left"  },
  { key: "reservedFor", label: "확정정보", align: "left" },
];

export default function SteelMatchRemnantPanel({
  jobId, jobName, type, onChanged,
}: { jobId: string; jobName: string; type: string; onChanged?: () => void }) {
  const [rows, setRows] = useState<RemMatchRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [marking, setMarking] = useState(false);
  const [search, setSearch] = useState("");

  const [colFilters, setColFilters] = useState<Record<string, string[]>>({});
  const [predicates, setPredicates] = useState<Record<string, TextPredicate | undefined>>({});
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [openCol, setOpenCol] = useState<string | null>(null);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setSelectedIds(new Set());
    try {
      const r = await fetch(`/api/steel-match/${jobId}/remnants?type=${type}`);
      const d = await r.json();
      if (d.success) setRows(d.data.rows); else { alert(d.error ?? "조회 실패"); setRows([]); }
    } finally { setLoading(false); }
  }, [jobId, type]);
  useEffect(() => { load(); }, [load]);

  const reservedInfo = (r: RemRow) =>
    r.status === "EXHAUSTED" ? "출고" : r.shipoutMarkedAt ? "선별" : (r.reservedFor ?? "");

  const accessors = useMemo<ColumnAccessorMap<RemMatchRow>>(() => ({
    vessel:     r => r.remnant?.vessel || (r.matched ? "-" : "(없음)"),
    remnantNo:  r => r.remnant?.remnantNo ?? "",
    material:   r => r.spec.material,
    shape:      r => r.remnant ? (SHAPE_LABEL[r.remnant.shape] ?? r.remnant.shape) : "",
    thickness:  r => fmtT(r.spec.thickness),
    width:      r => fmtL(r.spec.width),
    length:     r => fmtL(r.spec.length),
    weight:     r => r.remnant ? r.remnant.weightCalc.toLocaleString() : "-",
    status:     r => r.matched ? (STATUS_LABEL[r.remnant!.status] ?? r.remnant!.status) : "미매칭",
    location:   r => r.remnant?.location ?? "",
    heatNo:     r => r.remnant?.heatNo ?? "",
    reservedFor: r => r.remnant ? reservedInfo(r.remnant) : "",
  }), []);

  const distinctValues = useMemo(() => getAllCascadedOptions(rows, colFilters, accessors), [rows, colFilters, accessors]);

  const displayRows = useMemo(() => {
    let r = getCascadedFilteredRowsWithPredicates(rows, colFilters, predicates, accessors);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      r = r.filter(row => `${row.remnant?.vessel ?? ""} ${row.remnant?.remnantNo ?? ""} ${row.spec.material} ${row.remnant?.heatNo ?? ""} ${row.remnant?.location ?? ""}`.toLowerCase().includes(q));
    }
    if (sortKey && accessors[sortKey]) {
      const acc = accessors[sortKey];
      r = [...r].sort((a, b) => { const cmp = String(acc(a) ?? "").localeCompare(String(acc(b) ?? ""), "ko", { numeric: true }); return sortDir === "asc" ? cmp : -cmp; });
    }
    return r;
  }, [rows, colFilters, predicates, accessors, search, sortKey, sortDir]);

  // 선택 가능: 매칭 + 재고(IN_STOCK) + 미선별 + 미확정(절단용 reservedFor 없음)
  const selectableById = useMemo(() => {
    const m = new Map<string, RemRow>();
    for (const r of rows) if (r.matched && r.remnant && r.remnant.status === "IN_STOCK" && !r.remnant.shipoutMarkedAt && !r.remnant.reservedFor) m.set(r.remnant.id, r.remnant);
    return m;
  }, [rows]);
  const selectableVisibleIds = useMemo(() => {
    const out: string[] = []; const seen = new Set<string>();
    for (const r of displayRows) { const id = r.remnant?.id; if (id && selectableById.has(id) && !seen.has(id)) { out.push(id); seen.add(id); } }
    return out;
  }, [displayRows, selectableById]);
  const validSelectedIds = useMemo(() => [...selectedIds].filter(id => selectableById.has(id)), [selectedIds, selectableById]);
  const allVisibleSelected = selectableVisibleIds.length > 0 && selectableVisibleIds.every(id => selectedIds.has(id));

  const toggleAll = () => setSelectedIds(prev => { const n = new Set(prev); if (allVisibleSelected) selectableVisibleIds.forEach(id => n.delete(id)); else selectableVisibleIds.forEach(id => n.add(id)); return n; });
  const toggleOne = (id: string) => setSelectedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const openFilter = (key: string, el: HTMLElement) => { if (openCol === key) { setOpenCol(null); setAnchorEl(null); } else { setOpenCol(key); setAnchorEl(el); } };

  const writeSheet = (win: Window, list: RemRow[]) => {
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const shapeText = (p: RemRow) => {
      const base = SHAPE_LABEL[p.shape] ?? p.shape;
      return p.shape !== "RECTANGLE" && p.width2 != null && p.length2 != null ? `${base}(절단 ${fmtL(p.width2)}×${fmtL(p.length2)})` : base;
    };
    const body = list.map((p, i) => `
      <tr class="${i % 2 === 0 ? "even" : ""}">
        <td>${esc(p.remnantNo)}</td><td>${esc(p.vessel || "-")}</td><td>${esc(p.material)}</td><td>${esc(shapeText(p))}</td>
        <td class="num">${fmtT(p.thickness)}</td><td class="num">${p.width1 ? fmtL(p.width1) : "-"}</td>
        <td class="num">${p.length1 ? fmtL(p.length1) : "-"}</td><td class="num">${p.weightCalc.toFixed(1)}</td>
        <td>${esc(p.location ?? "-")}</td><td>${esc(p.heatNo ?? "-")}</td>
      </tr>`).join("");
    const totalWt = list.reduce((s, p) => s + p.weightCalc, 0).toFixed(1);
    win.document.write(`<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"/><title>선별지시서 (${esc(jobName)} · ${TYPE_LABEL[type]})</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:"Malgun Gothic",sans-serif;font-size:16pt;color:#111;padding:4mm}
h1{font-size:20pt;font-weight:bold;text-align:center;margin-bottom:2mm;letter-spacing:1px}.meta{text-align:center;font-size:10pt;color:#555;margin-bottom:2mm}
table{width:100%;border-collapse:collapse}th{background:#1e3a5f;color:#fff;padding:1px 2px;font-size:13pt;text-align:center;border:1px solid #888;white-space:nowrap}
td{padding:1px 2px;border:1px solid #aaa;text-align:center;font-size:16pt;white-space:nowrap}td.num{text-align:right;font-variant-numeric:tabular-nums}tr.even{background:#f5f8fc}
@media print{body{padding:3mm}@page{margin:6mm;size:A4 landscape}}</style></head><body>
<h1>선 별 지 시 서 (${esc(TYPE_LABEL[type])})</h1>
<p class="meta">${esc(jobName)} | 출력일시: ${new Date().toLocaleString("ko-KR")} | 총수량: ${list.length}장 | 총중량: ${totalWt}kg</p>
<table><thead><tr><th>잔재번호</th><th>출처</th><th>재질</th><th>형태</th><th>두께</th><th>폭</th><th>길이</th><th>중량(kg)</th><th>위치</th><th>판번호</th></tr></thead>
<tbody>${body}</tbody></table><script>window.onload=()=>{window.print()}<\/script></body></html>`);
    win.document.close();
  };

  const printAndMark = async () => {
    const ids = validSelectedIds;
    if (ids.length === 0) { alert("선별할 잔재를 선택하세요.\n(재고 상태이며 아직 선별/확정되지 않은 잔재만 가능)"); return; }
    if (!confirm(`선택 ${ids.length}건\n\n선별지시서를 출력하고 선택 잔재를 '${TYPE_LABEL[type]} 선별'로 확정하시겠습니까?\n(선별목록에 추가되어 카트→출고장으로 출고할 수 있습니다)`)) return;
    const selList = ids.map(id => selectableById.get(id)!);
    const win = window.open("", "_blank", "width=1100,height=750");
    setMarking(true);
    try {
      const r = await fetch("/api/remnants/shipout", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark", ids }),
      });
      const d = await r.json();
      if (!d.success) { win?.close(); alert(d.error ?? "선별 확정 실패"); return; }
      if (win) writeSheet(win, selList);
      setSelectedIds(new Set());
      if (typeof d.count === "number" && typeof d.requested === "number" && d.count < d.requested) {
        alert(`요청 ${d.requested}건 중 ${d.count}건만 선별 확정되었습니다.\n(나머지는 이미 선별/확정/소진되어 제외)`);
      } else {
        alert(`${d.count}건을 선별목록에 추가했습니다.\n선별 목록 탭 → 카트 → 출고장으로 출고하세요.`);
      }
      load();
      onChanged?.();
    } catch (e) { win?.close(); alert(e instanceof Error ? e.message : "네트워크 오류"); }
    finally { setMarking(false); }
  };

  return (
    <div>
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center gap-3 flex-wrap">
        <span className="text-sm font-semibold text-gray-800 flex-1 min-w-[160px]">{TYPE_LABEL[type]} 매칭 <span className="text-xs text-gray-400 font-normal">{displayRows.length}건 · 사양(호선무관)</span></span>
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="잔재번호·재질·판번호·위치 검색"
            className="pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg w-56 focus:outline-none focus:ring-2 focus:ring-amber-400" />
        </div>
        <button onClick={printAndMark} disabled={marking || validSelectedIds.length === 0}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-40">
          <Printer size={14} /> 선별지시서 출력{validSelectedIds.length ? ` (${validSelectedIds.length})` : ""}
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs whitespace-nowrap">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-2 py-2 w-9 text-center">
                <input type="checkbox" checked={allVisibleSelected} onChange={toggleAll} disabled={selectableVisibleIds.length === 0}
                  title="화면의 재고 잔재 전체선택" className="align-middle accent-amber-600 disabled:opacity-30" />
              </th>
              {COLUMNS.map(({ key, label, align }) => {
                const active = (colFilters[key]?.length ?? 0) > 0 || !!predicates[key];
                const isSort = sortKey === key;
                return (
                  <th key={key} className={`px-3 py-2 font-medium text-gray-600 ${align === "right" ? "text-right" : "text-left"}`}>
                    <button onClick={e => openFilter(key, e.currentTarget)} className={`inline-flex items-center gap-1 ${align === "right" ? "ml-auto" : ""} hover:text-gray-800`}>
                      {label}
                      <Filter size={10} className={active || isSort ? "text-amber-500" : "text-gray-300"} fill={active ? "currentColor" : "none"} />
                      {isSort && <span className="text-amber-500 text-[9px]">{sortDir === "asc" ? "▲" : "▼"}</span>}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={13} className="py-8 text-center text-gray-400">매칭 중...</td></tr>
            ) : displayRows.length === 0 ? (
              <tr><td colSpan={13} className="py-8 text-center text-gray-400">매칭 결과가 없습니다.</td></tr>
            ) : displayRows.map((r, i) => {
              const rem = r.remnant;
              const marked = !!rem?.shipoutMarkedAt;
              const shipped = rem?.status === "EXHAUSTED";
              const selectable = !!rem && rem.status === "IN_STOCK" && !marked && !rem.reservedFor;
              return (
                <tr key={rem?.id ?? `u-${i}`} className={`hover:bg-gray-50 ${!r.matched ? "bg-red-50/40" : shipped ? "bg-purple-50/40" : marked ? "bg-amber-50/40" : ""}`}>
                  <td className="px-2 py-1.5 text-center">
                    {selectable
                      ? <input type="checkbox" checked={selectedIds.has(rem!.id)} onChange={() => toggleOne(rem!.id)} className="align-middle accent-amber-600" />
                      : marked ? <span className="text-[10px] font-semibold text-amber-600">선별</span>
                        : shipped ? <span className="text-[10px] font-semibold text-purple-600">출고</span> : null}
                  </td>
                  <td className="px-3 py-1.5 font-medium">{rem?.vessel || (r.matched ? "-" : <span className="text-gray-400">(없음)</span>)}</td>
                  <td className="px-3 py-1.5 font-mono text-gray-500">{rem?.remnantNo ?? "-"}</td>
                  <td className="px-3 py-1.5">{r.spec.material}</td>
                  <td className="px-3 py-1.5">
                    {rem ? (
                      <span className="inline-flex items-center gap-1">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] ${rem.shape === "RECTANGLE" ? "bg-gray-100 text-gray-600" : "bg-amber-100 text-amber-700"}`}>{SHAPE_LABEL[rem.shape] ?? rem.shape}</span>
                        {rem.shape !== "RECTANGLE" && rem.width2 != null && rem.length2 != null && <span className="text-[10px] text-gray-400">절단 {fmtL(rem.width2)}×{fmtL(rem.length2)}</span>}
                      </span>
                    ) : <span className="text-gray-300">-</span>}
                  </td>
                  <td className="px-3 py-1.5 text-right">{fmtT(r.spec.thickness)}</td>
                  <td className="px-3 py-1.5 text-right">{fmtL(r.spec.width)}</td>
                  <td className="px-3 py-1.5 text-right">{fmtL(r.spec.length)}</td>
                  <td className="px-3 py-1.5 text-right">{rem ? rem.weightCalc.toLocaleString() : "-"}</td>
                  <td className="px-3 py-1.5">
                    {r.matched
                      ? <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-emerald-100 text-emerald-700">{STATUS_LABEL[rem!.status] ?? rem!.status}</span>
                      : <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-red-100 text-red-600">미매칭</span>}
                  </td>
                  <td className="px-3 py-1.5 text-gray-600">{rem?.location ?? "-"}</td>
                  <td className="px-3 py-1.5 font-mono">{rem?.heatNo ?? "-"}</td>
                  <td className="px-3 py-1.5">
                    {shipped ? <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-purple-100 text-purple-700">출고</span>
                      : marked ? <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-700">선별</span>
                        : rem?.reservedFor ? <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-700">{rem.reservedFor}</span>
                          : <span className="text-gray-300">-</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

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

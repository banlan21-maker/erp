"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import * as XLSX from "xlsx";
import { Upload, Download, Trash2, RefreshCw, X, FileSpreadsheet, Search, Eye, Filter } from "lucide-react";
import ColumnFilterDropdown from "@/components/column-filter-dropdown";
import { getAllCascadedOptions, getCascadedFilteredRowsWithPredicates, type ColumnAccessorMap, type TextPredicate } from "@/lib/cascading-filters";

/* ── 상태 정의 ─────────────────────────────────────────────────────────────── */
const STATUS_LIST = [
  { key: "REGISTERED",  label: "대기" },
  { key: "RECEIVED",    label: "입고" },
  { key: "ISSUED",      label: "투입" },
  { key: "COMPLETED",   label: "절단" },
  { key: "SHIPPED_OUT", label: "외부" },
] as const;
const STATUS_LABEL: Record<string, string> = Object.fromEntries(STATUS_LIST.map(s => [s.key, s.label]));
const STATUS_CLS: Record<string, string> = {
  REGISTERED:  "bg-gray-100 text-gray-700",
  RECEIVED:    "bg-green-100 text-green-700",
  ISSUED:      "bg-cyan-100 text-cyan-700",
  COMPLETED:   "bg-blue-100 text-blue-700",
  SHIPPED_OUT: "bg-purple-100 text-purple-700",
};
const ALL_KEYS = STATUS_LIST.map(s => s.key);

const fmtT = (v: number) => parseFloat(v.toFixed(1));
const fmtL = (v: number) => Math.round(v);
const fmtYMD = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return `${String(d.getFullYear()).slice(2)}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
};
const fmtDateTime = (iso: string) => new Date(iso).toLocaleString("ko-KR", { year: "2-digit", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });

interface Job     { id: string; name: string; author: string | null; statuses: string; specCount: number; createdAt: string }
interface Spec    { vesselCode: string; material: string; thickness: number; width: number; length: number }
interface PlanRow { id: string; vesselCode: string; material: string; thickness: number; width: number; length: number; status: string; uploadBatchNo: string | null; receivedAt: string | null; storageLocation: string | null; reservedFor: string | null }
interface MatchRow { matched: boolean; spec: Spec; plan: PlanRow | null }

// 매칭 결과 테이블 컬럼 (필터·정렬 대상)
const COLUMNS: { key: string; label: string; align: "left" | "right" }[] = [
  { key: "vessel",        label: "호선",       align: "left"  },
  { key: "material",      label: "재질",       align: "left"  },
  { key: "thickness",     label: "두께",       align: "right" },
  { key: "width",         label: "폭",         align: "right" },
  { key: "length",        label: "길이",       align: "right" },
  { key: "status",        label: "상태",       align: "left"  },
  { key: "uploadBatchNo", label: "업로드번호", align: "left"  },
  { key: "receivedAt",    label: "입고일",     align: "left"  },
  { key: "location",      label: "위치",       align: "left"  },
  { key: "reservedFor",   label: "확정정보",   align: "left"  },
];

const statusesLabel  = (s: string) => (!s || s === "ALL") ? "전체" : s.split(",").map(k => STATUS_LABEL[k] ?? k).join("·");
const parseStatuses  = (s: string): Set<string> => (!s || s === "ALL") ? new Set(ALL_KEYS) : new Set(s.split(",").filter(Boolean));
const statusesToParam = (set: Set<string>): string => set.size === ALL_KEYS.length ? "ALL" : ALL_KEYS.filter(k => set.has(k)).join(",");

/* ── 매칭 대상 상태 선택 (전체 + 5개, 1개 이상) ──────────────────────────── */
function StatusPicker({ selected, onChange }: { selected: Set<string>; onChange: (s: Set<string>) => void }) {
  const allOn = selected.size === ALL_KEYS.length;
  const chip = (on: boolean) => `px-2.5 py-1 text-xs rounded-full border ${on ? "bg-blue-600 border-blue-600 text-white" : "border-gray-300 text-gray-500 hover:bg-gray-50"}`;
  const toggle = (key: string) => {
    const n = new Set(selected);
    if (n.has(key)) n.delete(key); else n.add(key);
    if (n.size === 0) return;   // 최소 1개 유지
    onChange(n);
  };
  return (
    <div className="flex gap-1.5 flex-wrap">
      <button type="button" onClick={() => onChange(new Set(ALL_KEYS))} className={chip(allOn)}>전체</button>
      {STATUS_LIST.map(s => (
        <button type="button" key={s.key} onClick={() => toggle(s.key)} className={chip(selected.has(s.key))}>{s.label}</button>
      ))}
    </div>
  );
}

/* ── 엑셀 파싱 (호선·재질·두께·폭·길이, 호선 빈칸 허용) ──────────────────────── */
function parseSpecs(raw: unknown[][]): Spec[] {
  let headerRow = 0;
  for (let i = 0; i < Math.min(10, raw.length); i++) {
    const joined = (raw[i] as string[]).join(" ");
    if (/재질|두께|폭|길이|material|thickness/i.test(joined)) { headerRow = i; break; }
  }
  const headers = (raw[headerRow] as string[]).map(h => String(h).trim().toLowerCase());
  const colIdx = (keys: string[]) => headers.findIndex(h => keys.some(k => h.includes(k)));
  const iVessel    = colIdx(["호선", "vessel"]);
  const iMaterial  = colIdx(["재질", "material"]);
  const iThickness = colIdx(["두께", "thickness", "t."]);
  const iWidth     = colIdx(["폭", "width", "w."]);
  const iLength    = colIdx(["길이", "length", "l."]);

  const specs: Spec[] = [];
  for (let i = headerRow + 1; i < raw.length; i++) {
    const r = raw[i] as (string | number)[];
    const material  = iMaterial  >= 0 ? String(r[iMaterial] ?? "").trim() : "";
    const thickness = iThickness >= 0 ? Number(r[iThickness]) : 0;
    const width     = iWidth     >= 0 ? Number(r[iWidth])     : 0;
    const length    = iLength    >= 0 ? Number(r[iLength])    : 0;
    if (!material || !thickness || !width || !length) continue;
    specs.push({
      vesselCode: iVessel >= 0 ? String(r[iVessel] ?? "").trim() : "",   // 빈칸이면 "" → 호선 제외 매칭
      material, thickness: fmtT(thickness), width: fmtL(width), length: fmtL(length),
    });
  }
  return specs;
}

export default function SteelMatchTab() {
  const [jobs, setJobs]           = useState<Job[]>([]);
  const [loading, setLoading]     = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);

  const [selJobId, setSelJobId]   = useState<string | null>(null);
  const [selJobName, setSelJobName] = useState("");
  const [rows, setRows]           = useState<MatchRow[]>([]);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [selJobStatuses, setSelJobStatuses] = useState<string>("ALL");   // 열린 작업의 저장된 대상상태
  const [search, setSearch]       = useState("");
  const [editJob, setEditJob]     = useState<Job | null>(null);

  // 컬럼 필터·정렬 (표준 cascading 패턴)
  const [colFilters, setColFilters] = useState<Record<string, string[]>>({});
  const [predicates, setPredicates] = useState<Record<string, TextPredicate | undefined>>({});
  const [sortKey, setSortKey]     = useState<string | null>(null);
  const [sortDir, setSortDir]     = useState<"asc" | "desc">("asc");
  const [openCol, setOpenCol]     = useState<string | null>(null);
  const [anchorEl, setAnchorEl]   = useState<HTMLElement | null>(null);

  const loadJobs = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/steel-match");
      const d = await r.json();
      if (d.success) setJobs(d.data);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { loadJobs(); }, [loadJobs]);

  const loadMatches = useCallback(async (jobId: string) => {
    setRowsLoading(true);
    try {
      // 저장된 대상상태로 매칭 (?statuses override 미사용)
      const r = await fetch(`/api/steel-match/${jobId}`);
      const d = await r.json();
      if (d.success) { setRows(d.data.rows); setSelJobName(d.data.job.name); setSelJobStatuses(d.data.job.statuses); }
      else { alert(d.error ?? "조회 실패"); setRows([]); }
    } finally { setRowsLoading(false); }
  }, []);

  const openJobFresh = useCallback((jobId: string) => {
    setSelJobId(jobId);
    setSearch("");
    setColFilters({}); setPredicates({}); setSortKey(null); setOpenCol(null); setAnchorEl(null);
    loadMatches(jobId);
  }, [loadMatches]);

  // 보기/닫기 토글 — 이미 열린 작업을 다시 누르면 닫힘
  const toggleJob = (jobId: string) => {
    if (selJobId === jobId) { setSelJobId(null); setRows([]); setOpenCol(null); setAnchorEl(null); return; }
    openJobFresh(jobId);
  };

  const deleteJob = async (jobId: string, name: string) => {
    if (!confirm(`매칭 작업 '${name}'을(를) 삭제하시겠습니까?`)) return;
    const r = await fetch(`/api/steel-match/${jobId}`, { method: "DELETE" });
    if (r.ok) {
      if (selJobId === jobId) { setSelJobId(null); setRows([]); }
      loadJobs();
    } else alert("삭제 실패");
  };

  // 대상상태가 전체가 아니면 '미매칭'은 '대상상태 범위에 없음'을 의미 — 라벨로 명확화
  const unmatchedLabel = (!selJobStatuses || selJobStatuses === "ALL") ? "미매칭" : "미매칭(대상상태)";

  // 컬럼별 값 추출 (필터·정렬·드롭다운 옵션 공통) — 표시값 기준
  const accessors = useMemo<ColumnAccessorMap<MatchRow>>(() => ({
    vessel:        r => r.matched ? r.plan!.vesselCode : (r.spec.vesselCode || "(전체)"),
    material:      r => r.spec.material,
    thickness:     r => fmtT(r.spec.thickness),
    width:         r => fmtL(r.spec.width),
    length:        r => fmtL(r.spec.length),
    status:        r => r.matched ? (STATUS_LABEL[r.plan!.status] ?? r.plan!.status) : unmatchedLabel,
    uploadBatchNo: r => r.plan?.uploadBatchNo ?? "",
    receivedAt:    r => r.plan?.receivedAt ? fmtYMD(r.plan.receivedAt) : "",
    location:      r => r.plan?.storageLocation ?? "",
    reservedFor:   r => r.plan?.reservedFor ?? "",
  }), [unmatchedLabel]);

  // 컬럼 드롭다운 옵션 (cascading)
  const distinctValues = useMemo(
    () => getAllCascadedOptions(rows, colFilters, accessors),
    [rows, colFilters, accessors],
  );

  // 표 본문: 컬럼필터+텍스트조건 → 검색 → 정렬
  const displayRows = useMemo(() => {
    let r = getCascadedFilteredRowsWithPredicates(rows, colFilters, predicates, accessors);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      r = r.filter(row => {
        const hay = `${row.plan?.vesselCode ?? row.spec.vesselCode} ${row.spec.material} ${row.plan?.uploadBatchNo ?? ""} ${row.plan?.reservedFor ?? ""} ${row.plan?.storageLocation ?? ""}`.toLowerCase();
        return hay.includes(q);
      });
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

  const summary = (() => {
    const counts: Record<string, number> = {};
    let unmatched = 0;
    for (const r of displayRows) {
      if (r.matched && r.plan) counts[r.plan.status] = (counts[r.plan.status] ?? 0) + 1;
      else unmatched++;
    }
    return { counts, unmatched };
  })();

  const openFilter = (key: string, el: HTMLElement) => {
    if (openCol === key) { setOpenCol(null); setAnchorEl(null); }
    else { setOpenCol(key); setAnchorEl(el); }
  };

  const downloadExcel = () => {
    if (displayRows.length === 0) { alert("다운로드할 데이터가 없습니다."); return; }
    const wsRows = displayRows.map(r => ({
      "호선":       r.matched ? r.plan!.vesselCode : (r.spec.vesselCode || "(전체)"),
      "재질":       r.spec.material,
      "두께":       fmtT(r.spec.thickness),
      "폭":         fmtL(r.spec.width),
      "길이":       fmtL(r.spec.length),
      "상태":       r.matched ? (STATUS_LABEL[r.plan!.status] ?? r.plan!.status) : unmatchedLabel,
      "업로드번호": r.plan?.uploadBatchNo ?? "",
      "입고일":     fmtYMD(r.plan?.receivedAt ?? null),
      "위치":       r.plan?.storageLocation ?? "",
      "확정정보":   r.plan?.reservedFor ?? "",
    }));
    const ws = XLSX.utils.json_to_sheet(wsRows);
    ws["!cols"] = [{ wch: 12 },{ wch: 8 },{ wch: 6 },{ wch: 7 },{ wch: 7 },{ wch: 8 },{ wch: 14 },{ wch: 10 },{ wch: 14 },{ wch: 16 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "강재매칭");
    const today = new Date().toISOString().split("T")[0];
    const safe = (selJobName || "강재매칭").replace(/[\\/?*[\]:]/g, "_").slice(0, 40);
    XLSX.writeFile(wb, `강재매칭_${safe}_${today}.xlsx`);
  };

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-700">강재매칭 작업</h3>
          <p className="text-xs text-gray-500 mt-0.5">엑셀 사양 목록을 강재전체목록과 매칭해 저장 — 새로고침 시 현재 상태로 다시 매칭됩니다.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadJobs} className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
            <RefreshCw size={14} /> 새로고침
          </button>
          <button onClick={() => setUploadOpen(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            <Upload size={14} /> 엑셀 업로드 매칭
          </button>
        </div>
      </div>

      {/* 매칭 작업 목록 */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-xs table-fixed">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-gray-600 w-1/6">매칭 이름</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600 w-1/6">작성자</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600 w-1/6">업로드일시</th>
              <th className="px-3 py-2 text-right font-medium text-gray-600 w-1/6">사양수</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600 w-1/6">대상상태</th>
              <th className="px-3 py-2 text-center font-medium text-gray-600 w-1/6">작업</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={6} className="py-8 text-center text-gray-400">불러오는 중...</td></tr>
            ) : jobs.length === 0 ? (
              <tr><td colSpan={6} className="py-8 text-center text-gray-400">저장된 매칭 작업이 없습니다. [엑셀 업로드 매칭]으로 시작하세요.</td></tr>
            ) : jobs.map(j => {
              const open = selJobId === j.id;
              return (
              <tr key={j.id} className={`hover:bg-blue-50/40 ${open ? "bg-blue-50" : ""}`}>
                <td className="px-3 py-2 font-medium text-gray-800 truncate" title={j.name}>{j.name}</td>
                <td className="px-3 py-2 text-gray-600 truncate" title={j.author ?? ""}>{j.author || "-"}</td>
                <td className="px-3 py-2 text-gray-500 truncate">{fmtDateTime(j.createdAt)}</td>
                <td className="px-3 py-2 text-right text-gray-600">{j.specCount}</td>
                <td className="px-3 py-2 text-gray-500 truncate" title={statusesLabel(j.statuses)}>{statusesLabel(j.statuses)}</td>
                <td className="px-3 py-2 text-center">
                  <div className="flex items-center justify-center gap-1">
                    <button onClick={() => toggleJob(j.id)} className={`inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded ${open ? "bg-gray-600 text-white hover:bg-gray-700" : "bg-blue-600 text-white hover:bg-blue-700"}`}>
                      <Eye size={11} /> {open ? "닫기" : "보기"}
                    </button>
                    <button onClick={() => setEditJob(j)} className="inline-flex items-center gap-1 px-2 py-1 text-[11px] border border-gray-300 text-gray-600 rounded hover:bg-gray-50">수정</button>
                    <button onClick={() => deleteJob(j.id, j.name)} className="inline-flex items-center gap-1 px-2 py-1 text-[11px] border border-red-300 text-red-600 rounded hover:bg-red-50"><Trash2 size={11} /></button>
                  </div>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 매칭 결과 */}
      {selJobId && (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 flex-1 min-w-[200px]">
              <FileSpreadsheet size={15} className="text-blue-600" />
              <span className="text-sm font-semibold text-gray-800">{selJobName}</span>
              <span className="text-xs text-gray-400">매칭 {displayRows.length}건</span>
            </div>
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="호선·재질·업로드번호 검색"
                className="pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg w-56 focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
            <button onClick={downloadExcel} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700">
              <Download size={14} /> 엑셀 다운로드
            </button>
          </div>

          {/* 대상상태 (저장된 매칭 조건 — 수정은 작업 목록의 [수정]) */}
          <div className="px-4 py-2.5 border-b border-gray-200 flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-500 font-medium">대상상태:</span>
            {(!selJobStatuses || selJobStatuses === "ALL" ? ALL_KEYS : selJobStatuses.split(",").filter(Boolean)).map(k => (
              <span key={k} className="px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-700">
                {STATUS_LABEL[k] ?? k}{summary.counts[k] ? ` ${summary.counts[k]}` : ""}
              </span>
            ))}
            {summary.unmatched > 0 && <span className="text-xs text-red-500 ml-1">미매칭 {summary.unmatched}건</span>}
            <button onClick={() => { const j = jobs.find(x => x.id === selJobId); if (j) setEditJob(j); }}
              className="ml-auto text-xs px-2 py-1 border border-gray-300 text-gray-600 rounded hover:bg-gray-50">대상상태 수정</button>
          </div>

          {/* 결과 테이블 */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs whitespace-nowrap">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {COLUMNS.map(({ key, label, align }) => {
                    const active = (colFilters[key]?.length ?? 0) > 0 || !!predicates[key];
                    const isSort = sortKey === key;
                    return (
                      <th key={key} className={`px-3 py-2 font-medium text-gray-600 ${align === "right" ? "text-right" : "text-left"}`}>
                        <button onClick={e => openFilter(key, e.currentTarget)}
                          className={`inline-flex items-center gap-1 ${align === "right" ? "ml-auto" : ""} hover:text-gray-800`}>
                          {label}
                          <Filter size={10} className={active || isSort ? "text-blue-500" : "text-gray-300"} fill={active ? "currentColor" : "none"} />
                          {isSort && <span className="text-blue-500 text-[9px]">{sortDir === "asc" ? "▲" : "▼"}</span>}
                        </button>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rowsLoading ? (
                  <tr><td colSpan={10} className="py-8 text-center text-gray-400">매칭 중...</td></tr>
                ) : displayRows.length === 0 ? (
                  <tr><td colSpan={10} className="py-8 text-center text-gray-400">매칭 결과가 없습니다.</td></tr>
                ) : displayRows.map((r, i) => (
                  <tr key={i} className={`hover:bg-gray-50 ${!r.matched ? "bg-red-50/40" : ""}`}>
                    <td className="px-3 py-1.5 font-medium">{r.matched ? r.plan!.vesselCode : (r.spec.vesselCode || <span className="text-gray-400">(전체)</span>)}</td>
                    <td className="px-3 py-1.5">{r.spec.material}</td>
                    <td className="px-3 py-1.5 text-right">{fmtT(r.spec.thickness)}</td>
                    <td className="px-3 py-1.5 text-right">{fmtL(r.spec.width)}</td>
                    <td className="px-3 py-1.5 text-right">{fmtL(r.spec.length)}</td>
                    <td className="px-3 py-1.5">
                      {r.matched
                        ? <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${STATUS_CLS[r.plan!.status] ?? "bg-gray-100 text-gray-600"}`}>{STATUS_LABEL[r.plan!.status] ?? r.plan!.status}</span>
                        : <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-red-100 text-red-600">{unmatchedLabel}</span>}
                    </td>
                    <td className="px-3 py-1.5 font-mono text-[10px] text-gray-400">{r.plan?.uploadBatchNo ?? "-"}</td>
                    <td className="px-3 py-1.5 text-gray-500 font-mono">{r.plan?.receivedAt ? fmtYMD(r.plan.receivedAt) : "-"}</td>
                    <td className="px-3 py-1.5 text-gray-600">{r.plan?.storageLocation ?? "-"}</td>
                    <td className="px-3 py-1.5 text-purple-700">{r.plan?.reservedFor ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

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

      {uploadOpen && (
        <UploadMatchModal
          onClose={() => setUploadOpen(false)}
          onCreated={(id) => { setUploadOpen(false); loadJobs(); openJobFresh(id); }}
        />
      )}

      {editJob && (
        <EditStatusModal
          job={editJob}
          onClose={() => setEditJob(null)}
          onSaved={() => { const id = editJob.id; setEditJob(null); loadJobs(); if (selJobId === id) loadMatches(id); }}
        />
      )}
    </div>
  );
}

/* ── 대상상태 수정 ─────────────────────────────────────────────────────────── */
function EditStatusModal({ job, onClose, onSaved }: { job: Job; onClose: () => void; onSaved: () => void }) {
  const [statuses, setStatuses] = useState<Set<string>>(parseStatuses(job.statuses));
  const [loading, setLoading]   = useState(false);

  const save = async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/steel-match/${job.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statuses: statusesToParam(statuses) }),
      });
      const d = await r.json();
      if (!d.success) { alert(d.error ?? "수정 실패"); return; }
      onSaved();
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
          <h3 className="font-bold text-base text-gray-900">매칭 대상 상태 수정</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full"><X size={16} /></button>
        </div>
        <div className="p-5 space-y-3">
          <div className="text-sm text-gray-700"><strong>{job.name}</strong></div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">매칭 대상 상태 <span className="text-gray-400 font-normal">(1개 이상)</span></label>
            <StatusPicker selected={statuses} onChange={setStatuses} />
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <button onClick={onClose} className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50">취소</button>
            <button onClick={save} disabled={loading} className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-40">
              {loading ? "저장 중..." : "저장"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── 업로드 → 사양 확인 → 이름·상태 입력 → 생성 ───────────────────────────── */
function UploadMatchModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [step, setStep]       = useState<"upload" | "confirm">("upload");
  const [specs, setSpecs]     = useState<Spec[]>([]);
  const [name, setName]       = useState("");
  const [author, setAuthor]   = useState("");
  const [statuses, setStatuses] = useState<Set<string>>(new Set(ALL_KEYS));
  const [loading, setLoading] = useState(false);

  const handleFile = async (file: File) => {
    setLoading(true);
    try {
      const buf = await file.arrayBuffer();
      const wb  = XLSX.read(buf);
      const ws  = wb.Sheets[wb.SheetNames[0]];
      const raw = (XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as unknown) as unknown[][];
      const parsed = parseSpecs(raw);
      if (parsed.length === 0) {
        alert("유효한 사양 행을 찾지 못했습니다.\n헤더(호선·재질·두께·폭·길이)가 있어야 하며, 재질·두께·폭·길이는 필수입니다.");
        return;
      }
      setSpecs(parsed);
      setName(file.name.replace(/\.(xlsx|xls)$/i, ""));
      setStep("confirm");
    } catch (e) {
      alert(e instanceof Error ? e.message : "파일 처리 실패");
    } finally { setLoading(false); }
  };

  const create = async () => {
    if (!name.trim()) { alert("매칭 이름을 입력하세요. (예: 4506호선 입고자재 매칭작업)"); return; }
    if (!author.trim()) { alert("작성자를 입력하세요."); return; }
    setLoading(true);
    try {
      const r = await fetch("/api/steel-match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), author: author.trim() || null, statuses: statusesToParam(statuses), specs }),
      });
      const d = await r.json();
      if (!d.success) { alert(d.error ?? "생성 실패"); return; }
      onCreated(d.data.id);
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
        <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
          <h3 className="font-bold text-base text-gray-900 flex items-center gap-2"><Upload size={16} className="text-blue-600" /> 강재매칭 — 엑셀 업로드</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full"><X size={16} /></button>
        </div>

        {step === "upload" && (
          <div className="p-5 space-y-3">
            <div className="text-sm text-gray-700 leading-relaxed">
              양식: <strong>호선 · 재질 · 두께 · 폭 · 길이</strong> 컬럼이 헤더 1행에 있는 엑셀.<br />
              <span className="text-gray-500 text-xs">호선이 비어 있으면 호선을 제외하고 나머지 사양으로 매칭합니다.</span>
            </div>
            <label className={`block border-2 border-dashed rounded-xl p-8 text-center cursor-pointer ${loading ? "border-gray-300 bg-gray-50" : "border-blue-300 hover:bg-blue-50/50"}`}>
              <Upload size={24} className="mx-auto mb-2 text-blue-500" />
              <div className="text-sm font-semibold text-gray-700">{loading ? "처리 중…" : "엑셀 파일 선택 또는 드래그"}</div>
              <input type="file" accept=".xlsx,.xls" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            </label>
          </div>
        )}

        {step === "confirm" && (
          <div className="p-5 space-y-4 overflow-y-auto">
            <div className="text-sm bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-blue-700">
              사양 <strong>{specs.length}건</strong> 인식됨. 매칭 이름과 기본 대상 상태를 설정하세요.
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">매칭 이름 <span className="text-red-500">*</span></label>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="예: 4506호선 입고자재 매칭작업"
                  className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" autoFocus />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">작성자 <span className="text-red-500">*</span></label>
                <input value={author} onChange={e => setAuthor(e.target.value)} placeholder="이름"
                  className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">매칭 대상 상태 <span className="text-gray-400 font-normal">(1개 이상)</span></label>
              <StatusPicker selected={statuses} onChange={setStatuses} />
              <p className="text-[11px] text-gray-400 mt-1">선택한 상태의 강재전체목록 자재와만 매칭합니다. 매칭값이 없으면 &apos;미매칭&apos;으로 표시됩니다.</p>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-gray-100">
              <button onClick={() => setStep("upload")} className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50">← 다시 업로드</button>
              <button onClick={create} disabled={loading} className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-40">
                {loading ? "생성 중..." : "매칭 작업 생성"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

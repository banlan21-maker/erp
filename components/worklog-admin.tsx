"use client";

import { useState, useEffect, useMemo } from "react";
import {
  ClipboardList, RefreshCw, Plus, Edit2, Trash2,
  AlertCircle, X, Save, Zap, Filter, XCircle, Search, Download,
} from "lucide-react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import ColumnFilterDropdown, { type FilterValue } from "@/components/column-filter-dropdown";
import { calcPauseMs as libCalcPauseMs, calcTotalMs as libCalcTotalMs } from "@/lib/cutting-time";
import {
  getCascadedFilteredRowsWithPredicates, getAllCascadedOptions, type TextPredicate,
  type ColumnAccessorMap, type ColFilters,
} from "@/lib/cascading-filters";
import { ArrowUp, ArrowDown, Filter as FilterIcon } from "lucide-react";

// ─── 타입 ──────────────────────────────────────────────────────────────────

interface Equipment { id: string; name: string; type: string }
interface Project   { id: string; projectCode: string; projectName: string }
interface Worker    { id: string; name: string }

interface Drawing {
  id: string;
  projectId: string;
  project: { id: string; projectCode: string; projectName: string } | null;
  block: string | null;
  drawingNo: string | null;
  alternateVesselCode: string | null;
  heatNo: string | null;
  material: string;
  thickness: number;
  width: number;
  length: number;
  qty: number;
  useWeight: number | null;
  status: string;
  assignedRemnant: { width1: number | null; length1: number | null; width2: number | null; length2: number | null } | null;
}

interface CuttingPause {
  reason: string; reasonText: string | null;
  pausedAt: string; resumedAt: string | null;
}
interface CuttingLog {
  id: string;
  drawingListId: string | null;
  equipmentId: string;
  isUrgent: boolean;
  equipment: { id: string; name: string; type: string };
  project: { projectCode: string; projectName: string } | null;
  drawingList: { drawingNo: string | null; block: string | null; useWeight: number | null } | null;
  urgentWork: {
    urgentNo: string;
    title: string;
    requester: string | null;
    department: string | null;
    remnant: { remnantNo: string; width1: number | null; length1: number | null; width2: number | null; length2: number | null } | null;
  } | null;
  heatNo: string;
  material: string | null;
  thickness: number | null;
  width: number | null;
  length: number | null;
  qty: number | null;
  drawingNo: string | null;
  operator: string;
  status: "STARTED" | "PAUSED" | "COMPLETED";
  startAt: string;
  endAt: string | null;
  memo: string | null;
  pauses?: CuttingPause[];
}

// ── 치수 헬퍼 ─────────────────────────────────────────────────────────────
function calcSteelWeight(t: number, w1: number, l1: number, w2?: number | null, l2?: number | null): number {
  const area = w1 * l1 - (w2 ?? 0) * (l2 ?? 0);
  return Math.round(t * area * 7.85 / 1_000_000 * 10) / 10;
}

// ── 장비명 간소화 ─────────────────────────────────────────────────────────
function eqShort(name: string): string {
  const p = name.match(/플라즈마\s*(\d+)호기/);
  if (p) return `P${p[1]}`;
  const g = name.match(/가스\s*절단기\s*(\d+)호기/);
  if (g) return `G${g[1]}`;
  return name;
}

// ── 시간 헬퍼 ─────────────────────────────────────────────────────────────
// 일반 중단(퇴근/야간이월 제외) — lib/cutting-time.ts 위임
function calcPauseMs(pauses?: CuttingPause[]): number {
  return libCalcPauseMs(pauses);
}
function fmtHM(ms: number): string {
  if (ms <= 0) return "-";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;   // HH:MM
}
function fmtPauseMin(ms: number): string {
  if (ms <= 0) return "-";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;   // HH:MM
}
function fmtDate(iso: string): string {
  const d = new Date(iso);
  const yy = String(d.getFullYear()).slice(2);
  return `${yy}.${String(d.getMonth()+1).padStart(2,"0")}.${String(d.getDate()).padStart(2,"0")}`;   // YY.MM.DD
}

// ─── 컬럼 정의 (순서 = 테이블 표시 순서) ─────────────────────────────────

const COLUMNS = [
  { key: "status",     label: "상태",     align: "center" as const, filterable: true  },
  { key: "hosin",      label: "호선",     align: "left"  as const, filterable: true  },
  { key: "block",      label: "블록",     align: "left"  as const, filterable: true  },
  { key: "drawingNo",  label: "도면번호",  align: "left"  as const, filterable: true  },
  { key: "material",   label: "재질",     align: "left"  as const, filterable: true  },
  { key: "thickness",  label: "두께",     align: "right" as const, filterable: true  },
  { key: "width1",     label: "폭1",      align: "right" as const, filterable: true  },
  { key: "width2",     label: "폭2",      align: "right" as const, filterable: true  },
  { key: "length1",    label: "길이1",    align: "right" as const, filterable: true  },
  { key: "length2",    label: "길이2",    align: "right" as const, filterable: true  },
  { key: "steelWeight",label: "철판중량",  align: "right" as const, filterable: true  },
  { key: "useWeight",  label: "사용중량",  align: "right" as const, filterable: true  },
  { key: "heatNo",     label: "Heat NO", align: "left"  as const, filterable: true  },
  { key: "operator",   label: "작업자",   align: "left"  as const, filterable: true  },
  { key: "equipment",  label: "장비",     align: "left"  as const, filterable: true  },
  { key: "workDate",   label: "작업일",   align: "left"  as const, filterable: true  },
  { key: "totalTime",  label: "총가동시간", align: "left"  as const, filterable: true  },
  { key: "pauseTime",  label: "중단시간",  align: "left"  as const, filterable: true  },
  { key: "activeTime", label: "실가동시간", align: "left"  as const, filterable: true  },
  { key: "memo",       label: "비고",     align: "left"  as const, filterable: true  },
] as const;
type ColKey = (typeof COLUMNS)[number]["key"];
const FILTER_COLS = COLUMNS.filter(c => c.filterable);
type FCKey = (typeof FILTER_COLS)[number]["key"];

// ─── 헬퍼 ──────────────────────────────────────────────────────────────────

const TYPE_LABEL:   Record<string, string> = { PLASMA: "플라즈마", GAS: "가스" };

function fmtDt(iso: string) {
  const d = new Date(iso);
  return `${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}
function fmtDuration(start: string, end: string | null) {
  if (!end) return "-";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}시간 ${m}분` : `${m}분`;
}
function toLocalDatetimeValue(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ─── 돌발 작업일보 탭 ────────────────────────────────────────────────────────

// UrgentWork 한 행 (cuttingLogs 매칭 포함) — UrgentWorkTab 전용 타입
interface UrgentWorkRow {
  id: string;
  urgentNo: string;
  title: string;
  urgency: string;
  requester: string | null;
  department: string | null;
  vesselName: string | null;
  useWeight: number | null;
  status: string;
  createdAt: string;
  project: { id: string; projectCode: string; projectName: string } | null;
  remnant: {
    id: string; remnantNo: string; material: string; thickness: number;
    weight: number;
    width1: number | null; length1: number | null;
    width2: number | null; length2: number | null;
  } | null;
  cuttingLogs: CuttingLog[];
}

// 돌발 탭 컬럼 메타 — Project.MD § 9 표준 (헤더 11px / 본문 12px / py-1)
const URGENT_COLS = [
  { key: "status",       label: "상태",          align: "center" as const, filterable: true  },
  { key: "urgentNo",     label: "돌발번호",      align: "left"   as const, filterable: true  },
  { key: "title",        label: "작업명",        align: "left"   as const, filterable: true  },
  { key: "requester",    label: "요청자",        align: "left"   as const, filterable: true  },
  { key: "department",   label: "요청부서",      align: "left"   as const, filterable: true  },
  { key: "vessel",       label: "연관호선/블록", align: "left"   as const, filterable: true  },
  { key: "remnantNo",    label: "사용잔재번호",  align: "left"   as const, filterable: true  },
  { key: "material",     label: "재질",          align: "left"   as const, filterable: true  },
  { key: "thickness",    label: "두께",          align: "right"  as const, filterable: true  },
  { key: "width1",       label: "폭1",           align: "right"  as const, filterable: true  },
  { key: "width2",       label: "폭2",           align: "right"  as const, filterable: true  },
  { key: "length1",      label: "길이1",         align: "right"  as const, filterable: true  },
  { key: "length2",      label: "길이2",         align: "right"  as const, filterable: true  },
  { key: "steelWeight",  label: "중량(kg)",      align: "right"  as const, filterable: true  },
  { key: "useWeight",    label: "사용중량(kg)",  align: "right"  as const, filterable: true  },
  { key: "workDate",     label: "작업일",        align: "left"   as const, filterable: true  },
  { key: "totalTime",    label: "총가동시간",    align: "left"   as const, filterable: false },
  { key: "pauseTime",    label: "중단시간",      align: "left"   as const, filterable: false },
  { key: "activeTime",   label: "실가동시간",    align: "left"   as const, filterable: false },
] as const;
type URGENT_KEY = (typeof URGENT_COLS)[number]["key"];

// 정규화된 한 행 — accessor/렌더 둘 다 같은 객체 사용 (중복 계산 방지)
interface UrgentDisplayRow {
  w: UrgentWorkRow;
  log: CuttingLog | null;
  statusLabel: string;
  statusCls:   string;
  material:    string;
  thickness:   number | null;
  w1: number | null; l1: number | null; w2: number | null; l2: number | null;
  steelWeight: number | null;
  useWeight:   number | null;
  workDateStr: string;
  totalMs:     number;
  pauseMs:     number;
  activeMs:    number;
}

function UrgentWorkTab({ equipment, workers }: { equipment: Equipment[]; workers: Worker[] }) {
  const [works,    setWorks]    = useState<UrgentWorkRow[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [queried,  setQueried]  = useState(false); // 검색-우선: 진입 시 자동로드 없음
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo,   setDateTo]   = useState("");
  const [editLog,  setEditLog]  = useState<CuttingLog | null>(null);

  // 컬럼 필터 + 텍스트 조건 + 정렬 + 드롭다운 위치 (엑셀스타일 통합)
  const [colFilters, setColFilters] = useState<ColFilters>({});
  const [predicates, setPredicates] = useState<Record<string, TextPredicate>>({});
  const [openCol,    setOpenCol]    = useState<URGENT_KEY | null>(null);
  const [anchorEl,   setAnchorEl]   = useState<HTMLElement | null>(null);
  const [sortKey,    setSortKey]    = useState<URGENT_KEY | null>(null);
  const [sortDir,    setSortDir]    = useState<"asc" | "desc">("asc");

  const fetchData = async () => {
    setLoading(true);
    try {
      const res  = await fetch("/api/urgent-works");
      const data = await res.json();
      if (data.success) setWorks(data.data as UrgentWorkRow[]);
      setQueried(true);
    } finally { setLoading(false); }
  };
  // 진입 시 자동로드 없음 — [조회] 눌러야 표시

  const handleDeleteLog = async (id: string) => {
    if (!confirm("이 돌발 작업로그를 삭제할까요? (돌발 등록은 유지)")) return;
    await fetch(`/api/cutting-logs/${id}`, { method: "DELETE" });
    fetchData();
  };
  const handleDeleteUrgent = async (id: string, title: string) => {
    if (!confirm(`돌발등록 "${title}" 전체를 삭제할까요? (연결된 작업로그도 함께 삭제)`)) return;
    await fetch(`/api/urgent-works/${id}`, { method: "DELETE" });
    fetchData();
  };

  // 날짜 필터 — UrgentWork.createdAt 기준 (작업 전 행도 포함되므로 작업일이 아닌 등록일 기준이 자연)
  const dateFilteredWorks = useMemo(() => works.filter(w => {
    if (!dateFrom && !dateTo) return true;
    const d = new Date(w.createdAt);
    if (dateFrom) { const f = new Date(dateFrom); f.setHours(0,0,0,0); if (d < f) return false; }
    if (dateTo)   { const t = new Date(dateTo);   t.setHours(23,59,59,999); if (d > t) return false; }
    return true;
  }), [works, dateFrom, dateTo]);

  // 정규화 — 한 번만 계산해서 accessor/렌더 둘 다 사용
  const rows = useMemo<UrgentDisplayRow[]>(() => dateFilteredWorks.map(w => {
    const log = w.cuttingLogs[0] ?? null;
    const rem = w.remnant;
    const w1  = log?.width ?? rem?.width1 ?? null;
    const l1  = log?.length ?? rem?.length1 ?? null;
    const w2  = rem?.width2  ?? null;
    const l2  = rem?.length2 ?? null;
    const thickness = log?.thickness ?? rem?.thickness ?? null;
    const material  = log?.material ?? rem?.material ?? "";
    const steelWeight = thickness && w1 && l1
      ? Math.round(thickness * (w1 * l1 - (w2 ?? 0) * (l2 ?? 0)) * 7.85 / 1_000_000 * 10) / 10
      : null;
    const statusDef = !log
      ? { label: "대기", cls: "bg-gray-100 text-gray-600" }
      : log.status === "COMPLETED" ? { label: "완료",   cls: "bg-green-100 text-green-700" }
      : log.status === "PAUSED"    ? { label: "중단중", cls: "bg-yellow-100 text-yellow-700" }
      :                              { label: "진행중", cls: "bg-blue-100 text-blue-700" };
    const totalMs  = log ? libCalcTotalMs(log.startAt, log.endAt, log.pauses) : 0;
    const pauseMs  = log ? calcPauseMs(log.pauses) : 0;
    return {
      w, log,
      statusLabel: statusDef.label, statusCls: statusDef.cls,
      material, thickness, w1, l1, w2, l2,
      steelWeight,
      useWeight: w.useWeight,
      workDateStr: log ? fmtDate(log.startAt) : "",
      totalMs, pauseMs,
      activeMs: Math.max(0, totalMs - pauseMs),
    };
  }), [dateFilteredWorks]);

  // 컬럼 accessor — 필터/정렬 공통
  const accessors: ColumnAccessorMap<UrgentDisplayRow> = useMemo(() => ({
    status:       r => r.statusLabel,
    urgentNo:     r => r.w.urgentNo,
    title:        r => r.w.title,
    requester:    r => r.w.requester ?? "",
    department:   r => r.w.department ?? "",
    vessel:       r => r.w.project ? `[${r.w.project.projectCode}] ${r.w.project.projectName}` : (r.w.vesselName ?? ""),
    remnantNo:    r => r.w.remnant?.remnantNo ?? "",
    material:     r => r.material,
    thickness:    r => r.thickness != null ? String(r.thickness) : "",
    width1:       r => r.w1 != null ? String(r.w1) : "",
    width2:       r => r.w2 != null ? String(r.w2) : "",
    length1:      r => r.l1 != null ? String(r.l1) : "",
    length2:      r => r.l2 != null ? String(r.l2) : "",
    steelWeight:  r => r.steelWeight != null ? r.steelWeight.toFixed(1) : "",
    useWeight:    r => r.useWeight   != null ? r.useWeight.toFixed(1)   : "",
    workDate:     r => r.workDateStr,
  }), []);

  // cascading 필터 + 텍스트 조건
  const filteredRows = useMemo(
    () => getCascadedFilteredRowsWithPredicates(rows, colFilters, predicates, accessors),
    [rows, colFilters, predicates, accessors],
  );
  const distinctValues = useMemo(
    () => getAllCascadedOptions(rows, colFilters, accessors),
    [rows, colFilters, accessors],
  );

  // 정렬
  const sortedRows = useMemo(() => {
    if (!sortKey) return filteredRows;
    const acc = accessors[sortKey];
    if (!acc) return filteredRows;
    const arr = [...filteredRows];
    arr.sort((a, b) => {
      const av = acc(a); const bv = acc(b);
      // 숫자 추론
      const an = parseFloat(av as string); const bn = parseFloat(bv as string);
      const bothNum = !isNaN(an) && !isNaN(bn) && String(an) === av && String(bn) === bv;
      const cmp = bothNum
        ? an - bn
        : String(av).localeCompare(String(bv), "ko", { numeric: true });
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [filteredRows, sortKey, sortDir, accessors]);

  const handleSortFor = (key: URGENT_KEY, dir: "asc" | "desc" | null) => {
    if (dir === null) { setSortKey(null); setSortDir("asc"); }
    else { setSortKey(key); setSortDir(dir); }
  };

  // 요약
  const totalCount     = filteredRows.length;
  const completedCount = filteredRows.filter(r => r.log?.status === "COMPLETED").length;
  const ongoingCount   = filteredRows.filter(r => r.log && (r.log.status === "STARTED" || r.log.status === "PAUSED")).length;
  const pendingCount   = filteredRows.filter(r => !r.log).length;

  return (
    <div className="space-y-4">
      {/* 날짜 필터 */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
              날짜 필터 <span className="font-normal text-gray-400">(비우면 전체)</span>
            </label>
            <div className="flex items-center gap-1.5">
              <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="text-sm" />
              <span className="text-gray-400 text-xs">~</span>
              <Input type="date" value={dateTo}   onChange={e => setDateTo(e.target.value)}   className="text-sm" />
              {(dateFrom || dateTo) && (
                <button onClick={() => { setDateFrom(""); setDateTo(""); }} className="text-gray-400 hover:text-gray-600">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
          <button onClick={fetchData} disabled={loading}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50">
            <Search size={14} /> 조회
          </button>
        </div>
      </div>

      {!queried ? (
        <div className="bg-white border border-gray-200 rounded-xl py-16 text-center text-gray-400 text-sm">
          <Search size={28} className="mx-auto mb-2 text-gray-300" />
          <b className="text-gray-600">[조회]</b>를 누르면 돌발 작업일보가 표시됩니다.
        </div>
      ) : (<>
      {/* 요약 */}
      <div className="flex items-center gap-4 text-sm bg-white border border-gray-200 rounded-xl px-5 py-3 shadow-sm">
        <span className="text-gray-500">전체 <strong className="text-gray-900">{totalCount}</strong>건</span>
        <span className="text-gray-500">작업전 <strong className="text-gray-700">{pendingCount}</strong>건</span>
        <span className="text-yellow-600">진행중 <strong>{ongoingCount}</strong>건</span>
        <span className="text-green-600">완료 <strong>{completedCount}</strong>건</span>
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-20 text-gray-400 gap-3">
          <RefreshCw className="animate-spin text-blue-500" size={24} /> 불러오는 중...
        </div>
      ) : sortedRows.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-dashed border-gray-200 text-gray-400">
          <Zap size={36} className="mx-auto mb-3 opacity-20" />
          <p>돌발 작업일보가 없습니다.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead className="bg-orange-50 border-b border-gray-200">
                <tr>
                  <th className="px-2 py-1 text-center text-[11px] font-semibold text-gray-500 w-8">No</th>
                  {URGENT_COLS.map(col => {
                    const hasValues = (colFilters[col.key]?.length ?? 0) > 0;
                    const p = predicates[col.key];
                    const hasPredicate = !!p && (p.op === "empty" || p.op === "notEmpty" || p.val.length > 0);
                    const active = hasValues || hasPredicate;
                    const isSort = sortKey === col.key;
                    return (
                      <th
                        key={col.key}
                        className={`px-3 py-1 text-${col.align} text-[11px] font-semibold text-gray-500 whitespace-nowrap`}
                      >
                        <div className={`flex items-center gap-1 ${col.align === "right" ? "justify-end" : col.align === "center" ? "justify-center" : ""}`}>
                          <span>{col.label}</span>
                          {col.filterable && (
                            <button
                              onClick={e => { setOpenCol(col.key); setAnchorEl(e.currentTarget); }}
                              className="text-gray-400 hover:text-gray-700 inline-flex items-center"
                              title="필터·정렬"
                            >
                              <FilterIcon size={11} className={active ? "text-blue-500 fill-blue-500" : ""} fill={active ? "currentColor" : "none"} />
                              {isSort && (sortDir === "asc"
                                ? <ArrowUp   size={9} className="text-blue-500" />
                                : <ArrowDown size={9} className="text-blue-500" />)}
                            </button>
                          )}
                        </div>
                      </th>
                    );
                  })}
                  <th className="px-3 py-1 text-center text-[11px] font-semibold text-gray-500 whitespace-nowrap">액션</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sortedRows.map((r, i) => (
                  <tr key={r.w.id} className="hover:bg-orange-50/30 transition-colors">
                    <td className="px-2 py-1 text-center text-gray-400">{i + 1}</td>
                    {/* 상태 */}
                    <td className="px-3 py-1 text-center">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${r.statusCls}`}>{r.statusLabel}</span>
                    </td>
                    <td className="px-3 py-1 font-mono text-[11px] text-orange-700">{r.w.urgentNo}</td>
                    <td className="px-3 py-1 font-semibold text-gray-900 max-w-[160px] truncate">{r.w.title}</td>
                    <td className="px-3 py-1 text-gray-600">{r.w.requester ?? "-"}</td>
                    <td className="px-3 py-1 text-gray-500">{r.w.department ?? "-"}</td>
                    <td className="px-3 py-1 text-gray-600 whitespace-nowrap text-[11px]">
                      {r.w.project ? `[${r.w.project.projectCode}] ${r.w.project.projectName}` : (r.w.vesselName ?? "-")}
                    </td>
                    <td className="px-3 py-1 font-mono text-orange-700">{r.w.remnant?.remnantNo ?? "-"}</td>
                    <td className="px-3 py-1 text-gray-600">{r.material || "-"}</td>
                    <td className="px-3 py-1 text-right tabular-nums text-gray-600">{r.thickness ?? "-"}</td>
                    <td className="px-3 py-1 text-right tabular-nums text-gray-600">{r.w1?.toLocaleString() ?? "-"}</td>
                    <td className="px-3 py-1 text-right tabular-nums text-gray-400">{r.w2?.toLocaleString() ?? "-"}</td>
                    <td className="px-3 py-1 text-right tabular-nums text-gray-600">{r.l1?.toLocaleString() ?? "-"}</td>
                    <td className="px-3 py-1 text-right tabular-nums text-gray-400">{r.l2?.toLocaleString() ?? "-"}</td>
                    <td className="px-3 py-1 text-right tabular-nums text-gray-600">{r.steelWeight?.toFixed(1) ?? "-"}</td>
                    <td className="px-3 py-1 text-right tabular-nums text-gray-600">{r.useWeight != null ? r.useWeight.toFixed(1) : "-"}</td>
                    <td className="px-3 py-1 text-gray-600 whitespace-nowrap font-mono text-[11px]">{r.workDateStr || "-"}</td>
                    <td className="px-3 py-1 text-gray-500 whitespace-nowrap">
                      {r.log?.endAt ? fmtHM(r.totalMs) : (r.log ? "진행중" : "-")}
                    </td>
                    <td className="px-3 py-1 text-orange-500 whitespace-nowrap">{r.log ? fmtPauseMin(r.pauseMs) : "-"}</td>
                    <td className="px-3 py-1 text-green-700 font-semibold whitespace-nowrap">{r.log?.endAt ? fmtHM(r.activeMs) : "-"}</td>
                    {/* 액션 */}
                    <td className="px-3 py-1 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {r.log && (
                          <button onClick={() => setEditLog(r.log!)} className="p-1 text-blue-500 hover:bg-blue-50 rounded-md transition-colors" title="작업로그 수정">
                            <Edit2 size={13} />
                          </button>
                        )}
                        {r.log && (
                          <button onClick={() => handleDeleteLog(r.log!.id)} className="p-1 text-orange-400 hover:bg-orange-50 rounded-md transition-colors" title="작업로그만 삭제">
                            <Trash2 size={13} />
                          </button>
                        )}
                        <button onClick={() => handleDeleteUrgent(r.w.id, r.w.title)} className="p-1 text-red-400 hover:bg-red-50 rounded-md transition-colors" title="돌발등록 삭제">
                          <XCircle size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      </>)}

      {editLog && (
        <LogModal
          mode="edit"
          drawing={null}
          log={editLog}
          equipment={equipment}
          workers={workers}
          projectId={editLog.project ? "" : ""}
          onClose={() => setEditLog(null)}
          onSaved={() => { setEditLog(null); fetchData(); }}
        />
      )}

      {/* 컬럼 필터 드롭다운 */}
      {openCol && anchorEl && (
        <ColumnFilterDropdown
          anchorEl={anchorEl}
          values={distinctValues[openCol] ?? []}
          selected={colFilters[openCol] ?? []}
          onApply={sel => {
            setColFilters(p => ({ ...p, [openCol]: sel }));
            setOpenCol(null); setAnchorEl(null);
          }}
          onClose={() => { setOpenCol(null); setAnchorEl(null); }}
          sortDir={sortKey === openCol ? sortDir : null}
          onSort={(dir) => handleSortFor(openCol, dir)}
          predicate={predicates[openCol] ?? null}
          onPredicate={(p) => setPredicates(prev => {
            const next = { ...prev };
            if (p) next[openCol] = p; else delete next[openCol];
            return next;
          })}
        />
      )}
    </div>
  );
}

// ─── 로그 등록/수정 모달 ────────────────────────────────────────────────────

function LogModal({
  mode, drawing, log, equipment, workers, projectId, onClose, onSaved,
}: {
  mode: "add" | "edit";
  drawing: Drawing | null;
  log: CuttingLog | null;
  equipment: Equipment[];
  workers: Worker[];
  projectId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    equipmentId: log?.equipmentId ?? equipment[0]?.id ?? "",
    operator:    log?.operator ?? "",
    // 추가(add)모드는 판번호를 목록 선택으로만 채움(프리필 안 함) — select(selectedHeatId)과 heatNo 불일치 방지.
    // 수정(edit)모드는 기존 값 표시(잠금).
    heatNo:      log?.heatNo ?? "",
    selectedHeatId: "" as string, // 목록에서 고른 판번호(SteelPlanHeat) id — 정확 소진용
    startAt:     toLocalDatetimeValue(log?.startAt ?? new Date().toISOString()),
    endAt:       toLocalDatetimeValue(log?.endAt ?? null),
    status:      log?.status ?? "COMPLETED",
    memo:        log?.memo ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stuckLog, setStuckLog] = useState<{ id: string; heatNo: string; drawingNo: string | null; operator: string; startAt: string; project: string | null } | null>(null);
  const [heatOptions, setHeatOptions] = useState<{ id: string; heatNo: string }[]>([]);

  useEffect(() => {
    if (!drawing) return;
    const p = new URLSearchParams({
      // 호선 격리 — 대체호선 우선, 없으면 본 호선. 다른 호선 동일스펙 판번호 오노출 방지
      vesselCode: drawing.alternateVesselCode?.trim() || drawing.project?.projectCode || "",
      material:   drawing.material,
      thickness:  String(drawing.thickness),
      width:      String(drawing.width),
      length:     String(drawing.length),
    });
    fetch(`/api/steel-plan/heat-options?${p}`)
      .then(r => r.json())
      .then(setHeatOptions)
      .catch(() => {});
  }, [drawing]);
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setStuckLog(null);
    if (!form.equipmentId || !form.operator.trim() || !form.startAt) {
      setError("장비, 작업자, 시작일시는 필수입니다.");
      return;
    }
    // 판번호 재확인 — 신규 등록 시 현물과 일치하는지 최종 확인 (판번호 있는 절단만)
    if (mode === "add") {
      const hn = (form.heatNo || drawing?.heatNo || "").trim();
      if (hn && !confirm(`판번호 「${hn}」\n\n현물(실물 철판)의 판번호와 일치합니까?\n확인을 누르면 이 판번호로 등록합니다.`)) return;
    }
    setSaving(true);
    try {
      if (mode === "add") {
        // 종료일시까지 입력하면 곧장 완료(백필)로 생성 — 서버가 STARTED 안 거치고
        // COMPLETED 생성 + 동기화를 한 트랜잭션으로 처리(장비 가드 우회, 고아 로그 방지).
        const isCompleted = !!form.endAt;
        const res = await fetch("/api/cutting-logs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            equipmentId:   form.equipmentId,
            projectId,
            drawingListId: drawing?.id ?? null,
            heatNo:        form.heatNo || (drawing?.heatNo ?? ""),
            selectedHeatId: form.selectedHeatId || null,
            material:      drawing?.material ?? null,
            thickness:     drawing?.thickness ?? null,
            width:         drawing?.width ?? null,
            length:        drawing?.length ?? null,
            qty:           drawing?.qty ?? null,
            drawingNo:     drawing?.drawingNo ?? null,
            operator:      form.operator,
            memo:          form.memo || null,
            startAt:       form.startAt ? new Date(form.startAt).toISOString() : undefined,
            ...(isCompleted ? { status: "COMPLETED", endAt: new Date(form.endAt).toISOString() } : {}),
          }),
        });
        const data = await res.json();
        if (!data.success) {
          setError(data.error);
          if (data.stuckLog) setStuckLog(data.stuckLog);
          return;
        }
      } else if (log) {
        // 수정은 작업자·시간·비고·장비만 — status 는 보내지 않음(서버가 현재 상태 유지).
        // 판번호·치수·완료/진행 전환은 서버에서 차단(재고 desync 방지) → '삭제 후 재등록' 유도.
        const res = await fetch(`/api/cutting-logs/${log.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            equipmentId: form.equipmentId,
            operator:    form.operator,
            // heatNo 는 보내지 않음 — 식별값(판번호)은 수정 대상 아님(서버가 기존값 유지).
            //   빈 heatNo 로그(돌발/잔재)에 null 기록 시 비널 컬럼 위반(500), 완료로그엔 A-2 가드 409 회피.
            startAt:     form.startAt ? new Date(form.startAt).toISOString() : undefined,
            endAt:       form.endAt   ? new Date(form.endAt).toISOString()   : null,
            memo:        form.memo || null,
          }),
        });
        const data = await res.json();
        if (!data.success) { setError(data.error); return; }
      }
      onSaved();
    } catch {
      setError("서버 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
          <h3 className="font-bold text-lg text-gray-900 flex items-center gap-2">
            {mode === "add" ? <Plus size={18} className="text-blue-600" /> : <Edit2 size={18} className="text-blue-600" />}
            {mode === "add" ? "작업일보 추가 등록" : "작업일보 수정"}
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded-full transition-colors"><X size={18} /></button>
        </div>

        {drawing && (
          <div className="px-6 py-3 bg-blue-50 border-b border-blue-100 text-xs text-blue-800">
            <span className="font-semibold">강재:</span>{" "}
            {drawing.drawingNo && <span className="font-mono mr-2">{drawing.drawingNo}</span>}
            {drawing.block && <span className="mr-2">[{drawing.block}]</span>}
            <span>{drawing.material} {drawing.thickness}t × {drawing.width} × {drawing.length} ({drawing.qty}매)</span>
          </div>
        )}

        {error && (
          <div className="mx-6 mt-4 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm space-y-2">
            <div className="flex items-center gap-2"><AlertCircle size={14} /> {error}</div>
            {stuckLog && (
              <div className="bg-red-100 rounded p-2 text-xs space-y-1">
                <div className="font-semibold text-red-800">미종료 작업 정보:</div>
                <div>
                  {stuckLog.project && <span className="mr-2">호선: {stuckLog.project}</span>}
                  {stuckLog.heatNo && <span className="mr-2">판번호: {stuckLog.heatNo}</span>}
                  {stuckLog.drawingNo && <span className="mr-2">도면: {stuckLog.drawingNo}</span>}
                  <span className="mr-2">작업자: {stuckLog.operator}</span>
                  <span>시작: {new Date(stuckLog.startAt).toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                </div>
                <p className="mt-1 text-[11px] text-red-700 leading-relaxed">
                  현장에서 이 작업을 종료한 뒤 다시 시도하세요.<br />
                  <span className="text-red-600">완료된 과거 작업을 추가하려면 종료 일시까지 입력하면 장비 점유와 무관하게 바로 등록됩니다.</span>
                </p>
              </div>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-800 mb-1.5">장비 <span className="text-red-500">*</span></label>
            <select
              value={form.equipmentId}
              onChange={e => setForm(f => ({ ...f, equipmentId: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {equipment.map(eq => (
                <option key={eq.id} value={eq.id}>{eq.name} ({TYPE_LABEL[eq.type] ?? eq.type})</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-800 mb-1.5">작업자 <span className="text-red-500">*</span></label>
            <div className="flex gap-2">
              <Input
                value={form.operator}
                onChange={e => setForm(f => ({ ...f, operator: e.target.value }))}
                placeholder="작업자명 직접 입력"
                className="flex-1"
              />
              {workers.length > 0 && (
                <select
                  onChange={e => { if (e.target.value) setForm(f => ({ ...f, operator: e.target.value })); }}
                  className="px-2 py-1 border border-gray-200 rounded-md text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  defaultValue=""
                >
                  <option value="">목록 선택</option>
                  {workers.map(w => <option key={w.id} value={w.name}>{w.name}</option>)}
                </select>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Heat NO (판번호)</label>
            {mode === "edit" ? (
              // 수정에서는 판번호(식별값)를 변경하지 않음 — 잠금. 바꾸려면 삭제 후 재등록.
              <div>
                <Input value={form.heatNo || "—"} disabled className="font-mono bg-gray-100 text-gray-500" />
                <p className="mt-1 text-[11px] text-gray-400">판번호는 수정 화면에서 변경할 수 없습니다. 변경하려면 삭제 후 다시 등록하세요.</p>
              </div>
            ) : heatOptions.length > 0 ? (
              <select
                value={form.selectedHeatId}
                onChange={e => {
                  const id = e.target.value;
                  const h = heatOptions.find(x => x.id === id);
                  setForm(f => ({ ...f, selectedHeatId: id, heatNo: h?.heatNo ?? "" }));
                }}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">-- 판번호 선택 --</option>
                {heatOptions.map(h => (
                  <option key={h.id} value={h.id}>{h.heatNo}</option>
                ))}
              </select>
            ) : null}
            {mode === "add" && form.heatNo && (
              <p className="mt-1.5 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5">
                ⚠ 선택한 판번호 <span className="font-mono font-bold">{form.heatNo}</span> 가 현물(실물 철판)과 <b>일치하는지 다시 확인</b>하세요.
              </p>
            )}
            {mode !== "edit" && heatOptions.length === 0 && (
              <p className="text-xs text-yellow-600 bg-yellow-50 border border-yellow-200 rounded-md px-3 py-2">
                등록된 판번호가 없습니다. 강재입출고에서 판번호를 먼저 등록하세요.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-800 mb-1.5">시작 일시 <span className="text-red-500">*</span></label>
              <Input
                type="datetime-local"
                value={form.startAt}
                onChange={e => setForm(f => ({ ...f, startAt: e.target.value }))}
                className="text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">종료 일시</label>
              <Input
                type="datetime-local"
                value={form.endAt}
                onChange={e => setForm(f => ({ ...f, endAt: e.target.value }))}
                disabled={mode === "edit" && log?.status !== "COMPLETED"}
                className="text-sm disabled:bg-gray-100 disabled:text-gray-400"
              />
              {mode === "edit" && log?.status !== "COMPLETED" && (
                <p className="mt-1 text-[11px] text-gray-400">진행중 작업은 여기서 완료할 수 없습니다. 완료는 현장 절단종료를 이용하세요.</p>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">특이사항</label>
            <textarea
              value={form.memo}
              onChange={e => setForm(f => ({ ...f, memo: e.target.value }))}
              rows={2}
              className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="특이사항 입력 (선택)"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
            <Button type="button" variant="outline" onClick={onClose}>취소</Button>
            <Button type="submit" disabled={saving} className="bg-blue-600 hover:bg-blue-700 font-bold">
              <Save size={14} className="mr-1.5" />
              {saving ? "저장 중..." : mode === "add" ? "등록" : "수정 저장"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── 메인 컴포넌트 ─────────────────────────────────────────────────────────

export default function WorklogAdmin({
  equipment,
  projects,
  workers,
}: {
  equipment: Equipment[];
  projects: Project[];
  workers: Worker[];
}) {
  const [mainTab, setMainTab] = useState<"normal" | "urgent">("normal");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo,   setDateTo]   = useState<string>("");
  const [page, setPage] = useState(1);

  // 검색-우선: 진입 시 리스트 없음. 조회 조건(호선/블록/재질/규격) 설정 후 [조회] 해야 표시.
  const [sVessel,  setSVessel]  = useState("");
  const [sBlock,   setSBlock]   = useState("");
  const [sMaterial,setSMaterial]= useState("");
  const [sThk,     setSThk]     = useState("");
  const [sWidth,   setSWidth]   = useState("");
  const [sLength,  setSLength]  = useState("");
  const [queried,  setQueried]  = useState(false);
  const [allMode,  setAllMode]  = useState(false); // 마지막 조회가 '전체 보기'였는지 — 재조회 시 모드 유지
  const [lastFiltered, setLastFiltered] = useState(false); // 마지막 조회에 검색조건이 있었는지 — 0건 메시지 구분

  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [logs,     setLogs]     = useState<CuttingLog[]>([]);
  const [loading,  setLoading]  = useState(false);

  // 모달 상태
  const [modal, setModal] = useState<{
    open: boolean;
    mode: "add" | "edit";
    drawing: Drawing | null;
    log: CuttingLog | null;
  }>({ open: false, mode: "add", drawing: null, log: null });

  // 필터 + 텍스트 조건 + 정렬 (엑셀스타일 통합 드롭다운)
  const [filters,    setFilters]    = useState<Record<string, string[]>>({});
  const [normalPredicates, setNormalPredicates] = useState<Record<string, TextPredicate>>({});
  const [openCol,    setOpenCol]    = useState<string | null>(null);
  const [anchorEl,   setAnchorEl]   = useState<HTMLElement | null>(null);

  // 검색-우선 조회. all=true 면 조건·기간 모두 무시하고 전체 확정 목록(escape hatch).
  const fetchData = async (all = false) => {
    setLoading(true);
    setAllMode(all);
    setLastFiltered(!all && !!(sVessel.trim() || sBlock.trim() || sMaterial.trim() || sThk.trim() || sWidth.trim() || sLength.trim() || dateFrom || dateTo));
    try {
      const dp = new URLSearchParams({ allConfirmed: "true" });
      if (!all) {
        if (sVessel.trim())   dp.set("vesselCode", sVessel.trim());
        if (sBlock.trim())    dp.set("block",      sBlock.trim());
        if (sMaterial.trim()) dp.set("material",   sMaterial.trim());
        if (sThk.trim())      dp.set("thickness",  sThk.trim());
        if (sWidth.trim())    dp.set("width",      sWidth.trim());
        if (sLength.trim())   dp.set("length",     sLength.trim());
      }
      const logParams = new URLSearchParams();
      // 전체 보기(all)면 기간 무시하고 전 로그. 아니면 기간 적용(없으면 전체).
      if (all || (!dateFrom && !dateTo)) logParams.set("all", "true");
      else {
        if (dateFrom) logParams.set("dateFrom", dateFrom);
        if (dateTo)   logParams.set("dateTo",   dateTo);
      }

      const [drawRes, logRes] = await Promise.all([
        fetch(`/api/drawings?${dp}`),
        fetch(`/api/cutting-logs?${logParams}`),
      ]);
      const [drawJson, logJson] = await Promise.all([drawRes.json(), logRes.json()]);
      if (drawJson.success) setDrawings(drawJson.data);
      if (logJson.success)  setLogs(logJson.data);
      setQueried(true);
      setPage(1);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // 진입 시 자동로드 없음(검색-우선). 필터 변경 시에만 페이지 초기화.
  useEffect(() => { setPage(1); }, [filters, normalPredicates]);

  const logByDrawingId = useMemo(() => {
    const map = new Map<string, CuttingLog>();
    // 한 도면에 로그가 여러 개면 COMPLETED 우선, 동급이면 최신 startAt 채택 (옛 로그에 가려지지 않게)
    const rank = (s: string) => (s === "COMPLETED" ? 2 : s === "STARTED" || s === "PAUSED" ? 1 : 0);
    logs.forEach(l => {
      if (!l.drawingListId) return;
      const prev = map.get(l.drawingListId);
      if (!prev) { map.set(l.drawingListId, l); return; }
      const better = rank(l.status) > rank(prev.status)
        || (rank(l.status) === rank(prev.status) && new Date(l.startAt).getTime() > new Date(prev.startAt).getTime());
      if (better) map.set(l.drawingListId, l);
    });
    return map;
  }, [logs]);

  // ── 필터 헬퍼 ───────────────────────────────────────────────────────────

  const getW1 = (d: Drawing) => d.assignedRemnant?.width1  ?? d.width;
  const getL1 = (d: Drawing) => d.assignedRemnant?.length1 ?? d.length;

  const getVal = (d: Drawing, log: CuttingLog | null, col: FCKey): string => {
    switch (col) {
      case "status":     return !log ? "대기" : log.status === "COMPLETED" ? "완료" : log.status === "PAUSED" ? "중단중" : "진행중";
      case "hosin":      return d.project?.projectCode ?? "";
      case "block":      return d.block ?? "";
      case "drawingNo":  return d.drawingNo ?? "";
      case "material":   return d.material;
      case "thickness":  return String(d.thickness);
      case "width1":     return String(getW1(d));
      case "width2":     return d.assignedRemnant?.width2  != null ? String(d.assignedRemnant.width2)  : "";
      case "length1":    return String(getL1(d));
      case "length2":    return d.assignedRemnant?.length2 != null ? String(d.assignedRemnant.length2) : "";
      case "steelWeight":return String(calcSteelWeight(d.thickness, getW1(d), getL1(d), d.assignedRemnant?.width2, d.assignedRemnant?.length2));
      case "useWeight":  return d.useWeight != null ? String(d.useWeight) : "";
      case "heatNo":     return d.heatNo ?? "";
      case "operator":   return log?.operator ?? "";
      case "equipment":  return log ? eqShort(log.equipment.name) : "";
      case "workDate":   return log?.startAt ? fmtDate(log.startAt) : "";
      case "totalTime": {
        if (!log?.endAt) return log ? "진행중" : "";
        return fmtHM(libCalcTotalMs(log.startAt, log.endAt, log.pauses));
      }
      case "pauseTime":  return log ? fmtPauseMin(calcPauseMs(log.pauses)) : "";
      case "activeTime": {
        if (!log?.endAt) return log ? "진행중" : "";
        const totMs  = libCalcTotalMs(log.startAt, log.endAt, log.pauses);
        const pauMs  = calcPauseMs(log.pauses);
        return fmtHM(Math.max(0, totMs - pauMs));
      }
      case "memo":       return log?.memo ?? "";
      default:           return "";
    }
  };

  const allValues = (col: FCKey): FilterValue[] => {
    const set = new Set<string>();
    let hasEmpty = false;
    for (const d of drawings) {
      const log = logByDrawingId.get(d.id) ?? null;
      const v = getVal(d, log, col);
      if (v) set.add(v);
      else hasEmpty = true;
    }
    const result: FilterValue[] = Array.from(set).sort().map(v => ({ value: v, label: v }));
    if (hasEmpty) result.push({ value: "__EMPTY__", label: "항목없음" });
    return result;
  };

  const handleFilterChange = (col: string, values: string[]) =>
    setFilters(p => values.length === 0
      ? Object.fromEntries(Object.entries(p).filter(([k]) => k !== col))
      : { ...p, [col]: values });
  const handleFilterOpen  = (col: string, el: HTMLElement) => { setOpenCol(col); setAnchorEl(el); };
  const handleFilterClose = () => { setOpenCol(null); setAnchorEl(null); };

  // ── 필터 적용 ───────────────────────────────────────────────────────────

  const filteredDrawings = useMemo(() => {
    let result = drawings;
    // 날짜 필터가 있으면 작업일보가 있는 행만 표시
    if (dateFrom || dateTo) {
      result = result.filter(d => logByDrawingId.has(d.id));
    }
    // 컬럼 필터
    result = result.filter(d => {
      const log = logByDrawingId.get(d.id) ?? null;
      return FILTER_COLS.every(col => {
        const sel = filters[col.key as FCKey];
        if (!sel || sel.length === 0) return true;
        const v = getVal(d, log, col.key as FCKey);
        return sel.includes(v || "__EMPTY__");
      });
    });
    // 텍스트 조건 필터
    result = result.filter(d => {
      const log = logByDrawingId.get(d.id) ?? null;
      for (const [col, p] of Object.entries(normalPredicates)) {
        if (!p) continue;
        const v = getVal(d, log, col as FCKey);
        const vL = v.toLowerCase(); const qL = (p.val ?? "").toLowerCase();
        const pass = (() => {
          switch (p.op) {
            case "empty":      return v === "";
            case "notEmpty":   return v !== "";
            case "contains":   return qL === "" || vL.includes(qL);
            case "startsWith": return qL === "" || vL.startsWith(qL);
            case "endsWith":   return qL === "" || vL.endsWith(qL);
            case "equals":     return vL === qL;
            case "notEquals":  return vL !== qL;
            default: return true;
          }
        })();
        if (!pass) return false;
      }
      return true;
    });
    return result;
  }, [drawings, logByDrawingId, dateFrom, dateTo, filters, normalPredicates, getVal]);

  // 정렬 — 단일 컬럼
  const [sortKey, setSortKey] = useState<FCKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const handleNormalSortFor = (key: FCKey, dir: "asc" | "desc" | null) => {
    if (dir === null) { setSortKey(null); setSortDir("asc"); }
    else { setSortKey(key); setSortDir(dir); }
  };

  const sortedDrawings = useMemo(() => {
    if (!sortKey) return filteredDrawings;
    const arr = [...filteredDrawings];
    arr.sort((a, b) => {
      const la = logByDrawingId.get(a.id) ?? null;
      const lb = logByDrawingId.get(b.id) ?? null;
      const av = getVal(a, la, sortKey);
      const bv = getVal(b, lb, sortKey);
      const an = parseFloat(av); const bn = parseFloat(bv);
      const bothNum = !isNaN(an) && !isNaN(bn) && String(an) === av && String(bn) === bv;
      const cmp = bothNum
        ? an - bn
        : av.localeCompare(bv, "ko", { numeric: true });
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [filteredDrawings, sortKey, sortDir, logByDrawingId]);

  const PAGE_SIZE   = 50;
  const totalPages  = Math.ceil(sortedDrawings.length / PAGE_SIZE);
  const pagedRows   = sortedDrawings.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const filterCount =
    Object.values(filters).filter(v => v && v.length > 0).length +
    Object.values(normalPredicates).filter(p => p && (p.op === "empty" || p.op === "notEmpty" || (p.val ?? "").length > 0)).length;
  // 상태별 집계 — 완료(COMPLETED) / 진행중(STARTED+PAUSED) / 미등록(로그 없음). status 기준으로 정확히 분리
  const cutCount     = filteredDrawings.filter(d => logByDrawingId.get(d.id)?.status === "COMPLETED").length;
  const ongoingCount = filteredDrawings.filter(d => { const s = logByDrawingId.get(d.id)?.status; return s === "STARTED" || s === "PAUSED"; }).length;
  const noLogCount   = filteredDrawings.filter(d => !logByDrawingId.has(d.id)).length;

  const handleDelete = async (logId: string) => {
    if (!confirm("이 작업일보를 삭제할까요? (강재 상태가 복원됩니다)")) return;
    await fetch(`/api/cutting-logs/${logId}`, { method: "DELETE" });
    fetchData(allMode); // 마지막 조회 모드 유지(전체보기 유실 방지)
  };

  // 현재 조회·필터된 목록만 엑셀 다운로드
  const downloadExcel = () => {
    const rows = sortedDrawings.map((d, i) => {
      const log = logByDrawingId.get(d.id) ?? null;
      const r: Record<string, string | number> = { No: i + 1 };
      for (const c of COLUMNS) r[c.label] = getVal(d, log, c.key as FCKey);
      return r;
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "정규작업일보");
    XLSX.writeFile(wb, `정규작업일보_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ClipboardList size={24} className="text-blue-600" /> 작업일보 관리
          </h2>
          <p className="text-sm text-gray-500 mt-1">검색 조건(기간·호선·블록·재질·규격)으로 필요한 작업일보만 조회·수정·삭제합니다.</p>
        </div>
      </div>

      {/* 탭 */}
      <div className="flex gap-1 border-b border-gray-200">
        <button
          onClick={() => setMainTab("normal")}
          className={`px-5 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
            mainTab === "normal" ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          <ClipboardList size={14} className="inline mr-1.5 mb-0.5" />정규 작업일보
        </button>
        <button
          onClick={() => setMainTab("urgent")}
          className={`px-5 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
            mainTab === "urgent" ? "border-orange-500 text-orange-600" : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          <Zap size={14} className="inline mr-1.5 mb-0.5" />돌발 작업
        </button>
      </div>

      {mainTab === "urgent" && <UrgentWorkTab equipment={equipment} workers={workers} />}

      {mainTab === "normal" && (<>

      {/* 검색 패널 — 검색-우선: 조건 설정 후 [조회] 해야 목록 표시 */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
          <div className="col-span-2 sm:col-span-3 lg:col-span-2">
            <label className="block text-xs font-semibold text-gray-600 mb-1">기간 <span className="font-normal text-gray-400">(작업일, 비우면 전체)</span></label>
            <div className="flex items-center gap-1.5">
              <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="text-sm" />
              <span className="text-gray-400 text-xs">~</span>
              <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="text-sm" />
            </div>
          </div>
          <div><label className="block text-xs font-semibold text-gray-600 mb-1">호선</label><Input value={sVessel} onChange={e => setSVessel(e.target.value)} placeholder="호선" className="text-sm" onKeyDown={e => e.key === "Enter" && fetchData()} /></div>
          <div><label className="block text-xs font-semibold text-gray-600 mb-1">블록</label><Input value={sBlock} onChange={e => setSBlock(e.target.value)} placeholder="블록" className="text-sm" onKeyDown={e => e.key === "Enter" && fetchData()} /></div>
          <div><label className="block text-xs font-semibold text-gray-600 mb-1">재질</label><Input value={sMaterial} onChange={e => setSMaterial(e.target.value)} placeholder="재질" className="text-sm" onKeyDown={e => e.key === "Enter" && fetchData()} /></div>
          <div><label className="block text-xs font-semibold text-gray-600 mb-1">두께</label><Input value={sThk} onChange={e => setSThk(e.target.value)} placeholder="두께" className="text-sm" onKeyDown={e => e.key === "Enter" && fetchData()} /></div>
          <div><label className="block text-xs font-semibold text-gray-600 mb-1">폭</label><Input value={sWidth} onChange={e => setSWidth(e.target.value)} placeholder="폭" className="text-sm" onKeyDown={e => e.key === "Enter" && fetchData()} /></div>
          <div><label className="block text-xs font-semibold text-gray-600 mb-1">길이</label><Input value={sLength} onChange={e => setSLength(e.target.value)} placeholder="길이" className="text-sm" onKeyDown={e => e.key === "Enter" && fetchData()} /></div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => fetchData()} disabled={loading}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50">
            <Search size={14} /> 조회
          </button>
          <button onClick={() => { setDateFrom(""); setDateTo(""); fetchData(true); }} disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50">
            전체 보기
          </button>
          <button onClick={() => { setSVessel(""); setSBlock(""); setSMaterial(""); setSThk(""); setSWidth(""); setSLength(""); setDateFrom(""); setDateTo(""); }}
            className="inline-flex items-center gap-1 px-3 py-2 text-sm text-gray-400 hover:text-gray-600">
            <X size={13} /> 조건 초기화
          </button>
          <span className="text-xs text-gray-400 ml-auto">호선·블록·재질은 부분검색, 여러 조건은 함께(AND) 적용됩니다.</span>
        </div>
      </div>

      {/* 데이터 영역 */}
      {!queried ? (
        <div className="bg-white border border-gray-200 rounded-xl py-16 text-center text-gray-400 text-sm">
          <Search size={28} className="mx-auto mb-2 text-gray-300" />
          조회 조건을 설정하고 <b className="text-gray-600">[조회]</b>를 누르면 작업일보가 표시됩니다.
        </div>
      ) : loading ? (
        <div className="flex justify-center items-center py-20 text-gray-400 gap-3">
          <RefreshCw className="animate-spin text-blue-500" size={24} /> 데이터를 불러오는 중...
        </div>
      ) : (
        <div className="space-y-3">

          {/* 요약 + 필터 뱃지 */}
          <div className="flex items-center gap-4 text-sm flex-wrap bg-white border border-gray-200 rounded-xl px-5 py-3 shadow-sm">
            <span className="text-gray-500">전체 <strong className="text-gray-900">{filteredDrawings.length}</strong>건</span>
            <span className="text-green-600">완료 <strong>{cutCount}</strong>건</span>
            <span className="text-yellow-600">진행중 <strong>{ongoingCount}</strong>건</span>
            <span className="text-gray-400">미등록 <strong>{noLogCount}</strong>건</span>
            {filterCount > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded-md">
                <FilterIcon size={11} fill="currentColor" />
                <span>필터 {filterCount}개 적용 ({filteredDrawings.length}/{drawings.length}행)</span>
                <button onClick={() => { setFilters({}); setNormalPredicates({}); }} className="ml-0.5 hover:text-blue-800" title="모든 필터 초기화">
                  <XCircle size={12} />
                </button>
              </div>
            )}
            <button onClick={downloadExcel} disabled={filteredDrawings.length === 0}
              className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-emerald-600 text-white font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-50"
              title="현재 조회·필터된 목록만 엑셀 다운로드">
              <Download size={13} /> 엑셀 다운로드
            </button>
          </div>

          {/* 작업일보 리스트 */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-2 py-1 text-center text-[11px] font-semibold text-gray-500 w-8">No</th>
                    {COLUMNS.map(col => {
                      const isFilterable = col.filterable;
                      const hasValues    = isFilterable && (filters[col.key as FCKey]?.length ?? 0) > 0;
                      const p            = isFilterable ? normalPredicates[col.key] : undefined;
                      const hasPredicate = !!p && (p.op === "empty" || p.op === "notEmpty" || (p.val ?? "").length > 0);
                      const isActive     = hasValues || hasPredicate;
                      const alignCls     = col.align === "right" ? "justify-end" : "";
                      const isSort       = sortKey === col.key;
                      return (
                        <th key={col.key} className={`px-3 py-1 text-[11px] font-semibold text-gray-500 whitespace-nowrap ${col.align === "right" ? "text-right" : "text-left"}`}>
                          <div className={`flex items-center gap-1 ${alignCls}`}>
                            <span>{col.label}</span>
                            {isFilterable && (
                              <button
                                onClick={e => {
                                  e.stopPropagation();
                                  if (openCol === col.key) { handleFilterClose(); return; }
                                  handleFilterOpen(col.key, e.currentTarget);
                                }}
                                className={`p-0.5 rounded hover:bg-gray-200 transition-colors inline-flex items-center ${isActive || isSort ? "text-blue-600" : "text-gray-400"}`}
                                title={isActive ? "필터·정렬 적용 중" : "필터·정렬"}
                              >
                                <FilterIcon size={11} fill={isActive ? "currentColor" : "none"} />
                                {isSort && (sortDir === "asc"
                                  ? <ArrowUp size={9} className="text-blue-500" />
                                  : <ArrowDown size={9} className="text-blue-500" />)}
                              </button>
                            )}
                          </div>
                          {isFilterable && openCol === col.key && anchorEl && (
                            <ColumnFilterDropdown
                              anchorEl={anchorEl}
                              values={allValues(col.key as FCKey)}
                              selected={filters[col.key as FCKey] ?? []}
                              onApply={values => { handleFilterChange(col.key, values); handleFilterClose(); }}
                              onClose={handleFilterClose}
                              sortDir={sortKey === col.key ? sortDir : null}
                              onSort={dir => handleNormalSortFor(col.key as FCKey, dir)}
                              predicate={normalPredicates[col.key] ?? null}
                              onPredicate={p => setNormalPredicates(prev => {
                                const next = { ...prev };
                                if (p) next[col.key] = p; else delete next[col.key];
                                return next;
                              })}
                            />
                          )}
                        </th>
                      );
                    })}
                    <th className="px-3 py-1 text-center text-[11px] font-semibold text-gray-500 whitespace-nowrap">액션</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {pagedRows.map((d, i) => {
                    const log    = logByDrawingId.get(d.id) ?? null;
                    const hasCut = !!log;
                    const rowNo  = (page - 1) * PAGE_SIZE + i + 1;
                    return (
                      <tr key={d.id} className={`transition-colors ${hasCut ? "hover:bg-green-50/30" : "hover:bg-gray-50/60"}`}>
                        <td className="px-2 py-1 text-center text-gray-400">{rowNo}</td>
                        {/* 상태 — log.status 기준 (완료/중단중/진행중/대기) */}
                        <td className="px-3 py-1 text-center">
                          {(() => {
                            const st = !log ? { l: "대기", c: "bg-gray-100 text-gray-600" }
                              : log.status === "COMPLETED" ? { l: "완료",   c: "bg-green-100 text-green-700" }
                              : log.status === "PAUSED"    ? { l: "중단중", c: "bg-yellow-100 text-yellow-700" }
                              :                              { l: "진행중", c: "bg-blue-100 text-blue-700" };
                            return <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${st.c}`}>{st.l}</span>;
                          })()}
                        </td>
                        {/* 호선 */}
                        <td className="px-3 py-1 text-gray-600 font-mono text-[11px]">{d.project?.projectCode ?? "-"}</td>
                        {/* 블록 */}
                        <td className="px-3 py-1 text-gray-600">{d.block ?? "-"}</td>
                        {/* 도면번호 */}
                        <td className="px-3 py-1 font-mono text-[11px] font-bold text-gray-800">{d.drawingNo ?? "-"}</td>
                        {/* 재질 */}
                        <td className="px-3 py-1 text-gray-600">{d.material}</td>
                        {/* 두께 */}
                        <td className="px-3 py-1 text-right tabular-nums text-gray-600">{d.thickness}</td>
                        {/* 폭1 */}
                        <td className="px-3 py-1 text-right tabular-nums text-gray-600">{getW1(d)}</td>
                        {/* 폭2 */}
                        <td className="px-3 py-1 text-right tabular-nums text-gray-400">{d.assignedRemnant?.width2 ?? "-"}</td>
                        {/* 길이1 */}
                        <td className="px-3 py-1 text-right tabular-nums text-gray-600">{getL1(d)}</td>
                        {/* 길이2 */}
                        <td className="px-3 py-1 text-right tabular-nums text-gray-400">{d.assignedRemnant?.length2 ?? "-"}</td>
                        {/* 철판중량 */}
                        <td className="px-3 py-1 text-right tabular-nums text-gray-600">
                          {calcSteelWeight(d.thickness, getW1(d), getL1(d), d.assignedRemnant?.width2, d.assignedRemnant?.length2).toFixed(1)}
                        </td>
                        {/* 사용중량 */}
                        <td className="px-3 py-1 text-right tabular-nums text-gray-600">{d.useWeight?.toFixed(1) ?? "-"}</td>
                        {/* Heat NO */}
                        <td className="px-3 py-1 font-mono text-[11px] text-blue-700">{d.heatNo ?? "-"}</td>
                        {/* 작업자 */}
                        <td className="px-3 py-1 font-semibold text-gray-800">{log?.operator ?? "-"}</td>
                        {/* 장비 */}
                        <td className="px-3 py-1 text-gray-500">{log ? eqShort(log.equipment.name) : "-"}</td>
                        {/* 작업일 */}
                        <td className="px-3 py-1 text-gray-600 whitespace-nowrap font-mono text-[11px]">
                          {log ? fmtDate(log.startAt) : "-"}
                        </td>
                        {/* 총가동시간 — 야간이월(퇴근) 시간 차감 (실가동 셀과 동일 기준) */}
                        <td className="px-3 py-1 text-gray-500 whitespace-nowrap">
                          {log?.endAt ? fmtHM(libCalcTotalMs(log.startAt, log.endAt, log.pauses)) : (log ? "진행중" : "-")}
                        </td>
                        {/* 중단시간 */}
                        <td className="px-3 py-1 text-orange-500 whitespace-nowrap">
                          {log ? fmtPauseMin(calcPauseMs(log.pauses)) : "-"}
                        </td>
                        {/* 실가동시간 — 총가동(야간이월 제외) - 일반중단 */}
                        <td className="px-3 py-1 text-green-700 font-semibold whitespace-nowrap">
                          {log?.endAt ? fmtHM(Math.max(0, libCalcTotalMs(log.startAt, log.endAt, log.pauses) - calcPauseMs(log.pauses))) : (log ? "진행중" : "-")}
                        </td>
                        {/* 비고 */}
                        <td className="px-3 py-1 text-gray-400 max-w-[120px] truncate">{log?.memo ?? "-"}</td>
                        {/* 액션 */}
                        <td className="px-3 py-1 text-center">
                          {hasCut ? (
                            <div className="flex items-center justify-center gap-1">
                              <button
                                onClick={() => setModal({ open: true, mode: "edit", drawing: d, log })}
                                className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-md transition-colors"
                                title="수정"
                              >
                                <Edit2 size={13} />
                              </button>
                              <button
                                onClick={() => handleDelete(log.id)}
                                className="p-1.5 text-red-400 hover:bg-red-50 rounded-md transition-colors"
                                title="삭제"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setModal({ open: true, mode: "add", drawing: d, log: null })}
                              className="flex items-center gap-1 text-[11px] px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-semibold transition-colors mx-auto"
                            >
                              <Plus size={11} /> 추가
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {filteredDrawings.length === 0 && (
                    <tr>
                      <td colSpan={22} className="px-4 py-10 text-center text-gray-400">
                        {drawings.length === 0
                          ? (lastFiltered ? "검색 결과가 없습니다. 조건을 바꿔 다시 조회하세요." : "확정된 강재리스트가 없습니다.")
                          : "필터 결과가 없습니다."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* 페이지네이션 */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 bg-gray-50">
                <span className="text-xs text-gray-500">
                  {filteredDrawings.length}건 중 {(page-1)*PAGE_SIZE+1}~{Math.min(page*PAGE_SIZE, filteredDrawings.length)}번째
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-2.5 py-1 text-xs rounded border border-gray-200 disabled:opacity-40 hover:bg-white transition-colors"
                  >
                    이전
                  </button>
                  {Array.from({ length: Math.min(totalPages, 10) }, (_, i) => {
                    const p = i + 1;
                    return (
                      <button
                        key={p}
                        onClick={() => setPage(p)}
                        className={`px-2.5 py-1 text-xs rounded border transition-colors ${page === p ? "bg-blue-600 text-white border-blue-600" : "border-gray-200 hover:bg-white"}`}
                      >
                        {p}
                      </button>
                    );
                  })}
                  {totalPages > 10 && <span className="text-xs text-gray-400">... {totalPages}p</span>}
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="px-2.5 py-1 text-xs rounded border border-gray-200 disabled:opacity-40 hover:bg-white transition-colors"
                  >
                    다음
                  </button>
                </div>
              </div>
            )}
          </div>

        </div>
      )}

      {/* 모달 */}
      {modal.open && (
        <LogModal
          mode={modal.mode}
          drawing={modal.drawing}
          log={modal.log}
          equipment={equipment}
          workers={workers}
          projectId={modal.drawing?.projectId ?? ""}
          onClose={() => setModal(m => ({ ...m, open: false }))}
          onSaved={() => { setModal(m => ({ ...m, open: false })); fetchData(allMode); }}
        />
      )}
      </>)}
    </div>
  );
}

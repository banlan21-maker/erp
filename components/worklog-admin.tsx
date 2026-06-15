"use client";

import { useState, useEffect, useMemo } from "react";
import {
  ClipboardList, RefreshCw, Plus, Edit2, Trash2,
  AlertCircle, X, Save, Zap, Filter, XCircle,
} from "lucide-react";
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
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, []);

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
          <button onClick={fetchData} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-blue-600 pb-1">
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> 새로고침
          </button>
        </div>
      </div>

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
    heatNo:      log?.heatNo ?? drawing?.heatNo ?? "",
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
  const [forceClosing, setForceClosing] = useState(false);

  const handleForceClose = async () => {
    if (!stuckLog) return;
    setForceClosing(true);
    try {
      await fetch(`/api/cutting-logs/${stuckLog.id}`, { method: "DELETE" });
      setStuckLog(null);
      setError(null);
    } catch {
      setError("강제 종료 중 오류가 발생했습니다.");
    } finally {
      setForceClosing(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setStuckLog(null);
    if (!form.equipmentId || !form.operator.trim() || !form.startAt) {
      setError("장비, 작업자, 시작일시는 필수입니다.");
      return;
    }
    setSaving(true);
    try {
      if (mode === "add") {
        const res = await fetch("/api/cutting-logs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            equipmentId:   form.equipmentId,
            projectId,
            drawingListId: drawing?.id ?? null,
            heatNo:        form.heatNo || (drawing?.heatNo ?? ""),
            material:      drawing?.material ?? null,
            thickness:     drawing?.thickness ?? null,
            width:         drawing?.width ?? null,
            length:        drawing?.length ?? null,
            qty:           drawing?.qty ?? null,
            drawingNo:     drawing?.drawingNo ?? null,
            operator:      form.operator,
            memo:          form.memo || null,
            startAt:       form.startAt ? new Date(form.startAt).toISOString() : undefined,
          }),
        });
        const data = await res.json();
        if (!data.success) {
          setError(data.error);
          if (data.stuckLog) setStuckLog(data.stuckLog);
          return;
        }
        if (form.endAt && data.data?.id) {
          await fetch(`/api/cutting-logs/${data.data.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action:  "complete",
              memo:    form.memo || null,
              startAt: form.startAt ? new Date(form.startAt).toISOString() : undefined,
              endAt:   new Date(form.endAt).toISOString(),
            }),
          });
        }
      } else if (log) {
        const res = await fetch(`/api/cutting-logs/${log.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            equipmentId: form.equipmentId,
            operator:    form.operator,
            heatNo:      form.heatNo || null,
            startAt:     form.startAt ? new Date(form.startAt).toISOString() : undefined,
            endAt:       form.endAt   ? new Date(form.endAt).toISOString()   : null,
            status:      form.endAt ? "COMPLETED" : "STARTED",
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
                <button
                  type="button"
                  onClick={handleForceClose}
                  disabled={forceClosing}
                  className="mt-1 px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-semibold disabled:opacity-50"
                >
                  {forceClosing ? "처리중..." : "미종료 작업 강제 삭제 후 재시도"}
                </button>
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
            {heatOptions.length > 0 ? (
              <select
                value={form.heatNo}
                onChange={e => setForm(f => ({ ...f, heatNo: e.target.value }))}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">-- 판번호 선택 --</option>
                {heatOptions.map(h => (
                  <option key={h.id} value={h.heatNo}>{h.heatNo}</option>
                ))}
              </select>
            ) : (
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
                className="text-sm"
              />
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

  const fetchData = async () => {
    setLoading(true);
    try {
      const logParams = new URLSearchParams();
      if (dateFrom) logParams.set("dateFrom", dateFrom);
      if (dateTo)   logParams.set("dateTo",   dateTo);
      if (!dateFrom && !dateTo) logParams.set("all", "true");

      const [drawRes, logRes] = await Promise.all([
        fetch("/api/drawings?allConfirmed=true"),
        fetch(`/api/cutting-logs?${logParams}`),
      ]);
      const [drawJson, logJson] = await Promise.all([drawRes.json(), logRes.json()]);
      if (drawJson.success) setDrawings(drawJson.data);
      if (logJson.success)  setLogs(logJson.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [dateFrom, dateTo]);
  useEffect(() => { setPage(1); }, [dateFrom, dateTo, filters]);

  const logByDrawingId = useMemo(() => {
    const map = new Map<string, CuttingLog>();
    logs.forEach(l => { if (l.drawingListId) map.set(l.drawingListId, l); });
    return map;
  }, [logs]);

  // ── 필터 헬퍼 ───────────────────────────────────────────────────────────

  const getW1 = (d: Drawing) => d.assignedRemnant?.width1  ?? d.width;
  const getL1 = (d: Drawing) => d.assignedRemnant?.length1 ?? d.length;

  const getVal = (d: Drawing, log: CuttingLog | null, col: FCKey): string => {
    switch (col) {
      case "status":     return log ? "완료" : "대기";
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
        return fmtHM(new Date(log.endAt).getTime() - new Date(log.startAt).getTime());
      }
      case "pauseTime":  return log ? fmtPauseMin(calcPauseMs(log.pauses)) : "";
      case "activeTime": {
        if (!log?.endAt) return log ? "진행중" : "";
        const totMs  = new Date(log.endAt).getTime() - new Date(log.startAt).getTime();
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
  const cutCount    = filteredDrawings.filter(d => logByDrawingId.has(d.id)).length;

  const handleDelete = async (logId: string) => {
    if (!confirm("이 작업일보를 삭제할까요? (강재 상태가 복원됩니다)")) return;
    await fetch(`/api/cutting-logs/${logId}`, { method: "DELETE" });
    fetchData();
  };

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ClipboardList size={24} className="text-blue-600" /> 작업일보 관리
          </h2>
          <p className="text-sm text-gray-500 mt-1">날짜 필터로 작업일보를 조회하고 수정·삭제할 수 있습니다.</p>
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
              <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="text-sm" />
              {(dateFrom || dateTo) && (
                <button onClick={() => { setDateFrom(""); setDateTo(""); }} className="text-gray-400 hover:text-gray-600">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
          <button
            onClick={() => fetchData()}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-blue-600 transition-colors pb-1"
          >
            <RefreshCw size={13} /> 새로고침
          </button>
        </div>
      </div>

      {/* 데이터 영역 */}
      {loading ? (
        <div className="flex justify-center items-center py-20 text-gray-400 gap-3">
          <RefreshCw className="animate-spin text-blue-500" size={24} /> 데이터를 불러오는 중...
        </div>
      ) : (
        <div className="space-y-3">

          {/* 요약 + 필터 뱃지 */}
          <div className="flex items-center gap-4 text-sm flex-wrap bg-white border border-gray-200 rounded-xl px-5 py-3 shadow-sm">
            <span className="text-gray-500">전체 <strong className="text-gray-900">{filteredDrawings.length}</strong>건</span>
            <span className="text-green-600">완료 <strong>{cutCount}</strong>건</span>
            <span className="text-yellow-600">진행중 <strong>{filteredDrawings.filter(d => logByDrawingId.get(d.id)?.status === "STARTED").length}</strong>건</span>
            <span className="text-gray-400">미등록 <strong>{filteredDrawings.length - cutCount}</strong>건</span>
            {filterCount > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded-md">
                <FilterIcon size={11} fill="currentColor" />
                <span>필터 {filterCount}개 적용 ({filteredDrawings.length}/{drawings.length}행)</span>
                <button onClick={() => { setFilters({}); setNormalPredicates({}); }} className="ml-0.5 hover:text-blue-800" title="모든 필터 초기화">
                  <XCircle size={12} />
                </button>
              </div>
            )}
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
                        {/* 상태 */}
                        <td className="px-3 py-1 text-center">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${hasCut ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>
                            {hasCut ? "완료" : "대기"}
                          </span>
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
                        {/* 총가동시간 */}
                        <td className="px-3 py-1 text-gray-500 whitespace-nowrap">
                          {log?.endAt ? fmtHM(new Date(log.endAt).getTime() - new Date(log.startAt).getTime()) : (log ? "진행중" : "-")}
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
                        {drawings.length === 0 ? "확정된 강재리스트가 없습니다." : "필터 결과가 없습니다."}
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
          onSaved={() => { setModal(m => ({ ...m, open: false })); fetchData(); }}
        />
      )}
      </>)}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, RefreshCw, Undo2, Loader2, Filter, ArrowUp, ArrowDown, Search, XCircle } from "lucide-react";
import ColumnFilterDropdown from "@/components/column-filter-dropdown";
import {
  getAllCascadedOptions,
  getCascadedFilteredRowsWithPredicates,
  type ColumnAccessorMap,
  type TextPredicate,
} from "@/lib/cascading-filters";

interface HeatRow {
  id: string; heatNo: string; status: string; archivedAt: string;
  inVessel: string; inBlock: string; material: string; thickness: number; width: number; length: number; weight: number;
  useVessel: string; useBlock: string; drawingNo: string; equipment: string; useDate: string | null;
  outVessel: string; outBlock: string; dest: string; outDate: string | null;
}
interface PlanRow {
  id: string; vesselCode: string; material: string; thickness: number; width: number; length: number; weight: number;
  status: string; reservedFor: string; receivedAt: string | null; issuedAt: string | null; archivedAt: string;
}

const fmtDate = (v: string | null) => v ? new Date(v).toLocaleDateString("ko-KR", { year: "2-digit", month: "2-digit", day: "2-digit" }) : "";
const fmtT = (v: number) => parseFloat(v.toFixed(1));
const fmtL = (v: number) => Math.round(v);
const todayStr = () => new Date().toISOString().slice(0, 10);
const monthsAgoStr = (n: number) => { const d = new Date(); d.setMonth(d.getMonth() - n); return d.toISOString().slice(0, 10); };
const planStatusLabel = (s: string) => s === "COMPLETED" ? "절단완료" : s === "SHIPPED_OUT" ? "외부출고" : s;

export default function ArchivePage() {
  const [tab, setTab] = useState<"plates" | "surplus" | "registered" | "remnant">("plates");
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Archive size={22} className="text-gray-600" /> 아카이브</h2>
        <p className="text-sm text-gray-500 mt-1">완료·출고된 오래된 자재를 활성 목록에서 숨겨 보관 (전 생애 추적 유지, 복원 가능)</p>
      </div>
      <div className="flex gap-1 border-b border-gray-200 flex-wrap">
        {([["plates", "정규작업"], ["surplus", "여유원재"], ["registered", "등록잔재"], ["remnant", "현장잔재"]] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px ${tab === k ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-800"}`}>{label}</button>
        ))}
      </div>
      {tab === "plates" ? <PlatesTab /> : (
        <div className="bg-white border border-gray-200 rounded-xl py-16 text-center text-gray-400 text-sm">
          잔재 아카이브(여유원재·등록잔재·현장잔재)는 차후 구현 예정입니다.
        </div>
      )}
    </div>
  );
}

type Basis = "terminal" | "useDate" | "outDate" | "archivedAt";
const PAGE_SIZE = 50;

/* ── 강재전체목록과 동일한 컬럼 필터·정렬·페이지네이션 (재사용 훅) ───────────── */
function useColumnFilterTable<T>(rows: T[], accessors: ColumnAccessorMap<T>, pageSize = PAGE_SIZE) {
  const [filters, setFilters] = useState<Record<string, string[]>>({});
  const [predicates, setPredicates] = useState<Record<string, TextPredicate>>({});
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [openCol, setOpenCol] = useState<string | null>(null);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [page, setPage] = useState(1);

  const distinctValues = useMemo(() => getAllCascadedOptions(rows, filters, accessors), [rows, filters, accessors]);

  const filtered = useMemo(() => {
    const base = getCascadedFilteredRowsWithPredicates(rows, filters, predicates, accessors);
    if (!sortKey) return base;
    const acc = accessors[sortKey];
    if (!acc) return base;
    return [...base].sort((a, b) => {
      const av = acc(a), bv = acc(b);
      const cmp = (typeof av === "number" && typeof bv === "number")
        ? av - bv
        : String(av ?? "").localeCompare(String(bv ?? ""), "ko", { numeric: true });
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [rows, filters, predicates, sortKey, sortDir, accessors]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  useEffect(() => { setPage(1); }, [filters, predicates, sortKey, sortDir, rows]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);
  const pageRows = useMemo(() => filtered.slice((page - 1) * pageSize, page * pageSize), [filtered, page, pageSize]);

  const pageNums = useMemo(() => {
    const out: (number | "…")[] = [];
    for (let p = 1; p <= totalPages; p++) {
      if (p === 1 || p === totalPages || (p >= page - 2 && p <= page + 2)) out.push(p);
      else if (out[out.length - 1] !== "…") out.push("…");
    }
    return out;
  }, [page, totalPages]);

  const handleFilterChange = (col: string, values: string[]) =>
    setFilters(p => values.length === 0 ? Object.fromEntries(Object.entries(p).filter(([k]) => k !== col)) : { ...p, [col]: values });
  const closeMenu = () => { setOpenCol(null); setAnchorEl(null); };
  const clearFilters = () => { setFilters({}); setPredicates({}); };
  const filterCount = Object.keys(filters).length + Object.values(predicates).filter(p => p && (p.op === "empty" || p.op === "notEmpty" || p.val.length > 0)).length;

  // 컴포넌트 경계를 넘지 않도록 함수로 호출해 인라인 렌더 (드롭다운 재마운트 방지)
  const renderTh = (k: string, label: string, cls?: string, rowSpan?: number) => {
    const hasValues = (filters[k]?.length ?? 0) > 0;
    const p = predicates[k];
    const hasPred = !!p && (p.op === "empty" || p.op === "notEmpty" || p.val.length > 0);
    const isActive = hasValues || hasPred;
    const isSort = sortKey === k;
    return (
      <th key={k} rowSpan={rowSpan} className={`px-2 py-1.5 whitespace-nowrap ${cls ?? ""}`}>
        <div className="flex items-center justify-center gap-1">
          <span>{label}</span>
          <button
            onClick={e => { e.stopPropagation(); if (openCol === k) { closeMenu(); return; } setOpenCol(k); setAnchorEl(e.currentTarget); }}
            className={`p-0.5 rounded hover:bg-gray-200 inline-flex items-center ${isActive ? "text-blue-600" : "text-gray-400"}`}
            title="필터·정렬"
          >
            <Filter size={10} fill={isActive ? "currentColor" : "none"} />
            {isSort && (sortDir === "asc" ? <ArrowUp size={9} className="text-blue-500" /> : <ArrowDown size={9} className="text-blue-500" />)}
          </button>
        </div>
        {openCol === k && anchorEl && (
          <ColumnFilterDropdown
            anchorEl={anchorEl}
            values={distinctValues[k] ?? []}
            selected={filters[k] ?? []}
            onApply={values => { handleFilterChange(k, values); closeMenu(); }}
            onClose={closeMenu}
            sortDir={sortKey === k ? sortDir : null}
            onSort={dir => { if (dir === null) { setSortKey(null); setSortDir("asc"); } else { setSortKey(k); setSortDir(dir); } }}
            predicate={predicates[k] ?? null}
            onPredicate={pp => setPredicates(prev => { const n = { ...prev }; if (pp) n[k] = pp; else delete n[k]; return n; })}
          />
        )}
      </th>
    );
  };

  return { filtered, pageRows, page, setPage, totalPages, pageNums, filterCount, clearFilters, renderTh };
}

function Pager({ page, totalPages, pageNums, total, pageSize, onPage }: {
  page: number; totalPages: number; pageNums: (number | "…")[]; total: number; pageSize: number; onPage: (p: number) => void;
}) {
  if (total === 0) return null;
  return (
    <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-t border-gray-200 bg-gray-50 flex-wrap">
      <span className="text-xs text-gray-500">{(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} / 총 {total}건</span>
      <div className="flex items-center gap-1">
        <button onClick={() => onPage(Math.max(1, page - 1))} disabled={page === 1}
          className="px-2.5 py-1 text-sm border border-gray-300 rounded-lg hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed">이전</button>
        {pageNums.map((p, i) => p === "…"
          ? <span key={`e${i}`} className="px-1.5 text-gray-400">…</span>
          : <button key={p} onClick={() => onPage(p)}
              className={`px-2.5 py-1 text-sm border rounded-lg ${page === p ? "bg-blue-600 text-white border-blue-600" : "border-gray-300 hover:bg-white"}`}>{p}</button>
        )}
        <button onClick={() => onPage(Math.min(totalPages, page + 1))} disabled={page === totalPages}
          className="px-2.5 py-1 text-sm border border-gray-300 rounded-lg hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed">다음</button>
      </div>
    </div>
  );
}

function PlatesTab() {
  const [rows, setRows] = useState<HeatRow[]>([]);
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [eligible, setEligible] = useState(0);
  const [months, setMonths] = useState(1);
  const [busy, setBusy] = useState(false);

  const [mode, setMode] = useState<"heat" | "plan">("heat");
  const [basis, setBasis] = useState<Basis>("archivedAt");
  const [from, setFrom] = useState(() => monthsAgoStr(3));
  const [to, setTo] = useState(() => todayStr());
  const [queried, setQueried] = useState(false);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  // 초기 진입: 실행 대상 수(eligible)만 로드 — 리스트는 숨김
  const loadCount = useCallback(async () => {
    const r = await fetch(`/api/cutpart/archive?months=${months}`).then(r => r.json()).catch(() => ({ success: false }));
    if (r.success) setEligible(r.eligible);
  }, [months]);
  useEffect(() => { loadCount(); }, [loadCount]);

  const query = useCallback(async () => {
    if (!from || !to) { alert("기간(시작·종료일)을 설정하세요."); return; }
    if (from > to) { alert("시작일이 종료일보다 늦습니다."); return; }
    setLoading(true);
    const qs = new URLSearchParams({ months: String(months), from, to, basis }).toString();
    const r = await fetch(`/api/cutpart/archive?${qs}`).then(r => r.json()).catch(() => ({ success: false }));
    if (r.success) { setRows(r.data ?? []); setPlans(r.plans ?? []); setEligible(r.eligible); setQueried(true); }
    else alert(r.error ?? "조회 실패");
    setLoading(false);
  }, [from, to, basis, months]);

  const run = async () => {
    if (!confirm(`완료·출고된 지 ${months}개월 이상인 판번호 ${eligible}건을 아카이브(숨김)하시겠습니까?\n(강재전체목록·판번호리스트에서 숨겨지고, 여기서 조회·복원 가능)`)) return;
    setBusy(true);
    try {
      const r = await fetch("/api/cutpart/archive", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "run", months }) }).then(r => r.json());
      if (!r.success) { alert(r.error ?? "실패"); return; }
      alert(`판번호 ${r.archivedHeats}건, 강재 ${r.archivedPlans}건 아카이브됨.`);
      await loadCount();
      if (queried) await query();
    } finally { setBusy(false); }
  };
  const restore = async (body: { heatIds?: string[]; planIds?: string[]; all?: boolean }, confirmMsg: string) => {
    if (!confirm(confirmMsg)) return;
    const r = await fetch("/api/cutpart/archive", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "restore", ...body }) }).then(r => r.json());
    if (!r.success) { alert(r.error ?? "복원 실패"); return; }
    await loadCount();
    if (queried) await query();
  };
  const restoreHeat = (id: string) => restore({ heatIds: [id] }, "이 판번호를 활성 목록으로 복원하시겠습니까?");
  const restorePlan = (id: string) => restore({ planIds: [id] }, "이 강재(사양단위)를 활성 목록으로 복원하시겠습니까?");
  const restoreAll = () => restore({ all: true }, "아카이브된 전체(판번호·강재)를 활성 목록으로 복원하시겠습니까?");

  // accessors — 표시값과 동일한 문자열/숫자를 반환해야 필터·정렬이 화면과 일치
  const heatAccessors = useMemo<ColumnAccessorMap<HeatRow>>(() => ({
    heatNo: r => r.heatNo,
    inVessel: r => r.inVessel, inBlock: r => r.inBlock, material: r => r.material,
    thickness: r => fmtT(r.thickness), width: r => fmtL(r.width), length: r => fmtL(r.length), weight: r => r.weight,
    useVessel: r => r.useVessel, useBlock: r => r.useBlock, drawingNo: r => r.drawingNo, equipment: r => r.equipment, useDate: r => fmtDate(r.useDate),
    outVessel: r => r.outVessel, outBlock: r => r.outBlock, dest: r => r.dest, outDate: r => fmtDate(r.outDate),
  }), []);
  const planAccessors = useMemo<ColumnAccessorMap<PlanRow>>(() => ({
    vesselCode: r => r.vesselCode, material: r => r.material,
    thickness: r => fmtT(r.thickness), width: r => fmtL(r.width), length: r => fmtL(r.length), weight: r => r.weight,
    status: r => planStatusLabel(r.status), reservedFor: r => r.reservedFor,
    receivedAt: r => fmtDate(r.receivedAt), issuedAt: r => fmtDate(r.issuedAt), archivedAt: r => fmtDate(r.archivedAt),
  }), []);

  const searchedHeat = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.trim().toLowerCase();
    return rows.filter(r => `${r.heatNo} ${r.inVessel} ${r.material} ${r.useVessel} ${r.useBlock} ${r.drawingNo} ${r.equipment} ${r.outVessel} ${r.outBlock} ${r.dest}`.toLowerCase().includes(q));
  }, [rows, search]);
  const searchedPlan = useMemo(() => {
    if (!search.trim()) return plans;
    const q = search.trim().toLowerCase();
    return plans.filter(r => `${r.vesselCode} ${r.material} ${r.reservedFor}`.toLowerCase().includes(q));
  }, [plans, search]);

  const heatTable = useColumnFilterTable(searchedHeat, heatAccessors);
  const planTable = useColumnFilterTable(searchedPlan, planAccessors);
  const active = mode === "heat" ? heatTable : planTable;

  const toggleBtn = (m: "heat" | "plan", label: string, count: number) => (
    <button onClick={() => setMode(m)}
      className={`px-3 py-1.5 text-sm font-semibold ${mode === m ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>
      {label}{queried && <span className={mode === m ? "text-blue-100" : "text-gray-400"}> ({count})</span>}
    </button>
  );

  return (
    <div className="space-y-3">
      {/* 아카이브 실행 */}
      <div className="bg-white border border-gray-200 rounded-xl p-3 flex flex-wrap items-center gap-2">
        <span className="text-sm text-gray-600">완료·출고된 지</span>
        <select value={months} onChange={e => setMonths(Number(e.target.value))} className="px-2 py-1.5 text-sm border border-gray-300 rounded-lg">
          {[1, 2, 3, 6, 12].map(m => <option key={m} value={m}>{m}개월</option>)}
        </select>
        <span className="text-sm text-gray-600">이상 →</span>
        <button onClick={run} disabled={busy || eligible === 0} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50">
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Archive size={14} />} 아카이브 실행 ({eligible}건)
        </button>
        <button onClick={restoreAll} className="ml-auto inline-flex items-center gap-1 px-3 py-1.5 text-sm border border-amber-300 text-amber-700 rounded-lg hover:bg-amber-50"><Undo2 size={14} /> 전체 복원</button>
      </div>

      {/* 기간 조회 */}
      <div className="bg-white border border-gray-200 rounded-xl p-3 flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-gray-700">기간 조회</span>
        <select value={basis} onChange={e => setBasis(e.target.value as Basis)} className="px-2 py-1.5 text-sm border border-gray-300 rounded-lg" title="기간 판정 기준일">
          <option value="archivedAt">아카이브일자</option>
          <option value="terminal">터미널일(사용/출고)</option>
          <option value="useDate">사용일자</option>
          <option value="outDate">출고일자</option>
        </select>
        <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="px-2 py-1.5 text-sm border border-gray-300 rounded-lg" />
        <span className="text-gray-400">~</span>
        <input type="date" value={to} onChange={e => setTo(e.target.value)} className="px-2 py-1.5 text-sm border border-gray-300 rounded-lg" />
        <button onClick={query} disabled={loading} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm bg-gray-800 text-white font-semibold rounded-lg hover:bg-gray-900 disabled:opacity-50">
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />} 조회
        </button>
        <div className="ml-auto flex items-center gap-2">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={mode === "heat" ? "판번호·호선·재질·도면·도착지 검색" : "호선·재질·확정블록 검색"} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg w-64" />
          <button onClick={query} disabled={loading} className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50" title="새로고침"><RefreshCw size={14} /></button>
        </div>
      </div>

      {/* 결과 리스트 */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-2 border-b border-gray-200 bg-gray-50 flex items-center gap-3 flex-wrap">
          <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden divide-x divide-gray-300">
            {toggleBtn("heat", "판번호", rows.length)}
            {toggleBtn("plan", "강재", plans.length)}
          </div>
          <span className="text-sm font-bold text-gray-700">{mode === "heat" ? "아카이브된 판번호" : "아카이브된 강재(사양단위)"} {queried && <span className="text-gray-400 font-normal">({active.filtered.length}건)</span>}</span>
          {active.filterCount > 0 && (
            <button onClick={active.clearFilters} className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800">
              <XCircle size={12} /> 필터 {active.filterCount}개 초기화
            </button>
          )}
        </div>

        {/* 판번호 테이블 */}
        {mode === "heat" && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-xs whitespace-nowrap">
                <thead className="text-gray-600">
                  <tr className="bg-gray-100 text-center border-b border-gray-200">
                    {heatTable.renderTh("heatNo", "판번호", "border-r border-gray-200", 2)}
                    <th colSpan={7} className="px-2 py-1 bg-sky-50 text-sky-700 border-r border-gray-200">입고정보</th>
                    <th colSpan={5} className="px-2 py-1 bg-amber-50 text-amber-700 border-r border-gray-200">사용정보 (절단)</th>
                    <th colSpan={4} className="px-2 py-1 bg-emerald-50 text-emerald-700 border-r border-gray-200">출고정보</th>
                    <th rowSpan={2} className="px-2 py-1.5">복원</th>
                  </tr>
                  <tr className="bg-gray-50 text-center border-b border-gray-200">
                    {heatTable.renderTh("inVessel", "호선")}{heatTable.renderTh("inBlock", "블록")}{heatTable.renderTh("material", "재질")}{heatTable.renderTh("thickness", "두께")}{heatTable.renderTh("width", "폭")}{heatTable.renderTh("length", "길이")}{heatTable.renderTh("weight", "중량", "border-r border-gray-200")}
                    {heatTable.renderTh("useVessel", "호선")}{heatTable.renderTh("useBlock", "블록")}{heatTable.renderTh("drawingNo", "도면번호")}{heatTable.renderTh("equipment", "절단장비")}{heatTable.renderTh("useDate", "사용일자", "border-r border-gray-200")}
                    {heatTable.renderTh("outVessel", "호선")}{heatTable.renderTh("outBlock", "블록")}{heatTable.renderTh("dest", "도착지")}{heatTable.renderTh("outDate", "출고일자", "border-r border-gray-200")}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {loading ? (
                    <tr><td colSpan={18} className="py-10 text-center text-gray-400"><Loader2 className="animate-spin inline mr-2" size={16} /> 불러오는 중...</td></tr>
                  ) : !queried ? (
                    <tr><td colSpan={18} className="py-12 text-center text-gray-400">기준일과 기간을 설정하고 <b className="text-gray-600">[조회]</b>를 누르면 해당 기간의 아카이브 판번호가 표시됩니다.</td></tr>
                  ) : heatTable.filtered.length === 0 ? (
                    <tr><td colSpan={18} className="py-10 text-center text-gray-400">해당 기간·조건에 맞는 아카이브 판번호가 없습니다.</td></tr>
                  ) : heatTable.pageRows.map(r => (
                    <tr key={r.id} className="hover:bg-gray-50 text-center">
                      <td className="px-2 py-1.5 font-mono font-semibold border-r border-gray-100">{r.heatNo}</td>
                      <td className="px-2 py-1.5">{r.inVessel}</td><td className="px-2 py-1.5">{r.inBlock || "-"}</td><td className="px-2 py-1.5">{r.material}</td>
                      <td className="px-2 py-1.5 font-mono">{fmtT(r.thickness)}</td><td className="px-2 py-1.5 font-mono">{fmtL(r.width)}</td><td className="px-2 py-1.5 font-mono">{fmtL(r.length)}</td><td className="px-2 py-1.5 font-mono border-r border-gray-100">{r.weight}</td>
                      <td className="px-2 py-1.5">{r.useVessel || "-"}</td><td className="px-2 py-1.5">{r.useBlock || "-"}</td><td className="px-2 py-1.5 font-mono">{r.drawingNo || "-"}</td><td className="px-2 py-1.5">{r.equipment || "-"}</td><td className="px-2 py-1.5 border-r border-gray-100">{fmtDate(r.useDate) || "-"}</td>
                      <td className="px-2 py-1.5">{r.outVessel || "-"}</td><td className="px-2 py-1.5">{r.outBlock || "-"}</td><td className="px-2 py-1.5">{r.dest || "-"}</td><td className="px-2 py-1.5 border-r border-gray-100">{fmtDate(r.outDate) || "-"}</td>
                      <td className="px-2 py-1.5"><button onClick={() => restoreHeat(r.id)} className="text-amber-600 hover:underline" title="복원"><Undo2 size={13} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {queried && <Pager page={heatTable.page} totalPages={heatTable.totalPages} pageNums={heatTable.pageNums} total={heatTable.filtered.length} pageSize={PAGE_SIZE} onPage={heatTable.setPage} />}
          </>
        )}

        {/* 강재(사양단위) 테이블 */}
        {mode === "plan" && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-xs whitespace-nowrap">
                <thead className="text-gray-600">
                  <tr className="bg-gray-50 text-center border-b border-gray-200">
                    {planTable.renderTh("vesselCode", "호선")}{planTable.renderTh("material", "재질")}{planTable.renderTh("thickness", "두께")}{planTable.renderTh("width", "폭")}{planTable.renderTh("length", "길이")}{planTable.renderTh("weight", "중량")}
                    {planTable.renderTh("status", "상태")}{planTable.renderTh("reservedFor", "확정블록")}{planTable.renderTh("receivedAt", "입고일")}{planTable.renderTh("issuedAt", "출고일")}{planTable.renderTh("archivedAt", "아카이브일")}
                    <th className="px-2 py-1.5">복원</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {loading ? (
                    <tr><td colSpan={12} className="py-10 text-center text-gray-400"><Loader2 className="animate-spin inline mr-2" size={16} /> 불러오는 중...</td></tr>
                  ) : !queried ? (
                    <tr><td colSpan={12} className="py-12 text-center text-gray-400">기준일과 기간을 설정하고 <b className="text-gray-600">[조회]</b>를 누르면 해당 기간의 아카이브 강재가 표시됩니다.</td></tr>
                  ) : planTable.filtered.length === 0 ? (
                    <tr><td colSpan={12} className="py-10 text-center text-gray-400">해당 기간·조건에 맞는 아카이브 강재가 없습니다.</td></tr>
                  ) : planTable.pageRows.map(r => (
                    <tr key={r.id} className="hover:bg-gray-50 text-center">
                      <td className="px-2 py-1.5">{r.vesselCode}</td><td className="px-2 py-1.5">{r.material}</td>
                      <td className="px-2 py-1.5 font-mono">{fmtT(r.thickness)}</td><td className="px-2 py-1.5 font-mono">{fmtL(r.width)}</td><td className="px-2 py-1.5 font-mono">{fmtL(r.length)}</td><td className="px-2 py-1.5 font-mono">{r.weight}</td>
                      <td className="px-2 py-1.5">{planStatusLabel(r.status)}</td><td className="px-2 py-1.5">{r.reservedFor || "-"}</td>
                      <td className="px-2 py-1.5">{fmtDate(r.receivedAt) || "-"}</td><td className="px-2 py-1.5">{fmtDate(r.issuedAt) || "-"}</td><td className="px-2 py-1.5">{fmtDate(r.archivedAt) || "-"}</td>
                      <td className="px-2 py-1.5"><button onClick={() => restorePlan(r.id)} className="text-amber-600 hover:underline" title="복원"><Undo2 size={13} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {queried && <Pager page={planTable.page} totalPages={planTable.totalPages} pageNums={planTable.pageNums} total={planTable.filtered.length} pageSize={PAGE_SIZE} onPage={planTable.setPage} />}
          </>
        )}
      </div>
    </div>
  );
}

"use client";

/**
 * 용차사용대장 — 외부 차량 임대(용차) 사용 내역 관리
 * UI 패턴: components/transport-driving-log-tab.tsx 와 동일
 * 출발지/도착지 = DrivingLocation 프리셋(공용) + 직접입력
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { Plus, Trash2, RefreshCw, X, Save, ChevronLeft, ChevronRight, FileText, Download, Filter, Pencil, ArrowUp, ArrowDown } from "lucide-react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import ColumnFilterDropdown, { type FilterValue } from "./column-filter-dropdown";
import { getCascadedFilteredRowsWithPredicates, getAllCascadedOptions, type ColumnAccessorMap, type TextPredicate } from "@/lib/cascading-filters";

interface CharterUsage {
  id:          string;
  date:        string;
  driverName:  string;
  driverPhone: string | null;
  vehicleNo:   string | null;
  items:       string | null;
  departure:   string | null;
  destination: string | null;
  departTime:  string | null;
  cost:        number | null;
  memo:        string | null;
  createdAt:   string;
}

const todayYMD = () => new Date().toISOString().split("T")[0];

const FORM_INIT = {
  date:        "",
  driverName:  "",
  driverPhone: "",
  vehicleNo:   "",
  items:       "",
  departure:   "",
  destination: "",
  departTime:  "",
  cost:        "",
  memo:        "",
};

const won = (n: number | null) => n != null ? n.toLocaleString() + "원" : "-";

interface DrivingLocation { id: string; name: string; }

export default function CharterUsageTab() {
  const today = new Date();
  const [year,  setYear]  = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [logs,  setLogs]  = useState<CharterUsage[]>([]);
  const [loading, setLoading] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState({ ...FORM_INIT, date: todayYMD() });
  const [saving, setSaving]     = useState(false);
  const [formErr, setFormErr]   = useState("");

  const [editId,   setEditId]   = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ ...FORM_INIT });

  /* 위치 프리셋 (출발·도착 공용) — driving-log 와 동일 모델 재사용 */
  const [locations, setLocations] = useState<DrivingLocation[]>([]);
  const [locEditMode, setLocEditMode] = useState(false);
  const [newLocName, setNewLocName] = useState("");

  const loadLocations = useCallback(async () => {
    const r = await fetch("/api/driving-location");
    const d = await r.json();
    if (d.success) setLocations(d.data);
  }, []);
  useEffect(() => { loadLocations(); }, [loadLocations]);

  const addLocation = async () => {
    const nm = newLocName.trim();
    if (!nm) return;
    const r = await fetch("/api/driving-location", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: nm }),
    });
    const d = await r.json();
    if (!d.success) { alert(d.error ?? "추가 실패"); return; }
    setNewLocName("");
    loadLocations();
  };
  const deleteLocation = async (id: string, name: string) => {
    if (!confirm(`'${name}' 위치를 목록에서 제거하시겠습니까?`)) return;
    const r = await fetch(`/api/driving-location?id=${id}`, { method: "DELETE" });
    const d = await r.json();
    if (!d.success) { alert(d.error ?? "삭제 실패"); return; }
    loadLocations();
  };

  /* 로드 */
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/charter-usage?year=${year}&month=${month}`);
      const d = await r.json();
      if (d.success) setLogs(d.data);
    } finally { setLoading(false); }
  }, [year, month]);
  useEffect(() => { load(); }, [load]);

  /* 월 이동 */
  const prevMonth = () => {
    if (month === 1) { setYear(year - 1); setMonth(12); } else setMonth(month - 1);
  };
  const nextMonth = () => {
    if (month === 12) { setYear(year + 1); setMonth(1); } else setMonth(month + 1);
  };

  /* 등록 */
  const set = (k: keyof typeof form, v: string) => setForm(p => ({ ...p, [k]: v }));
  const openForm = () => {
    setForm({ ...FORM_INIT, date: todayYMD() });
    setFormErr("");
    setShowForm(true);
  };
  const handleSubmit = async () => {
    setFormErr("");
    if (!form.date)               { setFormErr("날짜를 입력하세요."); return; }
    if (!form.driverName.trim())  { setFormErr("운전자 이름을 입력하세요."); return; }
    setSaving(true);
    try {
      const r = await fetch("/api/charter-usage", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const d = await r.json();
      if (!d.success) { setFormErr(d.error ?? "저장 실패"); return; }
      setShowForm(false);
      load();
    } catch { setFormErr("서버 오류"); }
    finally { setSaving(false); }
  };

  /* 수정 */
  const setE = (k: keyof typeof editForm, v: string) => setEditForm(p => ({ ...p, [k]: v }));
  const openEdit = (l: CharterUsage) => {
    setEditId(l.id);
    setEditForm({
      date:        l.date,
      driverName:  l.driverName,
      driverPhone: l.driverPhone ?? "",
      vehicleNo:   l.vehicleNo ?? "",
      items:       l.items ?? "",
      departure:   l.departure ?? "",
      destination: l.destination ?? "",
      departTime:  l.departTime ?? "",
      cost:        l.cost != null ? String(l.cost) : "",
      memo:        l.memo ?? "",
    });
  };
  const saveEdit = async () => {
    if (!editId) return;
    const r = await fetch(`/api/charter-usage/${editId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editForm),
    });
    const d = await r.json();
    if (!d.success) { alert(d.error ?? "수정 실패"); return; }
    setEditId(null);
    load();
  };
  const deleteLog = async (id: string) => {
    if (!confirm("이 기록을 삭제하시겠습니까?")) return;
    await fetch(`/api/charter-usage/${id}`, { method: "DELETE" });
    load();
  };

  /* 컬럼 필터 */
  const COLUMNS = useMemo(() => [
    { key: "date",        label: "날짜",       align: "left"   as const },
    { key: "driverName",  label: "운전자",     align: "left"   as const },
    { key: "driverPhone", label: "전화번호",   align: "left"   as const },
    { key: "vehicleNo",   label: "차량번호",   align: "left"   as const },
    { key: "items",       label: "출고품목",   align: "left"   as const },
    { key: "departure",   label: "출발지",     align: "left"   as const },
    { key: "destination", label: "도착지",     align: "left"   as const },
    { key: "departTime",  label: "출발시간",   align: "center" as const },
    { key: "cost",        label: "용차비용",   align: "right"  as const },
    { key: "memo",        label: "비고",       align: "left"   as const },
  ], []);

  const colValue = (l: CharterUsage, col: string): string => {
    switch (col) {
      case "date":        return l.date;
      case "driverName":  return l.driverName;
      case "driverPhone": return l.driverPhone ?? "";
      case "vehicleNo":   return l.vehicleNo ?? "";
      case "items":       return l.items ?? "";
      case "departure":   return l.departure ?? "";
      case "destination": return l.destination ?? "";
      case "departTime":  return l.departTime ?? "";
      case "cost":        return l.cost != null ? String(l.cost) : "";
      case "memo":        return l.memo ?? "";
      default: return "";
    }
  };

  const [colFilters, setColFilters] = useState<Record<string, string[]>>({});
  const [predicates, setPredicates] = useState<Record<string, TextPredicate>>({});
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [openFilter, setOpenFilter] = useState<string | null>(null);
  const [filterAnchorEl, setFilterAnchorEl] = useState<HTMLElement | null>(null);

  // 월 변경 시 필터 리셋
  useEffect(() => { setColFilters({}); setPredicates({}); setSortKey(null); }, [year, month]);

  const handleSortFor = (col: string, dir: "asc" | "desc" | null) => {
    if (dir === null) { setSortKey(null); setSortDir("asc"); }
    else { setSortKey(col); setSortDir(dir); }
  };

  // cascading filter accessors
  const accessors = useMemo<ColumnAccessorMap<CharterUsage>>(() => {
    const m: ColumnAccessorMap<CharterUsage> = {};
    for (const c of COLUMNS) m[c.key] = (row) => colValue(row, c.key);
    return m;
  }, [COLUMNS, colValue]);

  const distinctValues = useMemo(
    () => getAllCascadedOptions(logs, colFilters, accessors),
    [logs, colFilters, accessors],
  );

  const filteredLogs = useMemo(() => {
    const base = getCascadedFilteredRowsWithPredicates(logs, colFilters, predicates, accessors);
    if (!sortKey) return base;
    return [...base].sort((a, b) => {
      const av = colValue(a, sortKey);
      const bv = colValue(b, sortKey);
      const cmp = av.localeCompare(bv, "ko", { numeric: true });
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [logs, colFilters, predicates, sortKey, sortDir, accessors, colValue]);

  const activeFilterCount =
    Object.values(colFilters).filter(v => v.length).length +
    Object.values(predicates).filter(p => p && (p.op === "empty" || p.op === "notEmpty" || p.val.length > 0)).length;

  /* 월간 요약 */
  const summary = useMemo(() => {
    const count = filteredLogs.length;
    const totalCost = filteredLogs.reduce((s, l) => s + (l.cost ?? 0), 0);
    return { count, totalCost };
  }, [filteredLogs]);

  /* 엑셀 다운로드 */
  const downloadExcel = async () => {
    const r = await fetch(`/api/charter-usage?year=${year}&month=${month}`);
    const d = await r.json();
    if (!d.success) { alert("데이터 조회 실패"); return; }
    const all: CharterUsage[] = d.data;

    const header = ["날짜", "운전자", "전화번호", "차량번호", "출고품목", "출발지", "도착지", "출발시간", "용차비용", "비고"];
    const toRow = (l: CharterUsage) => [
      l.date, l.driverName, l.driverPhone ?? "", l.vehicleNo ?? "", l.items ?? "",
      l.departure ?? "", l.destination ?? "", l.departTime ?? "",
      l.cost ?? 0, l.memo ?? "",
    ];

    const ws = XLSX.utils.aoa_to_sheet([
      [`용차사용대장 ${year}년 ${month}월`],
      header,
      ...all.map(toRow),
      [],
      ["합계", "", "", "", "", "", "", "",
        all.reduce((s, l) => s + (l.cost ?? 0), 0), ""],
    ]);
    ws["!cols"] = [
      { wch: 12 }, { wch: 10 }, { wch: 14 }, { wch: 12 }, { wch: 24 },
      { wch: 16 }, { wch: 16 }, { wch: 10 }, { wch: 12 }, { wch: 30 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `${year}-${String(month).padStart(2, "0")}`);
    XLSX.writeFile(wb, `용차사용대장_${year}-${String(month).padStart(2, "0")}.xlsx`);
  };

  /* ── 렌더 ── */
  return (
    <div className="space-y-4">
      {/* 상단 컨트롤 */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5">
          <button onClick={prevMonth} className="p-1.5 rounded border border-gray-200 hover:bg-gray-50"><ChevronLeft size={14} /></button>
          <select value={year} onChange={e => setYear(Number(e.target.value))} className="h-8 px-2 text-sm border border-gray-200 rounded bg-white">
            {Array.from({ length: 5 }, (_, i) => today.getFullYear() - 2 + i).map(y => (
              <option key={y} value={y}>{y}년</option>
            ))}
          </select>
          <select value={month} onChange={e => setMonth(Number(e.target.value))} className="h-8 px-2 text-sm border border-gray-200 rounded bg-white">
            {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
              <option key={m} value={m}>{m}월</option>
            ))}
          </select>
          <button onClick={nextMonth} className="p-1.5 rounded border border-gray-200 hover:bg-gray-50"><ChevronRight size={14} /></button>
        </div>

        <Button variant="outline" size="sm" onClick={load} className="h-8 text-xs">
          <RefreshCw size={12} className="mr-1" /> 새로고침
        </Button>

        <div className="ml-auto flex items-center gap-2">
          <Button onClick={downloadExcel} variant="outline" size="sm"
            className="h-8 text-xs text-emerald-700 border-emerald-300 hover:bg-emerald-50"
            title="해당 월 전체를 엑셀로 다운로드">
            <Download size={12} className="mr-1" /> 월별 엑셀
          </Button>
          <Button onClick={openForm} className="h-8 text-xs bg-blue-600 hover:bg-blue-700">
            <Plus size={13} className="mr-1" /> 용차사용 등록
          </Button>
        </div>
      </div>

      {/* 월간 요약 */}
      <div className="grid grid-cols-2 sm:grid-cols-2 gap-3">
        <div className="bg-blue-50 rounded-lg p-3">
          <p className="text-xs text-blue-600 font-semibold">총 건수</p>
          <p className="text-xl font-bold text-blue-900 mt-1">{summary.count}건</p>
        </div>
        <div className="bg-purple-50 rounded-lg p-3">
          <p className="text-xs text-purple-600 font-semibold">총 용차비용</p>
          <p className="text-xl font-bold text-purple-900 mt-1">{summary.totalCost.toLocaleString()}원</p>
        </div>
      </div>

      {/* 필터 배너 */}
      {activeFilterCount > 0 && (
        <div className="flex items-center justify-between text-xs text-blue-700 bg-blue-50 border border-blue-200 px-3 py-2 rounded-lg">
          <span>{activeFilterCount}개 컬럼 필터 적용 — {filteredLogs.length}건 / {logs.length}건</span>
          <button onClick={() => setColFilters({})} className="text-blue-700 hover:underline">필터 초기화</button>
        </div>
      )}

      {/* 테이블 */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm whitespace-nowrap">
          <thead className="bg-gray-50 border-b-2 border-gray-300">
            <tr>
              {COLUMNS.map(c => {
                const hasValues = (colFilters[c.key]?.length ?? 0) > 0;
                const p = predicates[c.key];
                const hasPredicate = !!p && (p.op === "empty" || p.op === "notEmpty" || p.val.length > 0);
                const active = hasValues || hasPredicate;
                const isSort = sortKey === c.key;
                const alignCls = c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : "text-left";
                const justifyCls = c.align === "right" ? "justify-end" : c.align === "center" ? "justify-center" : "";
                return (
                  <th key={c.key} className={`px-3 py-2.5 text-xs font-semibold text-gray-600 border-r border-gray-200 ${alignCls}`}>
                    <div className={`flex items-center gap-1 ${justifyCls}`}>
                      <span>{c.label}</span>
                      <button
                        onClick={(e) => { setOpenFilter(c.key); setFilterAnchorEl(e.currentTarget); }}
                        className={`rounded p-0.5 hover:bg-gray-200 inline-flex items-center ${active ? "text-blue-600" : "text-gray-400"}`}
                        title="필터·정렬"
                      >
                        <Filter size={11} fill={active ? "currentColor" : "none"} />
                        {isSort && (sortDir === "asc"
                          ? <ArrowUp   size={9} className="text-blue-500" />
                          : <ArrowDown size={9} className="text-blue-500" />)}
                      </button>
                    </div>
                  </th>
                );
              })}
              <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-600">관리</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={11} className="px-3 py-12 text-center text-gray-400 text-sm">
                <RefreshCw size={16} className="animate-spin inline mr-2" />불러오는 중...
              </td></tr>
            ) : filteredLogs.length === 0 ? (
              <tr><td colSpan={11} className="px-3 py-12 text-center text-gray-400 text-sm">
                <FileText size={32} className="mx-auto mb-2 text-gray-300" />
                {logs.length === 0 ? "등록된 용차사용 내역이 없습니다." : "필터 조건에 맞는 결과가 없습니다."}
              </td></tr>
            ) : filteredLogs.map(l => editId === l.id ? (
              <tr key={l.id} className="bg-blue-50/60">
                <td className="px-2 py-1.5 border-r border-gray-100"><Input type="date" value={editForm.date} onChange={e => setE("date", e.target.value)} className="h-7 text-xs w-32" /></td>
                <td className="px-2 py-1.5 border-r border-gray-100"><Input value={editForm.driverName} onChange={e => setE("driverName", e.target.value)} className="h-7 text-xs w-20" /></td>
                <td className="px-2 py-1.5 border-r border-gray-100"><Input value={editForm.driverPhone} onChange={e => setE("driverPhone", e.target.value)} className="h-7 text-xs w-28" /></td>
                <td className="px-2 py-1.5 border-r border-gray-100"><Input value={editForm.vehicleNo} onChange={e => setE("vehicleNo", e.target.value)} className="h-7 text-xs w-24" /></td>
                <td className="px-2 py-1.5 border-r border-gray-100"><Input value={editForm.items} onChange={e => setE("items", e.target.value)} className="h-7 text-xs w-32" /></td>
                <td className="px-2 py-1.5 border-r border-gray-100"><Input value={editForm.departure} onChange={e => setE("departure", e.target.value)} className="h-7 text-xs w-24" /></td>
                <td className="px-2 py-1.5 border-r border-gray-100"><Input value={editForm.destination} onChange={e => setE("destination", e.target.value)} className="h-7 text-xs w-24" /></td>
                <td className="px-2 py-1.5 border-r border-gray-100"><Input type="time" value={editForm.departTime} onChange={e => setE("departTime", e.target.value)} className="h-7 text-xs w-20" /></td>
                <td className="px-2 py-1.5 border-r border-gray-100"><Input type="number" value={editForm.cost} onChange={e => setE("cost", e.target.value)} className="h-7 text-xs w-24 text-right" /></td>
                <td className="px-2 py-1.5 border-r border-gray-100"><Input value={editForm.memo} onChange={e => setE("memo", e.target.value)} className="h-7 text-xs w-32" /></td>
                <td className="px-3 py-1.5 text-center">
                  <div className="flex items-center justify-center gap-1.5">
                    <button onClick={saveEdit} className="p-1 text-blue-600 hover:bg-blue-100 rounded" title="저장"><Save size={13} /></button>
                    <button onClick={() => setEditId(null)} className="p-1 text-gray-500 hover:bg-gray-100 rounded" title="취소"><X size={13} /></button>
                  </div>
                </td>
              </tr>
            ) : (
              <tr key={l.id} className="hover:bg-gray-50/70 transition-colors">
                <td className="px-3 py-2 text-xs text-gray-700 border-r border-gray-100 font-mono">{l.date}</td>
                <td className="px-3 py-2 text-xs font-medium text-gray-800 border-r border-gray-100">{l.driverName}</td>
                <td className="px-3 py-2 text-xs text-gray-600 border-r border-gray-100 font-mono">{l.driverPhone || <span className="text-gray-300">-</span>}</td>
                <td className="px-3 py-2 text-xs text-gray-600 border-r border-gray-100 font-mono">{l.vehicleNo || <span className="text-gray-300">-</span>}</td>
                <td className="px-3 py-2 text-xs text-gray-700 border-r border-gray-100 max-w-[160px] truncate" title={l.items ?? ""}>{l.items || <span className="text-gray-300">-</span>}</td>
                <td className="px-3 py-2 text-xs text-gray-700 border-r border-gray-100">{l.departure || <span className="text-gray-300">-</span>}</td>
                <td className="px-3 py-2 text-xs text-gray-700 border-r border-gray-100">{l.destination || <span className="text-gray-300">-</span>}</td>
                <td className="px-3 py-2 text-xs text-gray-600 text-center border-r border-gray-100 font-mono">{l.departTime || <span className="text-gray-300">-</span>}</td>
                <td className="px-3 py-2 text-xs text-purple-700 font-medium border-r border-gray-100 text-right">{won(l.cost)}</td>
                <td className="px-3 py-2 text-xs text-gray-500 border-r border-gray-100 max-w-[160px] truncate" title={l.memo ?? ""}>{l.memo || <span className="text-gray-300">-</span>}</td>
                <td className="px-3 py-2 text-center">
                  <div className="flex items-center justify-center gap-1.5">
                    <button onClick={() => openEdit(l)} className="p-1 text-gray-400 hover:text-blue-600 rounded" title="수정"><Pencil size={13} /></button>
                    <button onClick={() => deleteLog(l.id)} className="p-1 text-gray-300 hover:text-red-500 rounded" title="삭제"><Trash2 size={13} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 컬럼 필터 + 정렬 + 텍스트조건 통합 드롭다운 */}
      {openFilter && filterAnchorEl && (
        <ColumnFilterDropdown
          anchorEl={filterAnchorEl}
          values={distinctValues[openFilter] ?? []}
          selected={colFilters[openFilter] ?? []}
          onApply={(vals) => {
            setColFilters(p => ({ ...p, [openFilter]: vals }));
            setOpenFilter(null); setFilterAnchorEl(null);
          }}
          onClose={() => { setOpenFilter(null); setFilterAnchorEl(null); }}
          sortDir={sortKey === openFilter ? sortDir : null}
          onSort={(dir) => handleSortFor(openFilter, dir)}
          predicate={predicates[openFilter] ?? null}
          onPredicate={(p) => setPredicates(prev => {
            const next = { ...prev };
            if (p) next[openFilter] = p; else delete next[openFilter];
            return next;
          })}
        />
      )}

      {/* 등록 모달 */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => !saving && setShowForm(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b flex items-center justify-between sticky top-0 bg-white">
              <h3 className="font-bold text-gray-900">용차사용 등록</h3>
              <button onClick={() => setShowForm(false)} disabled={saving} className="p-1 hover:bg-gray-100 rounded"><X size={16} /></button>
            </div>
            <div className="p-5 space-y-4">
              {formErr && <div className="bg-red-50 text-red-700 text-sm px-3 py-2 rounded border border-red-200">{formErr}</div>}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-600 mb-1 block">날짜 <span className="text-red-500">*</span></label>
                  <Input type="date" value={form.date} onChange={e => set("date", e.target.value)} className="h-9 text-sm" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 mb-1 block">출발시간</label>
                  <Input type="time" value={form.departTime} onChange={e => set("departTime", e.target.value)} className="h-9 text-sm" />
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-600 mb-1 block">운전자 이름 <span className="text-red-500">*</span></label>
                  <Input value={form.driverName} onChange={e => set("driverName", e.target.value)} placeholder="이름" className="h-9 text-sm" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 mb-1 block">전화번호</label>
                  <Input value={form.driverPhone} onChange={e => set("driverPhone", e.target.value)} placeholder="010-0000-0000" className="h-9 text-sm" />
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-600 mb-1 block">차량번호</label>
                  <Input value={form.vehicleNo} onChange={e => set("vehicleNo", e.target.value)} placeholder="00가0000" className="h-9 text-sm" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 mb-1 block">용차비용 (원)</label>
                  <Input type="number" value={form.cost} onChange={e => set("cost", e.target.value)} placeholder="금액" className="h-9 text-sm text-right" />
                </div>

                <div className="col-span-2">
                  <label className="text-xs font-semibold text-gray-600 mb-1 block">출고품목</label>
                  <Input value={form.items} onChange={e => set("items", e.target.value)} placeholder="예: 강재, 부재" className="h-9 text-sm" />
                </div>
              </div>

              {/* 위치 (출발/도착 공용 프리셋) */}
              <div className="border border-gray-200 rounded-lg p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-gray-600">위치 (출발·도착 공용)</p>
                  <button onClick={() => setLocEditMode(!locEditMode)} className="text-xs text-blue-600 hover:underline">
                    {locEditMode ? "편집 종료" : "위치 편집"}
                  </button>
                </div>
                {locEditMode && (
                  <div className="flex gap-2">
                    <Input value={newLocName} onChange={e => setNewLocName(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addLocation())}
                      placeholder="새 위치명" className="h-8 text-xs flex-1" />
                    <Button size="sm" onClick={addLocation} className="h-8 text-xs">추가</Button>
                  </div>
                )}
                {(["departure", "destination"] as const).map(field => (
                  <div key={field} className="space-y-1.5">
                    <p className="text-xs text-gray-500">{field === "departure" ? "출발지" : "도착지"}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {locations.map(loc => (
                        <div key={loc.id} className="relative">
                          <button type="button"
                            onClick={() => set(field, form[field] === loc.name ? "" : loc.name)}
                            className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
                              form[field] === loc.name
                                ? "bg-blue-600 text-white border-blue-600"
                                : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
                            }`}>
                            {loc.name}
                          </button>
                          {locEditMode && (
                            <button type="button" onClick={() => deleteLocation(loc.id, loc.name)}
                              className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white rounded-full text-[10px] hover:bg-red-600">×</button>
                          )}
                        </div>
                      ))}
                    </div>
                    <Input value={form[field]} onChange={e => set(field, e.target.value)} placeholder="직접 입력" className="h-8 text-xs" />
                  </div>
                ))}
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">비고</label>
                <textarea value={form.memo} onChange={e => set("memo", e.target.value)} rows={2}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <div className="px-5 py-3 border-t bg-gray-50 flex justify-end gap-2">
              <button onClick={() => setShowForm(false)} disabled={saving} className="px-4 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50">취소</button>
              <Button onClick={handleSubmit} disabled={saving} className="h-8 text-xs bg-blue-600 hover:bg-blue-700">
                <Save size={13} className="mr-1" /> {saving ? "저장 중..." : "등록"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Plus, Trash2, RefreshCw, X, Save, ChevronLeft, ChevronRight, FileText, Download, Filter, Pencil, ArrowUp, ArrowDown } from "lucide-react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import ColumnFilterDropdown, { type FilterValue } from "./column-filter-dropdown";
import { getCascadedFilteredRowsWithPredicates, getAllCascadedOptions, type ColumnAccessorMap, type TextPredicate } from "@/lib/cascading-filters";
import type { TransportVehicle } from "@/components/transport-main";

/* ── 타입 ── */
interface Worker { id: string; name: string; role: string | null; position: string | null }
interface DrivingLog {
  id: string;
  vehicleId: string;
  date: string;
  driver: string;
  departure: string | null;
  destination: string | null;
  purpose: string | null;
  startTime: string | null;
  endTime: string | null;
  startMileage: number | null;
  endMileage: number | null;
  fuelCost: number | null;
  tollCost: number | null;
  memo: string | null;
  createdAt: string;
  vehicle: { id: string; code: string; name: string; plateNo: string | null };
}

const PURPOSE_PRESETS = ["자재운반", "현장이동", "정비", "출장"];

const LOG_INIT = {
  vehicleId: "", date: "", driver: "",
  departure: "", destination: "", purpose: "",
  startTime: "", endTime: "",
  startMileage: "", endMileage: "",
  fuelCost: "", tollCost: "", memo: "",
};

const won = (n: number | null) =>
  n != null ? n.toLocaleString() + "원" : "-";
const km = (n: number | null) =>
  n != null ? n.toLocaleString() + "km" : "-";
const distance = (s: number | null, e: number | null) =>
  s != null && e != null && e >= s ? (e - s).toLocaleString() + "km" : "-";

/* ══════════════════════════════════════════════════════════ */
export default function TransportDrivingLogTab({
  vehicles,
}: {
  vehicles: TransportVehicle[];
}) {
  const today = new Date();
  const [selVehicleId, setSelVehicleId] = useState<string>("");
  const [year,  setYear]  = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [logs,  setLogs]  = useState<DrivingLog[]>([]);
  const [loading, setLoading] = useState(false);

  /* 등록 모달 */
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]       = useState({ ...LOG_INIT });
  const [saving, setSaving]   = useState(false);
  const [formErr, setFormErr] = useState("");

  /* 수정 */
  const [editId,   setEditId]   = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ ...LOG_INIT });

  /* 인원 목록 (운전자 선택용) */
  const [workers, setWorkers] = useState<Worker[]>([]);

  /* 위치 프리셋 (출발·도착 공용) — DB 기반, 추가/삭제 가능 */
  interface DrivingLocation { id: string; name: string; }
  const [locations, setLocations] = useState<DrivingLocation[]>([]);
  const [locEditMode, setLocEditMode] = useState(false);
  const [newLocName, setNewLocName] = useState("");

  const loadLocations = async () => {
    const r = await fetch("/api/driving-location");
    const d = await r.json();
    if (d.success) setLocations(d.data);
  };
  useEffect(() => { loadLocations(); }, []);

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

  const deleteLocation = async (loc: DrivingLocation) => {
    if (!confirm(`위치 '${loc.name}'을(를) 삭제하시겠습니까?`)) return;
    const r = await fetch(`/api/driving-location?id=${loc.id}`, { method: "DELETE" });
    const d = await r.json();
    if (!d.success) { alert(d.error ?? "삭제 실패"); return; }
    loadLocations();
  };

  const set  = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));
  const setE = (k: string, v: string) => setEditForm(f => ({ ...f, [k]: v }));

  /* 데이터 로드 */
  const load = useCallback(async () => {
    setLoading(true);
    const p = new URLSearchParams({ year: String(year), month: String(month) });
    if (selVehicleId) p.set("vehicleId", selVehicleId);
    const res = await fetch(`/api/transport-driving-log?${p}`);
    if (res.ok) {
      const data = await res.json();
      if (data.success) setLogs(data.data);
    }
    setLoading(false);
  }, [year, month, selVehicleId]);

  useEffect(() => { load(); }, [load]);

  /* 인원 목록 1회 로드 */
  useEffect(() => {
    fetch("/api/workers")
      .then(r => r.json())
      .then(d => { if (d.success) setWorkers(d.data); })
      .catch(() => {});
  }, []);

  /* 엑셀 다운로드 — 차량별 시트 + 종합 시트 */
  const downloadExcel = async () => {
    // 다운로드는 항상 해당 월 전체(차량 필터 무시) 기준
    const p = new URLSearchParams({ year: String(year), month: String(month) });
    const res = await fetch(`/api/transport-driving-log?${p}`);
    if (!res.ok) { alert("다운로드 데이터 조회 실패"); return; }
    const data = await res.json();
    if (!data.success) { alert(data.error ?? "조회 실패"); return; }
    const all: DrivingLog[] = data.data ?? [];
    if (all.length === 0) { alert(`${year}년 ${month}월 운행일지가 없습니다.`); return; }

    const ym = `${year}-${String(month).padStart(2, "0")}`;
    const wb = XLSX.utils.book_new();

    const header = [
      "운행일", "차량코드", "차량명", "번호판", "운전자",
      "출발지", "도착지", "목적",
      "출발시간", "도착시간",
      "출발km", "도착km", "주행거리(km)",
      "유류비(원)", "통행료(원)", "메모",
    ];

    const toRow = (l: DrivingLog) => [
      l.date,
      l.vehicle.code,
      l.vehicle.name,
      l.vehicle.plateNo ?? "",
      l.driver,
      l.departure ?? "",
      l.destination ?? "",
      l.purpose ?? "",
      l.startTime ?? "",
      l.endTime ?? "",
      l.startMileage ?? "",
      l.endMileage ?? "",
      l.startMileage != null && l.endMileage != null && l.endMileage >= l.startMileage ? l.endMileage - l.startMileage : "",
      l.fuelCost ?? "",
      l.tollCost ?? "",
      l.memo ?? "",
    ];

    const cols = [{ wch: 11 },{ wch: 8 },{ wch: 14 },{ wch: 10 },{ wch: 8 },{ wch: 10 },{ wch: 10 },{ wch: 10 },{ wch: 7 },{ wch: 7 },{ wch: 10 },{ wch: 10 },{ wch: 12 },{ wch: 11 },{ wch: 11 },{ wch: 22 }];

    // 1) 종합 시트
    const allSheet = XLSX.utils.aoa_to_sheet([
      [`차량 운행일지 종합 (${ym})`],
      header,
      ...all.map(toRow),
      [],
      [
        "합계", "", "", "", "", "", "", "", "", "", "", "",
        all.reduce((s, l) => s + (l.startMileage != null && l.endMileage != null && l.endMileage >= l.startMileage ? l.endMileage - l.startMileage : 0), 0),
        all.reduce((s, l) => s + (l.fuelCost ?? 0), 0),
        all.reduce((s, l) => s + (l.tollCost ?? 0), 0),
        `총 ${all.length}건`,
      ],
    ]);
    allSheet["!cols"] = cols;
    XLSX.utils.book_append_sheet(wb, allSheet, "종합");

    // 2) 차량별 시트
    const byVehicle = new Map<string, DrivingLog[]>();
    for (const l of all) {
      const key = l.vehicleId;
      if (!byVehicle.has(key)) byVehicle.set(key, []);
      byVehicle.get(key)!.push(l);
    }

    const safeName = (name: string) => name.replace(/[\\/?*\[\]:]/g, "_").slice(0, 28);
    const usedNames = new Set<string>(["종합"]);
    for (const [, group] of byVehicle) {
      const v = group[0].vehicle;
      let baseName = safeName(`${v.code}_${v.name}`);
      if (!baseName) baseName = "차량";
      let name = baseName;
      let i = 2;
      while (usedNames.has(name)) name = `${baseName}_${i++}`.slice(0, 31);
      usedNames.add(name);

      const ws = XLSX.utils.aoa_to_sheet([
        [`[${v.code}] ${v.name}${v.plateNo ? ` (${v.plateNo})` : ""} — ${ym}`],
        header,
        ...group.map(toRow),
        [],
        [
          "합계", "", "", "", "", "", "", "", "", "", "", "",
          group.reduce((s, l) => s + (l.startMileage != null && l.endMileage != null && l.endMileage >= l.startMileage ? l.endMileage - l.startMileage : 0), 0),
          group.reduce((s, l) => s + (l.fuelCost ?? 0), 0),
          group.reduce((s, l) => s + (l.tollCost ?? 0), 0),
          `총 ${group.length}건`,
        ],
      ]);
      ws["!cols"] = cols;
      XLSX.utils.book_append_sheet(wb, ws, name);
    }

    XLSX.writeFile(wb, `차량운행일지_${ym}.xlsx`);
  };

  /* 월 이동 */
  const prevMonth = () => {
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
  };

  /* 등록 */
  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormErr("");
    if (!form.vehicleId) { setFormErr("차량을 선택해주세요."); return; }
    if (!form.date)      { setFormErr("운행일을 입력해주세요."); return; }
    if (!form.driver.trim()) { setFormErr("운전자를 입력해주세요."); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/transport-driving-log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vehicleId:    form.vehicleId,
          date:         form.date,
          driver:       form.driver,
          departure:    form.departure    || null,
          destination:  form.destination  || null,
          purpose:      form.purpose      || null,
          startTime:    form.startTime    || null,
          endTime:      form.endTime      || null,
          startMileage: form.startMileage || null,
          endMileage:   form.endMileage   || null,
          fuelCost:     form.fuelCost     || null,
          tollCost:     form.tollCost     || null,
          memo:         form.memo         || null,
        }),
      });
      const data = await res.json();
      if (!data.success) { setFormErr(data.error); return; }
      setShowForm(false);
      setForm({ ...LOG_INIT });
      load();
    } catch { setFormErr("서버 오류"); }
    finally { setSaving(false); }
  };

  /* 수정 시작 */
  const startEdit = (log: DrivingLog) => {
    setEditId(log.id);
    setEditForm({
      vehicleId:    log.vehicleId,
      date:         log.date,
      driver:       log.driver,
      departure:    log.departure    ?? "",
      destination:  log.destination  ?? "",
      purpose:      log.purpose      ?? "",
      startTime:    log.startTime    ?? "",
      endTime:      log.endTime      ?? "",
      startMileage: log.startMileage != null ? String(log.startMileage) : "",
      endMileage:   log.endMileage   != null ? String(log.endMileage)   : "",
      fuelCost:     log.fuelCost     != null ? String(log.fuelCost)     : "",
      tollCost:     log.tollCost     != null ? String(log.tollCost)     : "",
      memo:         log.memo         ?? "",
    });
  };

  /* 수정 저장 */
  const saveEdit = async () => {
    if (!editId) return;
    const res = await fetch(`/api/transport-driving-log/${editId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date:         editForm.date         || undefined,
        driver:       editForm.driver       || undefined,
        departure:    editForm.departure,
        destination:  editForm.destination,
        purpose:      editForm.purpose,
        startTime:    editForm.startTime,
        endTime:      editForm.endTime,
        startMileage: editForm.startMileage,
        endMileage:   editForm.endMileage,
        fuelCost:     editForm.fuelCost,
        tollCost:     editForm.tollCost,
        memo:         editForm.memo,
      }),
    });
    if (res.ok) { setEditId(null); load(); }
    else alert("수정 실패");
  };

  /* 삭제 */
  const handleDelete = async (id: string) => {
    if (!confirm("이 운행일지를 삭제하시겠습니까?")) return;
    const res = await fetch(`/api/transport-driving-log/${id}`, { method: "DELETE" });
    if (res.ok) setLogs(l => l.filter(x => x.id !== id));
    else alert("삭제 실패");
  };

  /* 월간 합계 */
  const summary = logs.reduce(
    (acc, l) => ({
      count:    acc.count + 1,
      distance: acc.distance + (l.startMileage != null && l.endMileage != null && l.endMileage >= l.startMileage ? l.endMileage - l.startMileage : 0),
      fuel:     acc.fuel    + (l.fuelCost  ?? 0),
      toll:     acc.toll    + (l.tollCost  ?? 0),
    }),
    { count: 0, distance: 0, fuel: 0, toll: 0 }
  );

  const inUsedVehicles = vehicles.filter(v => v.usage !== "DISPOSED" && v.vehicleType === "VEHICLE");

  /* 엑셀형 테이블 — 컬럼 정의, 필터, 헬퍼 */
  const COLUMNS = useMemo(() => [
    { key: "date",        label: "날짜",        align: "left"  as const },
    { key: "vehicle",     label: "차량",        align: "left"  as const },
    { key: "driver",      label: "운전자",      align: "left"  as const },
    { key: "route",       label: "출발 → 도착", align: "left"  as const },
    { key: "purpose",     label: "목적",        align: "left"  as const },
    { key: "startTime",   label: "출발시간",    align: "center" as const },
    { key: "endTime",     label: "도착시간",    align: "center" as const },
    { key: "startMileage",label: "출발거리",    align: "right" as const },
    { key: "endMileage",  label: "도착거리",    align: "right" as const },
    { key: "distance",    label: "운행거리",    align: "right" as const },
    { key: "fuelCost",    label: "유류비",      align: "right" as const },
    { key: "tollCost",    label: "통행료",      align: "right" as const },
    { key: "memo",        label: "비고",        align: "left"  as const },
  ], []);

  const colValue = useCallback((l: DrivingLog, col: string): string => {
    switch (col) {
      case "date":         return l.date;
      case "vehicle":      return `${l.vehicle.name}${l.vehicle.plateNo ? ` (${l.vehicle.plateNo})` : ""}`;
      case "driver":       return l.driver;
      case "route":        return `${l.departure ?? "-"} → ${l.destination ?? "-"}`;
      case "purpose":      return l.purpose ?? "";
      case "startTime":    return l.startTime ?? "";
      case "endTime":      return l.endTime ?? "";
      case "startMileage": return l.startMileage != null ? String(l.startMileage) : "";
      case "endMileage":   return l.endMileage   != null ? String(l.endMileage)   : "";
      case "distance":     return (l.startMileage != null && l.endMileage != null && l.endMileage >= l.startMileage) ? String(l.endMileage - l.startMileage) : "";
      case "fuelCost":     return l.fuelCost != null ? String(l.fuelCost) : "";
      case "tollCost":     return l.tollCost != null ? String(l.tollCost) : "";
      case "memo":         return l.memo ?? "";
      default:             return "";
    }
  }, []);

  const [colFilters, setColFilters] = useState<Record<string, string[]>>({});
  const [predicates, setPredicates] = useState<Record<string, TextPredicate>>({});
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [openFilter, setOpenFilter] = useState<string | null>(null);
  const [filterAnchorEl, setFilterAnchorEl] = useState<HTMLElement | null>(null);

  // 월 바뀌면 필터 초기화 (전월 필터값이 신월 데이터에 안 맞을 수 있으므로)
  useEffect(() => { setColFilters({}); setPredicates({}); setSortKey(null); }, [year, month]);

  const handleSortFor = (col: string, dir: "asc" | "desc" | null) => {
    if (dir === null) { setSortKey(null); setSortDir("asc"); }
    else { setSortKey(col); setSortDir(dir); }
  };

  // 컬럼 accessor 맵 — cascading filter 헬퍼용
  const accessors = useMemo<ColumnAccessorMap<DrivingLog>>(() => {
    const m: ColumnAccessorMap<DrivingLog> = {};
    for (const c of COLUMNS) m[c.key] = (row) => colValue(row, c.key);
    return m;
  }, [COLUMNS, colValue]);

  // 컬럼별 distinct 값 (cascading — 자기 자신 컬럼 제외 다른 필터 적용 후 unique)
  const distinctValues = useMemo(
    () => getAllCascadedOptions(logs, colFilters, accessors),
    [logs, colFilters, accessors],
  );

  // 필터 적용된 로그 — sortKey 있으면 그 컬럼으로, 없으면 기본(날짜 내림차순)
  const filteredLogs = useMemo(() => {
    const filtered = getCascadedFilteredRowsWithPredicates(logs, colFilters, predicates, accessors);
    if (sortKey) {
      return [...filtered].sort((a, b) => {
        const av = colValue(a, sortKey);
        const bv = colValue(b, sortKey);
        const cmp = av.localeCompare(bv, "ko", { numeric: true });
        return sortDir === "asc" ? cmp : -cmp;
      });
    }
    return [...filtered].sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      return (b.startTime ?? "").localeCompare(a.startTime ?? "");
    });
  }, [logs, colFilters, predicates, sortKey, sortDir, accessors, colValue]);

  const activeFilterCount = Object.values(colFilters).filter(v => v.length > 0).length;

  return (
    <div className="space-y-4">
      {/* 상단 컨트롤 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          {/* 차량 선택 */}
          <select
            value={selVehicleId}
            onChange={e => setSelVehicleId(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[180px]"
          >
            <option value="">전체 차량</option>
            {inUsedVehicles.map(v => (
              <option key={v.id} value={v.id}>
                [{v.code}] {v.name}{v.plateNo ? ` (${v.plateNo})` : ""}
              </option>
            ))}
          </select>

          {/* 연/월 선택 */}
          <div className="flex items-center gap-1">
            <button onClick={prevMonth} className="p-1.5 hover:bg-gray-100 rounded-md transition-colors">
              <ChevronLeft size={16} />
            </button>
            <div className="flex items-center gap-1">
              <select value={year} onChange={e => setYear(Number(e.target.value))}
                className="px-2 py-1.5 border border-gray-200 rounded-md text-sm bg-white focus:outline-none">
                {Array.from({ length: 5 }, (_, i) => today.getFullYear() - 2 + i).map(y => (
                  <option key={y} value={y}>{y}년</option>
                ))}
              </select>
              <select value={month} onChange={e => setMonth(Number(e.target.value))}
                className="px-2 py-1.5 border border-gray-200 rounded-md text-sm bg-white focus:outline-none">
                {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                  <option key={m} value={m}>{m}월</option>
                ))}
              </select>
            </div>
            <button onClick={nextMonth} className="p-1.5 hover:bg-gray-100 rounded-md transition-colors">
              <ChevronRight size={16} />
            </button>
          </div>

          <button onClick={load} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-500 transition-colors" title="새로고침">
            <RefreshCw size={14} />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <Button onClick={downloadExcel} variant="outline" className="flex items-center gap-2 text-emerald-700 border-emerald-300 hover:bg-emerald-50" title="해당 월 전체를 차량별 시트 + 종합 시트로 엑셀 다운로드">
            <Download size={15} /> 월별 엑셀
          </Button>
          <Button onClick={() => {
            const selVehicle = inUsedVehicles.find(v => v.id === selVehicleId);
            setShowForm(true);
            setForm({
              ...LOG_INIT,
              date: `${year}-${String(month).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`,
              vehicleId:    selVehicleId,
              startMileage: selVehicle?.mileage != null ? String(selVehicle.mileage) : "",
            });
            setFormErr("");
          }}
            className="flex items-center gap-2">
            <Plus size={15} /> 운행일지 등록
          </Button>
        </div>
      </div>

      {/* 월간 요약 카드 */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "총 운행건수", value: `${summary.count}건` },
          { label: "총 운행거리", value: `${summary.distance.toLocaleString()}km` },
          { label: "총 유류비", value: `${summary.fuel.toLocaleString()}원` },
          { label: "총 통행료", value: `${summary.toll.toLocaleString()}원` },
        ].map(item => (
          <div key={item.label} className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 font-semibold">{item.label}</p>
            <p className="text-xl font-bold text-gray-800 mt-0.5">{item.value}</p>
          </div>
        ))}
      </div>

      {/* 필터 적용 표시줄 */}
      {activeFilterCount > 0 && (
        <div className="flex items-center gap-2 text-xs text-blue-700 bg-blue-50 border border-blue-200 px-3 py-2 rounded-lg">
          <Filter size={12} fill="currentColor" />
          <span>필터 {activeFilterCount}개 적용 — {filteredLogs.length} / {logs.length}건</span>
          <button onClick={() => setColFilters({})} className="ml-auto text-blue-600 hover:underline">필터 초기화</button>
        </div>
      )}

      {/* 운행일지 — 엑셀형 단일 테이블 */}
      {loading ? (
        <div className="py-16 text-center text-gray-400 text-sm">불러오는 중…</div>
      ) : logs.length === 0 ? (
        <div className="py-16 text-center text-gray-400 text-sm">
          <FileText size={40} className="mx-auto mb-3 opacity-30" />
          {year}년 {month}월 운행일지가 없습니다.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <table className="w-full text-xs whitespace-nowrap">
            <thead className="bg-gray-50 border-b-2 border-gray-300">
              <tr>
                {COLUMNS.map(c => {
                  const hasValues = (colFilters[c.key]?.length ?? 0) > 0;
                  const p = predicates[c.key];
                  const hasPredicate = !!p && (p.op === "empty" || p.op === "notEmpty" || p.val.length > 0);
                  const active = hasValues || hasPredicate;
                  const isSort = sortKey === c.key;
                  const alignCls = c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : "text-left";
                  return (
                    <th key={c.key} className={`px-3 py-2.5 text-xs font-semibold text-gray-600 border-r border-gray-200 ${alignCls}`}>
                      <div className={`flex items-center gap-1 ${c.align === "right" ? "justify-end" : c.align === "center" ? "justify-center" : ""}`}>
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
                <th className="px-3 py-2.5 text-xs font-semibold text-gray-600 text-center">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredLogs.length === 0 ? (
                <tr><td colSpan={COLUMNS.length + 1} className="px-3 py-12 text-center text-gray-400 text-sm">필터 조건에 맞는 데이터가 없습니다.</td></tr>
              ) : filteredLogs.map(log => (
                editId === log.id ? (
                  /* 수정 행 */
                  <tr key={log.id} className="bg-blue-50/60">
                    <td className="px-2 py-1.5 text-xs text-gray-700 border-r border-gray-100">{log.date}</td>
                    <td className="px-2 py-1.5 text-xs text-gray-700 border-r border-gray-100">{log.vehicle.name}{log.vehicle.plateNo ? ` (${log.vehicle.plateNo})` : ""}</td>
                    <td className="px-2 py-1.5 border-r border-gray-100"><Input value={editForm.driver} onChange={e => setE("driver", e.target.value)} className="h-7 text-xs w-20" /></td>
                    <td className="px-2 py-1.5 border-r border-gray-100">
                      <div className="flex items-center gap-1">
                        <Input value={editForm.departure} onChange={e => setE("departure", e.target.value)} placeholder="출발" className="h-7 text-xs w-20" />
                        <span className="text-gray-400">→</span>
                        <Input value={editForm.destination} onChange={e => setE("destination", e.target.value)} placeholder="도착" className="h-7 text-xs w-20" />
                      </div>
                    </td>
                    <td className="px-2 py-1.5 border-r border-gray-100"><Input value={editForm.purpose} onChange={e => setE("purpose", e.target.value)} className="h-7 text-xs w-24" /></td>
                    <td className="px-2 py-1.5 border-r border-gray-100"><Input type="time" value={editForm.startTime} onChange={e => setE("startTime", e.target.value)} className="h-7 text-xs w-24" /></td>
                    <td className="px-2 py-1.5 border-r border-gray-100"><Input type="time" value={editForm.endTime} onChange={e => setE("endTime", e.target.value)} className="h-7 text-xs w-24" /></td>
                    <td className="px-2 py-1.5 border-r border-gray-100"><Input type="number" value={editForm.startMileage} onChange={e => setE("startMileage", e.target.value)} className="h-7 text-xs w-20 text-right" /></td>
                    <td className="px-2 py-1.5 border-r border-gray-100"><Input type="number" value={editForm.endMileage} onChange={e => setE("endMileage", e.target.value)} className="h-7 text-xs w-20 text-right" /></td>
                    <td className="px-2 py-1.5 text-xs text-gray-400 text-right border-r border-gray-100">-</td>
                    <td className="px-2 py-1.5 border-r border-gray-100"><Input type="number" value={editForm.fuelCost} onChange={e => setE("fuelCost", e.target.value)} className="h-7 text-xs w-20 text-right" /></td>
                    <td className="px-2 py-1.5 border-r border-gray-100"><Input type="number" value={editForm.tollCost} onChange={e => setE("tollCost", e.target.value)} className="h-7 text-xs w-20 text-right" /></td>
                    <td className="px-2 py-1.5 border-r border-gray-100"><Input value={editForm.memo} onChange={e => setE("memo", e.target.value)} className="h-7 text-xs w-28" /></td>
                    <td className="px-2 py-1.5">
                      <div className="flex gap-1 justify-center">
                        <button onClick={saveEdit} className="p-1 text-blue-600 hover:bg-blue-100 rounded" title="저장"><Save size={13} /></button>
                        <button onClick={() => setEditId(null)} className="p-1 text-gray-400 hover:bg-gray-100 rounded" title="취소"><X size={13} /></button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  /* 일반 행 */
                  <tr key={log.id} className="hover:bg-gray-50/70 transition-colors">
                    <td className="px-3 py-2 text-xs text-gray-700 font-mono border-r border-gray-100">{log.date}</td>
                    <td className="px-3 py-2 text-xs text-gray-700 border-r border-gray-100">
                      <span className="font-semibold">{log.vehicle.name}</span>
                      {log.vehicle.plateNo && <span className="ml-1 text-gray-400">({log.vehicle.plateNo})</span>}
                    </td>
                    <td className="px-3 py-2 text-gray-800 border-r border-gray-100">{log.driver}</td>
                    <td className="px-3 py-2 text-gray-600 border-r border-gray-100">
                      {log.departure || log.destination
                        ? <>{log.departure || "-"} <span className="text-gray-400">→</span> {log.destination || "-"}</>
                        : <span className="text-gray-300">-</span>}
                    </td>
                    <td className="px-3 py-2 text-gray-600 max-w-[140px] truncate border-r border-gray-100" title={log.purpose ?? ""}>{log.purpose || "-"}</td>
                    <td className="px-3 py-2 text-gray-600 text-center border-r border-gray-100">{log.startTime || "-"}</td>
                    <td className="px-3 py-2 text-gray-600 text-center border-r border-gray-100">{log.endTime || "-"}</td>
                    <td className="px-3 py-2 text-gray-600 text-right border-r border-gray-100">{km(log.startMileage)}</td>
                    <td className="px-3 py-2 text-gray-600 text-right border-r border-gray-100">{km(log.endMileage)}</td>
                    <td className="px-3 py-2 font-semibold text-right border-r border-gray-100">
                      {log.startMileage != null && log.endMileage != null
                        ? <span className="text-blue-600">{distance(log.startMileage, log.endMileage)}</span>
                        : <span className="text-gray-300">-</span>}
                    </td>
                    <td className="px-3 py-2 text-gray-600 text-right border-r border-gray-100">{won(log.fuelCost)}</td>
                    <td className="px-3 py-2 text-gray-600 text-right border-r border-gray-100">{won(log.tollCost)}</td>
                    <td className="px-3 py-2 text-gray-500 text-xs max-w-[140px] truncate border-r border-gray-100" title={log.memo ?? ""}>{log.memo || "-"}</td>
                    <td className="px-3 py-2 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button onClick={() => startEdit(log)} className="p-1 text-gray-400 hover:text-blue-600 rounded" title="수정"><Pencil size={13} /></button>
                        <button onClick={() => handleDelete(log.id)} className="p-1 text-gray-300 hover:text-red-500 rounded" title="삭제"><Trash2 size={13} /></button>
                      </div>
                    </td>
                  </tr>
                )
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 컬럼 필터 + 정렬 + 텍스트조건 통합 드롭다운 */}
      {openFilter && filterAnchorEl && (
        <ColumnFilterDropdown
          anchorEl={filterAnchorEl}
          values={distinctValues[openFilter] ?? []}
          selected={colFilters[openFilter] ?? []}
          onApply={(vals) => {
            setColFilters(prev => ({ ...prev, [openFilter]: vals }));
            setOpenFilter(null);
            setFilterAnchorEl(null);
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
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-4">
            {/* 헤더 */}
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <h3 className="font-bold text-xl text-gray-800">운행일지 등록</h3>
              <button onClick={() => setShowForm(false)} className="p-1 hover:bg-gray-100 rounded-full">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAdd} className="p-6 space-y-4">
              {formErr && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{formErr}</div>
              )}

              {/* 차량 + 운행일 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">차량 <span className="text-red-500">*</span></label>
                  <select
                    value={form.vehicleId}
                    onChange={e => {
                      const vid = e.target.value;
                      set("vehicleId", vid);
                      const v = inUsedVehicles.find(v => v.id === vid);
                      if (v?.mileage != null) set("startMileage", String(v.mileage));
                    }}
                    className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">-- 차량 선택 --</option>
                    {inUsedVehicles.map(v => (
                      <option key={v.id} value={v.id}>[{v.code}] {v.name}{v.plateNo ? ` (${v.plateNo})` : ""}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">운행일 <span className="text-red-500">*</span></label>
                  <Input type="date" value={form.date} onChange={e => set("date", e.target.value)} />
                </div>
              </div>

              {/* 운전자 + 목적 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">운전자 <span className="text-red-500">*</span></label>
                  <Input
                    list="driver-suggestions"
                    value={form.driver}
                    onChange={e => set("driver", e.target.value)}
                    placeholder="이름 입력 또는 선택"
                    autoComplete="off"
                  />
                  {workers.length > 0 && (
                    <datalist id="driver-suggestions">
                      {workers.map(w => (
                        <option key={w.id} value={w.name}>
                          {w.position ? `${w.name} (${w.position})` : w.name}
                        </option>
                      ))}
                    </datalist>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">목적/용무</label>
                  <div className="flex flex-wrap gap-1.5 mb-1.5">
                    {PURPOSE_PRESETS.map(p => (
                      <button
                        key={p} type="button"
                        onClick={() => set("purpose", p)}
                        className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors ${
                          form.purpose === p
                            ? "bg-blue-600 border-blue-600 text-white"
                            : "border-gray-300 text-gray-600 hover:border-blue-400 hover:text-blue-600"
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                  <Input
                    value={form.purpose}
                    onChange={e => set("purpose", e.target.value)}
                    placeholder="직접 입력"
                  />
                </div>
              </div>

              {/* 출발지 / 도착지 — 위치 프리셋 (DB 기반, 추가·삭제 가능) */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-600">위치 (출발·도착 공용)</span>
                  <button
                    type="button"
                    onClick={() => setLocEditMode(m => !m)}
                    className={`px-2.5 py-1 rounded-md text-xs font-semibold border ${locEditMode ? "bg-amber-500 border-amber-500 text-white" : "border-gray-300 text-gray-600 bg-white hover:bg-gray-50"}`}
                  >
                    {locEditMode ? "편집 완료" : "위치 편집"}
                  </button>
                </div>

                {locEditMode && (
                  <div className="flex gap-2">
                    <Input
                      value={newLocName}
                      onChange={e => setNewLocName(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addLocation(); } }}
                      placeholder="새 위치명 입력"
                    />
                    <Button type="button" onClick={addLocation} variant="outline" className="text-blue-600 border-blue-300 hover:bg-blue-50 whitespace-nowrap">
                      추가
                    </Button>
                  </div>
                )}

                {(["departure", "destination"] as const).map(field => {
                  const label = field === "departure" ? "출발지" : "도착지";
                  const value = form[field];
                  return (
                    <div key={field}>
                      <label className="block text-xs font-semibold text-gray-600 mb-1.5">{label}</label>
                      <div className="flex flex-wrap gap-1.5 mb-1.5">
                        {locations.map(loc => (
                          <div key={loc.id} className="relative">
                            <button
                              type="button"
                              onClick={() => set(field, value === loc.name ? "" : loc.name)}
                              className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${value === loc.name ? "bg-blue-600 border-blue-600 text-white" : "border-gray-300 text-gray-600 bg-white hover:bg-gray-50"} ${locEditMode ? "pr-5" : ""}`}
                            >
                              {loc.name}
                            </button>
                            {locEditMode && (
                              <button
                                type="button"
                                onClick={() => deleteLocation(loc)}
                                className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center text-[10px] leading-none"
                                title="삭제"
                              >×</button>
                            )}
                          </div>
                        ))}
                      </div>
                      <Input
                        value={value}
                        onChange={e => set(field, e.target.value)}
                        placeholder="직접 입력"
                        autoComplete="off"
                      />
                    </div>
                  );
                })}
              </div>

              {/* 출발·도착 시간 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">출발시간</label>
                  <Input type="time" value={form.startTime} onChange={e => set("startTime", e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">도착시간</label>
                  <Input type="time" value={form.endTime} onChange={e => set("endTime", e.target.value)} />
                </div>
              </div>

              {/* 주행거리 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">
                    출발 전 주행거리 (km)
                    {form.vehicleId && inUsedVehicles.find(v => v.id === form.vehicleId)?.mileage != null && (
                      <span className="ml-1.5 text-blue-500 font-normal">
                        (차량 현재 km 자동입력)
                      </span>
                    )}
                  </label>
                  <Input type="number" value={form.startMileage} onChange={e => set("startMileage", e.target.value)} placeholder="0" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">도착 후 주행거리 (km)</label>
                  <Input type="number" value={form.endMileage} onChange={e => set("endMileage", e.target.value)} placeholder="0" />
                </div>
              </div>
              {form.startMileage && form.endMileage && Number(form.endMileage) >= Number(form.startMileage) && (
                <p className="text-sm text-blue-600 font-semibold -mt-2">
                  운행거리: {(Number(form.endMileage) - Number(form.startMileage)).toLocaleString()}km
                </p>
              )}

              {/* 비용 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">유류비 (원)</label>
                  <Input type="number" value={form.fuelCost} onChange={e => set("fuelCost", e.target.value)} placeholder="0" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">통행료 (원)</label>
                  <Input type="number" value={form.tollCost} onChange={e => set("tollCost", e.target.value)} placeholder="0" />
                </div>
              </div>

              {/* 비고 */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">비고</label>
                <textarea value={form.memo} onChange={e => set("memo", e.target.value)} rows={2}
                  className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>

              <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>취소</Button>
                <Button type="submit" disabled={saving}>
                  <Save size={14} className="mr-1.5" />
                  {saving ? "저장 중..." : "등록"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      <p className="text-xs text-gray-400 text-center">행을 더블클릭하면 수정할 수 있습니다.</p>
    </div>
  );
}

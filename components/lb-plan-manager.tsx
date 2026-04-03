"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Plus, Settings2, Download, Upload, Save, Trash2, X, Check, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import * as XLSX from "xlsx"; // 엑셀 내보내기 전용 (가져오기는 서버사이드)

// ─── 타입 ─────────────────────────────────────────────────────────────────────

type HolidayType = "LEGAL" | "SUBSTITUTE" | "COMPANY" | "RAIN";

interface CalendarDay {
  id: string;
  date: string;       // YYYY-MM-DD
  type: HolidayType;
  label: string;
  year: number;
}

const HOLIDAY_TYPE_LABEL: Record<HolidayType, string> = {
  LEGAL:      "법정공휴일",
  SUBSTITUTE: "대체공휴일",
  COMPANY:    "회사휴무",
  RAIN:       "장마/우천",
};
const HOLIDAY_TYPE_COLOR: Record<HolidayType, string> = {
  LEGAL:      "bg-red-100 text-red-700",
  SUBSTITUTE: "bg-orange-100 text-orange-700",
  COMPANY:    "bg-blue-100 text-blue-700",
  RAIN:       "bg-cyan-100 text-cyan-700",
};

interface ProcessSetting {
  id: string;
  vesselCode: string;
  isDefault: boolean;
  cutLeadDays: number;
  cutDuration: number;
  assemblySmallDays: number;
  assemblyMidDays: number;
  assemblyLargeDays: number;
  hullInspLeadDays: number;        // 대조F 이후 최소 여유일수
  hullInspIntervalDays: number;    // 검사 주기 (일)
  hullInspBlocksPerSession: number; // 회당 검사 블록 수
  paintLeadDays: number;
  paintDuration: number;
  peLeadDays: number;
  peDuration: number;
}

interface LbRow {
  id: string;
  vesselCode: string;
  blk: string;
  no: number | null;
  weeklyQty: number | null;
  erectionDate: string | null;
  assemblyStart: string | null;
  pnd: string | null;
  cutS: string | null;
  cutF: string | null;
  smallS: string | null;
  smallF: string | null;
  midS: string | null;
  midF: string | null;
  largeS: string | null;
  largeF: string | null;
  hullInspDate: string | null;
  paintStart: string | null;
  paintEnd: string | null;
  peStart: string | null;
  peEnd: string | null;
  delayDays: number | null;
  manualFields?: string[]; // 수동수정된 필드명 목록
  isNew?: boolean; // 아직 저장되지 않은 임시 행
  isDirty?: boolean;
}

interface LbPlanVersion {
  id: string;
  name: string;
  isDeployed: boolean;
  blockCount: number;
  createdAt: string;
  settingsSnapshot?: {
    processSettings: ProcessSetting[];
    dataStartRow: number;
  } | null;
}

// ─── 날짜 유틸 ────────────────────────────────────────────────────────────────

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}
function subDays(date: Date, days: number): Date {
  return addDays(date, -days);
}
function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "-";
  return iso.slice(0, 10);
}
function toISO(d: Date | null): string | null {
  return d ? d.toISOString() : null;
}
function parseDate(val: string | null | undefined): Date | null {
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

// ─── 캘린더 유틸 ─────────────────────────────────────────────────────────────

// 비작업일 여부 확인
// isYard=false(절단, 실내): RAIN 타입 제외, 주말+나머지 공휴일만
// isYard=true(야드 공정): 모든 비작업일 적용
function isNonWorkingDay(dateStr: string, calendar: CalendarDay[], isYard: boolean): boolean {
  const d = new Date(dateStr + "T00:00:00");
  const dow = d.getDay();
  if (dow === 0 || dow === 6) return true; // 주말
  return calendar.some(c => {
    if (c.date !== dateStr) return false;
    if (c.type === "RAIN") return isYard; // 장마는 야드만
    return true;
  });
}

function addWorkingDays(start: Date, days: number, calendar: CalendarDay[], isYard: boolean): Date {
  let d = new Date(start);
  let rem = days;
  while (rem > 0) {
    d = addDays(d, 1);
    if (!isNonWorkingDay(d.toISOString().slice(0, 10), calendar, isYard)) rem--;
  }
  return d;
}

function subWorkingDays(start: Date, days: number, calendar: CalendarDay[], isYard: boolean): Date {
  let d = new Date(start);
  let rem = days;
  while (rem > 0) {
    d = subDays(d, 1);
    if (!isNonWorkingDay(d.toISOString().slice(0, 10), calendar, isYard)) rem--;
  }
  return d;
}

// 날짜 d가 비작업일이면 다음 작업일로 이동 (야드여부 구분)
function nextWorkingDay(d: Date, calendar: CalendarDay[], isYard: boolean): Date {
  let result = new Date(d);
  while (isNonWorkingDay(result.toISOString().slice(0, 10), calendar, isYard)) {
    result = addDays(result, 1);
  }
  return result;
}

// ─── 자동계산 ─────────────────────────────────────────────────────────────────

// 절단~대조까지만 계산 (선각검사 이후는 vessel 전체 기반으로 별도 계산)
function calcUpToLarge(row: LbRow, s: ProcessSetting, calendar: CalendarDay[] = []): Partial<LbRow> {
  const erection = parseDate(row.erectionDate);
  const assembly = parseDate(row.assemblyStart);
  if (!erection || !assembly) return {};

  const manual = new Set(row.manualFields ?? []);

  const pnd = subDays(erection, 1);
  const largeF = erection; // always = erectionDate

  // cutS: 수동값 있으면 유지, 없으면 계산
  const cutS = (manual.has("cutS") && row.cutS)
    ? parseDate(row.cutS)!
    : subWorkingDays(assembly, s.cutLeadDays, calendar, false);

  const cutF = (manual.has("cutF") && row.cutF)
    ? parseDate(row.cutF)!
    : addWorkingDays(cutS, s.cutDuration, calendar, false);

  // smallF는 항상 cutS (수동 오버라이드 없음)
  const smallF = cutS;

  const smallS = (manual.has("smallS") && row.smallS)
    ? parseDate(row.smallS)!
    : subWorkingDays(cutS, s.assemblySmallDays, calendar, true);

  // midF는 항상 smallS (수동 오버라이드 없음)
  const midF = smallS;

  const midS = (manual.has("midS") && row.midS)
    ? parseDate(row.midS)!
    : subWorkingDays(smallS, s.assemblyMidDays, calendar, true);

  const largeS = (manual.has("largeS") && row.largeS)
    ? parseDate(row.largeS)!
    : subWorkingDays(midS, s.assemblyLargeDays, calendar, true);

  return {
    pnd: toISO(pnd),
    cutS: toISO(cutS), cutF: toISO(cutF),
    smallS: toISO(smallS), smallF: toISO(smallF),
    midS: toISO(midS), midF: toISO(midF),
    largeS: toISO(largeS), largeF: toISO(largeF),
  };
}

// 선각검사 ~ 지연일수: vessel 전체 행을 받아 행별로 계산 (선각검사 그룹 배정 포함)
// rows: 해당 호선의 모든 행 (largeF 및 erectionDate 이미 계산된 상태)
// 반환: row.id → { hullInspDate, paintStart, paintEnd, peStart, peEnd, delayDays }
function calcHullAndDownstream(
  vesselRows: LbRow[],
  s: ProcessSetting,
  calendar: CalendarDay[] = []
): Map<string, Partial<LbRow>> {
  const result = new Map<string, Partial<LbRow>>();

  const eligible = vesselRows
    .filter(r => r.largeF && r.pnd)
    .sort((a, b) => {
      if (a.no != null && b.no != null) return a.no - b.no;
      return new Date(a.largeF!).getTime() - new Date(b.largeF!).getTime();
    });

  const perSession = s.hullInspBlocksPerSession;
  const interval   = s.hullInspIntervalDays;
  const leadDays   = s.hullInspLeadDays;

  let currentInspDate: Date | null = null;
  let sessionCount = 0;

  for (const row of eligible) {
    const manual = new Set(row.manualFields ?? []);
    const largeF = parseDate(row.largeF)!;
    const pnd    = parseDate(row.pnd)!;

    let hullInsp: Date;

    if (manual.has("hullInspDate") && row.hullInspDate) {
      // 수동으로 지정된 선각검사일 사용 (그룹 스케줄링 스킵)
      hullInsp = parseDate(row.hullInspDate)!;
    } else {
      // 그룹 스케줄링
      const earliest = addDays(largeF, leadDays);
      if (currentInspDate === null || sessionCount >= perSession) {
        if (currentInspDate === null) {
          currentInspDate = nextWorkingDay(earliest, calendar, true);
        } else {
          const nextSlot = addDays(currentInspDate, interval);
          const candidate = nextSlot >= earliest ? nextSlot : earliest;
          currentInspDate = nextWorkingDay(candidate, calendar, true);
        }
        sessionCount = 1;
      } else {
        sessionCount++;
      }
      hullInsp = currentInspDate;
    }

    const paintSt = (manual.has("paintStart") && row.paintStart)
      ? parseDate(row.paintStart)!
      : addWorkingDays(hullInsp, s.paintLeadDays, calendar, true);

    const paintEnd = (manual.has("paintEnd") && row.paintEnd)
      ? parseDate(row.paintEnd)!
      : addWorkingDays(paintSt, s.paintDuration, calendar, true);

    const peSt = (manual.has("peStart") && row.peStart)
      ? parseDate(row.peStart)!
      : addWorkingDays(paintEnd, s.peLeadDays, calendar, true);

    const peEnd = (manual.has("peEnd") && row.peEnd)
      ? parseDate(row.peEnd)!
      : addWorkingDays(peSt, s.peDuration, calendar, true);

    const delay = Math.round((pnd.getTime() - peEnd.getTime()) / 86400000);

    result.set(row.id, {
      hullInspDate: toISO(hullInsp),
      paintStart: toISO(paintSt), paintEnd: toISO(paintEnd),
      peStart: toISO(peSt), peEnd: toISO(peEnd),
      delayDays: delay,
    });
  }

  // largeF 없는 행은 해당 필드 null
  for (const row of vesselRows) {
    if (!result.has(row.id)) {
      result.set(row.id, {
        hullInspDate: null, paintStart: null, paintEnd: null,
        peStart: null, peEnd: null, delayDays: null,
      });
    }
  }

  return result;
}

// ─── 행 상태 배지 ─────────────────────────────────────────────────────────────

function StatusBadge({ row }: { row: LbRow }) {
  const today = new Date();
  if (!row.cutS) return null;
  const cutSDate = new Date(row.cutS);
  const cutFDate = row.cutF ? new Date(row.cutF) : null;
  const isCompleted = cutFDate && cutFDate < today;
  if (isCompleted) return <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-gray-100 text-gray-500">완료</span>;
  if (cutSDate <= today) return <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-green-100 text-green-700">진행중</span>;
  return <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700">예정</span>;
}

// ─── 공정 설정 모달 ───────────────────────────────────────────────────────────

const DEFAULT_SETTING: Omit<ProcessSetting, "id" | "vesselCode" | "isDefault"> = {
  cutLeadDays: 7, cutDuration: 10,
  assemblySmallDays: 10, assemblyMidDays: 7, assemblyLargeDays: 6,
  hullInspLeadDays: 3, hullInspIntervalDays: 7, hullInspBlocksPerSession: 2,
  paintLeadDays: 2, paintDuration: 10, peLeadDays: 2, peDuration: 13,
};

function ProcessSettingModal({
  onClose, onSaved, dataStartRow, onDataStartRowChange, onCalendarChange,
}: {
  onClose: () => void;
  onSaved: () => void;
  dataStartRow: number;
  onDataStartRowChange: (v: number) => void;
  onCalendarChange: () => void;
}) {
  const [tab, setTab] = useState<"process" | "calendar" | "excel">("process");

  // ── 공정설정 state ──────────────────────────────────────────────────────────
  const [settings, setSettings] = useState<ProcessSetting[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<Omit<ProcessSetting, "id">>({
    vesselCode: "", isDefault: false, ...DEFAULT_SETTING,
  });
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadSettings = useCallback(async () => {
    const res = await fetch("/api/lb-process-setting");
    setSettings(await res.json());
  }, []);

  useEffect(() => { loadSettings(); }, [loadSettings]);

  const startEdit = (s: ProcessSetting) => {
    setEditing(s.vesselCode);
    setForm({ vesselCode: s.vesselCode, isDefault: s.isDefault, cutLeadDays: s.cutLeadDays, cutDuration: s.cutDuration, assemblySmallDays: s.assemblySmallDays, assemblyMidDays: s.assemblyMidDays, assemblyLargeDays: s.assemblyLargeDays, hullInspLeadDays: s.hullInspLeadDays, hullInspIntervalDays: s.hullInspIntervalDays ?? 7, hullInspBlocksPerSession: s.hullInspBlocksPerSession ?? 2, paintLeadDays: s.paintLeadDays, paintDuration: s.paintDuration, peLeadDays: s.peLeadDays, peDuration: s.peDuration });
  };

  const saveEdit = async () => {
    setSaving(true);
    const url = editing ? `/api/lb-process-setting/${editing}` : "/api/lb-process-setting";
    const method = editing ? "PUT" : "POST";
    await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setSaving(false);
    setEditing(null);
    setAdding(false);
    setForm({ vesselCode: "", isDefault: false, ...DEFAULT_SETTING });
    await loadSettings();
    onSaved();
  };

  const deleteSetting = async (vesselCode: string) => {
    if (!confirm(`${vesselCode} 설정을 삭제하시겠습니까?`)) return;
    await fetch(`/api/lb-process-setting/${vesselCode}`, { method: "DELETE" });
    await loadSettings();
    onSaved();
  };

  const numField = (key: keyof typeof DEFAULT_SETTING, label: string) => (
    <div key={key} className="flex flex-col gap-1">
      <label className="text-xs text-gray-500 font-medium">{label}</label>
      <Input
        type="number" min={0}
        value={(form as unknown as Record<string, number>)[key]}
        onChange={e => setForm(f => ({ ...f, [key]: Number(e.target.value) }))}
        className="h-8 text-sm w-24"
      />
    </div>
  );

  // ── 캘린더 state ────────────────────────────────────────────────────────────
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [calDays, setCalDays] = useState<CalendarDay[]>([]);
  const [generating, setGenerating] = useState(false);
  const [calSaving, setCalSaving] = useState(false);
  const [newEntry, setNewEntry] = useState<{
    type: HolidayType; dateStart: string; dateEnd: string; label: string;
  }>({ type: "COMPANY", dateStart: "", dateEnd: "", label: "" });

  const loadCalDays = useCallback(async (y: number) => {
    const res = await fetch(`/api/lb-calendar?year=${y}`);
    if (res.ok) setCalDays(await res.json());
  }, []);

  useEffect(() => { loadCalDays(calYear); }, [calYear, loadCalDays]);

  const generateHolidays = async () => {
    setGenerating(true);
    await fetch("/api/lb-calendar/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ year: calYear }),
    });
    setGenerating(false);
    await loadCalDays(calYear);
    onCalendarChange();
  };

  const deleteCalDay = async (id: string) => {
    await fetch(`/api/lb-calendar/${id}`, { method: "DELETE" });
    setCalDays(prev => prev.filter(d => d.id !== id));
    onCalendarChange();
  };

  const addCalEntry = async () => {
    if (!newEntry.dateStart || !newEntry.label) return;
    setCalSaving(true);
    const items: Array<{ date: string; type: string; label: string; year: number }> = [];

    if (newEntry.type === "RAIN" && newEntry.dateEnd && newEntry.dateEnd >= newEntry.dateStart) {
      // 범위 → 개별 일자 전개
      let cur = new Date(newEntry.dateStart + "T00:00:00");
      const end = new Date(newEntry.dateEnd + "T00:00:00");
      while (cur <= end) {
        items.push({ date: cur.toISOString().slice(0, 10), type: newEntry.type, label: newEntry.label, year: calYear });
        cur.setDate(cur.getDate() + 1);
      }
    } else {
      items.push({ date: newEntry.dateStart, type: newEntry.type, label: newEntry.label, year: calYear });
    }

    await fetch("/api/lb-calendar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(items),
    });
    setCalSaving(false);
    setNewEntry({ type: "COMPANY", dateStart: "", dateEnd: "", label: "" });
    await loadCalDays(calYear);
    onCalendarChange();
  };

  const tabBtnCls = (t: typeof tab) =>
    `px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === t ? "border-blue-500 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"}`;

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center overflow-y-auto py-10">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex gap-1">
            <button className={tabBtnCls("process")} onClick={() => setTab("process")}>공정설정</button>
            <button className={tabBtnCls("calendar")} onClick={() => setTab("calendar")}>캘린더</button>
            <button className={tabBtnCls("excel")} onClick={() => setTab("excel")}>엑셀설정</button>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="p-6">
          {/* ── 공정설정 탭 ────────────────────────────────────────────────── */}
          {tab === "process" && (
            <>
              <div className="overflow-x-auto mb-4">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-gray-50 text-gray-600">
                      <th className="border px-2 py-1.5 text-left">호선</th>
                      <th className="border px-2 py-1.5">기본값</th>
                      <th className="border px-2 py-1.5">절단선행</th>
                      <th className="border px-2 py-1.5">절단기간</th>
                      <th className="border px-2 py-1.5">소조</th>
                      <th className="border px-2 py-1.5">중조</th>
                      <th className="border px-2 py-1.5">대조</th>
                      <th className="border px-2 py-1.5">대조F여유</th>
                      <th className="border px-2 py-1.5">검사주기</th>
                      <th className="border px-2 py-1.5">회당블록</th>
                      <th className="border px-2 py-1.5">도장선행</th>
                      <th className="border px-2 py-1.5">도장기간</th>
                      <th className="border px-2 py-1.5">PE선행</th>
                      <th className="border px-2 py-1.5">PE기간</th>
                      <th className="border px-2 py-1.5">작업</th>
                    </tr>
                  </thead>
                  <tbody>
                    {settings.map(s => (
                      <tr key={s.vesselCode} className="hover:bg-gray-50">
                        <td className="border px-2 py-1.5 font-semibold">{s.vesselCode}{s.isDefault && <span className="ml-1 text-blue-500">(기본)</span>}</td>
                        <td className="border px-2 py-1.5 text-center">{s.isDefault ? "✓" : ""}</td>
                        <td className="border px-2 py-1.5 text-center">{s.cutLeadDays}일</td>
                        <td className="border px-2 py-1.5 text-center">{s.cutDuration}일</td>
                        <td className="border px-2 py-1.5 text-center">{s.assemblySmallDays}일</td>
                        <td className="border px-2 py-1.5 text-center">{s.assemblyMidDays}일</td>
                        <td className="border px-2 py-1.5 text-center">{s.assemblyLargeDays}일</td>
                        <td className="border px-2 py-1.5 text-center">{s.hullInspLeadDays}일</td>
                        <td className="border px-2 py-1.5 text-center">{s.hullInspIntervalDays ?? 7}일</td>
                        <td className="border px-2 py-1.5 text-center">{s.hullInspBlocksPerSession ?? 2}개</td>
                        <td className="border px-2 py-1.5 text-center">{s.paintLeadDays}일</td>
                        <td className="border px-2 py-1.5 text-center">{s.paintDuration}일</td>
                        <td className="border px-2 py-1.5 text-center">{s.peLeadDays}일</td>
                        <td className="border px-2 py-1.5 text-center">{s.peDuration}일</td>
                        <td className="border px-2 py-1.5 text-center">
                          <button onClick={() => startEdit(s)} className="text-blue-500 hover:underline mr-2 text-xs">수정</button>
                          <button onClick={() => deleteSetting(s.vesselCode)} className="text-red-400 hover:underline text-xs">삭제</button>
                        </td>
                      </tr>
                    ))}
                    {settings.length === 0 && (
                      <tr><td colSpan={15} className="border px-2 py-4 text-center text-gray-400">설정된 호선이 없습니다.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              {(adding || editing) && (
                <div className="border rounded-lg p-4 bg-gray-50">
                  <p className="text-sm font-semibold text-gray-700 mb-3">{editing ? `${editing} 수정` : "신규 호선 추가"}</p>
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-gray-500 font-medium">호선번호 *</label>
                      <Input
                        value={form.vesselCode}
                        onChange={e => setForm(f => ({ ...f, vesselCode: e.target.value }))}
                        disabled={!!editing}
                        placeholder="예: 4506"
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="flex items-end gap-2">
                      <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer pb-1">
                        <input type="checkbox" checked={form.isDefault} onChange={e => setForm(f => ({ ...f, isDefault: e.target.checked }))} />
                        기본값으로 설정
                      </label>
                    </div>
                  </div>
                  <div className="grid grid-cols-5 gap-2 mb-4">
                    {numField("cutLeadDays", "절단 선행일수")}
                    {numField("cutDuration", "절단 기간")}
                    {numField("assemblySmallDays", "소조 소요일수")}
                    {numField("assemblyMidDays", "중조 소요일수")}
                    {numField("assemblyLargeDays", "대조 소요일수")}
                    {numField("hullInspLeadDays", "대조F 이후 여유")}
                    {numField("hullInspIntervalDays", "검사 주기(일)")}
                    {numField("hullInspBlocksPerSession", "회당 블록 수")}
                    {numField("paintLeadDays", "도장 착수 선행")}
                    {numField("paintDuration", "도장 기간")}
                    {numField("peLeadDays", "P-E 착수 선행")}
                    {numField("peDuration", "P-E 기간")}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={saveEdit} disabled={saving}><Check size={14} className="mr-1" />저장</Button>
                    <Button size="sm" variant="outline" onClick={() => { setEditing(null); setAdding(false); }}><X size={14} className="mr-1" />취소</Button>
                  </div>
                </div>
              )}

              {!adding && !editing && (
                <Button size="sm" onClick={() => { setAdding(true); setForm({ vesselCode: "", isDefault: false, ...DEFAULT_SETTING }); }}>
                  <Plus size={14} className="mr-1" /> 호선 추가
                </Button>
              )}
            </>
          )}

          {/* ── 캘린더 탭 ──────────────────────────────────────────────────── */}
          {tab === "calendar" && (
            <div className="flex flex-col gap-4">
              {/* 헤더: 연도 선택 + 자동생성 */}
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <label className="text-sm text-gray-600">연도</label>
                  <Input
                    type="number" className="h-8 w-24 text-sm"
                    value={calYear}
                    onChange={e => setCalYear(Number(e.target.value))}
                  />
                </div>
                <Button size="sm" variant="outline" onClick={generateHolidays} disabled={generating}>
                  {generating ? "생성 중..." : "법정공휴일 자동생성"}
                </Button>
                <span className="text-xs text-gray-400">신정·삼일절·어린이날·현충일·광복절·개천절·한글날·크리스마스 자동 등록</span>
              </div>

              {/* 등록 폼 */}
              <div className="border rounded-lg p-4 bg-gray-50">
                <p className="text-sm font-semibold text-gray-700 mb-3">비작업일 추가</p>
                <div className="flex flex-wrap items-end gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-gray-500">구분</label>
                    <select
                      className="border rounded-md text-sm px-2 h-8"
                      value={newEntry.type}
                      onChange={e => setNewEntry(n => ({ ...n, type: e.target.value as HolidayType }))}
                    >
                      {(Object.keys(HOLIDAY_TYPE_LABEL) as HolidayType[]).map(t => (
                        <option key={t} value={t}>{HOLIDAY_TYPE_LABEL[t]}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-gray-500">{newEntry.type === "RAIN" ? "시작일" : "날짜"}</label>
                    <Input
                      type="date" className="h-8 text-sm w-36"
                      value={newEntry.dateStart}
                      onChange={e => setNewEntry(n => ({ ...n, dateStart: e.target.value }))}
                    />
                  </div>
                  {newEntry.type === "RAIN" && (
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-gray-500">종료일</label>
                      <Input
                        type="date" className="h-8 text-sm w-36"
                        value={newEntry.dateEnd}
                        onChange={e => setNewEntry(n => ({ ...n, dateEnd: e.target.value }))}
                      />
                    </div>
                  )}
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-gray-500">메모</label>
                    <Input
                      className="h-8 text-sm w-36"
                      placeholder="예: 회사 창립기념일"
                      value={newEntry.label}
                      onChange={e => setNewEntry(n => ({ ...n, label: e.target.value }))}
                    />
                  </div>
                  <Button size="sm" onClick={addCalEntry} disabled={calSaving || !newEntry.dateStart || !newEntry.label}>
                    <Plus size={14} className="mr-1" /> 등록
                  </Button>
                </div>
              </div>

              {/* 등록된 비작업일 목록 */}
              <div className="overflow-y-auto max-h-64 border rounded-lg">
                <table className="w-full text-xs border-collapse">
                  <thead className="sticky top-0 bg-gray-50">
                    <tr>
                      <th className="border px-2 py-1.5 text-left">날짜</th>
                      <th className="border px-2 py-1.5 text-left">구분</th>
                      <th className="border px-2 py-1.5 text-left">메모</th>
                      <th className="border px-2 py-1.5">삭제</th>
                    </tr>
                  </thead>
                  <tbody>
                    {calDays.length === 0 && (
                      <tr><td colSpan={4} className="text-center py-6 text-gray-400">{calYear}년 등록된 비작업일이 없습니다.</td></tr>
                    )}
                    {calDays.map(d => (
                      <tr key={d.id} className="hover:bg-gray-50">
                        <td className="border px-2 py-1.5">{d.date}</td>
                        <td className="border px-2 py-1.5">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${HOLIDAY_TYPE_COLOR[d.type]}`}>
                            {HOLIDAY_TYPE_LABEL[d.type]}
                          </span>
                        </td>
                        <td className="border px-2 py-1.5">{d.label}</td>
                        <td className="border px-2 py-1.5 text-center">
                          <button onClick={() => deleteCalDay(d.id)} className="text-red-400 hover:text-red-600">
                            <Trash2 size={12} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-gray-400">장마/우천은 야드 공정(소조~P-E)에만 적용됩니다. 절단(실내)은 장마 영향 없음.</p>
            </div>
          )}

          {/* ── 엑셀설정 탭 ────────────────────────────────────────────────── */}
          {tab === "excel" && (
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-3">엑셀 가져오기 설정</p>
              <div className="flex items-center gap-3">
                <label className="text-sm text-gray-600 whitespace-nowrap">데이터 시작 행</label>
                <Input
                  type="number"
                  min={1}
                  value={dataStartRow}
                  onChange={e => onDataStartRowChange(Math.max(1, Number(e.target.value)))}
                  className="h-8 text-sm w-24"
                />
                <span className="text-xs text-gray-400">행 (기본값: 6 — 1~5행을 헤더로 건너뜀)</span>
              </div>
              <p className="text-xs text-gray-400 mt-1.5">A열 값이 숫자가 아닌 행은 자동으로 건너뜁니다.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── 수동 수정 가능한 날짜 필드 목록 (모듈 레벨) ────────────────────────────
const MANUAL_DATE_FIELDS = ["cutS", "cutF", "smallS", "midS", "largeS", "hullInspDate", "paintStart", "paintEnd", "peStart", "peEnd"] as const;
type ManualDateField = typeof MANUAL_DATE_FIELDS[number];

// ─── 인라인 편집 셀 ───────────────────────────────────────────────────────────

function EditCell({
  value, onChange, type = "text", readOnly = false, green = false, isManual = false,
}: {
  value: string;
  onChange?: (v: string) => void;
  type?: string;
  readOnly?: boolean;
  green?: boolean;
  isManual?: boolean;
}) {
  const base = "h-7 text-xs border-0 rounded-none focus:ring-1 focus:ring-inset focus:ring-blue-400 px-1.5 w-full";
  const content = readOnly ? (
    <div className={`${base} flex items-center ${green ? "bg-green-50 text-green-800 font-semibold" : "bg-gray-50 text-gray-600"}`}>
      {value || "-"}
    </div>
  ) : (
    <input
      type={type}
      value={value}
      onChange={e => onChange?.(e.target.value)}
      className={`${base} ${isManual ? "bg-indigo-50 text-indigo-900 font-semibold" : "bg-blue-50 text-blue-900 font-semibold"} outline-none`}
    />
  );

  if (!isManual) return content;
  return (
    <div className="relative">
      {content}
      <span
        className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-blue-500 pointer-events-none"
        title="수동 수정됨"
      />
    </div>
  );
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────────────────────

export default function LbPlanManager() {
  const [rows, setRows] = useState<LbRow[]>([]);
  const [settings, setSettings] = useState<ProcessSetting[]>([]);
  const [calendarDays, setCalendarDays] = useState<CalendarDay[]>([]);
  const [vesselFilter, setVesselFilter] = useState("ALL");
  const [yearFilter, setYearFilter] = useState(String(new Date().getFullYear()));
  const [showSettings, setShowSettings] = useState(false);
  const [dataStartRow, setDataStartRow] = useState(6);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [versions, setVersions] = useState<LbPlanVersion[]>([]);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveVersionName, setSaveVersionName] = useState("");
  const [savingVersion, setSavingVersion] = useState(false);

  const loadSettings = useCallback(async (): Promise<ProcessSetting[]> => {
    const res = await fetch("/api/lb-process-setting");
    const data: ProcessSetting[] = await res.json();
    setSettings(data);
    return data;
  }, []);

  const loadCalendar = useCallback(async (): Promise<CalendarDay[]> => {
    const y = new Date().getFullYear();
    const res = await fetch(`/api/lb-calendar?year=${y}`);
    if (!res.ok) return [];
    const data: CalendarDay[] = await res.json();
    setCalendarDays(data);
    return data;
  }, []);

  const loadPlans = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (vesselFilter !== "ALL") params.set("vesselCode", vesselFilter);
    if (yearFilter) params.set("year", yearFilter);
    const res = await fetch(`/api/lb-plan?${params}`);
    const data: LbRow[] = await res.json();
    setRows(data);
    setLoading(false);
  }, [vesselFilter, yearFilter]);

  const loadVersions = useCallback(async () => {
    const res = await fetch("/api/lb-plan-version");
    if (res.ok) setVersions(await res.json());
  }, []);

  useEffect(() => { loadSettings(); }, [loadSettings]);
  useEffect(() => { loadCalendar(); }, [loadCalendar]);
  useEffect(() => { loadPlans(); }, [loadPlans]);
  useEffect(() => { loadVersions(); }, [loadVersions]);

  // 해당 호선의 설정 찾기 (없으면 기본값, 그것도 없으면 undefined)
  const getSettingFor = useCallback((vesselCode: string, settingsList: ProcessSetting[]): ProcessSetting | undefined => {
    return settingsList.find(s => s.vesselCode === vesselCode)
        ?? settingsList.find(s => s.isDefault);
  }, []);

  // ── 전체 재계산: 설정/캘린더 변경 시 모든 행 날짜 재산출 ──────────────────
  const recalcAll = useCallback((settingsList: ProcessSetting[], cal: CalendarDay[]) => {
    setRows(prev => {
      // 1단계: 각 행별 절단~대조 재계산
      const pass1 = prev.map(row => {
        const s = getSettingFor(row.vesselCode, settingsList);
        if (!s || !row.erectionDate || !row.assemblyStart) return row;
        return { ...row, ...calcUpToLarge(row, s, cal), isDirty: true };
      });

      // 2단계: 호선별 선각검사~지연일수 재배정
      const vessels = Array.from(new Set(pass1.map(r => r.vesselCode).filter(Boolean)));
      let result = [...pass1];
      for (const vc of vessels) {
        const s = getSettingFor(vc, settingsList);
        if (!s) continue;
        const vesselRows = result.filter(r => r.vesselCode === vc);
        const hullMap = calcHullAndDownstream(vesselRows, s, cal);
        result = result.map(r => {
          if (r.vesselCode !== vc) return r;
          const downstream = hullMap.get(r.id);
          return downstream ? { ...r, ...downstream, isDirty: true } : r;
        });
      }
      return result;
    });
  }, [getSettingFor]);

  const setManual = (id: string, field: ManualDateField, value: string | null) => {
    setRows(prev => {
      // 1. 해당 행 업데이트 + manual 플래그 추가/제거
      const next = prev.map(r => {
        if (r.id !== id) return r;
        const current = new Set(r.manualFields ?? []);
        if (value === null || value === "") {
          current.delete(field);
        } else {
          current.add(field);
        }
        return {
          ...r,
          [field]: value ? new Date(value).toISOString() : null,
          manualFields: Array.from(current),
          isDirty: true,
        };
      });

      // 2. 해당 호선의 hull downstream 재배정
      const row = next.find(r => r.id === id);
      if (!row) return next;
      const vc = row.vesselCode;
      const s = getSettingFor(vc, settings);
      if (!s) return next;
      const vesselRows = next.filter(r => r.vesselCode === vc);
      const hullMap = calcHullAndDownstream(vesselRows, s, calendarDays);
      return next.map(r => {
        if (r.vesselCode !== vc) return r;
        const downstream = hullMap.get(r.id);
        return downstream ? { ...r, ...downstream, isDirty: true } : r;
      });
    });
  };

  const updateRow = (id: string, patch: Partial<LbRow>) => {
    setRows(prev => {
      const prevRow = prev.find(r => r.id === id);
      const oldVc = prevRow?.vesselCode ?? "";

      // 1단계: 해당 행 패치 + 절단~대조 재계산
      const next = prev.map(r => {
        if (r.id !== id) return r;
        const updated = { ...r, ...patch, isDirty: true };
        if ("erectionDate" in patch || "assemblyStart" in patch) {
          const s = getSettingFor(updated.vesselCode, settings);
          if (s) return { ...updated, ...calcUpToLarge(updated, s, calendarDays) };
        }
        return updated;
      });

      // 2단계: 영향받은 호선(들)에 선각검사~지연일수 재배정
      const changedRow = next.find(r => r.id === id);
      if (!changedRow) return next;
      const newVc = changedRow.vesselCode;

      const vesselsToRecalc = (newVc !== oldVc && oldVc)
        ? [newVc, oldVc]
        : [newVc];

      let result = next;
      for (const vc of vesselsToRecalc) {
        if (!vc) continue;
        const s = getSettingFor(vc, settings);
        if (!s) continue;
        const vesselRows = result.filter(r => r.vesselCode === vc);
        const hullMap = calcHullAndDownstream(vesselRows, s, calendarDays);
        result = result.map(r => {
          if (r.vesselCode !== vc) return r;
          const downstream = hullMap.get(r.id);
          return downstream ? { ...r, ...downstream, isDirty: true } : r;
        });
      }

      return result;
    });
  };

  const addRow = () => {
    const tempId = `new_${Date.now()}`;
    setRows(prev => [...prev, {
      id: tempId, vesselCode: "", blk: "", no: null, weeklyQty: null,
      erectionDate: null, assemblyStart: null,
      pnd: null, cutS: null, cutF: null,
      smallS: null, smallF: null, midS: null, midF: null,
      largeS: null, largeF: null, hullInspDate: null,
      paintStart: null, paintEnd: null, peStart: null, peEnd: null,
      delayDays: null, isNew: true, isDirty: true,
    }]);
  };

  const deleteRow = async (row: LbRow) => {
    if (row.isNew) {
      setRows(prev => prev.filter(r => r.id !== row.id));
      return;
    }
    if (!confirm(`${row.vesselCode} / ${row.blk} 행을 삭제하시겠습니까?`)) return;
    await fetch(`/api/lb-plan/${row.id}`, { method: "DELETE" });
    setRows(prev => prev.filter(r => r.id !== row.id));
  };

  // 행 초기화: 해당 행의 수동수정 플래그 제거 후 재계산
  const resetRow = (id: string) => {
    setRows(prev => {
      const next = prev.map(r => {
        if (r.id !== id) return r;
        const cleared = { ...r, manualFields: [], isDirty: true };
        const s = getSettingFor(cleared.vesselCode, settings);
        if (s) return { ...cleared, ...calcUpToLarge(cleared, s, calendarDays) };
        return cleared;
      });
      // hull downstream 재계산
      const row = next.find(r => r.id === id);
      if (!row) return next;
      const vc = row.vesselCode;
      const s = getSettingFor(vc, settings);
      if (!s) return next;
      const vesselRows = next.filter(r => r.vesselCode === vc);
      const hullMap = calcHullAndDownstream(vesselRows, s, calendarDays);
      return next.map(r => {
        if (r.vesselCode !== vc) return r;
        const downstream = hullMap.get(r.id);
        return downstream ? { ...r, ...downstream, isDirty: true } : r;
      });
    });
  };

  // 전체 초기화: 모든 행의 수동수정 플래그 제거 후 재계산
  const resetAllRows = () => {
    if (!confirm("모든 행의 수동수정을 초기화하고 설정값 기준으로 재계산합니까?")) return;
    setRows(prev => prev.map(r => ({ ...r, manualFields: [], isDirty: true })));
    // 다음 tick에 recalcAll 호출 (state 업데이트 후)
    setTimeout(() => recalcAll(settings, calendarDays), 0);
  };

  const saveAll = async () => {
    const dirty = rows.filter(r => r.isDirty);
    if (dirty.length === 0) return;
    setSaving(true);
    await Promise.all(dirty.map(async row => {
      if (row.isNew) {
        const res = await fetch("/api/lb-plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(row),
        });
        if (res.ok) {
          const saved: LbRow = await res.json();
          setRows(prev => prev.map(r => r.id === row.id ? { ...saved } : r));
        }
      } else {
        await fetch(`/api/lb-plan/${row.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(row),
        });
        setRows(prev => prev.map(r => r.id === row.id ? { ...r, isDirty: false } : r));
      }
    }));
    setSaving(false);
  };

  const saveVersion = async () => {
    if (!saveVersionName.trim()) return;
    setSavingVersion(true);
    const res = await fetch("/api/lb-plan-version", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: saveVersionName.trim(),
        rows,
        settingsSnapshot: { processSettings: settings, dataStartRow },
      }),
    });
    if (res.ok) {
      await loadVersions();
      setRows(prev => prev.map(r => ({ ...r, isDirty: false })));
      setShowSaveDialog(false);
      setSaveVersionName("");
    } else {
      const err = await res.json();
      alert(err.error ?? "저장 실패");
    }
    setSavingVersion(false);
  };

  const loadVersion = async (versionId: string) => {
    setLoading(true);
    // 해당 버전의 rows 로드
    const res = await fetch(`/api/lb-plan?versionId=${versionId}`);
    if (res.ok) {
      const data: LbRow[] = await res.json();
      setRows(data.map(r => ({
        ...r,
        manualFields: Array.isArray(r.manualFields) ? r.manualFields : [],
        isDirty: false,
      })));
    }

    // 버전의 설정 스냅샷 복원
    const version = versions.find(v => v.id === versionId);
    if (version?.settingsSnapshot) {
      const { processSettings, dataStartRow: dr } = version.settingsSnapshot;
      // 로컬 상태 업데이트
      setSettings(processSettings);
      setDataStartRow(dr);
      // DB에도 복원 (현재 작업 설정으로)
      await fetch("/api/lb-process-setting/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(processSettings),
      });
      // 복원된 설정으로 전체 재계산
      recalcAll(processSettings, calendarDays);
    }

    setLoading(false);
  };

  const deployVersion = async (v: LbPlanVersion) => {
    if (v.isDeployed) return;
    const deployed = versions.find(ver => ver.isDeployed);
    if (deployed) {
      if (!confirm(`현재 "${deployed.name}"이 배포 중입니다.\n"${v.name}"으로 교체하시겠습니까?`)) return;
    }
    await fetch(`/api/lb-plan-version/${v.id}/deploy`, { method: "POST" });
    await loadVersions();
  };

  const deleteVersion = async (v: LbPlanVersion) => {
    if (v.isDeployed) {
      alert("배포 중인 버전은 삭제할 수 없습니다. 배포를 해제한 후 삭제하세요.");
      return;
    }
    if (!confirm(`"${v.name}" 버전을 삭제하시겠습니까?\n해당 버전의 모든 데이터가 삭제됩니다.`)) return;
    const res = await fetch(`/api/lb-plan-version/${v.id}`, { method: "DELETE" });
    if (res.ok) {
      await loadVersions();
    } else {
      const err = await res.json();
      alert(err.error ?? "삭제 실패");
    }
  };

  // 양식 다운로드 (헤더만 있는 빈 양식)
  const downloadTemplate = () => {
    const headers = ["호선", "BLK", "NO", "주당생산량", "탑재일", "PND", "조립착수일"];
    const ws = XLSX.utils.aoa_to_sheet([headers]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "LB생산계획");
    XLSX.writeFile(wb, "LB생산계획_양식.xlsx");
  };

  // 엑셀 가져오기 — 서버사이드 파싱 (수식 계산값 정확히 읽음)
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ created: number; updated: number; skipped: number; newVessels: number } | null>(null);

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportResult(null);

    try {
      // 서버로 파일 업로드 → 서버에서 파싱 후 rows 반환
      const formData = new FormData();
      formData.append("file", file);
      formData.append("dataStartRow", String(dataStartRow));
      const res = await fetch("/api/lb-import", { method: "POST", body: formData });
      if (!res.ok) {
        const err = await res.json();
        alert(`가져오기 실패: ${err.error ?? "알 수 없는 오류"}`);
        return;
      }
      const { rows: parsed, totalRows, sheetName } = await res.json() as {
        rows: Array<{
          vesselCode: string; blk: string; no: number | null; weeklyQty: number | null;
          erectionDate: string | null; pnd: string | null; assemblyStart: string | null;
          cutS: string | null; cutF: string | null;
          smallS: string | null; smallF: string | null;
          midS: string | null; midF: string | null;
          largeS: string | null; largeF: string | null;
          hullInspDate: string | null; paintStart: string | null; paintEnd: string | null;
          peStart: string | null; peEnd: string | null; delayDays: number | null;
        }>;
        totalRows: number;
        sheetName: string;
      };

      if (totalRows === 0) {
        alert(`시트 "${sheetName}"에서 데이터를 찾지 못했습니다.\n(6행부터 데이터, A열이 숫자인 행만 인식)`);
        return;
      }

      // 중복 확인
      const existingKeys = new Set(rows.filter(r => !r.isNew).map(r => `${r.vesselCode}|${r.blk}`));
      const dupes = parsed.filter(r => existingKeys.has(`${r.vesselCode}|${r.blk}`));
      let action = "skip";
      if (dupes.length > 0) {
        const ans = confirm(
          `시트: ${sheetName} / 총 ${totalRows}건\n중복된 호선+BLK가 ${dupes.length}건 있습니다.\n\n확인 → 덮어쓰기\n취소 → 건너뛰기`
        );
        action = ans ? "overwrite" : "skip";
      }

      let created = 0, updated = 0, skipped = 0;

      setRows(prev => {
        const result = [...prev];
        for (const imp of parsed) {
          const key = `${imp.vesselCode}|${imp.blk}`;
          const existIdx = result.findIndex(r => !r.isNew && `${r.vesselCode}|${r.blk}` === key);
          if (existIdx >= 0) {
            if (action === "overwrite") {
              result[existIdx] = {
                ...result[existIdx],
                ...imp,
                // 날짜를 ISO 문자열로 변환 (서버는 YYYY-MM-DD 반환)
                erectionDate: imp.erectionDate ? new Date(imp.erectionDate).toISOString() : null,
                pnd:          imp.pnd          ? new Date(imp.pnd).toISOString()          : null,
                assemblyStart:imp.assemblyStart? new Date(imp.assemblyStart).toISOString(): null,
                cutS:  imp.cutS  ? new Date(imp.cutS).toISOString()  : null,
                cutF:  imp.cutF  ? new Date(imp.cutF).toISOString()  : null,
                smallS:imp.smallS? new Date(imp.smallS).toISOString(): null,
                smallF:imp.smallF? new Date(imp.smallF).toISOString(): null,
                midS:  imp.midS  ? new Date(imp.midS).toISOString()  : null,
                midF:  imp.midF  ? new Date(imp.midF).toISOString()  : null,
                largeS:imp.largeS? new Date(imp.largeS).toISOString(): null,
                largeF:imp.largeF? new Date(imp.largeF).toISOString(): null,
                hullInspDate: imp.hullInspDate ? new Date(imp.hullInspDate).toISOString() : null,
                paintStart: imp.paintStart ? new Date(imp.paintStart).toISOString() : null,
                paintEnd:   imp.paintEnd   ? new Date(imp.paintEnd).toISOString()   : null,
                peStart:    imp.peStart    ? new Date(imp.peStart).toISOString()    : null,
                peEnd:      imp.peEnd      ? new Date(imp.peEnd).toISOString()      : null,
                isNew: false, isDirty: true,
              };
              updated++;
            } else {
              skipped++;
            }
          } else {
            const ts = Date.now();
            result.push({
              id: `import_${ts}_${imp.blk}`,
              ...imp,
              erectionDate: imp.erectionDate ? new Date(imp.erectionDate).toISOString() : null,
              pnd:          imp.pnd          ? new Date(imp.pnd).toISOString()          : null,
              assemblyStart:imp.assemblyStart? new Date(imp.assemblyStart).toISOString(): null,
              cutS:  imp.cutS  ? new Date(imp.cutS).toISOString()  : null,
              cutF:  imp.cutF  ? new Date(imp.cutF).toISOString()  : null,
              smallS:imp.smallS? new Date(imp.smallS).toISOString(): null,
              smallF:imp.smallF? new Date(imp.smallF).toISOString(): null,
              midS:  imp.midS  ? new Date(imp.midS).toISOString()  : null,
              midF:  imp.midF  ? new Date(imp.midF).toISOString()  : null,
              largeS:imp.largeS? new Date(imp.largeS).toISOString(): null,
              largeF:imp.largeF? new Date(imp.largeF).toISOString(): null,
              hullInspDate: imp.hullInspDate ? new Date(imp.hullInspDate).toISOString() : null,
              paintStart: imp.paintStart ? new Date(imp.paintStart).toISOString() : null,
              paintEnd:   imp.paintEnd   ? new Date(imp.paintEnd).toISOString()   : null,
              peStart:    imp.peStart    ? new Date(imp.peStart).toISOString()    : null,
              peEnd:      imp.peEnd      ? new Date(imp.peEnd).toISOString()      : null,
              isNew: true, isDirty: true,
            });
            created++;
          }
        }
        return result;
      });

      // 업로드된 파일의 호선번호 중 설정에 없는 것 자동 등록
      const uploadedVessels = Array.from(new Set(parsed.map(r => r.vesselCode).filter(Boolean)));
      const existingVesselCodes = new Set(settings.map(s => s.vesselCode));
      const newVesselCodes = uploadedVessels.filter(vc => !existingVesselCodes.has(vc));

      let newVessels = 0;
      if (newVesselCodes.length > 0) {
        const registerResults = await Promise.allSettled(
          newVesselCodes.map(vc =>
            fetch("/api/lb-process-setting", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ vesselCode: vc, isDefault: false, ...DEFAULT_SETTING }),
            })
          )
        );
        newVessels = registerResults.filter(r => r.status === "fulfilled").length;
        if (newVessels > 0) await loadSettings();
      }

      setImportResult({ created, updated, skipped, newVessels });
    } finally {
      setImporting(false);
      e.target.value = "";
    }
  };

  // 호선 목록 (필터용)
  const vesselCodes = Array.from(new Set(rows.map(r => r.vesselCode).filter(Boolean))).sort();
  const filtered = vesselFilter === "ALL" ? rows : rows.filter(r => r.vesselCode === vesselFilter);

  const dirtyCount = rows.filter(r => r.isDirty).length;

  const colCls = "border-r border-gray-200 px-0";
  const thCls = "text-center text-[11px] font-semibold text-gray-600 py-2 px-1 border-r border-gray-200 whitespace-nowrap bg-gray-50";

  return (
    <div className="flex flex-col gap-4">
      {/* 버전 목록 패널 */}
      {versions.length > 0 && (
        <div className="border border-gray-200 rounded-lg bg-gray-50 p-3">
          <p className="text-xs font-semibold text-gray-600 mb-2">저장된 버전</p>
          <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto">
            {versions.map(v => (
              <div key={v.id}
                className="flex items-center gap-2 bg-white border border-gray-200 rounded-md px-3 py-2 hover:border-blue-300 cursor-pointer"
                onClick={() => loadVersion(v.id)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-sm font-medium text-gray-800 truncate">{v.name}</span>
                    {v.isDeployed
                      ? <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-green-100 text-green-700 shrink-0">배포중</span>
                      : <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-gray-100 text-gray-500 shrink-0">초안</span>
                    }
                  </div>
                  <div className="text-[10px] text-gray-400 mt-0.5">
                    {new Date(v.createdAt).toLocaleString("ko-KR")} · {v.blockCount}블록
                  </div>
                </div>
                <div className="flex gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                  <button
                    onClick={() => deployVersion(v)}
                    disabled={v.isDeployed}
                    className={`text-xs px-2 py-1 rounded border transition-colors ${v.isDeployed ? "border-green-300 text-green-600 bg-green-50 cursor-default" : "border-blue-300 text-blue-600 hover:bg-blue-50"}`}
                  >
                    {v.isDeployed ? "배포중" : "배포"}
                  </button>
                  <button
                    onClick={() => deleteVersion(v)}
                    className={`text-xs px-2 py-1 rounded border transition-colors ${v.isDeployed ? "border-gray-200 text-gray-300 cursor-not-allowed" : "border-red-200 text-red-500 hover:bg-red-50"}`}
                  >
                    삭제
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 툴바 */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          className="border rounded-md text-sm px-2 h-9"
          value={vesselFilter}
          onChange={e => setVesselFilter(e.target.value)}
        >
          <option value="ALL">전체 호선</option>
          {vesselCodes.map(v => <option key={v} value={v}>{v}</option>)}
        </select>
        <Input
          type="number" className="h-9 w-24 text-sm"
          value={yearFilter}
          onChange={e => setYearFilter(e.target.value)}
          placeholder="연도"
        />
        <div className="flex-1" />
        <Button size="sm" variant="outline" onClick={() => setShowSettings(true)}>
          <Settings2 size={14} className="mr-1" /> 설정
        </Button>
        <Button size="sm" variant="outline" onClick={() => recalcAll(settings, calendarDays)}
          title="설정·캘린더 기준으로 모든 행 날짜 재계산">
          <RefreshCw size={14} className="mr-1" /> 전체 재계산
        </Button>
        <Button size="sm" variant="outline" onClick={resetAllRows}
          title="모든 행의 수동수정을 제거하고 설정값으로 재계산">
          <RefreshCw size={14} className="mr-1" /> 전체 초기화
        </Button>
        <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={importing}>
          <Upload size={14} className="mr-1" /> {importing ? "가져오는 중..." : "엑셀 가져오기"}
        </Button>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImport} />
        {importResult && (
          <span className="text-xs text-gray-600 bg-gray-100 rounded px-2 py-1">
            신규 {importResult.created}건 / 업데이트 {importResult.updated}건 / 건너뜀 {importResult.skipped}건
            {importResult.newVessels > 0 && (
              <span className="ml-1.5 text-blue-600 font-semibold">· 새로운 호선 {importResult.newVessels}개 설정에 추가됨</span>
            )}
          </span>
        )}
        <Button size="sm" variant="outline" onClick={downloadTemplate}>
          <Download size={14} className="mr-1" /> 양식 다운로드
        </Button>
        <Button size="sm" onClick={addRow}>
          <Plus size={14} className="mr-1" /> 행 추가
        </Button>
        <Button size="sm" onClick={() => {
          const now = new Date();
          const pad = (n: number) => String(n).padStart(2, "0");
          const defaultName = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())} 저장본`;
          setSaveVersionName(defaultName);
          setShowSaveDialog(true);
        }} disabled={rows.length === 0} className="bg-blue-600 hover:bg-blue-700 text-white">
          <Save size={14} className="mr-1" /> 버전 저장
        </Button>
      </div>

      {/* 테이블 */}
      <div className="overflow-x-auto rounded-lg border border-gray-200 shadow-sm">
        <table className="text-xs border-collapse" style={{ tableLayout: "fixed", width: "2126px" }}>
          <colgroup>
            <col style={{ width: "56px" }} />   {/* 상태 */}
            <col style={{ width: "48px" }} />   {/* NO */}
            <col style={{ width: "72px" }} />   {/* 호선 */}
            <col style={{ width: "64px" }} />   {/* BLK */}
            <col style={{ width: "72px" }} />   {/* 주당생산량 */}
            <col style={{ width: "110px" }} />  {/* 탑재일 */}
            <col style={{ width: "110px" }} />  {/* PND */}
            <col style={{ width: "110px" }} />  {/* 조립착수일 */}
            <col style={{ width: "100px" }} />  {/* 절단S */}
            <col style={{ width: "100px" }} />  {/* 절단F */}
            <col style={{ width: "100px" }} />  {/* 소조S */}
            <col style={{ width: "100px" }} />  {/* 소조F */}
            <col style={{ width: "100px" }} />  {/* 중조S */}
            <col style={{ width: "100px" }} />  {/* 중조F */}
            <col style={{ width: "100px" }} />  {/* 대조S */}
            <col style={{ width: "100px" }} />  {/* 대조F */}
            <col style={{ width: "100px" }} />  {/* 선각검사 */}
            <col style={{ width: "100px" }} />  {/* 도장착수 */}
            <col style={{ width: "100px" }} />  {/* 도장완료 */}
            <col style={{ width: "100px" }} />  {/* P-E착수 */}
            <col style={{ width: "100px" }} />  {/* P-E완료 */}
            <col style={{ width: "72px" }} />   {/* 지연일수 */}
            <col style={{ width: "56px" }} />   {/* 초기화 */}
            <col style={{ width: "56px" }} />   {/* 삭제 */}
          </colgroup>
          <thead>
            <tr>
              <th className={thCls}>상태</th>
              <th className={thCls}>NO</th>
              <th className={`${thCls} bg-blue-50`}>호선</th>
              <th className={`${thCls} bg-blue-50`}>BLK</th>
              <th className={`${thCls} bg-blue-50`}>주당<br/>생산량</th>
              <th className={`${thCls} bg-blue-50`}>탑재일</th>
              <th className={thCls}>PND</th>
              <th className={`${thCls} bg-blue-50`}>조립착수일</th>
              <th className={`${thCls} bg-green-50 text-green-800`}>절단 S</th>
              <th className={`${thCls} bg-green-50 text-green-800`}>절단 F</th>
              <th className={thCls}>소조 S</th>
              <th className={thCls}>소조 F</th>
              <th className={thCls}>중조 S</th>
              <th className={thCls}>중조 F</th>
              <th className={thCls}>대조 S</th>
              <th className={thCls}>대조 F</th>
              <th className={thCls}>선각검사</th>
              <th className={thCls}>도장착수</th>
              <th className={thCls}>도장완료</th>
              <th className={thCls}>P-E착수</th>
              <th className={thCls}>P-E완료</th>
              <th className={thCls}>지연일수</th>
              <th className={thCls}>초기화</th>
              <th className={thCls}>삭제</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={24} className="text-center py-8 text-gray-400">불러오는 중...</td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={24} className="text-center py-8 text-gray-400">데이터가 없습니다. 행 추가 또는 엑셀 가져오기로 시작하세요.</td></tr>
            )}
            {filtered.map(row => {
              const delay = row.delayDays;
              const delayCls = delay == null ? "text-gray-400" : delay >= 0 ? "text-green-700 font-bold" : "text-red-600 font-bold";
              const isDirty = row.isDirty;
              return (
                <tr key={row.id} className={`border-b border-gray-100 hover:bg-gray-50 ${isDirty ? "bg-yellow-50" : ""}`}>
                  <td className={`${colCls} text-center py-1`}><StatusBadge row={row} /></td>
                  <td className={colCls}>
                    <EditCell value={row.no != null ? String(row.no) : ""} type="number"
                      onChange={v => updateRow(row.id, { no: v ? Number(v) : null })} />
                  </td>
                  <td className={colCls}>
                    <EditCell value={row.vesselCode}
                      onChange={v => updateRow(row.id, { vesselCode: v })} />
                  </td>
                  <td className={colCls}>
                    <EditCell value={row.blk}
                      onChange={v => updateRow(row.id, { blk: v })} />
                  </td>
                  <td className={colCls}>
                    <EditCell value={row.weeklyQty != null ? String(row.weeklyQty) : ""} type="number"
                      onChange={v => updateRow(row.id, { weeklyQty: v ? Number(v) : null })} />
                  </td>
                  <td className={colCls}>
                    <EditCell value={row.erectionDate?.slice(0, 10) ?? ""} type="date"
                      onChange={v => updateRow(row.id, { erectionDate: v ? new Date(v).toISOString() : null })} />
                  </td>
                  <td className={colCls}>
                    <EditCell value={fmtDate(row.pnd)} readOnly />
                  </td>
                  <td className={colCls}>
                    <EditCell value={row.assemblyStart?.slice(0, 10) ?? ""} type="date"
                      onChange={v => updateRow(row.id, { assemblyStart: v ? new Date(v).toISOString() : null })} />
                  </td>
                  <td className={colCls}>
                    <EditCell value={row.cutS?.slice(0,10) ?? ""} type="date" green
                      isManual={row.manualFields?.includes("cutS")}
                      onChange={v => setManual(row.id, "cutS", v || null)} />
                  </td>
                  <td className={colCls}>
                    <EditCell value={row.cutF?.slice(0,10) ?? ""} type="date" green
                      isManual={row.manualFields?.includes("cutF")}
                      onChange={v => setManual(row.id, "cutF", v || null)} />
                  </td>
                  <td className={colCls}><EditCell value={row.smallS?.slice(0,10) ?? ""} type="date"
                    isManual={row.manualFields?.includes("smallS")}
                    onChange={v => setManual(row.id, "smallS", v || null)} /></td>
                  <td className={colCls}><EditCell value={fmtDate(row.smallF)} readOnly /></td>
                  <td className={colCls}><EditCell value={row.midS?.slice(0,10) ?? ""} type="date"
                    isManual={row.manualFields?.includes("midS")}
                    onChange={v => setManual(row.id, "midS", v || null)} /></td>
                  <td className={colCls}><EditCell value={fmtDate(row.midF)} readOnly /></td>
                  <td className={colCls}><EditCell value={row.largeS?.slice(0,10) ?? ""} type="date"
                    isManual={row.manualFields?.includes("largeS")}
                    onChange={v => setManual(row.id, "largeS", v || null)} /></td>
                  <td className={colCls}><EditCell value={fmtDate(row.largeF)} readOnly /></td>
                  <td className={colCls}><EditCell value={row.hullInspDate?.slice(0,10) ?? ""} type="date"
                    isManual={row.manualFields?.includes("hullInspDate")}
                    onChange={v => setManual(row.id, "hullInspDate", v || null)} /></td>
                  <td className={colCls}><EditCell value={row.paintStart?.slice(0,10) ?? ""} type="date"
                    isManual={row.manualFields?.includes("paintStart")}
                    onChange={v => setManual(row.id, "paintStart", v || null)} /></td>
                  <td className={colCls}><EditCell value={row.paintEnd?.slice(0,10) ?? ""} type="date"
                    isManual={row.manualFields?.includes("paintEnd")}
                    onChange={v => setManual(row.id, "paintEnd", v || null)} /></td>
                  <td className={colCls}><EditCell value={row.peStart?.slice(0,10) ?? ""} type="date"
                    isManual={row.manualFields?.includes("peStart")}
                    onChange={v => setManual(row.id, "peStart", v || null)} /></td>
                  <td className={colCls}><EditCell value={row.peEnd?.slice(0,10) ?? ""} type="date"
                    isManual={row.manualFields?.includes("peEnd")}
                    onChange={v => setManual(row.id, "peEnd", v || null)} /></td>
                  <td className={`${colCls} text-center ${delayCls} py-1 px-1`}>
                    {delay != null ? (delay >= 0 ? `+${delay}일` : `${delay}일`) : "-"}
                  </td>
                  <td className="text-center py-1 px-1">
                    <button onClick={() => resetRow(row.id)}
                      className="text-xs text-gray-400 hover:text-blue-600"
                      title="이 행의 수동수정 초기화">
                      ↺
                    </button>
                  </td>
                  <td className="text-center py-1 px-1">
                    <button onClick={() => deleteRow(row)} className="text-red-400 hover:text-red-600">
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-400">
        파란색 셀: 직접 입력 / 초록색: 우리 담당(절단) / 회색: 자동계산 (수정 불가)
        {dirtyCount > 0 && <span className="ml-2 text-amber-600 font-semibold">미저장 {dirtyCount}행 있음 — 저장 버튼을 눌러주세요</span>}
      </p>

      {/* 버전 저장 다이얼로그 */}
      {showSaveDialog && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-6">
            <h3 className="text-base font-bold text-gray-900 mb-4">버전 저장</h3>
            <div className="flex flex-col gap-2 mb-4">
              <label className="text-sm text-gray-600">버전명</label>
              <Input
                value={saveVersionName}
                onChange={e => setSaveVersionName(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") saveVersion(); }}
                placeholder="예: 4월 초안"
                className="text-sm"
                autoFocus
              />
              <p className="text-xs text-gray-400">총 {rows.length}블록이 저장됩니다.</p>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setShowSaveDialog(false)}>취소</Button>
              <Button size="sm" onClick={saveVersion} disabled={savingVersion || !saveVersionName.trim()}>
                {savingVersion ? "저장 중..." : "저장"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {showSettings && (
        <ProcessSettingModal
          onClose={() => setShowSettings(false)}
          onSaved={async () => {
            const newSettings = await loadSettings();
            recalcAll(newSettings, calendarDays);
          }}
          dataStartRow={dataStartRow}
          onDataStartRowChange={setDataStartRow}
          onCalendarChange={async () => {
            const newCal = await loadCalendar();
            recalcAll(settings, newCal);
          }}
        />
      )}
    </div>
  );
}

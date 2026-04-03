"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Plus, Settings2, Download, Upload, Save, Trash2, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import * as XLSX from "xlsx"; // 엑셀 내보내기 전용 (가져오기는 서버사이드)

// ─── 타입 ─────────────────────────────────────────────────────────────────────

interface ProcessSetting {
  id: string;
  vesselCode: string;
  isDefault: boolean;
  cutLeadDays: number;
  cutDuration: number;
  assemblySmallDays: number;
  assemblyMidDays: number;
  assemblyLargeDays: number;
  hullInspLeadDays: number;
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
  isNew?: boolean; // 아직 저장되지 않은 임시 행
  isDirty?: boolean;
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

// ─── 자동계산 ─────────────────────────────────────────────────────────────────

function calcPlan(row: LbRow, s: ProcessSetting): Partial<LbRow> {
  const erection = parseDate(row.erectionDate);
  const assembly = parseDate(row.assemblyStart);
  if (!erection || !assembly) return {};

  const pnd      = subDays(erection, 1);
  const cutS     = subDays(assembly, s.cutLeadDays);
  const cutF     = addDays(cutS, s.cutDuration);
  const smallS   = subDays(cutS, s.assemblySmallDays);
  const smallF   = cutS;
  const midS     = subDays(smallS, s.assemblyMidDays);
  const midF     = smallS;
  const largeS   = subDays(midS, s.assemblyLargeDays);
  const largeF   = erection; // 대조F = 탑재일
  const hullInsp = subDays(largeF, s.hullInspLeadDays);
  const paintSt  = addDays(hullInsp, s.paintLeadDays);
  const paintEnd = addDays(paintSt, s.paintDuration);
  const peSt     = addDays(paintEnd, s.peLeadDays);
  const peEnd    = addDays(peSt, s.peDuration);
  const delay    = Math.round((pnd.getTime() - peEnd.getTime()) / 86400000);

  return {
    pnd: toISO(pnd),
    cutS: toISO(cutS), cutF: toISO(cutF),
    smallS: toISO(smallS), smallF: toISO(smallF),
    midS: toISO(midS), midF: toISO(midF),
    largeS: toISO(largeS), largeF: toISO(largeF),
    hullInspDate: toISO(hullInsp),
    paintStart: toISO(paintSt), paintEnd: toISO(paintEnd),
    peStart: toISO(peSt), peEnd: toISO(peEnd),
    delayDays: delay,
  };
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
  cutLeadDays: 7, cutDuration: 5,
  assemblySmallDays: 10, assemblyMidDays: 10, assemblyLargeDays: 15,
  hullInspLeadDays: 3, paintLeadDays: 2, paintDuration: 7, peLeadDays: 1, peDuration: 3,
};

function ProcessSettingModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [settings, setSettings] = useState<ProcessSetting[]>([]);
  const [editing, setEditing] = useState<string | null>(null); // vesselCode
  const [form, setForm] = useState<Omit<ProcessSetting, "id">>({
    vesselCode: "", isDefault: false, ...DEFAULT_SETTING,
  });
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/lb-process-setting");
    setSettings(await res.json());
  }, []);

  useEffect(() => { load(); }, [load]);

  const startEdit = (s: ProcessSetting) => {
    setEditing(s.vesselCode);
    setForm({ vesselCode: s.vesselCode, isDefault: s.isDefault, cutLeadDays: s.cutLeadDays, cutDuration: s.cutDuration, assemblySmallDays: s.assemblySmallDays, assemblyMidDays: s.assemblyMidDays, assemblyLargeDays: s.assemblyLargeDays, hullInspLeadDays: s.hullInspLeadDays, paintLeadDays: s.paintLeadDays, paintDuration: s.paintDuration, peLeadDays: s.peLeadDays, peDuration: s.peDuration });
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
    await load();
    onSaved();
  };

  const deleteSetting = async (vesselCode: string) => {
    if (!confirm(`${vesselCode} 설정을 삭제하시겠습니까?`)) return;
    await fetch(`/api/lb-process-setting/${vesselCode}`, { method: "DELETE" });
    await load();
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

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center overflow-y-auto py-10">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-base font-bold text-gray-900">호선별 공정 소요일수 설정</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="p-6">
          {/* 목록 */}
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
                  <th className="border px-2 py-1.5">선각검사</th>
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
                  <tr><td colSpan={13} className="border px-2 py-4 text-center text-gray-400">설정된 호선이 없습니다.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* 추가/수정 폼 */}
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
                {numField("hullInspLeadDays", "선각검사 선행")}
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
        </div>
      </div>
    </div>
  );
}

// ─── 인라인 편집 셀 ───────────────────────────────────────────────────────────

function EditCell({
  value, onChange, type = "text", readOnly = false, green = false,
}: {
  value: string;
  onChange?: (v: string) => void;
  type?: string;
  readOnly?: boolean;
  green?: boolean;
}) {
  const base = "h-7 text-xs border-0 rounded-none focus:ring-1 focus:ring-inset focus:ring-blue-400 px-1.5 w-full";
  if (readOnly) {
    return (
      <div className={`${base} flex items-center ${green ? "bg-green-50 text-green-800 font-semibold" : "bg-gray-50 text-gray-600"}`}>
        {value || "-"}
      </div>
    );
  }
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange?.(e.target.value)}
      className={`${base} bg-blue-50 text-blue-900 font-semibold outline-none`}
    />
  );
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────────────────────

export default function LbPlanManager() {
  const [rows, setRows] = useState<LbRow[]>([]);
  const [settings, setSettings] = useState<ProcessSetting[]>([]);
  const [vesselFilter, setVesselFilter] = useState("ALL");
  const [yearFilter, setYearFilter] = useState(String(new Date().getFullYear()));
  const [showSettings, setShowSettings] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadSettings = useCallback(async () => {
    const res = await fetch("/api/lb-process-setting");
    setSettings(await res.json());
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

  useEffect(() => { loadSettings(); }, [loadSettings]);
  useEffect(() => { loadPlans(); }, [loadPlans]);

  // 해당 호선의 설정 찾기 (없으면 기본값, 그것도 없으면 undefined)
  const getSettingFor = (vesselCode: string): ProcessSetting | undefined => {
    return settings.find(s => s.vesselCode === vesselCode)
        ?? settings.find(s => s.isDefault);
  };

  const updateRow = (id: string, patch: Partial<LbRow>) => {
    setRows(prev => prev.map(r => {
      if (r.id !== id) return r;
      const updated = { ...r, ...patch, isDirty: true };
      // 탑재일 또는 조립착수일 변경 시 자동계산
      if ("erectionDate" in patch || "assemblyStart" in patch) {
        const s = getSettingFor(updated.vesselCode);
        if (s) {
          const calc = calcPlan(updated, s);
          return { ...updated, ...calc };
        }
      }
      return updated;
    }));
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

  // 엑셀 내보내기
  const exportExcel = () => {
    const headers = [
      "NO", "호선", "BLK", "주당생산량",
      "탑재일", "PND", "조립착수일",
      "절단S", "절단F", "소조S", "소조F",
      "중조S", "중조F", "대조S", "대조F",
      "선각검사", "도장착수", "도장완료", "P-E착수", "P-E완료",
      "지연일수",
    ];
    const data = rows.map(r => [
      r.no, r.vesselCode, r.blk, r.weeklyQty,
      fmtDate(r.erectionDate), fmtDate(r.pnd), fmtDate(r.assemblyStart),
      fmtDate(r.cutS), fmtDate(r.cutF), fmtDate(r.smallS), fmtDate(r.smallF),
      fmtDate(r.midS), fmtDate(r.midF), fmtDate(r.largeS), fmtDate(r.largeF),
      fmtDate(r.hullInspDate), fmtDate(r.paintStart), fmtDate(r.paintEnd),
      fmtDate(r.peStart), fmtDate(r.peEnd),
      r.delayDays,
    ]);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "LB생산계획");
    const today = new Date();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    XLSX.writeFile(wb, `생산계획_${mm}월${dd}일_.xlsx`);
  };

  // 엑셀 가져오기 — 서버사이드 파싱 (수식 계산값 정확히 읽음)
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ created: number; updated: number; skipped: number } | null>(null);

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportResult(null);

    try {
      // 서버로 파일 업로드 → 서버에서 파싱 후 rows 반환
      const formData = new FormData();
      formData.append("file", file);
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

      setImportResult({ created, updated, skipped });
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
          <Settings2 size={14} className="mr-1" /> 공정 설정
        </Button>
        <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={importing}>
          <Upload size={14} className="mr-1" /> {importing ? "가져오는 중..." : "엑셀 가져오기"}
        </Button>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImport} />
        {importResult && (
          <span className="text-xs text-gray-600 bg-gray-100 rounded px-2 py-1">
            신규 {importResult.created}건 / 업데이트 {importResult.updated}건 / 건너뜀 {importResult.skipped}건
          </span>
        )}
        <Button size="sm" variant="outline" onClick={exportExcel}>
          <Download size={14} className="mr-1" /> 엑셀 내보내기
        </Button>
        <Button size="sm" onClick={addRow}>
          <Plus size={14} className="mr-1" /> 행 추가
        </Button>
        <Button size="sm" onClick={saveAll} disabled={saving || dirtyCount === 0}
          className={dirtyCount > 0 ? "bg-blue-600 hover:bg-blue-700 text-white" : ""}>
          <Save size={14} className="mr-1" /> 저장{dirtyCount > 0 ? ` (${dirtyCount})` : ""}
        </Button>
      </div>

      {/* 테이블 */}
      <div className="overflow-x-auto rounded-lg border border-gray-200 shadow-sm">
        <table className="min-w-max w-full text-xs border-collapse">
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
              <th className={thCls}>삭제</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={23} className="text-center py-8 text-gray-400">불러오는 중...</td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={23} className="text-center py-8 text-gray-400">데이터가 없습니다. 행 추가 또는 엑셀 가져오기로 시작하세요.</td></tr>
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
                    <EditCell value={fmtDate(row.cutS)} readOnly green />
                  </td>
                  <td className={colCls}>
                    <EditCell value={fmtDate(row.cutF)} readOnly green />
                  </td>
                  <td className={colCls}><EditCell value={fmtDate(row.smallS)} readOnly /></td>
                  <td className={colCls}><EditCell value={fmtDate(row.smallF)} readOnly /></td>
                  <td className={colCls}><EditCell value={fmtDate(row.midS)} readOnly /></td>
                  <td className={colCls}><EditCell value={fmtDate(row.midF)} readOnly /></td>
                  <td className={colCls}><EditCell value={fmtDate(row.largeS)} readOnly /></td>
                  <td className={colCls}><EditCell value={fmtDate(row.largeF)} readOnly /></td>
                  <td className={colCls}><EditCell value={fmtDate(row.hullInspDate)} readOnly /></td>
                  <td className={colCls}><EditCell value={fmtDate(row.paintStart)} readOnly /></td>
                  <td className={colCls}><EditCell value={fmtDate(row.paintEnd)} readOnly /></td>
                  <td className={colCls}><EditCell value={fmtDate(row.peStart)} readOnly /></td>
                  <td className={colCls}><EditCell value={fmtDate(row.peEnd)} readOnly /></td>
                  <td className={`${colCls} text-center ${delayCls} py-1 px-1`}>
                    {delay != null ? (delay >= 0 ? `+${delay}일` : `${delay}일`) : "-"}
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

      {showSettings && (
        <ProcessSettingModal
          onClose={() => setShowSettings(false)}
          onSaved={() => { loadSettings(); loadPlans(); }}
        />
      )}
    </div>
  );
}

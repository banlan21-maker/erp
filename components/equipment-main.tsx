"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus, Trash2, ChevronRight, Wrench,
  CheckCircle, AlertTriangle, Clock, XCircle, MinusCircle,
  Search, Pencil, X, Save,
} from "lucide-react";

// ── 타입 ────────────────────────────────────────────────────

export type MgmtEquipmentUsage = "IN_USE" | "MAINTENANCE" | "DISPOSED";

export interface KindPreset {
  id: string;
  label: string;
  sortOrder: number;
}

export interface InspectionItem {
  id?: string;
  itemName: string;
  periodMonth: number | string;
  lastInspectedAt: string;
  nextInspectAt?: string | null;
  inspector: string | null;
  memo: string | null;
}

export interface SpecItem {
  id?: string;
  specKey: string;
  specValue: string;
}

export interface Equipment {
  id: string;
  code: string;
  managementNo: string | null;
  name: string;
  kind: string;
  maker: string | null;
  modelName: string | null;
  madeYear: number | null;
  acquiredAt: string | null;
  acquiredCost: number | null;
  location: string | null;
  usage: MgmtEquipmentUsage;
  memo: string | null;
  specs: SpecItem[];
  inspections: InspectionItem[];
  createdAt: string;
  updatedAt: string;
}

// ── 상수 ────────────────────────────────────────────────────

const USAGE_LABELS: Record<MgmtEquipmentUsage, string> = {
  IN_USE: "사용중",
  MAINTENANCE: "점검중",
  DISPOSED: "폐기",
};

const USAGE_COLORS: Record<MgmtEquipmentUsage, string> = {
  IN_USE: "bg-green-100 text-green-700",
  MAINTENANCE: "bg-yellow-100 text-yellow-700",
  DISPOSED: "bg-gray-200 text-gray-500",
};

// ── 검사 상태 계산 ────────────────────────────────────────

type InspStatus = "overdue" | "imminent" | "caution" | "ok" | "none";

function getInspStatus(nextInspectAt: string | null | undefined): InspStatus {
  if (!nextInspectAt) return "none";
  const diff = Math.floor((new Date(nextInspectAt).getTime() - Date.now()) / 86400000);
  if (diff < 0) return "overdue";
  if (diff <= 30) return "imminent";
  if (diff <= 60) return "caution";
  return "ok";
}

function nearestInspStatus(inspections: InspectionItem[]): InspStatus {
  if (!inspections.length) return "none";
  const priority: InspStatus[] = ["overdue", "imminent", "caution", "ok", "none"];
  const statuses = inspections.map(i => getInspStatus(i.nextInspectAt));
  for (const s of priority) {
    if (statuses.includes(s)) return s;
  }
  return "none";
}

const STATUS_BADGE: Record<InspStatus, { label: string; cls: string; icon: React.ReactNode }> = {
  overdue:  { label: "초과",    cls: "bg-red-100 text-red-700",      icon: <XCircle size={11} /> },
  imminent: { label: "임박",    cls: "bg-orange-100 text-orange-700", icon: <AlertTriangle size={11} /> },
  caution:  { label: "주의",    cls: "bg-yellow-100 text-yellow-700", icon: <Clock size={11} /> },
  ok:       { label: "정상",    cls: "bg-green-100 text-green-700",   icon: <CheckCircle size={11} /> },
  none:     { label: "해당없음", cls: "bg-gray-100 text-gray-500",    icon: <MinusCircle size={11} /> },
};

// ── 입력 스타일 ────────────────────────────────────────────

const inputCls = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400";
const labelCls = "block text-xs font-medium text-gray-600 mb-1";

// ── 다음 검사 예정일 미리보기 ────────────────────────────────

function previewNext(lastDate: string, period: string | number): string {
  if (!lastDate || !period) return "";
  const d = new Date(lastDate);
  d.setMonth(d.getMonth() + Number(period));
  return d.toISOString().split("T")[0];
}

// ── 장비 종류 선택 컴포넌트 ──────────────────────────────────

function KindSelect({
  value, kinds, onChange, onKindAdded,
}: {
  value: string;
  kinds: KindPreset[];
  onChange: (v: string) => void;
  onKindAdded: (k: KindPreset) => void;
}) {
  const ADD_TOKEN = "__add__";
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const handleSelect = (v: string) => {
    if (v === ADD_TOKEN) setAdding(true);
    else onChange(v);
  };

  const handleAdd = async () => {
    setErr("");
    if (!newLabel.trim()) { setErr("종류명을 입력하세요."); return; }
    setSaving(true);
    const res = await fetch("/api/mgmt-equipment-kind", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: newLabel.trim() }),
    });
    const json = await res.json();
    setSaving(false);
    if (!json.success) { setErr(json.error || "추가 실패"); return; }
    onKindAdded(json.data);
    onChange(json.data.label);
    setNewLabel("");
    setAdding(false);
  };

  if (adding) {
    return (
      <div className="space-y-1.5">
        <div className="flex gap-2">
          <input className={inputCls} placeholder="새 종류명 입력" value={newLabel}
            onChange={e => setNewLabel(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleAdd()} autoFocus />
          <button type="button" onClick={handleAdd} disabled={saving}
            className="px-3 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap">
            {saving ? "저장 중" : "추가"}
          </button>
          <button type="button" onClick={() => { setAdding(false); setNewLabel(""); setErr(""); }}
            className="px-3 py-2 text-xs text-gray-500 border border-gray-300 rounded-lg hover:bg-gray-50">
            취소
          </button>
        </div>
        {err && <p className="text-xs text-red-600">{err}</p>}
      </div>
    );
  }

  return (
    <select className={inputCls} value={value} onChange={e => handleSelect(e.target.value)}>
      <option value="">선택</option>
      {kinds.map(k => <option key={k.id} value={k.label}>{k.label}</option>)}
      <option value={ADD_TOKEN}>+ 직접 추가...</option>
    </select>
  );
}

// ── 사양 행 편집 ──────────────────────────────────────────────

function SpecRows({
  specs, onAdd, onRemove, onChange,
}: {
  specs: SpecItem[];
  onAdd: () => void;
  onRemove: (i: number) => void;
  onChange: (i: number, field: "specKey" | "specValue", val: string) => void;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-bold text-gray-800">사양 정보</p>
        <button type="button" onClick={onAdd} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium">
          <Plus size={13} /> 항목 추가
        </button>
      </div>
      {specs.length === 0 && <p className="text-xs text-gray-400 text-center py-4">항목 추가 버튼으로 사양을 입력하세요.</p>}
      <div className="space-y-2">
        {specs.map((s, i) => (
          <div key={i} className="flex gap-2 items-center">
            <input className={`${inputCls} flex-1`} placeholder="항목명 (예: 절단전류)" value={s.specKey} onChange={e => onChange(i, "specKey", e.target.value)} />
            <input className={`${inputCls} flex-1`} placeholder="값 (예: 400A)" value={s.specValue} onChange={e => onChange(i, "specValue", e.target.value)} />
            <button type="button" onClick={() => onRemove(i)} className="text-gray-400 hover:text-red-500 flex-shrink-0"><Trash2 size={15} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── 검사항목 행 편집 ──────────────────────────────────────────

function InspRows({
  inspections, onAdd, onRemove, onChange,
}: {
  inspections: InspectionItem[];
  onAdd: () => void;
  onRemove: (i: number) => void;
  onChange: (i: number, field: keyof InspectionItem, val: string) => void;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-bold text-gray-800">검사 항목</p>
        <button type="button" onClick={onAdd} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium">
          <Plus size={13} /> 항목 추가
        </button>
      </div>
      {inspections.length === 0 && <p className="text-xs text-gray-400 text-center py-4">검사가 필요 없는 장비는 생략 가능합니다.</p>}
      <div className="space-y-4">
        {inspections.map((ins, i) => (
          <div key={i} className="border border-gray-100 rounded-lg p-3 bg-gray-50">
            <div className="flex justify-between items-start mb-2">
              <span className="text-xs font-semibold text-gray-600">검사항목 {i + 1}</span>
              <button type="button" onClick={() => onRemove(i)} className="text-gray-400 hover:text-red-500"><Trash2 size={14} /></button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 sm:col-span-1">
                <label className={labelCls}>항목명 *</label>
                <input className={inputCls} placeholder="예: 안전검사" value={ins.itemName} onChange={e => onChange(i, "itemName", e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>주기 (월)</label>
                <input className={inputCls} type="number" min="1" value={ins.periodMonth} onChange={e => onChange(i, "periodMonth", e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>최종 검사일</label>
                <input className={inputCls} type="date" value={ins.lastInspectedAt} onChange={e => onChange(i, "lastInspectedAt", e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>다음 검사 예정일 (자동)</label>
                <input className={`${inputCls} bg-gray-100`} readOnly value={previewNext(ins.lastInspectedAt, ins.periodMonth)} />
              </div>
              <div>
                <label className={labelCls}>담당 기관/담당자</label>
                <input className={inputCls} value={ins.inspector ?? ""} onChange={e => onChange(i, "inspector", e.target.value)} />
              </div>
              <div className="col-span-2">
                <label className={labelCls}>비고</label>
                <input className={inputCls} value={ins.memo ?? ""} onChange={e => onChange(i, "memo", e.target.value)} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── 폼 상태 ────────────────────────────────────────────────

interface FormState {
  name: string;
  managementNo: string;
  kind: string;
  maker: string;
  modelName: string;
  madeYear: string;
  acquiredAt: string;
  acquiredCost: string;
  location: string;
  usage: MgmtEquipmentUsage;
  memo: string;
  specs: SpecItem[];
  inspections: InspectionItem[];
}

const emptyForm = (): FormState => ({
  name: "", managementNo: "", kind: "", maker: "", modelName: "", madeYear: "",
  acquiredAt: "", acquiredCost: "", location: "", usage: "IN_USE", memo: "",
  specs: [], inspections: [],
});

function equipmentToForm(eq: Equipment): FormState {
  return {
    name: eq.name,
    managementNo: eq.managementNo ?? "",
    kind: eq.kind,
    maker: eq.maker ?? "",
    modelName: eq.modelName ?? "",
    madeYear: eq.madeYear ? String(eq.madeYear) : "",
    acquiredAt: eq.acquiredAt ?? "",
    acquiredCost: eq.acquiredCost ? String(eq.acquiredCost) : "",
    location: eq.location ?? "",
    usage: eq.usage,
    memo: eq.memo ?? "",
    specs: eq.specs.map(s => ({ id: s.id, specKey: s.specKey, specValue: s.specValue })),
    inspections: eq.inspections.map(ins => ({
      id: ins.id,
      itemName: ins.itemName,
      periodMonth: ins.periodMonth,
      lastInspectedAt: ins.lastInspectedAt ?? "",
      nextInspectAt: ins.nextInspectAt,
      inspector: ins.inspector,
      memo: ins.memo,
    })),
  };
}

// ── 수정 모달 ────────────────────────────────────────────────

function EditModal({
  eq,
  kinds,
  onKindAdded,
  onSaved,
  onDeleted,
  onClose,
}: {
  eq: Equipment;
  kinds: KindPreset[];
  onKindAdded: (k: KindPreset) => void;
  onSaved: (updated: Equipment) => void;
  onDeleted: () => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<FormState>(equipmentToForm(eq));
  const [saving,   setSaving]   = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  const handleDelete = async () => {
    if (!confirm(`"${eq.name}" 장비를 목록에서 완전히 제거하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) return;
    setDeleting(true);
    try {
      const res  = await fetch(`/api/mgmt-equipment/${eq.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!json.success) { setError(json.error || "삭제 실패"); return; }
      onDeleted();
    } catch { setError("서버 오류"); }
    finally { setDeleting(false); }
  };

  const setField = (name: string, value: string) =>
    setForm(f => ({ ...f, [name]: value }));

  const addSpec = () => setForm(f => ({ ...f, specs: [...f.specs, { specKey: "", specValue: "" }] }));
  const removeSpec = (i: number) => setForm(f => ({ ...f, specs: f.specs.filter((_, idx) => idx !== i) }));
  const setSpec = (i: number, field: "specKey" | "specValue", val: string) =>
    setForm(f => { const specs = [...f.specs]; specs[i] = { ...specs[i], [field]: val }; return { ...f, specs }; });

  const addInsp = () => setForm(f => ({
    ...f,
    inspections: [...f.inspections, { itemName: "", periodMonth: 12, lastInspectedAt: "", inspector: null, memo: null }],
  }));
  const removeInsp = (i: number) => setForm(f => ({ ...f, inspections: f.inspections.filter((_, idx) => idx !== i) }));
  const setInsp = (i: number, field: keyof InspectionItem, val: string) =>
    setForm(f => { const inspections = [...f.inspections]; inspections[i] = { ...inspections[i], [field]: val }; return { ...f, inspections }; });

  const handleSave = async () => {
    setError("");
    if (!form.name.trim()) { setError("장비명을 입력하세요."); return; }
    if (!form.kind) { setError("장비 종류를 선택하세요."); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/mgmt-equipment/${eq.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          madeYear: form.madeYear || null,
          acquiredCost: form.acquiredCost || null,
          acquiredAt: form.acquiredAt || null,
        }),
      });
      const json = await res.json();
      if (!json.success) { setError(json.error || "수정 실패"); return; }
      // 목록 즉시 반영: 변경된 필드만 업데이트
      onSaved({
        ...eq,
        name: form.name.trim(),
        managementNo: form.managementNo.trim() || null,
        kind: form.kind,
        maker: form.maker.trim() || null,
        modelName: form.modelName.trim() || null,
        madeYear: form.madeYear ? Number(form.madeYear) : null,
        acquiredAt: form.acquiredAt || null,
        acquiredCost: form.acquiredCost ? Number(form.acquiredCost) : null,
        location: form.location.trim() || null,
        usage: form.usage,
        memo: form.memo.trim() || null,
        specs: form.specs.filter(s => s.specKey.trim()),
        inspections: form.inspections.filter(ins => ins.itemName.trim()).map(ins => ({
          ...ins,
          nextInspectAt: ins.lastInspectedAt
            ? previewNext(ins.lastInspectedAt, ins.periodMonth) || null
            : null,
        })),
      });
      onClose();
    } catch {
      setError("네트워크 오류");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[92vh]">
        {/* 헤더 */}
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50 rounded-t-2xl flex-shrink-0">
          <h3 className="font-bold text-gray-900 flex items-center gap-2">
            <Pencil size={16} className="text-blue-600" /> {eq.code} — 장비 정보 수정
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-md hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>

        {/* 바디 */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {error && <div className="bg-red-50 text-red-700 text-sm px-4 py-2 rounded-lg border border-red-200">{error}</div>}

          {/* 기본 정보 */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-sm font-bold text-gray-800 mb-4">기본 정보</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>장비명 *</label>
                <input className={inputCls} value={form.name} onChange={e => setField("name", e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>관리번호 <span className="text-gray-400 font-normal">(선택)</span></label>
                <input className={inputCls} value={form.managementNo} onChange={e => setField("managementNo", e.target.value)} placeholder="예: KCS-2018-001" />
              </div>
              <div>
                <label className={labelCls}>장비 종류 *</label>
                <KindSelect value={form.kind} kinds={kinds} onChange={v => setField("kind", v)} onKindAdded={onKindAdded} />
              </div>
              <div>
                <label className={labelCls}>사용 여부</label>
                <select className={inputCls} value={form.usage} onChange={e => setField("usage", e.target.value)}>
                  {(Object.entries(USAGE_LABELS) as [MgmtEquipmentUsage, string][]).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>제조사</label>
                <input className={inputCls} value={form.maker} onChange={e => setField("maker", e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>모델명</label>
                <input className={inputCls} value={form.modelName} onChange={e => setField("modelName", e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>제조년도</label>
                <input className={inputCls} type="number" value={form.madeYear} onChange={e => setField("madeYear", e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>취득일</label>
                <input className={inputCls} type="date" value={form.acquiredAt} onChange={e => setField("acquiredAt", e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>취득금액 (원)</label>
                <input className={inputCls} type="number" value={form.acquiredCost} onChange={e => setField("acquiredCost", e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>설치 위치</label>
                <input className={inputCls} value={form.location} onChange={e => setField("location", e.target.value)} />
              </div>
              <div className="col-span-2">
                <label className={labelCls}>비고</label>
                <textarea className={inputCls} rows={2} value={form.memo} onChange={e => setField("memo", e.target.value)} />
              </div>
            </div>
          </div>

          <SpecRows specs={form.specs} onAdd={addSpec} onRemove={removeSpec} onChange={setSpec} />
          <InspRows inspections={form.inspections} onAdd={addInsp} onRemove={removeInsp} onChange={setInsp} />
        </div>

        {/* 푸터 */}
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl flex items-center justify-between flex-shrink-0">
          {/* 제거 버튼 (좌측) */}
          <button onClick={handleDelete} disabled={deleting || saving}
            className="px-4 py-2 text-sm font-bold text-white bg-red-500 rounded-lg hover:bg-red-600 disabled:opacity-50 flex items-center gap-2">
            <Trash2 size={14} /> {deleting ? "제거 중..." : "장비 제거"}
          </button>
          {/* 취소 / 저장 (우측) */}
          <div className="flex gap-3">
            <button onClick={onClose} className="px-5 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-100">취소</button>
            <button onClick={handleSave} disabled={saving || deleting}
              className="px-6 py-2 text-sm font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
              <Save size={14} /> {saving ? "저장 중..." : "수정 저장"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── 등록 폼 컴포넌트 ────────────────────────────────────────

function RegisterForm({
  kinds, onKindAdded, onCreated,
}: {
  kinds: KindPreset[];
  onKindAdded: (k: KindPreset) => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const setField = (name: string, value: string) => setForm(f => ({ ...f, [name]: value }));

  const addSpec = () => setForm(f => ({ ...f, specs: [...f.specs, { specKey: "", specValue: "" }] }));
  const removeSpec = (i: number) => setForm(f => ({ ...f, specs: f.specs.filter((_, idx) => idx !== i) }));
  const setSpec = (i: number, field: "specKey" | "specValue", val: string) =>
    setForm(f => { const specs = [...f.specs]; specs[i] = { ...specs[i], [field]: val }; return { ...f, specs }; });

  const addInsp = () => setForm(f => ({
    ...f,
    inspections: [...f.inspections, { itemName: "", periodMonth: 12, lastInspectedAt: "", inspector: null, memo: null }],
  }));
  const removeInsp = (i: number) => setForm(f => ({ ...f, inspections: f.inspections.filter((_, idx) => idx !== i) }));
  const setInsp = (i: number, field: keyof InspectionItem, val: string) =>
    setForm(f => { const inspections = [...f.inspections]; inspections[i] = { ...inspections[i], [field]: val }; return { ...f, inspections }; });

  const handleSubmit = async () => {
    setError("");
    if (!form.name.trim()) { setError("장비명을 입력하세요."); return; }
    if (!form.kind) { setError("장비 종류를 선택하세요."); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/mgmt-equipment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          madeYear: form.madeYear || null,
          acquiredCost: form.acquiredCost || null,
          acquiredAt: form.acquiredAt || null,
        }),
      });
      const json = await res.json();
      if (!json.success) { setError(json.error || "등록 실패"); return; }
      setForm(emptyForm());
      onCreated();
    } catch {
      setError("네트워크 오류");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      {error && <div className="bg-red-50 text-red-700 text-sm px-4 py-2 rounded-lg border border-red-200">{error}</div>}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <p className="text-sm font-bold text-gray-800 mb-4">기본 정보</p>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 sm:col-span-1">
            <label className={labelCls}>장비명 *</label>
            <input className={inputCls} value={form.name} onChange={e => setField("name", e.target.value)} placeholder="예: 플라즈마 1호기" />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className={labelCls}>관리번호 <span className="text-gray-400 font-normal">(선택)</span></label>
            <input className={inputCls} value={form.managementNo} onChange={e => setField("managementNo", e.target.value)} placeholder="예: KCS-2018-001" />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className={labelCls}>장비 종류 *</label>
            <KindSelect value={form.kind} kinds={kinds} onChange={v => setField("kind", v)} onKindAdded={onKindAdded} />
          </div>
          <div>
            <label className={labelCls}>제조사</label>
            <input className={inputCls} value={form.maker} onChange={e => setField("maker", e.target.value)} placeholder="예: 현대중공업" />
          </div>
          <div>
            <label className={labelCls}>모델명</label>
            <input className={inputCls} value={form.modelName} onChange={e => setField("modelName", e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>제조년도</label>
            <input className={inputCls} type="number" value={form.madeYear} onChange={e => setField("madeYear", e.target.value)} placeholder="예: 2018" />
          </div>
          <div>
            <label className={labelCls}>취득일</label>
            <input className={inputCls} type="date" value={form.acquiredAt} onChange={e => setField("acquiredAt", e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>취득금액 (원)</label>
            <input className={inputCls} type="number" value={form.acquiredCost} onChange={e => setField("acquiredCost", e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>설치 위치</label>
            <input className={inputCls} value={form.location} onChange={e => setField("location", e.target.value)} placeholder="예: 절단동 1번" />
          </div>
          <div className="col-span-2">
            <label className={labelCls}>비고</label>
            <textarea className={inputCls} rows={2} value={form.memo} onChange={e => setField("memo", e.target.value)} />
          </div>
        </div>
      </div>

      <SpecRows specs={form.specs} onAdd={addSpec} onRemove={removeSpec} onChange={setSpec} />
      <InspRows inspections={form.inspections} onAdd={addInsp} onRemove={removeInsp} onChange={setInsp} />

      <div className="flex justify-end">
        <button onClick={handleSubmit} disabled={saving}
          className="px-6 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50">
          {saving ? "저장 중..." : "장비 등록"}
        </button>
      </div>
    </div>
  );
}

// ── 장비 목록 ────────────────────────────────────────────────

function nearestNextDate(inspections: InspectionItem[]): string | null {
  const dates = inspections.map(i => i.nextInspectAt).filter(Boolean) as string[];
  if (!dates.length) return null;
  return dates.sort()[0];
}

// ── 메인 컴포넌트 ────────────────────────────────────────────

export default function EquipmentMain({
  initialEquipments,
  initialKinds,
}: {
  initialEquipments: Equipment[];
  initialKinds: KindPreset[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"register" | "list">("list");
  const [equipments, setEquipments] = useState<Equipment[]>(initialEquipments);
  const [kinds, setKinds] = useState<KindPreset[]>(initialKinds);

  // 필터 / 검색
  const [search, setSearch] = useState("");
  const [filterKind, setFilterKind] = useState("ALL");
  const [filterStatus, setFilterStatus] = useState<InspStatus | "ALL">("ALL");
  const [filterUsage, setFilterUsage] = useState<MgmtEquipmentUsage | "ALL">("ALL");

  // 수정 모달
  const [editTarget, setEditTarget] = useState<Equipment | null>(null);

  const reload = async () => {
    const res = await fetch("/api/mgmt-equipment");
    const json = await res.json();
    if (json.success) setEquipments(json.data);
    setTab("list");
  };

  const handleKindAdded = (k: KindPreset) => setKinds(prev => [...prev, k]);

  const handleSaved = (updated: Equipment) =>
    setEquipments(prev => prev.map(eq => eq.id === updated.id ? updated : eq));

  const filtered = equipments.filter(eq => {
    if (search) {
      const q = search.toLowerCase();
      const hit = eq.name.toLowerCase().includes(q)
        || eq.code.toLowerCase().includes(q)
        || (eq.managementNo ?? "").toLowerCase().includes(q)
        || eq.kind.toLowerCase().includes(q)
        || (eq.location ?? "").toLowerCase().includes(q);
      if (!hit) return false;
    }
    if (filterKind !== "ALL" && eq.kind !== filterKind) return false;
    if (filterUsage !== "ALL" && eq.usage !== filterUsage) return false;
    if (filterStatus !== "ALL" && nearestInspStatus(eq.inspections) !== filterStatus) return false;
    return true;
  });

  return (
    <>
      {editTarget && (
        <EditModal
          eq={editTarget}
          kinds={kinds}
          onKindAdded={handleKindAdded}
          onSaved={handleSaved}
          onDeleted={() => {
            setEquipments(prev => prev.filter(e => e.id !== editTarget.id));
            setEditTarget(null);
          }}
          onClose={() => setEditTarget(null)}
        />
      )}

      <div className="space-y-5">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Wrench size={24} className="text-blue-600" /> 장비관리
          </h2>
          <p className="text-sm text-gray-500 mt-1">고정 장비 이력카드 및 검사 주기를 관리합니다.</p>
        </div>

        {/* 탭 */}
        <div className="flex gap-1 border-b border-gray-200">
          {([["list", "장비목록"], ["register", "장비등록"]] as const).map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)}
              className={`px-5 py-2.5 text-sm font-semibold transition-all border-b-2 -mb-px ${
                tab === key ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-800"
              }`}>
              {label}
            </button>
          ))}
        </div>

        {tab === "register" && (
          <RegisterForm kinds={kinds} onKindAdded={handleKindAdded} onCreated={reload} />
        )}

        {tab === "list" && (
          <div className="space-y-3">
            {/* 검색창 */}
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="장비명, 코드, 관리번호, 종류, 위치 검색"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>

            {/* 필터 */}
            <div className="flex flex-wrap gap-3">
              <select className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                value={filterKind} onChange={e => setFilterKind(e.target.value)}>
                <option value="ALL">전체 종류</option>
                {kinds.map(k => <option key={k.id} value={k.label}>{k.label}</option>)}
              </select>
              <select className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                value={filterStatus} onChange={e => setFilterStatus(e.target.value as InspStatus | "ALL")}>
                <option value="ALL">전체 검사상태</option>
                {(Object.entries(STATUS_BADGE) as [InspStatus, typeof STATUS_BADGE[InspStatus]][]).map(([v, b]) => (
                  <option key={v} value={v}>{b.label}</option>
                ))}
              </select>
              <select className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                value={filterUsage} onChange={e => setFilterUsage(e.target.value as MgmtEquipmentUsage | "ALL")}>
                <option value="ALL">전체 사용여부</option>
                {(Object.entries(USAGE_LABELS) as [MgmtEquipmentUsage, string][]).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
              <span className="text-xs text-gray-400 self-center">
                {filtered.length !== equipments.length
                  ? `${filtered.length} / ${equipments.length}건`
                  : `총 ${equipments.length}건`}
              </span>
            </div>

            {/* 목록 */}
            {filtered.length === 0 ? (
              <div className="py-16 text-center text-gray-400 text-sm">등록된 장비가 없습니다.</div>
            ) : (
              <div className="space-y-2">
                {filtered.map(eq => {
                  const status = nearestInspStatus(eq.inspections);
                  const badge = STATUS_BADGE[status];
                  const nextDate = nearestNextDate(eq.inspections);

                  return (
                    <div key={eq.id}
                      className="bg-white border border-gray-200 rounded-xl px-5 py-4 flex items-center justify-between group hover:border-blue-200 hover:shadow-sm transition-all"
                    >
                      {/* 클릭 → 이력카드 */}
                      <div className="flex items-center gap-4 flex-1 min-w-0 cursor-pointer"
                        onClick={() => router.push(`/management/equipment/${eq.id}`)}>
                        <div className="p-2.5 bg-gray-50 rounded-lg border border-gray-100 flex-shrink-0">
                          <Wrench size={16} className="text-gray-500" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs text-gray-400 font-mono">{eq.code}</span>
                            {eq.managementNo && (
                              <span className="text-xs text-gray-400 font-mono">({eq.managementNo})</span>
                            )}
                            <span className="text-sm font-bold text-gray-900">{eq.name}</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${USAGE_COLORS[eq.usage]}`}>
                              {USAGE_LABELS[eq.usage]}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            <span className="text-xs text-gray-500">{eq.kind}</span>
                            {eq.location && <span className="text-xs text-gray-400">· {eq.location}</span>}
                            {nextDate && (
                              <span className="text-xs text-gray-400">
                                · 다음 검사: <span className="font-mono">{nextDate.slice(0, 10)}</span>
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* 우측 액션 */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${badge.cls}`}>
                          {badge.icon} {badge.label}
                        </span>
                        {/* 수정 버튼 */}
                        <button
                          onClick={e => { e.stopPropagation(); setEditTarget(eq); }}
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                          title="수정"
                        >
                          <Pencil size={14} />
                        </button>
                        {/* 이력카드 이동 화살표 */}
                        <ChevronRight size={16} className="text-gray-300 cursor-pointer"
                          onClick={() => router.push(`/management/equipment/${eq.id}`)} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

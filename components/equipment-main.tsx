"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus, Trash2, ChevronRight, Wrench,
  CheckCircle, AlertTriangle, Clock, XCircle, MinusCircle,
} from "lucide-react";

// ── 타입 ────────────────────────────────────────────────────

export type MgmtEquipmentKind = "CNC_MACHINE" | "CRANE" | "PRESSURE_VESSEL" | "COMPRESSOR" | "OTHER";
export type MgmtEquipmentUsage = "IN_USE" | "MAINTENANCE" | "DISPOSED";

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
  name: string;
  kind: MgmtEquipmentKind;
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

const KIND_LABELS: Record<MgmtEquipmentKind, string> = {
  CNC_MACHINE: "CNC설비",
  CRANE: "크레인",
  PRESSURE_VESSEL: "압력용기",
  COMPRESSOR: "컴프레샤",
  OTHER: "기타",
};

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
  const statuses: InspStatus[] = inspections.map(i => getInspStatus(i.nextInspectAt));
  const priority: InspStatus[] = ["overdue", "imminent", "caution", "ok", "none"];
  for (const s of priority) {
    if (statuses.includes(s)) return s;
  }
  return "none";
}

const STATUS_BADGE: Record<InspStatus, { label: string; cls: string; icon: React.ReactNode }> = {
  overdue:  { label: "초과",   cls: "bg-red-100 text-red-700",      icon: <XCircle size={11} /> },
  imminent: { label: "임박",   cls: "bg-orange-100 text-orange-700", icon: <AlertTriangle size={11} /> },
  caution:  { label: "주의",   cls: "bg-yellow-100 text-yellow-700", icon: <Clock size={11} /> },
  ok:       { label: "정상",   cls: "bg-green-100 text-green-700",   icon: <CheckCircle size={11} /> },
  none:     { label: "해당없음", cls: "bg-gray-100 text-gray-500",   icon: <MinusCircle size={11} /> },
};

// ── 입력 스타일 ────────────────────────────────────────────

const inputCls = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400";
const labelCls = "block text-xs font-medium text-gray-600 mb-1";

// ── 초기 폼 상태 ────────────────────────────────────────────

interface FormState {
  name: string;
  kind: MgmtEquipmentKind | "";
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
  name: "",
  kind: "",
  maker: "",
  modelName: "",
  madeYear: "",
  acquiredAt: "",
  acquiredCost: "",
  location: "",
  usage: "IN_USE",
  memo: "",
  specs: [],
  inspections: [],
});

// ── 다음 검사 예정일 미리보기 ────────────────────────────────

function previewNext(lastDate: string, period: string | number): string {
  if (!lastDate || !period) return "";
  const d = new Date(lastDate);
  d.setMonth(d.getMonth() + Number(period));
  return d.toISOString().split("T")[0];
}

// ── 등록 폼 컴포넌트 ────────────────────────────────────────

function RegisterForm({ onCreated }: { onCreated: () => void }) {
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const setField = (name: string, value: string) =>
    setForm(f => ({ ...f, [name]: value }));

  // 사양 행 관리
  const addSpec = () => setForm(f => ({ ...f, specs: [...f.specs, { specKey: "", specValue: "" }] }));
  const removeSpec = (i: number) => setForm(f => ({ ...f, specs: f.specs.filter((_, idx) => idx !== i) }));
  const setSpec = (i: number, field: "specKey" | "specValue", val: string) =>
    setForm(f => {
      const specs = [...f.specs];
      specs[i] = { ...specs[i], [field]: val };
      return { ...f, specs };
    });

  // 검사항목 행 관리
  const addInsp = () => setForm(f => ({
    ...f,
    inspections: [...f.inspections, { itemName: "", periodMonth: 12, lastInspectedAt: "", inspector: "", memo: "" }],
  }));
  const removeInsp = (i: number) => setForm(f => ({ ...f, inspections: f.inspections.filter((_, idx) => idx !== i) }));
  const setInsp = (i: number, field: keyof InspectionItem, val: string) =>
    setForm(f => {
      const inspections = [...f.inspections];
      inspections[i] = { ...inspections[i], [field]: val };
      return { ...f, inspections };
    });

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

      {/* 기본 정보 */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <p className="text-sm font-bold text-gray-800 mb-4">기본 정보</p>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 sm:col-span-1">
            <label className={labelCls}>장비명 *</label>
            <input className={inputCls} value={form.name} onChange={e => setField("name", e.target.value)} placeholder="예: 플라즈마 1호기" />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className={labelCls}>장비 종류 *</label>
            <select className={inputCls} value={form.kind} onChange={e => setField("kind", e.target.value)}>
              <option value="">선택</option>
              {(Object.entries(KIND_LABELS) as [MgmtEquipmentKind, string][]).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
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
          <div>
            <label className={labelCls}>사용 여부</label>
            <select className={inputCls} value={form.usage} onChange={e => setField("usage", e.target.value)}>
              {(Object.entries(USAGE_LABELS) as [MgmtEquipmentUsage, string][]).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
          <div className="col-span-2">
            <label className={labelCls}>비고</label>
            <textarea className={inputCls} rows={2} value={form.memo} onChange={e => setField("memo", e.target.value)} />
          </div>
        </div>
      </div>

      {/* 사양 */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-bold text-gray-800">사양 정보</p>
          <button type="button" onClick={addSpec} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium">
            <Plus size={13} /> 항목 추가
          </button>
        </div>
        {form.specs.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-4">항목 추가 버튼으로 사양을 입력하세요.</p>
        )}
        <div className="space-y-2">
          {form.specs.map((s, i) => (
            <div key={i} className="flex gap-2 items-center">
              <input className={`${inputCls} flex-1`} placeholder="항목명 (예: 절단전류)" value={s.specKey} onChange={e => setSpec(i, "specKey", e.target.value)} />
              <input className={`${inputCls} flex-1`} placeholder="값 (예: 400A)" value={s.specValue} onChange={e => setSpec(i, "specValue", e.target.value)} />
              <button type="button" onClick={() => removeSpec(i)} className="text-gray-400 hover:text-red-500 flex-shrink-0">
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* 검사 항목 */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-bold text-gray-800">검사 항목</p>
          <button type="button" onClick={addInsp} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium">
            <Plus size={13} /> 항목 추가
          </button>
        </div>
        {form.inspections.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-4">검사가 필요 없는 장비는 생략 가능합니다.</p>
        )}
        <div className="space-y-4">
          {form.inspections.map((ins, i) => (
            <div key={i} className="border border-gray-100 rounded-lg p-3 bg-gray-50">
              <div className="flex justify-between items-start mb-2">
                <span className="text-xs font-semibold text-gray-600">검사항목 {i + 1}</span>
                <button type="button" onClick={() => removeInsp(i)} className="text-gray-400 hover:text-red-500">
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 sm:col-span-1">
                  <label className={labelCls}>항목명 *</label>
                  <input className={inputCls} placeholder="예: 안전검사" value={ins.itemName} onChange={e => setInsp(i, "itemName", e.target.value)} />
                </div>
                <div>
                  <label className={labelCls}>주기 (월)</label>
                  <input className={inputCls} type="number" min="1" value={ins.periodMonth} onChange={e => setInsp(i, "periodMonth", e.target.value)} />
                </div>
                <div>
                  <label className={labelCls}>최종 검사일</label>
                  <input className={inputCls} type="date" value={ins.lastInspectedAt} onChange={e => setInsp(i, "lastInspectedAt", e.target.value)} />
                </div>
                <div>
                  <label className={labelCls}>다음 검사 예정일 (자동)</label>
                  <input className={`${inputCls} bg-gray-100`} readOnly value={previewNext(ins.lastInspectedAt, ins.periodMonth)} />
                </div>
                <div>
                  <label className={labelCls}>담당 기관/담당자</label>
                  <input className={inputCls} value={ins.inspector ?? ""} onChange={e => setInsp(i, "inspector", e.target.value)} />
                </div>
                <div className="col-span-2">
                  <label className={labelCls}>비고</label>
                  <input className={inputCls} value={ins.memo ?? ""} onChange={e => setInsp(i, "memo", e.target.value)} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={handleSubmit}
          disabled={saving}
          className="px-6 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "저장 중..." : "장비 등록"}
        </button>
      </div>
    </div>
  );
}

// ── 장비 목록 ────────────────────────────────────────────────

function nearestNextDate(inspections: InspectionItem[]): string | null {
  const dates = inspections
    .map(i => i.nextInspectAt)
    .filter(Boolean) as string[];
  if (!dates.length) return null;
  return dates.sort()[0];
}

interface EquipmentListProps {
  equipments: Equipment[];
  filterKind: MgmtEquipmentKind | "ALL";
  filterStatus: InspStatus | "ALL";
  filterUsage: MgmtEquipmentUsage | "ALL";
}

function EquipmentList({ equipments, filterKind, filterStatus, filterUsage }: EquipmentListProps) {
  const router = useRouter();

  const filtered = equipments.filter(eq => {
    if (filterKind !== "ALL" && eq.kind !== filterKind) return false;
    if (filterUsage !== "ALL" && eq.usage !== filterUsage) return false;
    if (filterStatus !== "ALL") {
      const s = nearestInspStatus(eq.inspections);
      if (s !== filterStatus) return false;
    }
    return true;
  });

  if (filtered.length === 0) {
    return <div className="py-16 text-center text-gray-400 text-sm">등록된 장비가 없습니다.</div>;
  }

  return (
    <div className="space-y-2">
      {filtered.map(eq => {
        const status = nearestInspStatus(eq.inspections);
        const badge = STATUS_BADGE[status];
        const nextDate = nearestNextDate(eq.inspections);

        return (
          <div
            key={eq.id}
            onClick={() => router.push(`/management/equipment/${eq.id}`)}
            className="bg-white border border-gray-200 rounded-xl px-5 py-4 flex items-center justify-between cursor-pointer hover:border-blue-300 hover:shadow-sm transition-all"
          >
            <div className="flex items-center gap-4">
              <div className="p-2.5 bg-gray-50 rounded-lg border border-gray-100">
                <Wrench size={16} className="text-gray-500" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 font-mono">{eq.code}</span>
                  <span className="text-sm font-bold text-gray-900">{eq.name}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${USAGE_COLORS[eq.usage]}`}>
                    {USAGE_LABELS[eq.usage]}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-gray-500">{KIND_LABELS[eq.kind]}</span>
                  {eq.location && <span className="text-xs text-gray-400">· {eq.location}</span>}
                  {nextDate && (
                    <span className="text-xs text-gray-400">
                      · 다음 검사: <span className="font-mono">{nextDate.slice(0, 10)}</span>
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${badge.cls}`}>
                {badge.icon} {badge.label}
              </span>
              <ChevronRight size={16} className="text-gray-300" />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── 메인 컴포넌트 ────────────────────────────────────────────

export default function EquipmentMain({ initialEquipments }: { initialEquipments: Equipment[] }) {
  const [tab, setTab] = useState<"register" | "list">("list");
  const [equipments, setEquipments] = useState<Equipment[]>(initialEquipments);
  const [filterKind, setFilterKind] = useState<MgmtEquipmentKind | "ALL">("ALL");
  const [filterStatus, setFilterStatus] = useState<InspStatus | "ALL">("ALL");
  const [filterUsage, setFilterUsage] = useState<MgmtEquipmentUsage | "ALL">("ALL");

  const reload = async () => {
    const res = await fetch("/api/mgmt-equipment");
    const json = await res.json();
    if (json.success) setEquipments(json.data);
    setTab("list");
  };

  return (
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
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-5 py-2.5 text-sm font-semibold transition-all border-b-2 -mb-px ${
              tab === key
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-800"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "register" && <RegisterForm onCreated={reload} />}

      {tab === "list" && (
        <div className="space-y-4">
          {/* 필터 */}
          <div className="flex flex-wrap gap-3">
            <select
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              value={filterKind}
              onChange={e => setFilterKind(e.target.value as MgmtEquipmentKind | "ALL")}
            >
              <option value="ALL">전체 종류</option>
              {(Object.entries(KIND_LABELS) as [MgmtEquipmentKind, string][]).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
            <select
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value as InspStatus | "ALL")}
            >
              <option value="ALL">전체 검사상태</option>
              {(Object.entries(STATUS_BADGE) as [InspStatus, typeof STATUS_BADGE[InspStatus]][]).map(([v, b]) => (
                <option key={v} value={v}>{b.label}</option>
              ))}
            </select>
            <select
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              value={filterUsage}
              onChange={e => setFilterUsage(e.target.value as MgmtEquipmentUsage | "ALL")}
            >
              <option value="ALL">전체 사용여부</option>
              {(Object.entries(USAGE_LABELS) as [MgmtEquipmentUsage, string][]).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
            <span className="text-xs text-gray-400 self-center">총 {equipments.length}건</span>
          </div>
          <EquipmentList
            equipments={equipments}
            filterKind={filterKind}
            filterStatus={filterStatus}
            filterUsage={filterUsage}
          />
        </div>
      )}
    </div>
  );
}

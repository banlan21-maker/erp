"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Plus, Truck, ChevronRight, Search, X, Save, Trash2,
  CheckCircle, AlertTriangle, Clock, XCircle, MinusCircle,
  Filter,
} from "lucide-react";
import TransportDrivingLogTab from "@/components/transport-driving-log-tab";

// ── 타입 ─────────────────────────────────────────────────────

export type TransportVehicleType = "VEHICLE" | "EQUIPMENT";
export type TransportUsage = "IN_USE" | "MAINTENANCE" | "DISPOSED";
export type TransportFactory = "FACTORY1" | "FACTORY2";
export type FuelType = "GASOLINE" | "DIESEL" | "LPG" | "ELECTRIC";
export type EquipSubType = "FORKLIFT" | "CRANE" | "OTHER";
export type TransportPowerType = "ENGINE" | "ELECTRIC" | "LPG";
export type ConsumableBasis = "MILEAGE" | "PERIOD" | "BOTH";

export interface ConsumableItem {
  id?: string;
  itemName: string;
  basis: ConsumableBasis;
  intervalKm: number | string | null;
  intervalMonth: number | string | null;
  lastReplacedAt: string;
  lastReplacedMileage: number | string | null;
  nextReplaceMileage?: number | null;
  nextReplaceAt?: string | null;
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

export interface TransportVehicle {
  id: string;
  code: string;
  vehicleType: TransportVehicleType;
  name: string;
  plateNo: string | null;
  maker: string | null;
  modelName: string | null;
  madeYear: number | null;
  acquiredAt: string | null;
  acquiredCost: number | null;
  factory: TransportFactory;
  factoryLocation: string | null;
  manager: string | null;
  usage: TransportUsage;
  memo: string | null;
  fuelType: FuelType | null;
  displacement: number | null;
  mileage: number | null;
  insuranceExpiry: string | null;
  inspExpiry: string | null;
  equipSubType: EquipSubType | null;
  maxLoad: number | null;
  powerType: TransportPowerType | null;
  mastHeight: number | null;
  specs: SpecItem[];
  consumables: ConsumableItem[];
  inspections: InspectionItem[];
  createdAt: string;
  updatedAt: string;
}

// ── 상수 ─────────────────────────────────────────────────────

const USAGE_LABELS: Record<TransportUsage, string> = {
  IN_USE: "사용중",
  MAINTENANCE: "점검중",
  DISPOSED: "폐기",
};

const USAGE_COLORS: Record<TransportUsage, string> = {
  IN_USE: "bg-green-100 text-green-700",
  MAINTENANCE: "bg-yellow-100 text-yellow-700",
  DISPOSED: "bg-gray-200 text-gray-500",
};

const FACTORY_LABELS: Record<TransportFactory, string> = {
  FACTORY1: "1공장",
  FACTORY2: "2공장",
};

const FUEL_LABELS: Record<FuelType, string> = {
  GASOLINE: "휘발유",
  DIESEL: "경유",
  LPG: "LPG",
  ELECTRIC: "전기",
};

const EQUIP_SUB_LABELS: Record<EquipSubType, string> = {
  FORKLIFT: "지게차",
  CRANE: "크레인 차량",
  OTHER: "기타",
};

const POWER_LABELS: Record<TransportPowerType, string> = {
  ENGINE: "엔진",
  ELECTRIC: "전동",
  LPG: "LPG",
};

const BASIS_LABELS: Record<ConsumableBasis, string> = {
  MILEAGE: "주행거리",
  PERIOD: "기간",
  BOTH: "둘 다",
};

// 소모품 기본값
const DEFAULT_CONSUMABLES: Omit<ConsumableItem, "id">[] = [
  { itemName: "엔진오일", basis: "BOTH", intervalKm: 5000, intervalMonth: 6, lastReplacedAt: "", lastReplacedMileage: null },
  { itemName: "오일필터", basis: "BOTH", intervalKm: 5000, intervalMonth: 6, lastReplacedAt: "", lastReplacedMileage: null },
  { itemName: "에어필터", basis: "BOTH", intervalKm: 20000, intervalMonth: 12, lastReplacedAt: "", lastReplacedMileage: null },
  { itemName: "에어컨 필터", basis: "BOTH", intervalKm: 10000, intervalMonth: 12, lastReplacedAt: "", lastReplacedMileage: null },
  { itemName: "타이어", basis: "BOTH", intervalKm: 40000, intervalMonth: 36, lastReplacedAt: "", lastReplacedMileage: null },
  { itemName: "브레이크 패드", basis: "MILEAGE", intervalKm: 30000, intervalMonth: null, lastReplacedAt: "", lastReplacedMileage: null },
  { itemName: "냉각수", basis: "PERIOD", intervalKm: null, intervalMonth: 24, lastReplacedAt: "", lastReplacedMileage: null },
];

// ── 알림 상태 계산 ─────────────────────────────────────────

type AlertStatus = "overdue" | "imminent" | "caution" | "ok" | "none";

// 일반차량 소모품 알림 (주행거리 or 기간, 먼저 도달하는 쪽)
function getConsumableStatus(
  c: ConsumableItem,
  currentMileage: number | null
): AlertStatus {
  const today = Date.now();
  let kmStatus: AlertStatus = "none";
  let dateStatus: AlertStatus = "none";

  if (currentMileage != null && c.nextReplaceMileage != null && (c.basis === "MILEAGE" || c.basis === "BOTH")) {
    const remaining = c.nextReplaceMileage - currentMileage;
    if (remaining < 0) kmStatus = "overdue";
    else if (remaining <= 500) kmStatus = "imminent";
    else if (remaining <= 1000) kmStatus = "caution";
    else kmStatus = "ok";
  }

  if (c.nextReplaceAt && (c.basis === "PERIOD" || c.basis === "BOTH")) {
    const diff = Math.floor((new Date(c.nextReplaceAt).getTime() - today) / 86400000);
    if (diff < 0) dateStatus = "overdue";
    else if (diff <= 14) dateStatus = "imminent";
    else if (diff <= 30) dateStatus = "caution";
    else dateStatus = "ok";
  }

  const priority: AlertStatus[] = ["overdue", "imminent", "caution", "ok", "none"];
  const kmIdx = priority.indexOf(kmStatus);
  const dtIdx = priority.indexOf(dateStatus);
  return priority[Math.min(kmIdx, dtIdx)];
}

// 운송장비 검사 알림
function getInspStatus(nextInspectAt: string | null | undefined): AlertStatus {
  if (!nextInspectAt) return "none";
  const diff = Math.floor((new Date(nextInspectAt).getTime() - Date.now()) / 86400000);
  if (diff < 0) return "overdue";
  if (diff <= 30) return "imminent";
  if (diff <= 60) return "caution";
  return "ok";
}

// 차량 전체에서 가장 심각한 알림 상태
function getVehicleWorstStatus(v: TransportVehicle): AlertStatus {
  const priority: AlertStatus[] = ["overdue", "imminent", "caution", "ok", "none"];
  let worst: AlertStatus = "none";

  if (v.vehicleType === "VEHICLE") {
    for (const c of v.consumables) {
      const s = getConsumableStatus(c, v.mileage);
      if (priority.indexOf(s) < priority.indexOf(worst)) worst = s;
    }
  } else {
    for (const ins of v.inspections) {
      const s = getInspStatus(ins.nextInspectAt);
      if (priority.indexOf(s) < priority.indexOf(worst)) worst = s;
    }
  }
  return worst;
}

const STATUS_BADGE: Record<AlertStatus, { label: string; color: string; icon: React.ReactNode }> = {
  overdue:  { label: "초과", color: "bg-red-100 text-red-700",       icon: <XCircle size={12} /> },
  imminent: { label: "임박", color: "bg-orange-100 text-orange-700", icon: <AlertTriangle size={12} /> },
  caution:  { label: "주의", color: "bg-yellow-100 text-yellow-700", icon: <Clock size={12} /> },
  ok:       { label: "정상", color: "bg-green-100 text-green-700",   icon: <CheckCircle size={12} /> },
  none:     { label: "해당없음", color: "bg-gray-100 text-gray-500", icon: null },
};

// ── 등록 폼 초기값 ────────────────────────────────────────────

const emptyForm = {
  vehicleType: "VEHICLE" as TransportVehicleType,
  name: "",
  plateNo: "",
  maker: "",
  modelName: "",
  madeYear: "",
  acquiredAt: "",
  acquiredCost: "",
  factory: "FACTORY1" as TransportFactory,
  factoryLocation: "",
  manager: "",
  usage: "IN_USE" as TransportUsage,
  memo: "",
  // 일반차량
  fuelType: "DIESEL" as FuelType,
  displacement: "",
  mileage: "",
  insuranceExpiry: "",
  inspExpiry: "",
  // 운송장비
  equipSubType: "FORKLIFT" as EquipSubType,
  maxLoad: "",
  powerType: "ENGINE" as TransportPowerType,
  mastHeight: "",
};

// ── 메인 컴포넌트 ─────────────────────────────────────────────

interface Props {
  initialVehicles: TransportVehicle[];
}

export default function TransportMain({ initialVehicles }: Props) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"register" | "manage" | "drivingLog">("manage");
  const [vehicles, setVehicles] = useState<TransportVehicle[]>(initialVehicles);

  // ── 등록 폼 상태 ──────────────────────────────────────────
  const [form, setForm] = useState(emptyForm);
  const [consumables, setConsumables] = useState<ConsumableItem[]>(
    DEFAULT_CONSUMABLES.map(c => ({ ...c }))
  );
  const [inspections, setInspections] = useState<InspectionItem[]>([]);
  const [specs, setSpecs] = useState<SpecItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  // ── 관리 탭 상태 ──────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [filterFactory, setFilterFactory] = useState<"ALL" | TransportFactory>("ALL");
  const [filterType, setFilterType] = useState<"ALL" | TransportVehicleType>("ALL");
  const [filterStatus, setFilterStatus] = useState<"ALL" | AlertStatus>("ALL");
  const [filterUsage, setFilterUsage] = useState<"ALL" | TransportUsage>("ALL");

  // ── 종류 변경 시 소모품/검사항목 초기화 ──────────────────
  function handleTypeChange(t: TransportVehicleType) {
    setForm(prev => ({ ...prev, vehicleType: t }));
    if (t === "VEHICLE") {
      setConsumables(DEFAULT_CONSUMABLES.map(c => ({ ...c })));
      setInspections([]);
      setSpecs([]);
    } else {
      setConsumables([]);
      setInspections([{ itemName: "", periodMonth: 12, lastInspectedAt: "", inspector: null, memo: null }]);
    }
  }

  // ── 등록 저장 ────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    setFormError("");
    if (!form.name.trim()) { setFormError("차량/장비명은 필수입니다."); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/transport-vehicle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          madeYear: form.madeYear || null,
          acquiredCost: form.acquiredCost || null,
          displacement: form.displacement || null,
          mileage: form.mileage || null,
          maxLoad: form.maxLoad || null,
          mastHeight: form.mastHeight || null,
          specs,
          consumables: form.vehicleType === "VEHICLE" ? consumables : [],
          inspections: form.vehicleType === "EQUIPMENT" ? inspections : [],
        }),
      });
      const data = await res.json();
      if (!data.success) { setFormError(data.error || "등록 실패"); return; }
      setVehicles(prev => [...prev, data.data]);
      // 폼 초기화
      setForm(emptyForm);
      setConsumables(DEFAULT_CONSUMABLES.map(c => ({ ...c })));
      setInspections([]);
      setSpecs([]);
      setActiveTab("manage");
    } finally {
      setSaving(false);
    }
  }, [form, consumables, inspections, specs]);

  // ── 필터링 ────────────────────────────────────────────────
  const filtered = vehicles.filter(v => {
    if (search && !v.name.includes(search) && !v.plateNo?.includes(search) && !v.code.includes(search)) return false;
    if (filterFactory !== "ALL" && v.factory !== filterFactory) return false;
    if (filterType !== "ALL" && v.vehicleType !== filterType) return false;
    if (filterUsage !== "ALL" && v.usage !== filterUsage) return false;
    if (filterStatus !== "ALL") {
      const worst = getVehicleWorstStatus(v);
      if (worst !== filterStatus) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Truck size={24} className="text-blue-600" /> 운송관리
        </h2>
        <p className="text-sm text-gray-500 mt-1">운송차량 및 장비를 등록하고 관리합니다.</p>
      </div>

      {/* 탭 */}
      <div className="border-b border-gray-200">
        <div className="flex gap-0">
          {([
            { key: "manage",     label: "운송장비 관리" },
            { key: "register",   label: "운송장비 등록" },
            { key: "drivingLog", label: "차량운행일지" },
          ] as const).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === key
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── 등록 탭 ── */}
      {activeTab === "register" && (
        <div className="space-y-6">
          {/* 종류 선택 */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
            <p className="text-sm font-semibold text-gray-700 mb-3">1. 종류 선택</p>
            <div className="flex gap-3">
              {(["VEHICLE", "EQUIPMENT"] as TransportVehicleType[]).map(t => (
                <button
                  key={t}
                  onClick={() => handleTypeChange(t)}
                  className={`flex-1 py-3 rounded-lg border-2 text-sm font-semibold transition-colors ${
                    form.vehicleType === t
                      ? "border-blue-600 bg-blue-50 text-blue-700"
                      : "border-gray-200 text-gray-600 hover:border-gray-300"
                  }`}
                >
                  {t === "VEHICLE" ? "일반차량" : "운송장비"}
                  <span className="block text-xs font-normal text-gray-400 mt-0.5">
                    {t === "VEHICLE" ? "승용차, 트럭, 화물차 등" : "지게차, 크레인 차량 등"}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* 공통 정보 */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-4">
            <p className="text-sm font-semibold text-gray-700">2. 공통 정보</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">차량/장비명 <span className="text-red-500">*</span></label>
                <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="예: 1톤 트럭" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">차량번호(번호판)</label>
                <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={form.plateNo} onChange={e => setForm(p => ({ ...p, plateNo: e.target.value }))} placeholder="예: 12가 3456" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">제조사</label>
                <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={form.maker} onChange={e => setForm(p => ({ ...p, maker: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">모델명</label>
                <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={form.modelName} onChange={e => setForm(p => ({ ...p, modelName: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">연식 (제조년도)</label>
                <input type="number" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={form.madeYear} onChange={e => setForm(p => ({ ...p, madeYear: e.target.value }))} placeholder="예: 2020" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">취득일</label>
                <input type="date" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={form.acquiredAt} onChange={e => setForm(p => ({ ...p, acquiredAt: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">취득금액 (선택)</label>
                <input type="number" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={form.acquiredCost} onChange={e => setForm(p => ({ ...p, acquiredCost: e.target.value }))} placeholder="원" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">보관 공장 <span className="text-red-500">*</span></label>
                <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={form.factory} onChange={e => setForm(p => ({ ...p, factory: e.target.value as TransportFactory }))}>
                  <option value="FACTORY1">1공장</option>
                  <option value="FACTORY2">2공장</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">세부 위치</label>
                <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={form.factoryLocation} onChange={e => setForm(p => ({ ...p, factoryLocation: e.target.value }))} placeholder="예: 야적장, 절단동 앞" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">담당자</label>
                <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={form.manager} onChange={e => setForm(p => ({ ...p, manager: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">사용 여부</label>
                <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={form.usage} onChange={e => setForm(p => ({ ...p, usage: e.target.value as TransportUsage }))}>
                  <option value="IN_USE">사용중</option>
                  <option value="MAINTENANCE">점검중</option>
                  <option value="DISPOSED">폐기</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">비고</label>
                <textarea className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" rows={2} value={form.memo} onChange={e => setForm(p => ({ ...p, memo: e.target.value }))} />
              </div>
            </div>
          </div>

          {/* 종류별 추가 정보 */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-4">
            <p className="text-sm font-semibold text-gray-700">
              3. {form.vehicleType === "VEHICLE" ? "일반차량" : "운송장비"} 추가 정보
            </p>
            {form.vehicleType === "VEHICLE" ? (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">연료 종류</label>
                  <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={form.fuelType} onChange={e => setForm(p => ({ ...p, fuelType: e.target.value as FuelType }))}>
                    <option value="DIESEL">경유</option>
                    <option value="GASOLINE">휘발유</option>
                    <option value="LPG">LPG</option>
                    <option value="ELECTRIC">전기</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">배기량 (cc)</label>
                  <input type="number" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={form.displacement} onChange={e => setForm(p => ({ ...p, displacement: e.target.value }))} placeholder="예: 1600" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">현재 주행거리 (km)</label>
                  <input type="number" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={form.mileage} onChange={e => setForm(p => ({ ...p, mileage: e.target.value }))} placeholder="예: 85000" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">보험 만료일</label>
                  <input type="date" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={form.insuranceExpiry} onChange={e => setForm(p => ({ ...p, insuranceExpiry: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">정기검사 만료일</label>
                  <input type="date" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={form.inspExpiry} onChange={e => setForm(p => ({ ...p, inspExpiry: e.target.value }))} />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">장비 세부 종류</label>
                  <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={form.equipSubType} onChange={e => setForm(p => ({ ...p, equipSubType: e.target.value as EquipSubType }))}>
                    <option value="FORKLIFT">지게차</option>
                    <option value="CRANE">크레인 차량</option>
                    <option value="OTHER">기타</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">최대 하중 (톤)</label>
                  <input type="number" step="0.1" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={form.maxLoad} onChange={e => setForm(p => ({ ...p, maxLoad: e.target.value }))} placeholder="예: 1.5" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">동력 방식</label>
                  <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={form.powerType} onChange={e => setForm(p => ({ ...p, powerType: e.target.value as TransportPowerType }))}>
                    <option value="ENGINE">엔진</option>
                    <option value="ELECTRIC">전동</option>
                    <option value="LPG">LPG</option>
                  </select>
                </div>
                {form.equipSubType === "FORKLIFT" && (
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">마스트 높이 (m)</label>
                    <input type="number" step="0.1" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={form.mastHeight} onChange={e => setForm(p => ({ ...p, mastHeight: e.target.value }))} placeholder="예: 3.0" />
                  </div>
                )}
                {/* 기타 사양 */}
                <div className="col-span-2">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-medium text-gray-600">기타 사양</label>
                    <button onClick={() => setSpecs(p => [...p, { specKey: "", specValue: "" }])} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                      <Plus size={12} /> 항목 추가
                    </button>
                  </div>
                  <div className="space-y-2">
                    {specs.map((s, i) => (
                      <div key={i} className="flex gap-2">
                        <input className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm" placeholder="항목명" value={s.specKey} onChange={e => setSpecs(p => p.map((x, j) => j === i ? { ...x, specKey: e.target.value } : x))} />
                        <input className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm" placeholder="값" value={s.specValue} onChange={e => setSpecs(p => p.map((x, j) => j === i ? { ...x, specValue: e.target.value } : x))} />
                        <button onClick={() => setSpecs(p => p.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-500 p-1.5"><Trash2 size={14} /></button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 소모품 교체 주기 (일반차량) */}
          {form.vehicleType === "VEHICLE" && (
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-700">4. 소모품 교체 주기 설정</p>
                <button onClick={() => setConsumables(p => [...p, { itemName: "", basis: "BOTH", intervalKm: null, intervalMonth: null, lastReplacedAt: "", lastReplacedMileage: null }])} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                  <Plus size={12} /> 항목 추가
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-gray-500 border-b">
                      <th className="py-2 pr-3 font-medium">소모품명</th>
                      <th className="py-2 pr-3 font-medium">기준</th>
                      <th className="py-2 pr-3 font-medium">주기(km)</th>
                      <th className="py-2 pr-3 font-medium">주기(월)</th>
                      <th className="py-2 pr-3 font-medium">최종교체일</th>
                      <th className="py-2 pr-3 font-medium">최종교체km</th>
                      <th className="py-2 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {consumables.map((c, i) => (
                      <tr key={i}>
                        <td className="py-1.5 pr-3"><input className="w-full border border-gray-200 rounded px-2 py-1 text-xs" value={c.itemName} onChange={e => setConsumables(p => p.map((x, j) => j === i ? { ...x, itemName: e.target.value } : x))} /></td>
                        <td className="py-1.5 pr-3">
                          <select className="border border-gray-200 rounded px-2 py-1 text-xs" value={c.basis} onChange={e => setConsumables(p => p.map((x, j) => j === i ? { ...x, basis: e.target.value as ConsumableBasis } : x))}>
                            <option value="BOTH">둘 다</option>
                            <option value="MILEAGE">주행거리</option>
                            <option value="PERIOD">기간</option>
                          </select>
                        </td>
                        <td className="py-1.5 pr-3"><input type="number" className="w-20 border border-gray-200 rounded px-2 py-1 text-xs" value={c.intervalKm ?? ""} onChange={e => setConsumables(p => p.map((x, j) => j === i ? { ...x, intervalKm: e.target.value || null } : x))} /></td>
                        <td className="py-1.5 pr-3"><input type="number" className="w-16 border border-gray-200 rounded px-2 py-1 text-xs" value={c.intervalMonth ?? ""} onChange={e => setConsumables(p => p.map((x, j) => j === i ? { ...x, intervalMonth: e.target.value || null } : x))} /></td>
                        <td className="py-1.5 pr-3"><input type="date" className="border border-gray-200 rounded px-2 py-1 text-xs" value={c.lastReplacedAt} onChange={e => setConsumables(p => p.map((x, j) => j === i ? { ...x, lastReplacedAt: e.target.value } : x))} /></td>
                        <td className="py-1.5 pr-3"><input type="number" className="w-20 border border-gray-200 rounded px-2 py-1 text-xs" value={c.lastReplacedMileage ?? ""} onChange={e => setConsumables(p => p.map((x, j) => j === i ? { ...x, lastReplacedMileage: e.target.value || null } : x))} /></td>
                        <td className="py-1.5"><button onClick={() => setConsumables(p => p.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-500"><Trash2 size={13} /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 검사 항목 (운송장비) */}
          {form.vehicleType === "EQUIPMENT" && (
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-700">4. 정기검사 항목 등록</p>
                <button onClick={() => setInspections(p => [...p, { itemName: "", periodMonth: 12, lastInspectedAt: "", inspector: null, memo: null }])} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                  <Plus size={12} /> 항목 추가
                </button>
              </div>
              <div className="space-y-3">
                {inspections.map((ins, i) => (
                  <div key={i} className="grid grid-cols-5 gap-3 items-end">
                    <div className="col-span-2">
                      <label className="block text-xs text-gray-500 mb-1">검사 항목명</label>
                      <input className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm" value={ins.itemName} onChange={e => setInspections(p => p.map((x, j) => j === i ? { ...x, itemName: e.target.value } : x))} placeholder="예: 지게차 정기검사" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">주기 (월)</label>
                      <input type="number" className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm" value={ins.periodMonth} onChange={e => setInspections(p => p.map((x, j) => j === i ? { ...x, periodMonth: e.target.value } : x))} />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">최종 검사일</label>
                      <input type="date" className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm" value={ins.lastInspectedAt} onChange={e => setInspections(p => p.map((x, j) => j === i ? { ...x, lastInspectedAt: e.target.value } : x))} />
                    </div>
                    <div className="flex items-end gap-2">
                      <div className="flex-1">
                        <label className="block text-xs text-gray-500 mb-1">담당 기관/담당자</label>
                        <input className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm" value={ins.inspector ?? ""} onChange={e => setInspections(p => p.map((x, j) => j === i ? { ...x, inspector: e.target.value } : x))} />
                      </div>
                      <button onClick={() => setInspections(p => p.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-500 pb-1.5"><Trash2 size={15} /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 저장 */}
          {formError && <p className="text-sm text-red-600">{formError}</p>}
          <div className="flex justify-end gap-3">
            <button onClick={() => { setForm(emptyForm); setConsumables(DEFAULT_CONSUMABLES.map(c => ({ ...c }))); setInspections([]); setSpecs([]); setFormError(""); }} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
              <X size={14} className="inline mr-1" />초기화
            </button>
            <button onClick={handleSave} disabled={saving} className="px-5 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
              <Save size={14} />{saving ? "저장 중..." : "저장"}
            </button>
          </div>
        </div>
      )}

      {/* ── 관리 탭 ── */}
      {activeTab === "manage" && (
        <div className="space-y-4">
          {/* 필터 바 */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <div className="flex flex-wrap gap-3 items-center">
              <div className="relative flex-1 min-w-48">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="차량명, 번호판, 코드 검색" value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <div className="flex items-center gap-2">
                <Filter size={13} className="text-gray-400" />
                <select className="border border-gray-200 rounded-lg px-3 py-2 text-sm" value={filterFactory} onChange={e => setFilterFactory(e.target.value as "ALL" | TransportFactory)}>
                  <option value="ALL">전체 공장</option>
                  <option value="FACTORY1">1공장</option>
                  <option value="FACTORY2">2공장</option>
                </select>
                <select className="border border-gray-200 rounded-lg px-3 py-2 text-sm" value={filterType} onChange={e => setFilterType(e.target.value as "ALL" | TransportVehicleType)}>
                  <option value="ALL">전체 종류</option>
                  <option value="VEHICLE">일반차량</option>
                  <option value="EQUIPMENT">운송장비</option>
                </select>
                <select className="border border-gray-200 rounded-lg px-3 py-2 text-sm" value={filterStatus} onChange={e => setFilterStatus(e.target.value as "ALL" | AlertStatus)}>
                  <option value="ALL">전체 상태</option>
                  <option value="overdue">초과</option>
                  <option value="imminent">임박</option>
                  <option value="caution">주의</option>
                  <option value="ok">정상</option>
                </select>
                <select className="border border-gray-200 rounded-lg px-3 py-2 text-sm" value={filterUsage} onChange={e => setFilterUsage(e.target.value as "ALL" | TransportUsage)}>
                  <option value="ALL">전체 사용여부</option>
                  <option value="IN_USE">사용중</option>
                  <option value="MAINTENANCE">점검중</option>
                  <option value="DISPOSED">폐기</option>
                </select>
              </div>
            </div>
          </div>

          {/* 목록 */}
          {filtered.length === 0 ? (
            <div className="py-16 text-center text-gray-400 text-sm bg-white rounded-xl border border-gray-200">
              {vehicles.length === 0
                ? <><p className="text-base font-medium text-gray-500">등록된 차량/장비가 없습니다.</p><button onClick={() => setActiveTab("register")} className="mt-3 text-sm text-blue-600 hover:underline">+ 등록하러 가기</button></>
                : "검색 결과가 없습니다."}
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 bg-gray-50 border-b">
                    <th className="px-4 py-3 font-medium">코드</th>
                    <th className="px-4 py-3 font-medium">차량번호</th>
                    <th className="px-4 py-3 font-medium">명칭</th>
                    <th className="px-4 py-3 font-medium">종류</th>
                    <th className="px-4 py-3 font-medium">공장</th>
                    <th className="px-4 py-3 font-medium">담당자</th>
                    <th className="px-4 py-3 font-medium">사용여부</th>
                    <th className="px-4 py-3 font-medium">알림</th>
                    <th className="px-4 py-3 font-medium"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map(v => {
                    const worst = getVehicleWorstStatus(v);
                    const badge = STATUS_BADGE[worst];
                    return (
                      <tr key={v.id} className="hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => router.push(`/management/transport/${v.id}`)}>
                        <td className="px-4 py-3 font-mono text-xs text-gray-500">{v.code}</td>
                        <td className="px-4 py-3 text-gray-700">{v.plateNo || "-"}</td>
                        <td className="px-4 py-3 font-semibold text-gray-900">{v.name}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${v.vehicleType === "VEHICLE" ? "bg-blue-50 text-blue-700" : "bg-purple-50 text-purple-700"}`}>
                            {v.vehicleType === "VEHICLE" ? "일반차량" : "운송장비"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{FACTORY_LABELS[v.factory]}</td>
                        <td className="px-4 py-3 text-gray-600">{v.manager || "-"}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${USAGE_COLORS[v.usage]}`}>
                            {USAGE_LABELS[v.usage]}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${badge.color}`}>
                            {badge.icon}{badge.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-400"><ChevronRight size={16} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── 차량운행일지 탭 ── */}
      {activeTab === "drivingLog" && (
        <TransportDrivingLogTab vehicles={vehicles} />
      )}
    </div>
  );
}

"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Truck, Wrench, Plus, Save, X, Trash2,
  CheckCircle, AlertTriangle, Clock, XCircle, Pencil,
} from "lucide-react";
import type {
  TransportVehicle, TransportUsage, TransportFactory, FuelType,
  EquipSubType, TransportPowerType, ConsumableBasis, ConsumableItem,
  InspectionItem, SpecItem,
} from "./transport-main";

// ── 상수 ─────────────────────────────────────────────────────

const USAGE_LABELS: Record<TransportUsage, string> = { IN_USE: "사용중", MAINTENANCE: "점검중", DISPOSED: "폐기" };
const USAGE_COLORS: Record<TransportUsage, string> = { IN_USE: "bg-green-100 text-green-700", MAINTENANCE: "bg-yellow-100 text-yellow-700", DISPOSED: "bg-gray-200 text-gray-500" };
const FACTORY_LABELS: Record<TransportFactory, string> = { FACTORY1: "1공장", FACTORY2: "2공장" };
const FUEL_LABELS: Record<FuelType, string> = { GASOLINE: "휘발유", DIESEL: "경유", LPG: "LPG", ELECTRIC: "전기" };
const EQUIP_SUB_LABELS: Record<EquipSubType, string> = { FORKLIFT: "지게차", CRANE: "크레인 차량", OTHER: "기타" };
const POWER_LABELS: Record<TransportPowerType, string> = { ENGINE: "엔진", ELECTRIC: "전동", LPG: "LPG" };

// ── 알림 계산 ─────────────────────────────────────────────────

type AlertStatus = "overdue" | "imminent" | "caution" | "ok" | "none";

function getConsumableStatus(c: ConsumableItem, currentMileage: number | null): AlertStatus {
  const today = Date.now();
  let kmStatus: AlertStatus = "none";
  let dateStatus: AlertStatus = "none";
  if (currentMileage != null && c.nextReplaceMileage != null && (c.basis === "MILEAGE" || c.basis === "BOTH")) {
    const r = c.nextReplaceMileage - currentMileage;
    if (r < 0) kmStatus = "overdue";
    else if (r <= 500) kmStatus = "imminent";
    else if (r <= 1000) kmStatus = "caution";
    else kmStatus = "ok";
  }
  if (c.nextReplaceAt && (c.basis === "PERIOD" || c.basis === "BOTH")) {
    const diff = Math.floor((new Date(c.nextReplaceAt).getTime() - today) / 86400000);
    if (diff < 0) dateStatus = "overdue";
    else if (diff <= 14) dateStatus = "imminent";
    else if (diff <= 30) dateStatus = "caution";
    else dateStatus = "ok";
  }
  const p: AlertStatus[] = ["overdue", "imminent", "caution", "ok", "none"];
  return p[Math.min(p.indexOf(kmStatus), p.indexOf(dateStatus))];
}

function getInspStatus(nextInspectAt: string | null | undefined): AlertStatus {
  if (!nextInspectAt) return "none";
  const diff = Math.floor((new Date(nextInspectAt).getTime() - Date.now()) / 86400000);
  if (diff < 0) return "overdue";
  if (diff <= 30) return "imminent";
  if (diff <= 60) return "caution";
  return "ok";
}

const STATUS_BADGE: Record<AlertStatus, { label: string; color: string; icon: React.ReactNode }> = {
  overdue:  { label: "초과", color: "bg-red-100 text-red-700",       icon: <XCircle size={12} /> },
  imminent: { label: "임박", color: "bg-orange-100 text-orange-700", icon: <AlertTriangle size={12} /> },
  caution:  { label: "주의", color: "bg-yellow-100 text-yellow-700", icon: <Clock size={12} /> },
  ok:       { label: "정상", color: "bg-green-100 text-green-700",   icon: <CheckCircle size={12} /> },
  none:     { label: "해당없음", color: "bg-gray-100 text-gray-500", icon: null },
};

// ── 확장된 타입 (이력 포함) ───────────────────────────────────

interface ConsumableLog { id: string; replacedAt: string; mileageAt: number | null; memo: string | null; createdAt: string; }
interface InspectionLog { id: string; completedAt: string; memo: string | null; createdAt: string; }
interface RepairLog { id: string; repairedAt: string; content: string; contractor: string | null; cost: number | null; memo: string | null; createdAt: string; }

interface ConsumableWithLogs extends ConsumableItem { logs: ConsumableLog[]; }
interface InspectionWithLogs extends InspectionItem { logs: InspectionLog[]; }

interface VehicleDetail extends Omit<TransportVehicle, "consumables" | "inspections"> {
  consumables: ConsumableWithLogs[];
  inspections: InspectionWithLogs[];
  repairs: RepairLog[];
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────

export default function TransportCard({ vehicle: initial }: { vehicle: VehicleDetail }) {
  const router = useRouter();
  const [vehicle, setVehicle] = useState<VehicleDetail>(initial);
  const [activeTab, setActiveTab] = useState<"info" | "consumable" | "inspection" | "repair">("info");

  // 주행거리 업데이트
  const [mileageInput, setMileageInput] = useState(String(vehicle.mileage ?? ""));
  const [mileageSaving, setMileageSaving] = useState(false);

  // 교체 완료 모달
  const [replaceModal, setReplaceModal] = useState<{ consumableId: string; itemName: string } | null>(null);
  const [replaceForm, setReplaceForm] = useState({ replacedAt: "", mileageAt: "", memo: "" });

  // 검사 완료 모달
  const [inspModal, setInspModal] = useState<{ itemId: string; itemName: string } | null>(null);
  const [inspForm, setInspForm] = useState({ completedAt: "", memo: "" });

  // 기본 정보 수정
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState({
    name:            vehicle.name,
    plateNo:         vehicle.plateNo         ?? "",
    maker:           vehicle.maker           ?? "",
    modelName:       vehicle.modelName       ?? "",
    madeYear:        vehicle.madeYear        != null ? String(vehicle.madeYear)        : "",
    acquiredAt:      vehicle.acquiredAt      ?? "",
    acquiredCost:    vehicle.acquiredCost    != null ? String(vehicle.acquiredCost)    : "",
    factory:         vehicle.factory,
    factoryLocation: vehicle.factoryLocation ?? "",
    manager:         vehicle.manager         ?? "",
    usage:           vehicle.usage,
    memo:            vehicle.memo            ?? "",
    // 일반차량
    fuelType:        vehicle.fuelType        ?? "DIESEL",
    displacement:    vehicle.displacement    != null ? String(vehicle.displacement)    : "",
    insuranceExpiry: vehicle.insuranceExpiry ?? "",
    inspExpiry:      vehicle.inspExpiry      ?? "",
    // 운송장비
    equipSubType:    vehicle.equipSubType    ?? "FORKLIFT",
    maxLoad:         vehicle.maxLoad         != null ? String(vehicle.maxLoad)         : "",
    powerType:       vehicle.powerType       ?? "ENGINE",
    mastHeight:      vehicle.mastHeight      != null ? String(vehicle.mastHeight)      : "",
  });
  const [editSaving, setEditSaving] = useState(false);
  const [editError,  setEditError]  = useState("");
  const setE = (k: string, v: string) => setEditForm(f => ({ ...f, [k]: v }));

  const handleSaveEdit = useCallback(async () => {
    setEditError("");
    if (!editForm.name.trim()) { setEditError("차량/장비명은 필수입니다."); return; }
    setEditSaving(true);
    try {
      const res = await fetch(`/api/transport-vehicle/${vehicle.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vehicleType:     vehicle.vehicleType,
          name:            editForm.name,
          plateNo:         editForm.plateNo         || null,
          maker:           editForm.maker           || null,
          modelName:       editForm.modelName       || null,
          madeYear:        editForm.madeYear        || null,
          acquiredAt:      editForm.acquiredAt      || null,
          acquiredCost:    editForm.acquiredCost    || null,
          factory:         editForm.factory,
          factoryLocation: editForm.factoryLocation || null,
          manager:         editForm.manager         || null,
          usage:           editForm.usage,
          memo:            editForm.memo            || null,
          fuelType:        editForm.fuelType        || null,
          displacement:    editForm.displacement    || null,
          insuranceExpiry: editForm.insuranceExpiry || null,
          inspExpiry:      editForm.inspExpiry      || null,
          equipSubType:    editForm.equipSubType    || null,
          maxLoad:         editForm.maxLoad         || null,
          powerType:       editForm.powerType       || null,
          mastHeight:      editForm.mastHeight      || null,
          // 기존 소모품/검사/사양은 그대로 유지
          specs:       vehicle.specs.map(s => ({ id: s.id, specKey: s.specKey, specValue: s.specValue })),
          consumables: vehicle.consumables.map(c => ({ id: c.id, itemName: c.itemName, basis: c.basis, intervalKm: c.intervalKm, intervalMonth: c.intervalMonth, lastReplacedAt: c.lastReplacedAt, lastReplacedMileage: c.lastReplacedMileage })),
          inspections: vehicle.inspections.map(i => ({ id: i.id, itemName: i.itemName, periodMonth: i.periodMonth, lastInspectedAt: i.lastInspectedAt, inspector: i.inspector, memo: i.memo })),
        }),
      });
      const data = await res.json();
      if (!data.success) { setEditError(data.error || "저장 실패"); return; }
      // 로컬 상태 반영
      setVehicle(prev => ({
        ...prev,
        name:            editForm.name,
        plateNo:         editForm.plateNo         || null,
        maker:           editForm.maker           || null,
        modelName:       editForm.modelName       || null,
        madeYear:        editForm.madeYear        ? Number(editForm.madeYear)        : null,
        acquiredAt:      editForm.acquiredAt      || null,
        acquiredCost:    editForm.acquiredCost    ? Number(editForm.acquiredCost)    : null,
        factory:         editForm.factory         as typeof prev.factory,
        factoryLocation: editForm.factoryLocation || null,
        manager:         editForm.manager         || null,
        usage:           editForm.usage           as typeof prev.usage,
        memo:            editForm.memo            || null,
        fuelType:        (editForm.fuelType       || null) as typeof prev.fuelType,
        displacement:    editForm.displacement    ? Number(editForm.displacement)    : null,
        insuranceExpiry: editForm.insuranceExpiry || null,
        inspExpiry:      editForm.inspExpiry      || null,
        equipSubType:    (editForm.equipSubType   || null) as typeof prev.equipSubType,
        maxLoad:         editForm.maxLoad         ? Number(editForm.maxLoad)         : null,
        powerType:       (editForm.powerType      || null) as typeof prev.powerType,
        mastHeight:      editForm.mastHeight      ? Number(editForm.mastHeight)      : null,
      }));
      setEditMode(false);
    } catch { setEditError("서버 오류가 발생했습니다."); }
    finally { setEditSaving(false); }
  }, [vehicle, editForm]);

  // 수선 이력 등록
  const [repairForm, setRepairForm] = useState({ repairedAt: "", content: "", contractor: "", cost: "", memo: "" });
  const [repairSaving, setRepairSaving] = useState(false);
  const [repairError, setRepairError] = useState("");

  // 주행거리 업데이트
  const handleMileageUpdate = useCallback(async () => {
    setMileageSaving(true);
    try {
      const res = await fetch(`/api/transport-vehicle/${vehicle.id}/mileage`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mileage: Number(mileageInput) }),
      });
      const data = await res.json();
      if (data.success) {
        setVehicle(prev => ({ ...prev, mileage: Number(mileageInput) }));
      }
    } finally {
      setMileageSaving(false);
    }
  }, [vehicle.id, mileageInput]);

  // 소모품 교체 완료
  const handleReplaceComplete = useCallback(async () => {
    if (!replaceModal || !replaceForm.replacedAt) return;
    const res = await fetch(`/api/transport-consumable/${replaceModal.consumableId}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        replacedAt: replaceForm.replacedAt,
        mileageAt: replaceForm.mileageAt ? Number(replaceForm.mileageAt) : null,
        memo: replaceForm.memo,
      }),
    });
    const data = await res.json();
    if (data.success) {
      // 로컬 상태 갱신
      setVehicle(prev => ({
        ...prev,
        consumables: prev.consumables.map(c =>
          c.id === replaceModal.consumableId
            ? {
                ...c,
                lastReplacedAt: data.data.consumable.lastReplacedAt?.split("T")[0] ?? c.lastReplacedAt,
                lastReplacedMileage: data.data.consumable.lastReplacedMileage,
                nextReplaceMileage: data.data.consumable.nextReplaceMileage,
                nextReplaceAt: data.data.consumable.nextReplaceAt?.split("T")[0] ?? null,
                logs: [
                  { ...data.data.log, replacedAt: data.data.log.replacedAt.split("T")[0], createdAt: data.data.log.createdAt },
                  ...c.logs,
                ],
              }
            : c
        ),
      }));
      setReplaceModal(null);
      setReplaceForm({ replacedAt: "", mileageAt: "", memo: "" });
    }
  }, [replaceModal, replaceForm]);

  // 검사 완료
  const handleInspComplete = useCallback(async () => {
    if (!inspModal || !inspForm.completedAt) return;
    const res = await fetch(`/api/transport-inspection/${inspModal.itemId}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completedAt: inspForm.completedAt, memo: inspForm.memo }),
    });
    const data = await res.json();
    if (data.success) {
      setVehicle(prev => ({
        ...prev,
        inspections: prev.inspections.map(ins =>
          ins.id === inspModal.itemId
            ? {
                ...ins,
                lastInspectedAt: data.data.item.lastInspectedAt?.split("T")[0] ?? ins.lastInspectedAt,
                nextInspectAt: data.data.item.nextInspectAt?.split("T")[0] ?? null,
                logs: [
                  { ...data.data.log, completedAt: data.data.log.completedAt.split("T")[0], createdAt: data.data.log.createdAt },
                  ...ins.logs,
                ],
              }
            : ins
        ),
      }));
      setInspModal(null);
      setInspForm({ completedAt: "", memo: "" });
    }
  }, [inspModal, inspForm]);

  // 수선 이력 저장
  const handleRepairSave = useCallback(async () => {
    setRepairError("");
    if (!repairForm.content.trim()) { setRepairError("수선 내용은 필수입니다."); return; }
    if (!repairForm.repairedAt) { setRepairError("수선일은 필수입니다."); return; }
    setRepairSaving(true);
    try {
      const res = await fetch("/api/transport-repair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vehicleId: vehicle.id,
          repairedAt: repairForm.repairedAt,
          content: repairForm.content,
          contractor: repairForm.contractor || null,
          cost: repairForm.cost ? Number(repairForm.cost) : null,
          memo: repairForm.memo || null,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setVehicle(prev => ({
          ...prev,
          repairs: [{ ...data.data, repairedAt: data.data.repairedAt.split("T")[0], createdAt: data.data.createdAt }, ...prev.repairs],
        }));
        setRepairForm({ repairedAt: "", content: "", contractor: "", cost: "", memo: "" });
      } else {
        setRepairError(data.error || "저장 실패");
      }
    } finally {
      setRepairSaving(false);
    }
  }, [vehicle.id, repairForm]);

  const tabs = [
    { key: "info", label: "기본 정보" },
    ...(vehicle.vehicleType === "VEHICLE" ? [{ key: "consumable", label: "소모품 교체 이력" }] : []),
    ...(vehicle.vehicleType === "EQUIPMENT" ? [{ key: "inspection", label: "검사 이력" }] : []),
    { key: "repair", label: "수선/정비 이력" },
  ] as { key: typeof activeTab; label: string }[];

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center gap-4">
        <button onClick={() => router.back()} className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-500">
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <Truck size={20} className="text-blue-600" />
            <h2 className="text-xl font-bold text-gray-900">{vehicle.name}</h2>
            <span className="font-mono text-sm text-gray-400">{vehicle.code}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${USAGE_COLORS[vehicle.usage]}`}>
              {USAGE_LABELS[vehicle.usage]}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${vehicle.vehicleType === "VEHICLE" ? "bg-blue-50 text-blue-700" : "bg-purple-50 text-purple-700"}`}>
              {vehicle.vehicleType === "VEHICLE" ? "일반차량" : "운송장비"}
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-0.5 ml-8">{FACTORY_LABELS[vehicle.factory]}{vehicle.factoryLocation ? ` · ${vehicle.factoryLocation}` : ""}{vehicle.manager ? ` · 담당: ${vehicle.manager}` : ""}</p>
        </div>
        {/* 수정 버튼 (기본 정보 탭에서만 표시) */}
        {activeTab === "info" && !editMode && (
          <button
            onClick={() => { setEditMode(true); setEditError(""); }}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700 transition-colors"
          >
            <Pencil size={14} /> 수정
          </button>
        )}
      </div>

      {/* 탭 */}
      <div className="border-b border-gray-200">
        <div className="flex gap-0">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === t.key ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── 기본 정보 탭 ── */}
      {activeTab === "info" && (
        <div className="space-y-6">
          {/* 주행거리 업데이트 (일반차량) */}
          {vehicle.vehicleType === "VEHICLE" && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center gap-4">
              <div>
                <p className="text-xs font-medium text-blue-600 mb-0.5">현재 주행거리</p>
                <p className="text-xl font-bold text-blue-900">{vehicle.mileage?.toLocaleString() ?? "-"} km</p>
              </div>
              <div className="flex items-center gap-2 ml-4">
                <input
                  type="number"
                  className="border border-blue-300 rounded-lg px-3 py-2 text-sm w-36 bg-white"
                  placeholder="새 주행거리 (km)"
                  value={mileageInput}
                  onChange={e => setMileageInput(e.target.value)}
                />
                <button onClick={handleMileageUpdate} disabled={mileageSaving} className="px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50">
                  {mileageSaving ? "저장 중..." : "업데이트"}
                </button>
              </div>
            </div>
          )}

          {/* 공통 정보 */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">공통 정보</p>
            {editMode ? (
              <div className="grid grid-cols-3 gap-x-6 gap-y-4 text-sm">
                <EditField label="차량/장비명 *" value={editForm.name}            onChange={v => setE("name", v)} />
                <EditField label="차량번호"       value={editForm.plateNo}         onChange={v => setE("plateNo", v)} />
                <EditField label="제조사"         value={editForm.maker}           onChange={v => setE("maker", v)} />
                <EditField label="모델명"         value={editForm.modelName}       onChange={v => setE("modelName", v)} />
                <EditField label="연식"           value={editForm.madeYear}        onChange={v => setE("madeYear", v)} type="number" />
                <EditField label="취득일"         value={editForm.acquiredAt}      onChange={v => setE("acquiredAt", v)} type="date" />
                <EditField label="취득금액 (원)"  value={editForm.acquiredCost}    onChange={v => setE("acquiredCost", v)} type="number" />
                <EditSelect label="보관 공장" value={editForm.factory} onChange={v => setE("factory", v)}
                  options={[{ value: "FACTORY1", label: "1공장" }, { value: "FACTORY2", label: "2공장" }]} />
                <EditField label="세부 위치"      value={editForm.factoryLocation} onChange={v => setE("factoryLocation", v)} />
                <EditField label="담당자"         value={editForm.manager}         onChange={v => setE("manager", v)} />
                <EditSelect label="사용 상태" value={editForm.usage} onChange={v => setE("usage", v)}
                  options={[{ value: "IN_USE", label: "사용중" }, { value: "MAINTENANCE", label: "점검중" }, { value: "DISPOSED", label: "폐기" }]} />
                <div className="col-span-3">
                  <EditField label="비고" value={editForm.memo} onChange={v => setE("memo", v)} />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-x-6 gap-y-3 text-sm">
                <InfoRow label="차량번호" value={vehicle.plateNo} />
                <InfoRow label="제조사" value={vehicle.maker} />
                <InfoRow label="모델명" value={vehicle.modelName} />
                <InfoRow label="연식" value={vehicle.madeYear ? `${vehicle.madeYear}년` : null} />
                <InfoRow label="취득일" value={vehicle.acquiredAt} />
                <InfoRow label="취득금액" value={vehicle.acquiredCost ? `${vehicle.acquiredCost.toLocaleString()}원` : null} />
                <InfoRow label="보관 공장" value={FACTORY_LABELS[vehicle.factory]} />
                <InfoRow label="세부 위치" value={vehicle.factoryLocation} />
                <InfoRow label="담당자" value={vehicle.manager} />
                <InfoRow label="비고" value={vehicle.memo} />
              </div>
            )}
          </div>

          {/* 종류별 추가 정보 */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">
              {vehicle.vehicleType === "VEHICLE" ? "일반차량 정보" : "운송장비 정보"}
            </p>
            {editMode ? (
              vehicle.vehicleType === "VEHICLE" ? (
                <div className="grid grid-cols-3 gap-x-6 gap-y-4 text-sm">
                  <EditSelect label="연료 종류" value={editForm.fuelType} onChange={v => setE("fuelType", v)}
                    options={[{ value: "GASOLINE", label: "휘발유" }, { value: "DIESEL", label: "경유" }, { value: "LPG", label: "LPG" }, { value: "ELECTRIC", label: "전기" }]} />
                  <EditField label="배기량 (cc)"      value={editForm.displacement}    onChange={v => setE("displacement", v)} type="number" />
                  <EditField label="보험 만료일"       value={editForm.insuranceExpiry} onChange={v => setE("insuranceExpiry", v)} type="date" />
                  <EditField label="정기검사 만료일"   value={editForm.inspExpiry}      onChange={v => setE("inspExpiry", v)} type="date" />
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-x-6 gap-y-4 text-sm">
                  <EditSelect label="세부 종류" value={editForm.equipSubType} onChange={v => setE("equipSubType", v)}
                    options={[{ value: "FORKLIFT", label: "지게차" }, { value: "CRANE", label: "크레인 차량" }, { value: "OTHER", label: "기타" }]} />
                  <EditField label="최대 하중 (t)"   value={editForm.maxLoad}    onChange={v => setE("maxLoad", v)} type="number" />
                  <EditSelect label="동력 방식" value={editForm.powerType} onChange={v => setE("powerType", v)}
                    options={[{ value: "ENGINE", label: "엔진" }, { value: "ELECTRIC", label: "전동" }, { value: "LPG", label: "LPG" }]} />
                  <EditField label="마스트 높이 (m)" value={editForm.mastHeight} onChange={v => setE("mastHeight", v)} type="number" />
                </div>
              )
            ) : (
              vehicle.vehicleType === "VEHICLE" ? (
                <div className="grid grid-cols-3 gap-x-6 gap-y-3 text-sm">
                  <InfoRow label="연료 종류" value={vehicle.fuelType ? FUEL_LABELS[vehicle.fuelType] : null} />
                  <InfoRow label="배기량" value={vehicle.displacement ? `${vehicle.displacement.toLocaleString()} cc` : null} />
                  <InfoRow label="보험 만료일" value={vehicle.insuranceExpiry} />
                  <InfoRow label="정기검사 만료일" value={vehicle.inspExpiry} />
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-x-6 gap-y-3 text-sm">
                  <InfoRow label="세부 종류" value={vehicle.equipSubType ? EQUIP_SUB_LABELS[vehicle.equipSubType] : null} />
                  <InfoRow label="최대 하중" value={vehicle.maxLoad ? `${vehicle.maxLoad}t` : null} />
                  <InfoRow label="동력 방식" value={vehicle.powerType ? POWER_LABELS[vehicle.powerType] : null} />
                  {vehicle.mastHeight && <InfoRow label="마스트 높이" value={`${vehicle.mastHeight}m`} />}
                  {vehicle.specs.length > 0 && (
                    <div className="col-span-3 mt-2 pt-3 border-t border-gray-100">
                      <p className="text-xs font-medium text-gray-500 mb-2">기타 사양</p>
                      <div className="grid grid-cols-3 gap-x-6 gap-y-2">
                        {vehicle.specs.map(s => <InfoRow key={s.id} label={s.specKey} value={s.specValue} />)}
                      </div>
                    </div>
                  )}
                </div>
              )
            )}
          </div>

          {/* 수정 모드 하단 버튼 */}
          {editMode && (
            <div className="flex items-center justify-between">
              {editError && <p className="text-sm text-red-600">{editError}</p>}
              <div className="flex gap-2 ml-auto">
                <button
                  onClick={() => { setEditMode(false); setEditError(""); }}
                  className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700 transition-colors"
                >
                  취소
                </button>
                <button
                  onClick={handleSaveEdit}
                  disabled={editSaving}
                  className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  <Save size={14} /> {editSaving ? "저장 중..." : "저장"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── 소모품 교체 이력 탭 ── */}
      {activeTab === "consumable" && vehicle.vehicleType === "VEHICLE" && (
        <div className="space-y-4">
          {vehicle.consumables.map(c => {
            const status = getConsumableStatus(c, vehicle.mileage);
            const badge = STATUS_BADGE[status];
            return (
              <div key={c.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b bg-gray-50 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <p className="font-semibold text-gray-800">{c.itemName}</p>
                    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${badge.color}`}>
                      {badge.icon}{badge.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    {c.nextReplaceMileage != null && <span>다음 교체: <strong>{c.nextReplaceMileage.toLocaleString()} km</strong></span>}
                    {c.nextReplaceAt && <span>예정일: <strong>{c.nextReplaceAt}</strong></span>}
                    <button
                      onClick={() => { setReplaceModal({ consumableId: c.id!, itemName: c.itemName }); setReplaceForm({ replacedAt: "", mileageAt: String(vehicle.mileage ?? ""), memo: "" }); }}
                      className="flex items-center gap-1 text-blue-600 hover:underline font-medium"
                    >
                      <CheckCircle size={13} /> 교체 완료 처리
                    </button>
                  </div>
                </div>
                {/* 이력 */}
                {c.logs.length === 0 ? (
                  <div className="px-5 py-6 text-center text-gray-400 text-sm">교체 이력이 없습니다.</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead><tr className="text-left text-xs text-gray-500 bg-gray-50 border-b"><th className="px-4 py-2 font-medium">교체일</th><th className="px-4 py-2 font-medium">교체 시 주행거리</th><th className="px-4 py-2 font-medium">비고</th></tr></thead>
                    <tbody className="divide-y divide-gray-50">
                      {c.logs.map(log => (
                        <tr key={log.id}>
                          <td className="px-4 py-2 font-mono">{log.replacedAt}</td>
                          <td className="px-4 py-2">{log.mileageAt != null ? `${log.mileageAt.toLocaleString()} km` : "-"}</td>
                          <td className="px-4 py-2 text-gray-500">{log.memo || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── 검사 이력 탭 ── */}
      {activeTab === "inspection" && vehicle.vehicleType === "EQUIPMENT" && (
        <div className="space-y-4">
          {vehicle.inspections.map(ins => {
            const status = getInspStatus(ins.nextInspectAt);
            const badge = STATUS_BADGE[status];
            return (
              <div key={ins.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b bg-gray-50 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <p className="font-semibold text-gray-800">{ins.itemName}</p>
                    <span className="text-xs text-gray-400">주기 {ins.periodMonth}개월</span>
                    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${badge.color}`}>
                      {badge.icon}{badge.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    {ins.nextInspectAt && <span>다음 검사: <strong>{ins.nextInspectAt}</strong></span>}
                    <button
                      onClick={() => { setInspModal({ itemId: ins.id!, itemName: ins.itemName }); setInspForm({ completedAt: "", memo: "" }); }}
                      className="flex items-center gap-1 text-blue-600 hover:underline font-medium"
                    >
                      <CheckCircle size={13} /> 검사 완료 처리
                    </button>
                  </div>
                </div>
                {ins.logs.length === 0 ? (
                  <div className="px-5 py-6 text-center text-gray-400 text-sm">검사 이력이 없습니다.</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead><tr className="text-left text-xs text-gray-500 bg-gray-50 border-b"><th className="px-4 py-2 font-medium">검사 완료일</th><th className="px-4 py-2 font-medium">비고</th></tr></thead>
                    <tbody className="divide-y divide-gray-50">
                      {ins.logs.map(log => (
                        <tr key={log.id}>
                          <td className="px-4 py-2 font-mono">{log.completedAt}</td>
                          <td className="px-4 py-2 text-gray-500">{log.memo || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            );
          })}
          {vehicle.inspections.length === 0 && (
            <div className="py-12 text-center text-gray-400 text-sm bg-white rounded-xl border border-gray-200">검사 항목이 없습니다.</div>
          )}
        </div>
      )}

      {/* ── 수선/정비 이력 탭 ── */}
      {activeTab === "repair" && (
        <div className="space-y-4">
          {/* 등록 폼 */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-4">
            <p className="text-sm font-semibold text-gray-700 flex items-center gap-2"><Plus size={15} /> 수선/정비 이력 등록</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">수선일 <span className="text-red-500">*</span></label>
                <input type="date" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={repairForm.repairedAt} onChange={e => setRepairForm(p => ({ ...p, repairedAt: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">수선 업체/담당자</label>
                <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={repairForm.contractor} onChange={e => setRepairForm(p => ({ ...p, contractor: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">수선 내용 <span className="text-red-500">*</span></label>
                <textarea className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" rows={2} value={repairForm.content} onChange={e => setRepairForm(p => ({ ...p, content: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">비용 (원)</label>
                <input type="number" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={repairForm.cost} onChange={e => setRepairForm(p => ({ ...p, cost: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">비고</label>
                <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={repairForm.memo} onChange={e => setRepairForm(p => ({ ...p, memo: e.target.value }))} />
              </div>
            </div>
            {repairError && <p className="text-sm text-red-600">{repairError}</p>}
            <div className="flex justify-end">
              <button onClick={handleRepairSave} disabled={repairSaving} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
                <Save size={14} />{repairSaving ? "저장 중..." : "이력 저장"}
              </button>
            </div>
          </div>

          {/* 이력 목록 */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            {vehicle.repairs.length === 0 ? (
              <div className="py-12 text-center text-gray-400 text-sm">수선/정비 이력이 없습니다.</div>
            ) : (
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs text-gray-500 bg-gray-50 border-b">
                  <th className="px-4 py-3 font-medium">수선일</th>
                  <th className="px-4 py-3 font-medium">수선 내용</th>
                  <th className="px-4 py-3 font-medium">수선 업체/담당자</th>
                  <th className="px-4 py-3 font-medium">비용</th>
                  <th className="px-4 py-3 font-medium">비고</th>
                </tr></thead>
                <tbody className="divide-y divide-gray-50">
                  {vehicle.repairs.map(r => (
                    <tr key={r.id}>
                      <td className="px-4 py-3 font-mono text-xs">{r.repairedAt}</td>
                      <td className="px-4 py-3">{r.content}</td>
                      <td className="px-4 py-3 text-gray-500">{r.contractor || "-"}</td>
                      <td className="px-4 py-3 text-gray-500">{r.cost ? `${r.cost.toLocaleString()}원` : "-"}</td>
                      <td className="px-4 py-3 text-gray-500">{r.memo || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ── 소모품 교체 완료 모달 ── */}
      {replaceModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm space-y-4">
            <div className="flex items-center justify-between">
              <p className="font-bold text-gray-900">교체 완료 처리</p>
              <button onClick={() => setReplaceModal(null)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <p className="text-sm text-gray-600">{replaceModal.itemName}</p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">교체일 <span className="text-red-500">*</span></label>
                <input type="date" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={replaceForm.replacedAt} onChange={e => setReplaceForm(p => ({ ...p, replacedAt: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">교체 시 주행거리 (km)</label>
                <input type="number" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={replaceForm.mileageAt} onChange={e => setReplaceForm(p => ({ ...p, mileageAt: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">비고</label>
                <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={replaceForm.memo} onChange={e => setReplaceForm(p => ({ ...p, memo: e.target.value }))} />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setReplaceModal(null)} className="px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">취소</button>
              <button onClick={handleReplaceComplete} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">완료 처리</button>
            </div>
          </div>
        </div>
      )}

      {/* ── 검사 완료 모달 ── */}
      {inspModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm space-y-4">
            <div className="flex items-center justify-between">
              <p className="font-bold text-gray-900">검사 완료 처리</p>
              <button onClick={() => setInspModal(null)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <p className="text-sm text-gray-600">{inspModal.itemName}</p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">완료일 <span className="text-red-500">*</span></label>
                <input type="date" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={inspForm.completedAt} onChange={e => setInspForm(p => ({ ...p, completedAt: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">비고</label>
                <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={inspForm.memo} onChange={e => setInspForm(p => ({ ...p, memo: e.target.value }))} />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setInspModal(null)} className="px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">취소</button>
              <button onClick={handleInspComplete} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">완료 처리</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── 헬퍼 ─────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div>
      <p className="text-xs text-gray-400">{label}</p>
      <p className="text-sm font-medium text-gray-800 mt-0.5">{value ?? "-"}</p>
    </div>
  );
}

function EditField({ label, value, onChange, type = "text" }: {
  label: string; value: string; onChange: (v: string) => void; type?: string;
}) {
  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
      />
    </div>
  );
}

function EditSelect({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1">{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

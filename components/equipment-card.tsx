"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Wrench, CheckCircle, AlertTriangle, Clock,
  XCircle, MinusCircle, Plus, ChevronDown, ChevronUp,
} from "lucide-react";

// ── 타입 ────────────────────────────────────────────────────

type MgmtEquipmentUsage = "IN_USE" | "MAINTENANCE" | "DISPOSED";
type InspStatus = "overdue" | "imminent" | "caution" | "ok" | "none";

interface InspLog {
  id: string;
  completedAt: string;
  memo: string | null;
  createdAt: string;
}

interface InspectionItem {
  id: string;
  itemName: string;
  periodMonth: number;
  lastInspectedAt: string;
  nextInspectAt: string | null;
  inspector: string | null;
  memo: string | null;
  logs: InspLog[];
}

interface RepairCost {
  id?: string;
  itemName: string;
  amount: number;
  sortOrder?: number;
}
interface RepairLog {
  id: string;
  repairedAt: string;
  cause: string | null;
  content: string;
  contractor: string | null;
  cost: number | null;
  downtimeMinutes: number | null;
  memo: string | null;
  costs?: RepairCost[];
  createdAt: string;
}

interface SpecItem {
  id: string;
  specKey: string;
  specValue: string;
}

interface Equipment {
  id: string;
  code: string;
  name: string;
  kind: string;
  managementNo: string | null;
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
  repairs: RepairLog[];
  createdAt: string;
  updatedAt: string;
}

// ── 상수 ────────────────────────────────────────────────────

const USAGE_LABELS: Record<MgmtEquipmentUsage, string> = {
  IN_USE: "사용중", MAINTENANCE: "점검중", DISPOSED: "폐기",
};
const USAGE_COLORS: Record<MgmtEquipmentUsage, string> = {
  IN_USE: "bg-green-100 text-green-700",
  MAINTENANCE: "bg-yellow-100 text-yellow-700",
  DISPOSED: "bg-gray-200 text-gray-500",
};

function getInspStatus(nextInspectAt: string | null | undefined): InspStatus {
  if (!nextInspectAt) return "none";
  const diff = Math.floor((new Date(nextInspectAt).getTime() - Date.now()) / 86400000);
  if (diff < 0) return "overdue";
  if (diff <= 30) return "imminent";
  if (diff <= 60) return "caution";
  return "ok";
}

function dDayLabel(dateStr: string | null | undefined) {
  if (!dateStr) return null;
  const diff = Math.floor((new Date(dateStr).getTime() - Date.now()) / 86400000);
  if (diff < 0) return { text: `D+${Math.abs(diff)}`, cls: "text-red-700 bg-red-100" };
  if (diff === 0) return { text: "D-day", cls: "text-red-700 bg-red-100" };
  if (diff <= 30) return { text: `D-${diff}`, cls: "text-orange-700 bg-orange-100" };
  if (diff <= 60) return { text: `D-${diff}`, cls: "text-yellow-700 bg-yellow-100" };
  return { text: `D-${diff}`, cls: "text-green-700 bg-green-100" };
}

const STATUS_BADGE: Record<InspStatus, { label: string; cls: string; icon: React.ReactNode }> = {
  overdue:  { label: "초과",   cls: "bg-red-100 text-red-700",      icon: <XCircle size={12} /> },
  imminent: { label: "임박",   cls: "bg-orange-100 text-orange-700", icon: <AlertTriangle size={12} /> },
  caution:  { label: "주의",   cls: "bg-yellow-100 text-yellow-700", icon: <Clock size={12} /> },
  ok:       { label: "정상",   cls: "bg-green-100 text-green-700",   icon: <CheckCircle size={12} /> },
  none:     { label: "해당없음", cls: "bg-gray-100 text-gray-500",   icon: <MinusCircle size={12} /> },
};

const inputCls = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400";
const labelCls = "block text-xs font-medium text-gray-600 mb-1";

// ── 검사 완료 모달 ───────────────────────────────────────────

function CompleteModal({
  item,
  onClose,
  onDone,
}: {
  item: InspectionItem;
  onClose: () => void;
  onDone: (updated: InspectionItem) => void;
}) {
  const today = new Date().toISOString().split("T")[0];
  const [completedAt, setCompletedAt] = useState(today);
  const [memo, setMemo] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    const res = await fetch(`/api/mgmt-inspection/${item.id}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completedAt, memo }),
    });
    const json = await res.json();
    if (json.success) {
      const updatedItem = json.data.item;
      const newLog = json.data.log;
      const next = updatedItem.nextInspectAt
        ? new Date(updatedItem.nextInspectAt).toISOString().split("T")[0]
        : null;
      onDone({
        ...item,
        lastInspectedAt: completedAt,
        nextInspectAt: next,
        logs: [
          { id: newLog.id, completedAt, memo: memo || null, createdAt: newLog.createdAt },
          ...item.logs,
        ],
      });
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4">
        <p className="text-base font-bold text-gray-900">검사 완료 처리</p>
        <p className="text-sm text-gray-600">
          <span className="font-semibold">{item.itemName}</span> 검사 완료일을 입력하세요.
        </p>
        <div>
          <label className={labelCls}>완료일 *</label>
          <input className={inputCls} type="date" value={completedAt} onChange={e => setCompletedAt(e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>비고</label>
          <input className={inputCls} value={memo} onChange={e => setMemo(e.target.value)} placeholder="선택 입력" />
        </div>
        <div className="flex gap-2 justify-end pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">취소</button>
          <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {saving ? "저장 중..." : "완료 저장"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 수선이력 입력 폼 ──────────────────────────────────────────

function RepairForm({
  equipmentId,
  onAdded,
}: {
  equipmentId: string;
  onAdded: (log: RepairLog) => void;
}) {
  const today = new Date().toISOString().split("T")[0];
  const [repairedAt, setRepairedAt] = useState(today);
  const [cause, setCause] = useState("");
  const [content, setContent] = useState("");
  const [contractor, setContractor] = useState("");
  const [costs, setCosts] = useState<{ itemName: string; amount: string }[]>([]);
  const [dtH, setDtH] = useState("");
  const [dtM, setDtM] = useState("");
  const [memo, setMemo] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const addCostRow = () => setCosts(prev => [...prev, { itemName: "", amount: "" }]);
  const removeCostRow = (i: number) => setCosts(prev => prev.filter((_, idx) => idx !== i));
  const updCost = (i: number, field: "itemName" | "amount", v: string) =>
    setCosts(prev => prev.map((c, idx) => (idx === i ? { ...c, [field]: v } : c)));
  const totalCost = costs.reduce((s, c) => s + (Number(c.amount) || 0), 0);

  const handleSave = async () => {
    setError("");
    if (!content.trim()) { setError("조치 내용을 입력하세요."); return; }
    setSaving(true);
    const res = await fetch("/api/mgmt-repair", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        equipmentId, repairedAt, cause, content, contractor, memo,
        costs: costs.filter(c => c.itemName.trim() && Number(c.amount) > 0),
        downtimeHours: Number(dtH) || 0,
        downtimeMins:  Number(dtM) || 0,
      }),
    });
    const json = await res.json();
    if (json.success) {
      onAdded({ ...json.data, repairedAt, createdAt: json.data.createdAt });
      setCause(""); setContent(""); setContractor(""); setCosts([]); setDtH(""); setDtM(""); setMemo(""); setRepairedAt(today);
    } else {
      setError(json.error || "등록 실패");
    }
    setSaving(false);
  };

  return (
    <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 space-y-3">
      <p className="text-xs font-bold text-gray-700">수선이력 추가</p>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>수선일 *</label>
          <input className={inputCls} type="date" value={repairedAt} onChange={e => setRepairedAt(e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>수선 업체/담당자</label>
          <input className={inputCls} value={contractor} onChange={e => setContractor(e.target.value)} />
        </div>
        <div className="col-span-2">
          <label className={labelCls}>고장 원인</label>
          <textarea className={inputCls} rows={2} value={cause} onChange={e => setCause(e.target.value)} placeholder="예: 모터 베어링 마모로 진동 발생" />
        </div>
        <div className="col-span-2">
          <label className={labelCls}>조치 내용 *</label>
          <textarea className={inputCls} rows={2} value={content} onChange={e => setContent(e.target.value)} />
        </div>
        <div className="col-span-2">
          <label className={labelCls}>비가동시간</label>
          <div className="flex items-center gap-2">
            <input
              type="number" min={0} value={dtH} onChange={e => setDtH(e.target.value)}
              placeholder="시간"
              className="w-24 border border-gray-300 rounded-lg px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            <span className="text-sm text-gray-500">시간</span>
            <input
              type="number" min={0} max={59} value={dtM} onChange={e => setDtM(e.target.value)}
              placeholder="분"
              className="w-24 border border-gray-300 rounded-lg px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            <span className="text-sm text-gray-500">분</span>
          </div>
        </div>
        <div className="col-span-2">
          <div className="flex items-center justify-between mb-1.5">
            <label className={labelCls + " mb-0"}>소모 비용 (항목별)</label>
            <button type="button" onClick={addCostRow} className="text-xs px-2 py-1 border border-blue-300 text-blue-600 rounded hover:bg-blue-50">+ 항목 추가</button>
          </div>
          {costs.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-2 border border-dashed border-gray-200 rounded">+ 항목 추가 버튼으로 부품비·인건비 등 비용 항목을 입력</p>
          ) : (
            <div className="space-y-1.5">
              {costs.map((c, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input
                    type="text"
                    placeholder="항목명 (예: 부품비)"
                    value={c.itemName}
                    onChange={e => updCost(i, "itemName", e.target.value)}
                    className="flex-1 min-w-0 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                  <input
                    type="number"
                    placeholder="금액(원)"
                    value={c.amount}
                    onChange={e => updCost(i, "amount", e.target.value)}
                    className="w-32 flex-shrink-0 border border-gray-300 rounded-lg px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                  <button type="button" onClick={() => removeCostRow(i)} className="text-gray-300 hover:text-red-500 px-2 flex-shrink-0">×</button>
                </div>
              ))}
              <p className="text-right text-xs font-semibold text-gray-700 pt-1 border-t border-gray-100">합계: {totalCost.toLocaleString()}원</p>
            </div>
          )}
        </div>
        <div className="col-span-2">
          <label className={labelCls}>비고</label>
          <input className={inputCls} value={memo} onChange={e => setMemo(e.target.value)} />
        </div>
      </div>
      <div className="flex justify-end">
        <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
          {saving ? "저장 중..." : "이력 추가"}
        </button>
      </div>
    </div>
  );
}

// ── 메인 이력카드 ────────────────────────────────────────────

export default function EquipmentCard({ equipment: initial }: { equipment: Equipment }) {
  const router = useRouter();
  const [eq, setEq] = useState<Equipment>(initial);
  const [completeTarget, setCompleteTarget] = useState<InspectionItem | null>(null);
  const [showRepairForm, setShowRepairForm] = useState(false);
  const [expandedLogs, setExpandedLogs] = useState<Record<string, boolean>>({});

  const toggleLogs = (id: string) =>
    setExpandedLogs(prev => ({ ...prev, [id]: !prev[id] }));

  const handleInspDone = (updated: InspectionItem) => {
    setEq(e => ({
      ...e,
      inspections: e.inspections.map(i => (i.id === updated.id ? updated : i)),
    }));
    setCompleteTarget(null);
  };

  const handleRepairAdded = (log: RepairLog) => {
    setEq(e => ({ ...e, repairs: [log, ...e.repairs] }));
    setShowRepairForm(false);
  };

  return (
    <>
      {completeTarget && (
        <CompleteModal
          item={completeTarget}
          onClose={() => setCompleteTarget(null)}
          onDone={handleInspDone}
        />
      )}

      <div className="space-y-6 max-w-4xl">
        {/* 헤더 */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/management/equipment")}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-800 transition-colors"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400 font-mono">{eq.code}</span>
              <h2 className="text-2xl font-bold text-gray-900">{eq.name}</h2>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${USAGE_COLORS[eq.usage]}`}>
                {USAGE_LABELS[eq.usage]}
              </span>
            </div>
            <p className="text-sm text-gray-500 mt-0.5">{eq.kind}{eq.location ? ` · ${eq.location}` : ""}</p>
          </div>
        </div>

        {/* ① 기본정보 + 사양 */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b bg-gray-50">
            <p className="font-semibold text-gray-800 flex items-center gap-2">
              <Wrench size={15} className="text-blue-600" /> 장비 기본정보
            </p>
          </div>
          <div className="p-5 grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
            {[
              ["관리번호", eq.managementNo],
              ["제조사", eq.maker],
              ["모델명", eq.modelName],
              ["제조년도", eq.madeYear ? String(eq.madeYear) + "년" : null],
              ["취득일", eq.acquiredAt],
              ["취득금액", eq.acquiredCost ? eq.acquiredCost.toLocaleString() + "원" : null],
              ["설치위치", eq.location],
            ].map(([label, val]) => (
              <div key={label as string}>
                <p className="text-xs text-gray-400 mb-0.5">{label}</p>
                <p className="font-medium text-gray-800">{val || <span className="text-gray-300">—</span>}</p>
              </div>
            ))}
            {eq.memo && (
              <div className="col-span-2 sm:col-span-3">
                <p className="text-xs text-gray-400 mb-0.5">비고</p>
                <p className="text-gray-700">{eq.memo}</p>
              </div>
            )}
          </div>

          {/* 사양 */}
          {eq.specs.length > 0 && (
            <>
              <div className="px-5 py-3 border-t border-gray-100 bg-gray-50">
                <p className="text-xs font-semibold text-gray-600">사양 정보</p>
              </div>
              <div className="px-5 py-4">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {eq.specs.map(s => (
                    <div key={s.id} className="bg-gray-50 rounded-lg px-3 py-2">
                      <p className="text-xs text-gray-400">{s.specKey}</p>
                      <p className="text-sm font-semibold text-gray-800 mt-0.5">{s.specValue}</p>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* ② 검사 이력 */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b bg-gray-50 flex items-center justify-between">
            <p className="font-semibold text-gray-800 flex items-center gap-2">
              <CheckCircle size={15} className="text-green-600" /> 검사 이력
            </p>
          </div>
          {eq.inspections.length === 0 ? (
            <div className="py-10 text-center text-gray-400 text-sm">등록된 검사 항목이 없습니다.</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {eq.inspections.map(ins => {
                const status = getInspStatus(ins.nextInspectAt);
                const badge = STATUS_BADGE[status];
                const dday = dDayLabel(ins.nextInspectAt);
                const logsVisible = expandedLogs[ins.id];

                return (
                  <div key={ins.id} className="p-5">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-bold text-gray-900">{ins.itemName}</p>
                          <span className={`flex items-center gap-0.5 text-xs font-semibold px-2 py-0.5 rounded-full ${badge.cls}`}>
                            {badge.icon} {badge.label}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-xs text-gray-500">
                          <span>주기: {ins.periodMonth}개월</span>
                          {ins.lastInspectedAt && <span>최종검사: {ins.lastInspectedAt}</span>}
                          {ins.nextInspectAt && (
                            <span className="flex items-center gap-1">
                              다음검사: {ins.nextInspectAt}
                              {dday && (
                                <span className={`ml-1 font-bold px-1.5 py-0.5 rounded ${dday.cls}`}>
                                  {dday.text}
                                </span>
                              )}
                            </span>
                          )}
                          {ins.inspector && <span>담당: {ins.inspector}</span>}
                        </div>
                      </div>
                      <button
                        onClick={() => setCompleteTarget(ins)}
                        className="flex-shrink-0 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                      >
                        검사 완료
                      </button>
                    </div>

                    {/* 검사 이력 로그 */}
                    {ins.logs.length > 0 && (
                      <div className="mt-3">
                        <button
                          onClick={() => toggleLogs(ins.id)}
                          className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600"
                        >
                          {logsVisible ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                          과거 이력 {ins.logs.length}건
                        </button>
                        {logsVisible && (
                          <div className="mt-2 space-y-1.5">
                            {ins.logs.map(log => (
                              <div key={log.id} className="flex items-center gap-3 text-xs bg-gray-50 rounded-lg px-3 py-2">
                                <span className="font-mono text-gray-600">{log.completedAt}</span>
                                {log.memo && <span className="text-gray-500">{log.memo}</span>}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ③ 수선 이력 */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b bg-gray-50 flex items-center justify-between">
            <p className="font-semibold text-gray-800 flex items-center gap-2">
              <Wrench size={15} className="text-orange-500" /> 수선 이력
            </p>
            <button
              onClick={() => setShowRepairForm(v => !v)}
              className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium"
            >
              <Plus size={13} /> 이력 추가
            </button>
          </div>

          {showRepairForm && (
            <div className="p-5 border-b">
              <RepairForm equipmentId={eq.id} onAdded={handleRepairAdded} />
            </div>
          )}

          {eq.repairs.length === 0 ? (
            <div className="py-10 text-center text-gray-400 text-sm">수선 이력이 없습니다.</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {eq.repairs.map(r => {
                const totalCost = r.costs && r.costs.length > 0
                  ? r.costs.reduce((s, c) => s + c.amount, 0)
                  : (r.cost ?? 0);
                return (
                  <div key={r.id} className="px-5 py-4">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="text-xs font-mono text-gray-500">{(r.repairedAt ?? "").slice(0, 10)}</span>
                      {r.contractor && <span className="text-xs text-gray-500">{r.contractor}</span>}
                      {totalCost > 0 && (
                        <span className="text-xs font-semibold text-gray-700">
                          {totalCost.toLocaleString()}원
                        </span>
                      )}
                      {r.downtimeMinutes != null && r.downtimeMinutes > 0 && (
                        <span className="text-xs font-semibold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">
                          비가동 {Math.floor(r.downtimeMinutes / 60)}시간 {r.downtimeMinutes % 60}분
                        </span>
                      )}
                    </div>
                    {r.cause && (
                      <div className="mt-1.5">
                        <span className="text-[10px] font-semibold text-red-600 bg-red-50 px-1.5 py-0.5 rounded mr-2">고장원인</span>
                        <span className="text-sm text-gray-700">{r.cause}</span>
                      </div>
                    )}
                    <div className="mt-1">
                      <span className="text-[10px] font-semibold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded mr-2">조치내용</span>
                      <span className="text-sm text-gray-800">{r.content}</span>
                    </div>
                    {r.costs && r.costs.length > 0 && (
                      <div className="mt-2 bg-gray-50 rounded-lg px-3 py-2">
                        <p className="text-[10px] font-semibold text-gray-500 mb-1">소모비용 내역</p>
                        <table className="text-xs w-full">
                          <tbody>
                            {r.costs.map((c, i) => (
                              <tr key={i}>
                                <td className="text-gray-600 py-0.5">{c.itemName}</td>
                                <td className="text-right font-semibold text-gray-800 py-0.5">{c.amount.toLocaleString()}원</td>
                              </tr>
                            ))}
                            <tr className="border-t border-gray-200">
                              <td className="text-gray-600 font-semibold pt-1">합계</td>
                              <td className="text-right font-bold text-gray-900 pt-1">{totalCost.toLocaleString()}원</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    )}
                    {r.memo && <p className="text-xs text-gray-400 mt-1">비고: {r.memo}</p>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

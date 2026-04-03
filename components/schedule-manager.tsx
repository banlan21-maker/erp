"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import {
  CalendarDays, Plus, RefreshCw, AlertTriangle,
  Edit2, Trash2, X, Save, BarChart2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import LbPlanManager from "@/components/lb-plan-manager";

// frappe-gantt: SSR 비활성화
const FrappeGantt = dynamic(() => import("@/components/frappe-gantt-wrapper"), { ssr: false });

// ─── 타입 ──────────────────────────────────────────────────────────────────

interface Project { id: string; projectCode: string; projectName: string }

interface GanttItem {
  id: string;
  vesselCode: string;
  blockName: string;
  projectId: string | null;
  plannedStart: string | null;
  plannedEnd: string | null;
  deliveryFactory: string | null;
  deliveryAssembly: string | null;
  workType: string;
  status: string;
  holdReason: string | null;
  priority: number;
  memo: string | null;
  actualStart: string | null;
  actualEnd: string | null;
  completionRate: number;
  totalWeight: number;
  cutWeight: number;
  delayDays: number | null;
  logCount: number;
}

interface LoadItem {
  date: string;
  count: number;
  loadRate: number;
  schedules: string[];
}

// ─── 상수 ──────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  PLANNED: "예정", IN_PROGRESS: "진행중", COMPLETED: "완료",
  HOLD: "홀드", CANCELLED: "취소",
};
const STATUS_COLOR: Record<string, string> = {
  PLANNED:     "bg-blue-100 text-blue-700",
  IN_PROGRESS: "bg-green-100 text-green-700",
  COMPLETED:   "bg-gray-100 text-gray-600",
  HOLD:        "bg-yellow-100 text-yellow-700",
  CANCELLED:   "bg-red-100 text-red-600",
};
const HOLD_REASON_LABEL: Record<string, string> = {
  MATERIAL_DELAY: "강재지연", URGENT: "긴급작업", REVISION: "도면개정", OTHER: "기타",
};

function fmtDate(iso: string | null) {
  if (!iso) return "-";
  return iso.slice(0, 10);
}
function toInputDate(iso: string | null) {
  if (!iso) return "";
  return iso.slice(0, 10);
}
function dDayStr(iso: string | null) {
  if (!iso) return null;
  const diff = Math.floor((new Date(iso).getTime() - Date.now()) / 86400000);
  if (diff === 0) return "D-Day";
  if (diff > 0) return `D-${diff}`;
  return `D+${Math.abs(diff)}`;
}

// ─── 스케줄 입력 폼 모달 ────────────────────────────────────────────────────

function ScheduleFormModal({
  mode, item, projects, onClose, onSaved,
}: {
  mode: "add" | "edit";
  item: GanttItem | null;
  projects: Project[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    projectId:        item?.projectId        ?? "",
    vesselCode:       item?.vesselCode        ?? "",
    blockName:        item?.blockName         ?? "",
    plannedStart:     toInputDate(item?.plannedStart ?? null),
    plannedEnd:       toInputDate(item?.plannedEnd   ?? null),
    deliveryFactory:  toInputDate(item?.deliveryFactory  ?? null),
    deliveryAssembly: toInputDate(item?.deliveryAssembly ?? null),
    workType:         item?.workType   ?? "NORMAL",
    status:           item?.status     ?? "PLANNED",
    holdReason:       item?.holdReason ?? "",
    priority:         String(item?.priority ?? 0),
    memo:             item?.memo       ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 기존 프로젝트 선택 시 vesselCode/blockName 자동 입력
  const handleProjectChange = (projectId: string) => {
    const p = projects.find(p => p.id === projectId);
    setForm(f => ({
      ...f,
      projectId,
      vesselCode: p ? p.projectCode : f.vesselCode,
      blockName:  p ? p.projectName : f.blockName,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.vesselCode.trim() || !form.blockName.trim()) {
      setError("호선 코드와 블록명을 입력해주세요."); return;
    }
    setSaving(true);
    try {
      const payload = {
        projectId:        form.projectId        || null,
        vesselCode:       form.vesselCode,
        blockName:        form.blockName,
        plannedStart:     form.plannedStart     || null,
        plannedEnd:       form.plannedEnd       || null,
        deliveryFactory:  form.deliveryFactory  || null,
        deliveryAssembly: form.deliveryAssembly || null,
        workType:         form.workType,
        status:           form.status,
        holdReason:       form.holdReason       || null,
        priority:         Number(form.priority),
        memo:             form.memo             || null,
      };
      const url    = mode === "add" ? "/api/schedules" : `/api/schedules/${item!.id}`;
      const method = mode === "add" ? "POST" : "PATCH";
      const res  = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!data.success) { setError(data.error); return; }
      onSaved();
    } catch { setError("서버 오류가 발생했습니다."); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl my-4">
        <div className="px-6 py-4 border-b flex items-center justify-between bg-gray-50 rounded-t-xl">
          <h3 className="font-bold text-lg flex items-center gap-2">
            <CalendarDays size={18} className="text-blue-600" />
            {mode === "add" ? "스케줄 등록" : "스케줄 수정"}
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded-full"><X size={18} /></button>
        </div>

        {error && (
          <div className="mx-6 mt-4 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm flex items-center gap-2">
            <AlertTriangle size={14} /> {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* 기존 프로젝트 연결 */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">기존 블록 연결 <span className="text-gray-400 font-normal">(선택 — 자재 미등록 시 직접 입력)</span></label>
            <select
              value={form.projectId}
              onChange={e => handleProjectChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">-- 직접 입력 --</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>[{p.projectCode}] {p.projectName}</option>
              ))}
            </select>
          </div>

          {/* 호선/블록 직접 입력 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">호선 코드 <span className="text-red-500">*</span></label>
              <Input value={form.vesselCode} onChange={e => setForm(f => ({ ...f, vesselCode: e.target.value }))} placeholder="예: 4560" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">블록명 <span className="text-red-500">*</span></label>
              <Input value={form.blockName} onChange={e => setForm(f => ({ ...f, blockName: e.target.value }))} placeholder="예: D101" />
            </div>
          </div>

          {/* 일정 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">절단 시작 예정일</label>
              <Input type="date" value={form.plannedStart} onChange={e => setForm(f => ({ ...f, plannedStart: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">절단 완료 예정일</label>
              <Input type="date" value={form.plannedEnd} onChange={e => setForm(f => ({ ...f, plannedEnd: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">가공장 납기일</label>
              <Input type="date" value={form.deliveryFactory} onChange={e => setForm(f => ({ ...f, deliveryFactory: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">조립장 납기일</label>
              <Input type="date" value={form.deliveryAssembly} onChange={e => setForm(f => ({ ...f, deliveryAssembly: e.target.value }))} />
            </div>
          </div>

          {/* 작업구분 / 상태 / 우선순위 */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">작업 구분</label>
              <select value={form.workType} onChange={e => setForm(f => ({ ...f, workType: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="NORMAL">일반</option>
                <option value="REVISION">도면개정</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">상태</label>
              <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="PLANNED">예정</option>
                <option value="IN_PROGRESS">진행중</option>
                <option value="COMPLETED">완료</option>
                <option value="HOLD">홀드</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">우선순위 <span className="text-gray-400 text-xs">(낮을수록 우선)</span></label>
              <Input type="number" min="0" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))} />
            </div>
          </div>

          {/* 중단 사유 (홀드 시) */}
          {form.status === "HOLD" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">중단 사유</label>
              <select value={form.holdReason} onChange={e => setForm(f => ({ ...f, holdReason: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">선택</option>
                <option value="MATERIAL_DELAY">강재지연</option>
                <option value="URGENT">긴급작업</option>
                <option value="REVISION">도면개정</option>
                <option value="OTHER">기타</option>
              </select>
            </div>
          )}

          {/* 비고 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">비고</label>
            <textarea value={form.memo} onChange={e => setForm(f => ({ ...f, memo: e.target.value }))}
              rows={2} className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="특이사항" />
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
            <Button type="button" variant="outline" onClick={onClose}>취소</Button>
            <Button type="submit" disabled={saving} className="bg-blue-600 hover:bg-blue-700 font-bold">
              <Save size={14} className="mr-1.5" />
              {saving ? "저장 중..." : mode === "add" ? "등록" : "저장"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── 부하 그래프 ────────────────────────────────────────────────────────────

function LoadChart({ loadData }: { loadData: LoadItem[] }) {
  const max = Math.max(...loadData.map(d => d.count), 4);
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
        <BarChart2 size={15} className="text-blue-500" /> 일별 CNC 부하 (플라즈마 4대 기준)
      </h3>
      <div className="flex items-end gap-1.5 h-28 overflow-x-auto pb-2">
        {loadData.map(d => {
          const height = Math.round((d.count / max) * 100);
          const color  = d.loadRate >= 100 ? "bg-red-500" : d.loadRate >= 75 ? "bg-yellow-400" : "bg-blue-400";
          const isToday = d.date === new Date().toISOString().slice(0, 10);
          return (
            <div key={d.date} className="flex flex-col items-center gap-1 min-w-[28px] group relative">
              <div className={`w-5 rounded-t transition-all ${color} ${isToday ? "ring-2 ring-offset-1 ring-blue-600" : ""}`}
                style={{ height: `${Math.max(height, 4)}%` }} />
              <span className={`text-[9px] ${isToday ? "text-blue-600 font-bold" : "text-gray-400"} rotate-45 origin-left`}>
                {d.date.slice(5)}
              </span>
              {/* 툴팁 */}
              {d.count > 0 && (
                <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover:block bg-gray-900 text-white text-xs rounded-lg px-2 py-1.5 z-10 w-max max-w-xs shadow-xl">
                  <p className="font-bold">{d.date} — {d.count}블록 ({d.loadRate}%)</p>
                  {d.schedules.slice(0, 5).map((s, i) => <p key={i} className="text-gray-300">• {s}</p>)}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
        <span className="flex items-center gap-1"><span className="w-3 h-3 bg-blue-400 rounded-sm" /> 여유 (&lt;75%)</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 bg-yellow-400 rounded-sm" /> 주의 (75~99%)</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 bg-red-500 rounded-sm" /> 과부하 (≥100%)</span>
      </div>
    </div>
  );
}

// ─── 메인 컴포넌트 ─────────────────────────────────────────────────────────

export default function ScheduleManager({ projects }: { projects: Project[] }) {
  const [mainTab, setMainTab] = useState<"cut" | "lb">("cut");

  const [ganttData,  setGanttData]  = useState<GanttItem[]>([]);
  const [loadData,   setLoadData]   = useState<LoadItem[]>([]);
  const [loading,    setLoading]    = useState(true);

  const [showCompleted, setShowCompleted] = useState(false);

  const [scheduleModal, setScheduleModal] = useState<{ open: boolean; mode: "add" | "edit"; item: GanttItem | null }>
    ({ open: false, mode: "add", item: null });

  // 부하 그래프 기간 (오늘부터 60일)
  const loadFrom = new Date().toISOString().slice(0, 10);
  const loadTo   = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [ganttRes, loadRes] = await Promise.all([
        fetch(`/api/schedules/gantt?includeArchive=false&includeCompleted=${showCompleted}`),
        fetch(`/api/schedules/load?from=${loadFrom}&to=${loadTo}`),
      ]);
      const [ganttJson, loadJson] = await Promise.all([
        ganttRes.json(), loadRes.json(),
      ]);
      if (ganttJson.success) setGanttData(ganttJson.data);
      if (loadJson.success)  setLoadData(loadJson.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [showCompleted]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleDeleteSchedule = async (id: string) => {
    if (!confirm("이 스케줄을 삭제하시겠습니까?")) return;
    await fetch(`/api/schedules/${id}`, { method: "DELETE" });
    fetchAll();
  };

  // 미배치 블록 (plannedStart 없는 스케줄)
  const unscheduled = ganttData.filter(d => !d.plannedStart);
  const scheduled   = ganttData.filter(d => !!d.plannedStart);

  // 탭 전환 시 절단생성 탭만 데이터 로딩
  useEffect(() => { if (mainTab === "cut") fetchAll(); }, [mainTab]);

  const tabCls = (t: "cut" | "lb") =>
    `px-4 py-2 text-sm font-semibold rounded-t-md border-b-2 transition-colors ${
      mainTab === t
        ? "border-blue-600 text-blue-600 bg-white"
        : "border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50"
    }`;

  return (
    <div className="space-y-5">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <CalendarDays size={24} className="text-blue-600" /> 스케줄 생성
          </h2>
          <p className="text-sm text-gray-500 mt-1">절단 일정 배치 및 L/B 생산계획을 관리합니다.</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
            <input type="checkbox" checked={showCompleted} onChange={e => setShowCompleted(e.target.checked)} className="rounded" />
            완료 포함
          </label>
          {mainTab === "cut" && (
            <>
              <Button variant="outline" size="sm" onClick={fetchAll} className="text-xs">
                <RefreshCw size={13} className="mr-1" /> 새로고침
              </Button>
              <Button size="sm" onClick={() => setScheduleModal({ open: true, mode: "add", item: null })}
                className="bg-blue-600 hover:bg-blue-700 text-xs font-bold">
                <Plus size={13} className="mr-1" /> 스케줄 등록
              </Button>
            </>
          )}
        </div>
      </div>

      {/* 탭 */}
      <div className="flex gap-1 border-b border-gray-200">
        <button className={tabCls("cut")} onClick={() => setMainTab("cut")}>절단생성</button>
        <button className={tabCls("lb")} onClick={() => setMainTab("lb")}>L/B생성</button>
      </div>

      {/* L/B생성 탭 */}
      {mainTab === "lb" && <LbPlanManager />}

      {/* 절단생성 탭 */}
      {mainTab === "cut" && loading ? (
        <div className="flex justify-center items-center py-20 text-gray-400 gap-3">
          <RefreshCw className="animate-spin text-blue-500" size={24} /> 데이터를 불러오는 중...
        </div>
      ) : mainTab === "cut" ? (
        <>
          {/* 부하 그래프 */}
          {loadData.length > 0 && <LoadChart loadData={loadData} />}

          {/* 간트차트 */}
          {scheduled.length > 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-700">간트차트 ({scheduled.length}건)</span>
                <span className="text-xs text-gray-400">블록 클릭 시 상세 편집</span>
              </div>
              <div className="p-4" style={{ minHeight: 720 }}>
                <FrappeGantt
                  items={scheduled}
                  onItemClick={(item) => setScheduleModal({ open: true, mode: "edit", item })}
                  onDateChange={async (id, start, end) => {
                    // 낙관적 로컬 업데이트 → Gantt가 refresh()만 하고 재빌드 안 함
                    setGanttData(prev => prev.map(item =>
                      item.id === id ? { ...item, plannedStart: start, plannedEnd: end } : item
                    ));
                    await fetch(`/api/schedules/${id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ plannedStart: start, plannedEnd: end }),
                    });
                  }}
                />
              </div>
            </div>
          ) : (
            <div className="text-center py-12 bg-white rounded-xl border border-dashed border-gray-300 text-gray-400">
              <CalendarDays size={36} className="mx-auto mb-2 opacity-30" />
              <p>등록된 스케줄이 없습니다. 우측 패널에서 스케줄을 등록하세요.</p>
            </div>
          )}

          {/* 미배치 블록 */}
          {unscheduled.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b bg-gray-50">
                <span className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-gray-400" />
                  미배치 블록 ({unscheduled.length}건)
                </span>
              </div>
              <div className="divide-y divide-gray-50">
                {unscheduled.map(item => (
                  <div key={item.id} className="px-4 py-3 flex items-center justify-between hover:bg-gray-50">
                    <div>
                      <p className="text-sm font-semibold text-gray-800">[{item.vesselCode}] {item.blockName}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[item.status]}`}>
                          {STATUS_LABEL[item.status]}
                        </span>
                        {item.workType === "REVISION" && (
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">도면개정</span>
                        )}
                      </div>
                    </div>
                    <button onClick={() => setScheduleModal({ open: true, mode: "edit", item })}
                      className="text-xs px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-md font-semibold transition-colors">
                      일정 배치
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 전체 스케줄 목록 (테이블) */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-700">전체 스케줄 목록 ({ganttData.length}건)</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left whitespace-nowrap">
                <thead className="bg-gray-50 border-b text-xs text-gray-500 uppercase">
                  <tr>
                    <th className="px-4 py-2.5">호선</th>
                    <th className="px-4 py-2.5">블록</th>
                    <th className="px-4 py-2.5">상태</th>
                    <th className="px-4 py-2.5">계획 시작</th>
                    <th className="px-4 py-2.5">계획 완료</th>
                    <th className="px-4 py-2.5">가공장 납기</th>
                    <th className="px-4 py-2.5">조립장 납기</th>
                    <th className="px-4 py-2.5 text-right">완료율</th>
                    <th className="px-4 py-2.5 text-right">지연</th>
                    <th className="px-4 py-2.5 text-center">액션</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {ganttData.length === 0 ? (
                    <tr><td colSpan={10} className="px-4 py-10 text-center text-gray-400">스케줄이 없습니다.</td></tr>
                  ) : ganttData.map(item => {
                    const isOverdue = item.plannedEnd && item.completionRate < 100 && new Date(item.plannedEnd) < new Date();
                    return (
                      <tr key={item.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-mono text-xs text-gray-600">{item.vesselCode}</td>
                        <td className="px-4 py-3 font-semibold text-gray-800">{item.blockName}</td>
                        <td className="px-4 py-3">
                          <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[item.status]}`}>
                            {STATUS_LABEL[item.status]}
                          </span>
                          {item.holdReason && (
                            <span className="ml-1 text-[11px] px-1.5 py-0.5 rounded bg-yellow-50 text-yellow-600">
                              {HOLD_REASON_LABEL[item.holdReason]}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-600">{fmtDate(item.plannedStart)}</td>
                        <td className={`px-4 py-3 text-xs ${isOverdue ? "text-red-600 font-bold" : "text-gray-600"}`}>
                          {fmtDate(item.plannedEnd)}
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {item.deliveryFactory ? (
                            <span className={new Date(item.deliveryFactory) < new Date() && item.status !== "COMPLETED" ? "text-red-600 font-bold" : "text-gray-600"}>
                              {fmtDate(item.deliveryFactory)} <span className="text-gray-400">({dDayStr(item.deliveryFactory)})</span>
                            </span>
                          ) : <span className="text-gray-300">-</span>}
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {item.deliveryAssembly ? (
                            <span className={new Date(item.deliveryAssembly) < new Date() && item.status !== "COMPLETED" ? "text-red-600 font-bold" : "text-gray-600"}>
                              {fmtDate(item.deliveryAssembly)} <span className="text-gray-400">({dDayStr(item.deliveryAssembly)})</span>
                            </span>
                          ) : <span className="text-gray-300">-</span>}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${item.completionRate === 100 ? "bg-green-500" : isOverdue ? "bg-red-500" : "bg-blue-500"}`}
                                style={{ width: `${item.completionRate}%` }} />
                            </div>
                            <span className={`text-xs font-bold ${item.completionRate === 100 ? "text-green-600" : isOverdue ? "text-red-600" : "text-gray-700"}`}>
                              {item.completionRate}%
                            </span>
                          </div>
                        </td>
                        <td className={`px-4 py-3 text-right text-xs font-bold ${item.delayDays !== null && item.delayDays > 0 ? "text-red-600" : item.delayDays !== null && item.delayDays < 0 ? "text-green-600" : "text-gray-400"}`}>
                          {item.delayDays !== null ? (item.delayDays > 0 ? `+${item.delayDays}일` : item.delayDays < 0 ? `${item.delayDays}일` : "정시") : "-"}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={() => setScheduleModal({ open: true, mode: "edit", item })}
                              className="p-1.5 text-blue-400 hover:bg-blue-50 rounded-md"><Edit2 size={13} /></button>
                            <button onClick={() => handleDeleteSchedule(item.id)}
                              className="p-1.5 text-red-400 hover:bg-red-50 rounded-md"><Trash2 size={13} /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}

      {/* 모달 */}
      {scheduleModal.open && (
        <ScheduleFormModal
          mode={scheduleModal.mode}
          item={scheduleModal.item}
          projects={projects}
          onClose={() => setScheduleModal(m => ({ ...m, open: false }))}
          onSaved={() => { setScheduleModal(m => ({ ...m, open: false })); fetchAll(); }}
        />
      )}
    </div>
  );
}

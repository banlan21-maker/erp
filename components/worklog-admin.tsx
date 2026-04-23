"use client";

import { useState, useEffect, useMemo } from "react";
import {
  ClipboardList, RefreshCw, Plus, Edit2, Trash2,
  AlertCircle, Search, X, Save, Zap, AlertTriangle, Filter, XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import ColumnFilterDropdown, { type FilterValue } from "@/components/column-filter-dropdown";

// ─── 타입 ──────────────────────────────────────────────────────────────────

interface Equipment { id: string; name: string; type: string }
interface Project   { id: string; projectCode: string; projectName: string }
interface Worker    { id: string; name: string }

interface UrgentWork {
  id: string;
  urgentNo: string;
  title: string;
  urgency: string;
  requester: string | null;
  department: string | null;
  dueDate: string | null;
  status: string;
  registeredBy: string | null;
  memo: string | null;
  materialMemo: string | null;
  drawingNo: string | null;
  destination: string | null;
  vesselName: string | null;
  project: { projectCode: string; projectName: string } | null;
  remnant: { remnantNo: string; material: string; thickness: number; needsConsult: boolean } | null;
  requestDate: string;
  createdAt: string;
}

interface Drawing {
  id: string;
  projectId: string;
  project: { id: string; projectCode: string; projectName: string } | null;
  block: string | null;
  drawingNo: string | null;
  heatNo: string | null;
  material: string;
  thickness: number;
  width: number;
  length: number;
  qty: number;
  useWeight: number | null;
  status: string;
}

interface CuttingLog {
  id: string;
  drawingListId: string | null;
  equipmentId: string;
  equipment: { id: string; name: string; type: string };
  project: { projectCode: string; projectName: string } | null;
  drawingList: { drawingNo: string | null; block: string | null; useWeight: number | null } | null;
  heatNo: string;
  material: string | null;
  thickness: number | null;
  width: number | null;
  length: number | null;
  qty: number | null;
  drawingNo: string | null;
  operator: string;
  status: "STARTED" | "COMPLETED";
  startAt: string;
  endAt: string | null;
  memo: string | null;
}

function calcSteelWeight(t: number, w: number, l: number): number {
  return Math.round(t * w * l * 7.85 / 1_000_000 * 10) / 10;
}

// ─── 컬럼 정의 (순서 = 테이블 표시 순서) ─────────────────────────────────

const COLUMNS = [
  { key: "hosin",     label: "호선",    align: "left"  as const, filterable: true  },
  { key: "block",     label: "블록",    align: "left"  as const, filterable: true  },
  { key: "drawingNo", label: "도면번호", align: "left"  as const, filterable: true  },
  { key: "material",  label: "재질",    align: "left"  as const, filterable: true  },
  { key: "thickness", label: "두께",    align: "right" as const, filterable: true  },
  { key: "width",     label: "폭",      align: "right" as const, filterable: true  },
  { key: "length",      label: "길이",    align: "right" as const, filterable: true  },
  { key: "steelWeight", label: "철판중량", align: "right" as const, filterable: false },
  { key: "useWeight",   label: "사용중량", align: "right" as const, filterable: false },
  { key: "heatNo",      label: "Heat NO", align: "left"  as const, filterable: true  },
  { key: "status",    label: "강재상태", align: "left"  as const, filterable: true  },
  { key: "operator",  label: "작업자",  align: "left"  as const, filterable: true  },
  { key: "equipment", label: "장비",    align: "left"  as const, filterable: true  },
  { key: "duration",  label: "작업시간", align: "left"  as const, filterable: false },
  { key: "memo",      label: "비고",    align: "left"  as const, filterable: false },
] as const;
type ColKey = (typeof COLUMNS)[number]["key"];
const FILTER_COLS = COLUMNS.filter(c => c.filterable);
type FCKey = (typeof FILTER_COLS)[number]["key"];

// ─── 헬퍼 ──────────────────────────────────────────────────────────────────

const URGENCY_LABEL: Record<string, string>  = { URGENT: "⚡ 긴급", FLEXIBLE: "✅ 여유있음", PRECUT: "📦 선행절단" };
const URGENCY_COLOR: Record<string, string>  = {
  URGENT:   "bg-red-100 text-red-700 border-red-300",
  FLEXIBLE: "bg-green-100 text-green-700 border-green-300",
  PRECUT:   "bg-blue-100 text-blue-700 border-blue-300",
};
const USTATUS_LABEL: Record<string, string>  = { PENDING: "대기", IN_PROGRESS: "진행중", COMPLETED: "완료" };
const USTATUS_COLOR: Record<string, string>  = {
  PENDING:     "bg-yellow-100 text-yellow-700",
  IN_PROGRESS: "bg-blue-100 text-blue-700",
  COMPLETED:   "bg-green-100 text-green-700",
};
const TYPE_LABEL:   Record<string, string> = { PLASMA: "플라즈마", GAS: "가스" };
const STATUS_LABEL: Record<string, string> = {
  STARTED:   "진행중",
  COMPLETED: "완료",
};
const STATUS_COLOR: Record<string, string> = {
  STARTED:   "bg-yellow-100 text-yellow-700",
  COMPLETED: "bg-green-100 text-green-700",
};

function fmtDt(iso: string) {
  const d = new Date(iso);
  return `${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}
function fmtDuration(start: string, end: string | null) {
  if (!end) return "-";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}시간 ${m}분` : `${m}분`;
}
function toLocalDatetimeValue(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ─── 돌발 수정 모달 ────────────────────────────────────────────────────────

function UrgentEditModal({
  work, onClose, onSaved,
}: { work: UrgentWork; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    title:        work.title,
    urgency:      work.urgency,
    requester:    work.requester ?? "",
    department:   work.department ?? "",
    dueDate:      work.dueDate ? work.dueDate.slice(0, 10) : "",
    materialMemo: work.materialMemo ?? "",
    drawingNo:    work.drawingNo ?? "",
    destination:  work.destination ?? "",
    registeredBy: work.registeredBy ?? "",
    memo:         work.memo ?? "",
    status:       work.status,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) { setError("작업명을 입력해주세요."); return; }
    setSaving(true);
    try {
      const res  = await fetch(`/api/urgent-works/${work.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title:        form.title,
          urgency:      form.urgency,
          requester:    form.requester    || null,
          department:   form.department   || null,
          dueDate:      form.dueDate      || null,
          materialMemo: form.materialMemo || null,
          drawingNo:    form.drawingNo    || null,
          destination:  form.destination  || null,
          registeredBy: form.registeredBy || null,
          memo:         form.memo         || null,
          status:       form.status,
        }),
      });
      const data = await res.json();
      if (!data.success) { setError(data.error); return; }
      onSaved();
    } catch { setError("서버 오류"); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg my-4">
        <div className="px-6 py-4 border-b flex items-center justify-between bg-orange-50 rounded-t-xl">
          <h3 className="font-bold text-lg flex items-center gap-2 text-orange-700">
            <Zap size={18} className="text-orange-500" /> 돌발작업 수정
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-orange-100 rounded-full"><X size={18} /></button>
        </div>
        {error && (
          <div className="mx-6 mt-4 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm flex items-center gap-2">
            <AlertCircle size={14} /> {error}
          </div>
        )}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">작업명 <span className="text-red-500">*</span></label>
            <Input value={form.title} onChange={e => set("title", e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            {["URGENT","FLEXIBLE","PRECUT"].map(v => (
              <label key={v} className={`flex flex-col items-center px-2 py-2 rounded-xl border-2 cursor-pointer text-xs font-semibold transition-all ${
                form.urgency === v ? URGENCY_COLOR[v] : "border-gray-200 text-gray-500"
              }`}>
                <input type="radio" className="hidden" name="urgency-edit" value={v} checked={form.urgency === v} onChange={() => set("urgency", v)} />
                {URGENCY_LABEL[v]}
              </label>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">요청자</label>
              <Input value={form.requester} onChange={e => set("requester", e.target.value)} placeholder="이름" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">부서</label>
              <Input value={form.department} onChange={e => set("department", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">납기일</label>
              <Input type="date" value={form.dueDate} onChange={e => set("dueDate", e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">상태</label>
              <select value={form.status} onChange={e => set("status", e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="PENDING">대기</option>
                <option value="IN_PROGRESS">진행중</option>
                <option value="COMPLETED">완료</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">재질 메모</label>
              <Input value={form.materialMemo} onChange={e => set("materialMemo", e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">도면번호</label>
              <Input value={form.drawingNo} onChange={e => set("drawingNo", e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">도착지</label>
              <Input value={form.destination} onChange={e => set("destination", e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">등록자</label>
              <Input value={form.registeredBy} onChange={e => set("registeredBy", e.target.value)} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">비고</label>
            <textarea value={form.memo} onChange={e => set("memo", e.target.value)} rows={2}
              className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
            <Button type="button" variant="outline" onClick={onClose}>취소</Button>
            <Button type="submit" disabled={saving} className="bg-orange-500 hover:bg-orange-600 font-bold">
              <Save size={14} className="mr-1.5" />{saving ? "저장 중..." : "수정 저장"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── 돌발 탭 ───────────────────────────────────────────────────────────────

function UrgentWorkTab() {
  const [works,          setWorks]          = useState<UrgentWork[]>([]);
  const [loading,        setLoading]        = useState(false);
  const [statusFilter,   setStatusFilter]   = useState("");
  const [urgencyFilter,  setUrgencyFilter]  = useState("");
  const [editWork,       setEditWork]       = useState<UrgentWork | null>(null);

  const fetchWorks = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter)  params.set("status",  statusFilter);
      if (urgencyFilter) params.set("urgency", urgencyFilter);
      const res  = await fetch(`/api/urgent-works?${params}`);
      const data = await res.json();
      if (data.success) setWorks(data.data);
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchWorks(); }, [statusFilter, urgencyFilter]);

  const handleDelete = async (id: string) => {
    if (!confirm("이 돌발작업을 삭제할까요?")) return;
    await fetch(`/api/urgent-works/${id}`, { method: "DELETE" });
    fetchWorks();
  };

  const handleStatusChange = async (id: string, status: string) => {
    await fetch(`/api/urgent-works/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    fetchWorks();
  };

  const pendingCount = works.filter(w => w.status === "PENDING").length;
  const inProgCount  = works.filter(w => w.status === "IN_PROGRESS").length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4 bg-white border border-gray-200 rounded-xl px-5 py-3 shadow-sm text-sm">
        <span className="text-gray-500">전체 <strong className="text-gray-900">{works.length}</strong>건</span>
        <span className="text-yellow-600">대기 <strong>{pendingCount}</strong>건</span>
        <span className="text-blue-600">진행중 <strong>{inProgCount}</strong>건</span>
        <span className="text-green-600">완료 <strong>{works.filter(w => w.status === "COMPLETED").length}</strong>건</span>
        <button onClick={fetchWorks} className="ml-auto flex items-center gap-1.5 text-xs text-gray-500 hover:text-blue-600">
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> 새로고침
        </button>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="flex gap-1.5">
          {[["", "전체"], ["PENDING", "대기"], ["IN_PROGRESS", "진행중"], ["COMPLETED", "완료"]].map(([v, l]) => (
            <button key={v} onClick={() => setStatusFilter(v)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                statusFilter === v ? "bg-gray-800 text-white border-gray-800" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
              }`}>{l}</button>
          ))}
        </div>
        <div className="flex gap-1.5 ml-auto">
          {[["", "전체"], ["URGENT", "⚡ 긴급"], ["FLEXIBLE", "✅ 여유"], ["PRECUT", "📦 선행"]].map(([v, l]) => (
            <button key={v} onClick={() => setUrgencyFilter(v)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                urgencyFilter === v ? "bg-orange-500 text-white border-orange-500" : "bg-white text-gray-600 border-gray-200 hover:border-orange-300"
              }`}>{l}</button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-20 text-gray-400 gap-3">
          <RefreshCw className="animate-spin text-blue-500" size={24} /> 불러오는 중...
        </div>
      ) : works.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-dashed border-gray-200 text-gray-400">
          <Zap size={36} className="mx-auto mb-3 opacity-20" />
          <p>등록된 돌발작업이 없습니다.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left whitespace-nowrap">
              <thead className="bg-gray-50 border-b border-gray-100 text-xs text-gray-500 uppercase">
                <tr>
                  <th className="px-4 py-2.5">돌발번호</th>
                  <th className="px-4 py-2.5">작업명</th>
                  <th className="px-4 py-2.5">긴급도</th>
                  <th className="px-4 py-2.5">요청자/부서</th>
                  <th className="px-4 py-2.5">납기일</th>
                  <th className="px-4 py-2.5">호선</th>
                  <th className="px-4 py-2.5">재질메모</th>
                  <th className="px-4 py-2.5">잔재</th>
                  <th className="px-4 py-2.5">상태</th>
                  <th className="px-4 py-2.5 text-center">액션</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {works.map(w => (
                  <tr key={w.id} className={`transition-colors ${w.urgency === "URGENT" ? "hover:bg-red-50/30" : "hover:bg-gray-50"}`}>
                    <td className="px-4 py-3 font-mono text-xs font-bold text-gray-700">{w.urgentNo}</td>
                    <td className="px-4 py-3 font-semibold text-gray-900 max-w-[160px] truncate">{w.title}</td>
                    <td className="px-4 py-3">
                      <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold border ${URGENCY_COLOR[w.urgency] ?? "bg-gray-100 text-gray-600 border-gray-200"}`}>
                        {URGENCY_LABEL[w.urgency] ?? w.urgency}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">
                      {w.requester || "-"}
                      {w.department && <span className="text-gray-400 ml-1">/ {w.department}</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">{w.dueDate ? w.dueDate.slice(0,10) : "-"}</td>
                    <td className="px-4 py-3 text-xs text-gray-600">
                      {w.project ? `[${w.project.projectCode}] ${w.project.projectName}` : w.vesselName || "-"}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 max-w-[120px] truncate">{w.materialMemo || "-"}</td>
                    <td className="px-4 py-3 text-xs">
                      {w.remnant ? (
                        <span className={w.remnant.needsConsult ? "text-purple-700 flex items-center gap-1" : "text-gray-600"}>
                          {w.remnant.needsConsult && <AlertTriangle size={11} />}
                          {w.remnant.remnantNo}
                        </span>
                      ) : <span className="text-gray-400">-</span>}
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={w.status}
                        onChange={e => handleStatusChange(w.id, e.target.value)}
                        className={`text-[11px] px-2 py-1 rounded-full font-semibold border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-400 ${USTATUS_COLOR[w.status] ?? "bg-gray-100 text-gray-600"}`}
                      >
                        <option value="PENDING">대기</option>
                        <option value="IN_PROGRESS">진행중</option>
                        <option value="COMPLETED">완료</option>
                      </select>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => setEditWork(w)} className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-md" title="수정">
                          <Edit2 size={13} />
                        </button>
                        <button onClick={() => handleDelete(w.id)} className="p-1.5 text-red-400 hover:bg-red-50 rounded-md" title="삭제">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {editWork && (
        <UrgentEditModal
          work={editWork}
          onClose={() => setEditWork(null)}
          onSaved={() => { setEditWork(null); fetchWorks(); }}
        />
      )}
    </div>
  );
}

// ─── 로그 등록/수정 모달 ────────────────────────────────────────────────────

function LogModal({
  mode, drawing, log, equipment, workers, projectId, onClose, onSaved,
}: {
  mode: "add" | "edit";
  drawing: Drawing | null;
  log: CuttingLog | null;
  equipment: Equipment[];
  workers: Worker[];
  projectId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    equipmentId: log?.equipmentId ?? equipment[0]?.id ?? "",
    operator:    log?.operator ?? "",
    heatNo:      log?.heatNo ?? drawing?.heatNo ?? "",
    startAt:     toLocalDatetimeValue(log?.startAt ?? new Date().toISOString()),
    endAt:       toLocalDatetimeValue(log?.endAt ?? null),
    status:      log?.status ?? "COMPLETED",
    memo:        log?.memo ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stuckLog, setStuckLog] = useState<{ id: string; heatNo: string; drawingNo: string | null; operator: string; startAt: string; project: string | null } | null>(null);
  const [heatOptions, setHeatOptions] = useState<{ id: string; heatNo: string }[]>([]);

  useEffect(() => {
    if (!drawing) return;
    const p = new URLSearchParams({
      material:   drawing.material,
      thickness:  String(drawing.thickness),
      width:      String(drawing.width),
      length:     String(drawing.length),
    });
    fetch(`/api/steel-plan/heat-options?${p}`)
      .then(r => r.json())
      .then(setHeatOptions)
      .catch(() => {});
  }, [drawing]);
  const [forceClosing, setForceClosing] = useState(false);

  const handleForceClose = async () => {
    if (!stuckLog) return;
    setForceClosing(true);
    try {
      await fetch(`/api/cutting-logs/${stuckLog.id}`, { method: "DELETE" });
      setStuckLog(null);
      setError(null);
    } catch {
      setError("강제 종료 중 오류가 발생했습니다.");
    } finally {
      setForceClosing(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setStuckLog(null);
    if (!form.equipmentId || !form.operator.trim() || !form.startAt) {
      setError("장비, 작업자, 시작일시는 필수입니다.");
      return;
    }
    setSaving(true);
    try {
      if (mode === "add") {
        const res = await fetch("/api/cutting-logs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            equipmentId:   form.equipmentId,
            projectId,
            drawingListId: drawing?.id ?? null,
            heatNo:        form.heatNo || (drawing?.heatNo ?? ""),
            material:      drawing?.material ?? null,
            thickness:     drawing?.thickness ?? null,
            width:         drawing?.width ?? null,
            length:        drawing?.length ?? null,
            qty:           drawing?.qty ?? null,
            drawingNo:     drawing?.drawingNo ?? null,
            operator:      form.operator,
            memo:          form.memo || null,
            startAt:       form.startAt ? new Date(form.startAt).toISOString() : undefined,
          }),
        });
        const data = await res.json();
        if (!data.success) {
          setError(data.error);
          if (data.stuckLog) setStuckLog(data.stuckLog);
          return;
        }
        if (form.endAt && data.data?.id) {
          await fetch(`/api/cutting-logs/${data.data.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action:  "complete",
              memo:    form.memo || null,
              startAt: form.startAt ? new Date(form.startAt).toISOString() : undefined,
              endAt:   new Date(form.endAt).toISOString(),
            }),
          });
        }
      } else if (log) {
        const res = await fetch(`/api/cutting-logs/${log.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            equipmentId: form.equipmentId,
            operator:    form.operator,
            heatNo:      form.heatNo || null,
            startAt:     form.startAt ? new Date(form.startAt).toISOString() : undefined,
            endAt:       form.endAt   ? new Date(form.endAt).toISOString()   : null,
            status:      form.endAt ? "COMPLETED" : "STARTED",
            memo:        form.memo || null,
          }),
        });
        const data = await res.json();
        if (!data.success) { setError(data.error); return; }
      }
      onSaved();
    } catch {
      setError("서버 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
          <h3 className="font-bold text-lg text-gray-900 flex items-center gap-2">
            {mode === "add" ? <Plus size={18} className="text-blue-600" /> : <Edit2 size={18} className="text-blue-600" />}
            {mode === "add" ? "작업일보 추가 등록" : "작업일보 수정"}
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded-full transition-colors"><X size={18} /></button>
        </div>

        {drawing && (
          <div className="px-6 py-3 bg-blue-50 border-b border-blue-100 text-xs text-blue-800">
            <span className="font-semibold">강재:</span>{" "}
            {drawing.drawingNo && <span className="font-mono mr-2">{drawing.drawingNo}</span>}
            {drawing.block && <span className="mr-2">[{drawing.block}]</span>}
            <span>{drawing.material} {drawing.thickness}t × {drawing.width} × {drawing.length} ({drawing.qty}매)</span>
          </div>
        )}

        {error && (
          <div className="mx-6 mt-4 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm space-y-2">
            <div className="flex items-center gap-2"><AlertCircle size={14} /> {error}</div>
            {stuckLog && (
              <div className="bg-red-100 rounded p-2 text-xs space-y-1">
                <div className="font-semibold text-red-800">미종료 작업 정보:</div>
                <div>
                  {stuckLog.project && <span className="mr-2">호선: {stuckLog.project}</span>}
                  {stuckLog.heatNo && <span className="mr-2">판번호: {stuckLog.heatNo}</span>}
                  {stuckLog.drawingNo && <span className="mr-2">도면: {stuckLog.drawingNo}</span>}
                  <span className="mr-2">작업자: {stuckLog.operator}</span>
                  <span>시작: {new Date(stuckLog.startAt).toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                </div>
                <button
                  type="button"
                  onClick={handleForceClose}
                  disabled={forceClosing}
                  className="mt-1 px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-semibold disabled:opacity-50"
                >
                  {forceClosing ? "처리중..." : "미종료 작업 강제 삭제 후 재시도"}
                </button>
              </div>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-800 mb-1.5">장비 <span className="text-red-500">*</span></label>
            <select
              value={form.equipmentId}
              onChange={e => setForm(f => ({ ...f, equipmentId: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {equipment.map(eq => (
                <option key={eq.id} value={eq.id}>{eq.name} ({TYPE_LABEL[eq.type] ?? eq.type})</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-800 mb-1.5">작업자 <span className="text-red-500">*</span></label>
            <div className="flex gap-2">
              <Input
                value={form.operator}
                onChange={e => setForm(f => ({ ...f, operator: e.target.value }))}
                placeholder="작업자명 직접 입력"
                className="flex-1"
              />
              {workers.length > 0 && (
                <select
                  onChange={e => { if (e.target.value) setForm(f => ({ ...f, operator: e.target.value })); }}
                  className="px-2 py-1.5 border border-gray-200 rounded-md text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  defaultValue=""
                >
                  <option value="">목록 선택</option>
                  {workers.map(w => <option key={w.id} value={w.name}>{w.name}</option>)}
                </select>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Heat NO (판번호)</label>
            {heatOptions.length > 0 ? (
              <select
                value={form.heatNo}
                onChange={e => setForm(f => ({ ...f, heatNo: e.target.value }))}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">-- 판번호 선택 --</option>
                {heatOptions.map(h => (
                  <option key={h.id} value={h.heatNo}>{h.heatNo}</option>
                ))}
              </select>
            ) : (
              <p className="text-xs text-yellow-600 bg-yellow-50 border border-yellow-200 rounded-md px-3 py-2">
                등록된 판번호가 없습니다. 강재입고관리에서 판번호를 먼저 등록하세요.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-800 mb-1.5">시작 일시 <span className="text-red-500">*</span></label>
              <Input
                type="datetime-local"
                value={form.startAt}
                onChange={e => setForm(f => ({ ...f, startAt: e.target.value }))}
                className="text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">종료 일시</label>
              <Input
                type="datetime-local"
                value={form.endAt}
                onChange={e => setForm(f => ({ ...f, endAt: e.target.value }))}
                className="text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">특이사항</label>
            <textarea
              value={form.memo}
              onChange={e => setForm(f => ({ ...f, memo: e.target.value }))}
              rows={2}
              className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="특이사항 입력 (선택)"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
            <Button type="button" variant="outline" onClick={onClose}>취소</Button>
            <Button type="submit" disabled={saving} className="bg-blue-600 hover:bg-blue-700 font-bold">
              <Save size={14} className="mr-1.5" />
              {saving ? "저장 중..." : mode === "add" ? "등록" : "수정 저장"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── 메인 컴포넌트 ─────────────────────────────────────────────────────────

export default function WorklogAdmin({
  equipment,
  projects,
  workers,
}: {
  equipment: Equipment[];
  projects: Project[];
  workers: Worker[];
}) {
  const [mainTab, setMainTab] = useState<"normal" | "urgent">("normal");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo,   setDateTo]   = useState<string>("");
  const [page, setPage] = useState(1);

  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [logs,     setLogs]     = useState<CuttingLog[]>([]);
  const [loading,  setLoading]  = useState(false);

  // 모달 상태
  const [modal, setModal] = useState<{
    open: boolean;
    mode: "add" | "edit";
    drawing: Drawing | null;
    log: CuttingLog | null;
  }>({ open: false, mode: "add", drawing: null, log: null });

  // 필터 상태
  const [filters,  setFilters]  = useState<Record<string, string[]>>({});
  const [openCol,  setOpenCol]  = useState<string | null>(null);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const logParams = new URLSearchParams();
      if (dateFrom) logParams.set("dateFrom", dateFrom);
      if (dateTo)   logParams.set("dateTo",   dateTo);
      if (!dateFrom && !dateTo) logParams.set("all", "true");

      const [drawRes, logRes] = await Promise.all([
        fetch("/api/drawings?allConfirmed=true"),
        fetch(`/api/cutting-logs?${logParams}`),
      ]);
      const [drawJson, logJson] = await Promise.all([drawRes.json(), logRes.json()]);
      if (drawJson.success) setDrawings(drawJson.data);
      if (logJson.success)  setLogs(logJson.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [dateFrom, dateTo]);
  useEffect(() => { setPage(1); }, [dateFrom, dateTo, filters]);

  const logByDrawingId = useMemo(() => {
    const map = new Map<string, CuttingLog>();
    logs.forEach(l => { if (l.drawingListId) map.set(l.drawingListId, l); });
    return map;
  }, [logs]);

  // ── 필터 헬퍼 ───────────────────────────────────────────────────────────

  const getVal = (d: Drawing, log: CuttingLog | null, col: FCKey): string => {
    switch (col) {
      case "hosin":     return d.project?.projectCode ?? "";
      case "block":     return d.block ?? "";
      case "drawingNo": return d.drawingNo ?? "";
      case "material":  return d.material;
      case "thickness": return String(d.thickness);
      case "width":     return String(d.width);
      case "length":    return String(d.length);
      case "heatNo":    return d.heatNo ?? "";
      case "status":    return log?.status ?? "";
      case "operator":  return log?.operator ?? "";
      case "equipment": return log?.equipment?.name ?? "";
    }
  };

  const allValues = (col: FCKey): FilterValue[] => {
    const set = new Set<string>();
    let hasEmpty = false;
    for (const d of drawings) {
      const log = logByDrawingId.get(d.id) ?? null;
      const v = getVal(d, log, col);
      if (v) set.add(v);
      else hasEmpty = true;
    }
    const result: FilterValue[] = col === "status"
      ? Array.from(set).sort().map(v => ({ value: v, label: STATUS_LABEL[v] ?? v }))
      : Array.from(set).sort().map(v => ({ value: v, label: v }));
    if (hasEmpty) result.push({ value: "__EMPTY__", label: "항목없음" });
    return result;
  };

  const handleFilterChange = (col: string, values: string[]) =>
    setFilters(p => values.length === 0
      ? Object.fromEntries(Object.entries(p).filter(([k]) => k !== col))
      : { ...p, [col]: values });
  const handleFilterOpen  = (col: string, el: HTMLElement) => { setOpenCol(col); setAnchorEl(el); };
  const handleFilterClose = () => { setOpenCol(null); setAnchorEl(null); };

  // ── 필터 적용 ───────────────────────────────────────────────────────────

  const filteredDrawings = useMemo(() => {
    let result = drawings;
    // 날짜 필터가 있으면 작업일보가 있는 행만 표시
    if (dateFrom || dateTo) {
      result = result.filter(d => logByDrawingId.has(d.id));
    }
    // 컬럼 필터
    result = result.filter(d => {
      const log = logByDrawingId.get(d.id) ?? null;
      return FILTER_COLS.every(col => {
        const sel = filters[col.key as FCKey];
        if (!sel || sel.length === 0) return true;
        const v = getVal(d, log, col.key as FCKey);
        return sel.includes(v || "__EMPTY__");
      });
    });
    return result;
  }, [drawings, logByDrawingId, dateFrom, dateTo, filters]);

  const PAGE_SIZE   = 50;
  const totalPages  = Math.ceil(filteredDrawings.length / PAGE_SIZE);
  const pagedRows   = filteredDrawings.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const filterCount = Object.keys(filters).length;
  const cutCount    = filteredDrawings.filter(d => logByDrawingId.has(d.id)).length;

  const handleDelete = async (logId: string) => {
    if (!confirm("이 작업일보를 삭제할까요? (강재 상태가 복원됩니다)")) return;
    await fetch(`/api/cutting-logs/${logId}`, { method: "DELETE" });
    fetchData();
  };

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ClipboardList size={24} className="text-blue-600" /> 작업일보 관리
          </h2>
          <p className="text-sm text-gray-500 mt-1">날짜 필터로 작업일보를 조회하고 수정·삭제할 수 있습니다.</p>
        </div>
      </div>

      {/* 탭 */}
      <div className="flex gap-1 border-b border-gray-200">
        <button
          onClick={() => setMainTab("normal")}
          className={`px-5 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
            mainTab === "normal" ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          <ClipboardList size={14} className="inline mr-1.5 mb-0.5" />정규 작업일보
        </button>
        <button
          onClick={() => setMainTab("urgent")}
          className={`px-5 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
            mainTab === "urgent" ? "border-orange-500 text-orange-600" : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          <Zap size={14} className="inline mr-1.5 mb-0.5" />돌발 작업
        </button>
      </div>

      {mainTab === "urgent" && <UrgentWorkTab />}

      {mainTab === "normal" && (<>

      {/* 날짜 필터 */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
              날짜 필터 <span className="font-normal text-gray-400">(비우면 전체)</span>
            </label>
            <div className="flex items-center gap-1.5">
              <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="text-sm" />
              <span className="text-gray-400 text-xs">~</span>
              <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="text-sm" />
              {(dateFrom || dateTo) && (
                <button onClick={() => { setDateFrom(""); setDateTo(""); }} className="text-gray-400 hover:text-gray-600">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
          <button
            onClick={() => fetchData()}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-blue-600 transition-colors pb-1"
          >
            <RefreshCw size={13} /> 새로고침
          </button>
        </div>
      </div>

      {/* 데이터 영역 */}
      {loading ? (
        <div className="flex justify-center items-center py-20 text-gray-400 gap-3">
          <RefreshCw className="animate-spin text-blue-500" size={24} /> 데이터를 불러오는 중...
        </div>
      ) : (
        <div className="space-y-3">

          {/* 요약 + 필터 뱃지 */}
          <div className="flex items-center gap-4 text-sm flex-wrap bg-white border border-gray-200 rounded-xl px-5 py-3 shadow-sm">
            <span className="text-gray-500">전체 <strong className="text-gray-900">{filteredDrawings.length}</strong>건</span>
            <span className="text-green-600">완료 <strong>{cutCount}</strong>건</span>
            <span className="text-yellow-600">진행중 <strong>{filteredDrawings.filter(d => logByDrawingId.get(d.id)?.status === "STARTED").length}</strong>건</span>
            <span className="text-gray-400">미등록 <strong>{filteredDrawings.length - cutCount}</strong>건</span>
            {filterCount > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded-md">
                <Filter size={11} fill="currentColor" />
                <span>필터 {filterCount}개 적용 ({filteredDrawings.length}/{drawings.length}행)</span>
                <button onClick={() => setFilters({})} className="ml-0.5 hover:text-blue-800" title="모든 필터 초기화">
                  <XCircle size={12} />
                </button>
              </div>
            )}
          </div>

          {/* 작업일보 리스트 */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-2 py-2.5 text-center text-xs font-semibold text-gray-500 w-8">No</th>
                    {COLUMNS.map(col => {
                      const isFilterable = col.filterable;
                      const isActive     = isFilterable && (filters[col.key as FCKey]?.length ?? 0) > 0;
                      const alignCls     = col.align === "right" ? "justify-end" : "";
                      return (
                        <th key={col.key} className={`px-3 py-2.5 text-xs font-semibold text-gray-500 whitespace-nowrap ${col.align === "right" ? "text-right" : "text-left"}`}>
                          <div className={`flex items-center gap-1 ${alignCls}`}>
                            <span>{col.label}</span>
                            {isFilterable && (
                              <button
                                onClick={e => {
                                  e.stopPropagation();
                                  if (openCol === col.key) { handleFilterClose(); return; }
                                  handleFilterOpen(col.key, e.currentTarget);
                                }}
                                className={`p-0.5 rounded hover:bg-gray-200 transition-colors ${isActive ? "text-blue-600" : "text-gray-400"}`}
                                title={isActive ? `필터 적용 중 (${filters[col.key as FCKey]?.length}개)` : "필터"}
                              >
                                <Filter size={11} fill={isActive ? "currentColor" : "none"} />
                              </button>
                            )}
                          </div>
                          {isFilterable && openCol === col.key && anchorEl && (
                            <ColumnFilterDropdown
                              anchorEl={anchorEl}
                              values={allValues(col.key as FCKey)}
                              selected={filters[col.key as FCKey] ?? []}
                              onApply={values => { handleFilterChange(col.key, values); handleFilterClose(); }}
                              onClose={handleFilterClose}
                            />
                          )}
                        </th>
                      );
                    })}
                    <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-500 whitespace-nowrap">액션</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {pagedRows.map((d, i) => {
                    const log    = logByDrawingId.get(d.id) ?? null;
                    const hasCut = !!log;
                    const rowNo  = (page - 1) * PAGE_SIZE + i + 1;
                    return (
                      <tr key={d.id} className={`transition-colors ${hasCut ? "hover:bg-green-50/30" : "hover:bg-gray-50/60"}`}>
                        <td className="px-2 py-1.5 text-center text-gray-400">{rowNo}</td>
                        {/* 호선 */}
                        <td className="px-3 py-1.5 text-gray-600 font-mono text-[11px]">{d.project?.projectCode ?? "-"}</td>
                        {/* 블록 */}
                        <td className="px-3 py-1.5 text-gray-600">{d.block ?? "-"}</td>
                        {/* 도면번호 */}
                        <td className="px-3 py-1.5 font-mono text-[11px] font-bold text-gray-800">{d.drawingNo ?? "-"}</td>
                        {/* 재질 */}
                        <td className="px-3 py-1.5 text-gray-600">{d.material}</td>
                        {/* 두께 */}
                        <td className="px-3 py-1.5 text-right tabular-nums text-gray-600">{d.thickness}</td>
                        {/* 폭 */}
                        <td className="px-3 py-1.5 text-right tabular-nums text-gray-600">{d.width}</td>
                        {/* 길이 */}
                        <td className="px-3 py-1.5 text-right tabular-nums text-gray-600">{d.length}</td>
                        {/* 철판중량 */}
                        <td className="px-3 py-1.5 text-right tabular-nums text-gray-600">{calcSteelWeight(d.thickness, d.width, d.length).toFixed(1)}</td>
                        {/* 사용중량 */}
                        <td className="px-3 py-1.5 text-right tabular-nums text-gray-600">{d.useWeight?.toFixed(1) ?? "-"}</td>
                        {/* Heat NO */}
                        <td className="px-3 py-1.5 font-mono text-[11px] text-blue-700">{d.heatNo ?? "-"}</td>
                        {/* 작업상태 */}
                        <td className="px-3 py-1.5">
                          {log ? (
                            <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${STATUS_COLOR[log.status] ?? "bg-gray-100 text-gray-600"}`}>
                              {STATUS_LABEL[log.status] ?? log.status}
                            </span>
                          ) : (
                            <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold bg-gray-100 text-gray-400">미등록</span>
                          )}
                        </td>
                        {/* 작업자 */}
                        <td className="px-3 py-1.5 font-semibold text-gray-800">{log?.operator ?? "-"}</td>
                        {/* 장비 */}
                        <td className="px-3 py-1.5 text-gray-500">{log?.equipment?.name ?? "-"}</td>
                        {/* 작업시간 */}
                        <td className="px-3 py-1.5 text-gray-600 whitespace-nowrap">
                          {log ? (
                            <div>
                              <div className="text-[11px] text-gray-500">{fmtDt(log.startAt)} ~ {log.endAt ? fmtDt(log.endAt) : "진행중"}</div>
                              {log.endAt && <div className="text-green-600 font-medium">{fmtDuration(log.startAt, log.endAt)}</div>}
                            </div>
                          ) : "-"}
                        </td>
                        {/* 비고 */}
                        <td className="px-3 py-1.5 text-gray-400 max-w-[120px] truncate">{log?.memo ?? "-"}</td>
                        {/* 액션 */}
                        <td className="px-3 py-1.5 text-center">
                          {hasCut ? (
                            <div className="flex items-center justify-center gap-1">
                              <button
                                onClick={() => setModal({ open: true, mode: "edit", drawing: d, log })}
                                className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-md transition-colors"
                                title="수정"
                              >
                                <Edit2 size={13} />
                              </button>
                              <button
                                onClick={() => handleDelete(log.id)}
                                className="p-1.5 text-red-400 hover:bg-red-50 rounded-md transition-colors"
                                title="삭제"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setModal({ open: true, mode: "add", drawing: d, log: null })}
                              className="flex items-center gap-1 text-[11px] px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-semibold transition-colors mx-auto"
                            >
                              <Plus size={11} /> 추가
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {filteredDrawings.length === 0 && (
                    <tr>
                      <td colSpan={16} className="px-4 py-10 text-center text-gray-400">
                        {drawings.length === 0 ? "확정된 강재리스트가 없습니다." : "필터 결과가 없습니다."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* 페이지네이션 */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 bg-gray-50">
                <span className="text-xs text-gray-500">
                  {filteredDrawings.length}건 중 {(page-1)*PAGE_SIZE+1}~{Math.min(page*PAGE_SIZE, filteredDrawings.length)}번째
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-2.5 py-1 text-xs rounded border border-gray-200 disabled:opacity-40 hover:bg-white transition-colors"
                  >
                    이전
                  </button>
                  {Array.from({ length: Math.min(totalPages, 10) }, (_, i) => {
                    const p = i + 1;
                    return (
                      <button
                        key={p}
                        onClick={() => setPage(p)}
                        className={`px-2.5 py-1 text-xs rounded border transition-colors ${page === p ? "bg-blue-600 text-white border-blue-600" : "border-gray-200 hover:bg-white"}`}
                      >
                        {p}
                      </button>
                    );
                  })}
                  {totalPages > 10 && <span className="text-xs text-gray-400">... {totalPages}p</span>}
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="px-2.5 py-1 text-xs rounded border border-gray-200 disabled:opacity-40 hover:bg-white transition-colors"
                  >
                    다음
                  </button>
                </div>
              </div>
            )}
          </div>

        </div>
      )}

      {/* 모달 */}
      {modal.open && (
        <LogModal
          mode={modal.mode}
          drawing={modal.drawing}
          log={modal.log}
          equipment={equipment}
          workers={workers}
          projectId={modal.drawing?.projectId ?? ""}
          onClose={() => setModal(m => ({ ...m, open: false }))}
          onSaved={() => { setModal(m => ({ ...m, open: false })); fetchData(); }}
        />
      )}
      </>)}
    </div>
  );
}

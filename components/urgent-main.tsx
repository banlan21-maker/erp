"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Zap, Save, Plus, Trash2, RefreshCw, ChevronDown, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/* ── 타입 ── */
interface Project  { id: string; projectCode: string; projectName: string }
interface Remnant  { id: string; remnantNo: string; material: string; thickness: number; weight: number; needsConsult: boolean }
interface UrgentWork {
  id: string; urgentNo: string; title: string; urgency: string;
  requester: string | null; department: string | null;
  vesselName: string | null; dueDate: string | null;
  status: string; registeredBy: string | null; createdAt: string;
  project: { id: string; projectCode: string; projectName: string } | null;
}

/* ── 상수 ── */
const URGENCY_OPTIONS = [
  { value: "URGENT",   label: "⚡ 긴급",    desc: "당일·즉시 처리 필요",   color: "border-red-400 bg-red-50 text-red-700" },
  { value: "FLEXIBLE", label: "✅ 여유있음", desc: "며칠 내 처리 가능",     color: "border-green-400 bg-green-50 text-green-700" },
  { value: "PRECUT",   label: "📦 선행절단", desc: "미리 준비해 두는 작업", color: "border-blue-400 bg-blue-50 text-blue-700" },
];
const URGENCY_BADGE: Record<string, string> = {
  URGENT:   "bg-red-100 text-red-700",
  FLEXIBLE: "bg-green-100 text-green-700",
  PRECUT:   "bg-blue-100 text-blue-700",
};
const URGENCY_LABEL: Record<string, string> = {
  URGENT: "⚡ 긴급", FLEXIBLE: "✅ 여유있음", PRECUT: "📦 선행절단",
};
const STATUS_LABEL: Record<string, string> = {
  PENDING: "대기", IN_PROGRESS: "진행중", DONE: "완료", CANCELLED: "취소",
};
const STATUS_COLOR: Record<string, string> = {
  PENDING:     "bg-yellow-100 text-yellow-700",
  IN_PROGRESS: "bg-blue-100 text-blue-700",
  DONE:        "bg-gray-100 text-gray-600",
  CANCELLED:   "bg-red-50 text-red-400",
};
const STATUS_OPTIONS = ["PENDING", "IN_PROGRESS", "DONE", "CANCELLED"];

const FORM_INIT = {
  title: "", urgency: "URGENT",
  requester: "", department: "",
  projectId: "", vesselName: "",
  dueDate: "", materialMemo: "", drawingNo: "", destination: "",
  remnantId: "", registeredBy: "", memo: "",
};

/* ════════════════════════════════════════════════════════════ */
export default function UrgentMain({
  projects,
  remnants,
}: {
  projects: Project[];
  remnants: Remnant[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab") ?? "register";
  const goTab = (t: string) => router.push(`/cutpart/urgent?tab=${t}`);

  const tabs = [
    { key: "register", label: "돌발등록" },
    { key: "list",     label: "돌발리스트" },
  ];

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Zap size={24} className="text-orange-500" />
          돌발작업
        </h2>
        <p className="text-sm text-gray-500 mt-0.5">돌발작업 등록 및 목록 관리</p>
      </div>

      {/* 탭 */}
      <div className="flex border-b border-gray-200 gap-0">
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => goTab(key)}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              tab === key
                ? "border-orange-500 text-orange-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 탭 콘텐츠 */}
      {tab === "register" && (
        <RegisterTab projects={projects} remnants={remnants} onRegistered={() => goTab("list")} />
      )}
      {tab === "list" && (
        <ListTab />
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════ */
/* 돌발등록 탭                                                  */
/* ════════════════════════════════════════════════════════════ */
function RegisterTab({
  projects,
  remnants,
  onRegistered,
}: {
  projects: Project[];
  remnants: Remnant[];
  onRegistered: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);
  const [ok,     setOk]     = useState(false);
  const [form,   setForm]   = useState({ ...FORM_INIT });
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const selRemnant = remnants.find(r => r.id === form.remnantId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.title.trim()) { setError("작업명을 입력해주세요."); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/urgent-works", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title:        form.title,
          urgency:      form.urgency,
          requester:    form.requester    || null,
          department:   form.department   || null,
          projectId:    form.projectId    || null,
          vesselName:   form.vesselName   || null,
          dueDate:      form.dueDate      || null,
          materialMemo: form.materialMemo || null,
          drawingNo:    form.drawingNo    || null,
          destination:  form.destination  || null,
          remnantId:    form.remnantId    || null,
          registeredBy: form.registeredBy || null,
          memo:         form.memo         || null,
        }),
      });
      const data = await res.json();
      if (!data.success) { setError(data.error); return; }
      setOk(true);
      setForm({ ...FORM_INIT });
      setTimeout(() => { setOk(false); onRegistered(); }, 1200);
    } catch {
      setError("서버 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl">
      {ok && (
        <div className="mb-4 bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-3 text-sm font-medium flex items-center gap-2">
          <CheckCircle2 size={16} /> 돌발작업이 등록됐습니다. 리스트로 이동합니다…
        </div>
      )}
      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm flex items-center gap-2">
          <AlertTriangle size={16} /> {error}
        </div>
      )}
      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        {/* 작업명 */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">
            작업명 <span className="text-red-500">*</span>
          </label>
          <Input value={form.title} onChange={e => set("title", e.target.value)}
            placeholder="예: 브래킷 치공구, 보강재 추가절단" autoFocus />
        </div>

        {/* 긴급도 */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            긴급도 <span className="text-red-500">*</span>
          </label>
          <div className="flex gap-3 flex-wrap">
            {URGENCY_OPTIONS.map(opt => (
              <label key={opt.value}
                className={`flex-1 min-w-[120px] flex flex-col items-center gap-0.5 px-3 py-2.5 rounded-xl border-2 cursor-pointer transition-all text-sm font-semibold ${
                  form.urgency === opt.value ? opt.color : "border-gray-200 text-gray-500 hover:border-gray-300"
                }`}
              >
                <input type="radio" name="urgency" value={opt.value}
                  checked={form.urgency === opt.value}
                  onChange={() => set("urgency", opt.value)} className="hidden" />
                <span>{opt.label}</span>
                <span className="text-[10px] font-normal opacity-70">{opt.desc}</span>
              </label>
            ))}
          </div>
        </div>

        {/* 요청자 / 부서 */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">요청자</label>
            <Input value={form.requester} onChange={e => set("requester", e.target.value)} placeholder="이름" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">부서</label>
            <Input value={form.department} onChange={e => set("department", e.target.value)} placeholder="예: 생산팀" />
          </div>
        </div>

        {/* 납기일 */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">납기일</label>
          <Input type="date" value={form.dueDate} onChange={e => set("dueDate", e.target.value)} />
        </div>

        {/* 연관 호선/블록 */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">연관 호선/블록</label>
            <select value={form.projectId} onChange={e => set("projectId", e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-400">
              <option value="">-- 없음 --</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>[{p.projectCode}] {p.projectName}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">호선명 직접 입력</label>
            <Input value={form.vesselName} onChange={e => set("vesselName", e.target.value)}
              placeholder="예: 4560호" disabled={!!form.projectId} />
          </div>
        </div>

        {/* 재질 메모 / 도면번호 / 도착지 / 등록자 */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">재질 메모</label>
            <Input value={form.materialMemo} onChange={e => set("materialMemo", e.target.value)} placeholder="예: AH36 12t 이상" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">도면번호</label>
            <Input value={form.drawingNo} onChange={e => set("drawingNo", e.target.value)} placeholder="예: D-101-A" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">도착지</label>
            <Input value={form.destination} onChange={e => set("destination", e.target.value)} placeholder="예: 조립장 3번 라인" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">등록자</label>
            <Input value={form.registeredBy} onChange={e => set("registeredBy", e.target.value)} placeholder="이름" />
          </div>
        </div>

        {/* 사용 예정 잔재 */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            사용 예정 잔재 <span className="text-gray-400">(선택)</span>
          </label>
          <select value={form.remnantId} onChange={e => set("remnantId", e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-400">
            <option value="">-- 선택 안 함 --</option>
            {remnants.map(r => (
              <option key={r.id} value={r.id}>
                {r.remnantNo} — {r.material} t{r.thickness} · {r.weight}kg{r.needsConsult ? " ⚠️" : ""}
              </option>
            ))}
          </select>
          {selRemnant?.needsConsult && (
            <p className="mt-1.5 text-xs text-purple-700 bg-purple-50 border border-purple-200 rounded-md px-3 py-2 flex items-center gap-1.5">
              <AlertTriangle size={12} />
              이 자재는 협의가 필요한 등록잔재입니다. 담당자 확인 후 진행하세요.
            </p>
          )}
        </div>

        {/* 비고 */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">비고</label>
          <textarea value={form.memo} onChange={e => set("memo", e.target.value)} rows={2}
            className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm resize-none focus:outline-none focus:ring-2 focus:ring-orange-400" />
        </div>

        <div className="flex justify-end pt-2 border-t border-gray-100">
          <Button type="submit" disabled={saving} className="bg-orange-500 hover:bg-orange-600 font-bold">
            <Save size={14} className="mr-1.5" />
            {saving ? "등록 중..." : "돌발 등록"}
          </Button>
        </div>
      </form>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════ */
/* 돌발리스트 탭                                                */
/* ════════════════════════════════════════════════════════════ */
function ListTab() {
  const [works,         setWorks]         = useState<UrgentWork[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [statusFilter,  setStatusFilter]  = useState("");
  const [editingStatus, setEditingStatus] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const p = new URLSearchParams();
    if (statusFilter) p.set("status", statusFilter);
    const res = await fetch(`/api/urgent-works?${p}`);
    if (res.ok) {
      const data = await res.json();
      if (data.success) setWorks(data.data);
    }
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  const handleStatusChange = async (id: string, status: string) => {
    setEditingStatus(null);
    setWorks(ws => ws.map(w => w.id === id ? { ...w, status } : w));
    const res = await fetch(`/api/urgent-works/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) load();
  };

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`"${title}" 을(를) 삭제하시겠습니까?`)) return;
    const res = await fetch(`/api/urgent-works/${id}`, { method: "DELETE" });
    if (res.ok) setWorks(ws => ws.filter(w => w.id !== id));
    else alert("삭제 실패");
  };

  const fmt = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" }) : "-";

  return (
    <div className="space-y-3">
      {/* 상단 바 */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        {/* 상태 필터 */}
        <div className="flex gap-1 flex-wrap">
          {[{ value: "", label: "전체" }, ...STATUS_OPTIONS.map(s => ({ value: s, label: STATUS_LABEL[s] }))].map(opt => (
            <button
              key={opt.value}
              onClick={() => setStatusFilter(opt.value)}
              className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                statusFilter === opt.value
                  ? "bg-orange-500 border-orange-500 text-white"
                  : "border-gray-200 text-gray-600 hover:border-orange-300 hover:text-orange-600"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <button onClick={load}
          className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-500 transition-colors"
          title="새로고침">
          <RefreshCw size={14} />
        </button>
      </div>

      {/* 테이블 */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-gray-400 text-sm">불러오는 중…</div>
        ) : works.length === 0 ? (
          <div className="py-16 text-center text-gray-400 text-sm">
            {statusFilter ? "해당 상태의 돌발작업이 없습니다." : "등록된 돌발작업이 없습니다."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {["돌발번호", "긴급도", "작업명", "요청자/부서", "연관 호선", "납기일", "상태", "등록일", ""].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {works.map(w => (
                  <tr key={w.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-3 py-2 font-mono text-xs text-gray-500 whitespace-nowrap">{w.urgentNo}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${URGENCY_BADGE[w.urgency] ?? "bg-gray-100 text-gray-600"}`}>
                        {URGENCY_LABEL[w.urgency] ?? w.urgency}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-medium text-gray-800 max-w-[200px] truncate" title={w.title}>{w.title}</td>
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                      {[w.requester, w.department].filter(Boolean).join(" / ") || "-"}
                    </td>
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                      {w.project ? `[${w.project.projectCode}] ${w.project.projectName}` : (w.vesselName || "-")}
                    </td>
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{fmt(w.dueDate)}</td>
                    <td className="px-3 py-2 whitespace-nowrap relative">
                      <button
                        onClick={() => setEditingStatus(editingStatus === w.id ? null : w.id)}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium cursor-pointer hover:opacity-80 ${STATUS_COLOR[w.status] ?? "bg-gray-100 text-gray-600"}`}
                      >
                        {STATUS_LABEL[w.status] ?? w.status}
                        <ChevronDown size={10} />
                      </button>
                      {editingStatus === w.id && (
                        <div className="absolute z-20 top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[100px]">
                          {STATUS_OPTIONS.map(s => (
                            <button key={s} onClick={() => handleStatusChange(w.id, s)}
                              className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 ${w.status === s ? "font-semibold text-orange-600" : "text-gray-700"}`}>
                              {STATUS_LABEL[s]}
                            </button>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-gray-400 text-xs whitespace-nowrap">{fmt(w.createdAt)}</td>
                    <td className="px-3 py-2">
                      <button onClick={() => handleDelete(w.id, w.title)}
                        className="p-1 text-gray-300 hover:text-red-500 transition-colors rounded" title="삭제">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Zap, Save, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Project { id: string; projectCode: string; projectName: string }
interface Remnant { id: string; remnantNo: string; material: string; thickness: number; weight: number; needsConsult: boolean }

const URGENCY_OPTIONS = [
  { value: "URGENT",   label: "⚡ 긴급",    desc: "당일·즉시 처리 필요",    color: "border-red-400 bg-red-50 text-red-700" },
  { value: "FLEXIBLE", label: "✅ 여유있음", desc: "며칠 내 처리 가능",      color: "border-green-400 bg-green-50 text-green-700" },
  { value: "PRECUT",   label: "📦 선행절단", desc: "미리 준비해 두는 작업",  color: "border-blue-400 bg-blue-50 text-blue-700" },
];

const INIT = {
  title: "", urgency: "URGENT",
  requester: "", department: "",
  projectId: "", vesselName: "",
  dueDate: "",
  materialMemo: "", drawingNo: "", destination: "",
  remnantId: "", registeredBy: "", memo: "",
};

export default function UrgentRegisterForm({
  projects,
  remnants,
}: {
  projects: Project[];
  remnants: Remnant[];
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);
  const [ok,     setOk]     = useState(false);
  const [form,   setForm]   = useState({ ...INIT });
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
      setForm({ ...INIT });
      setTimeout(() => {
        setOk(false);
        router.push("/cutpart/urgent/list");
      }, 1500);
    } catch {
      setError("서버 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
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
          <Input
            value={form.title}
            onChange={e => set("title", e.target.value)}
            placeholder="예: 브래킷 치공구, 보강재 추가절단"
            autoFocus
          />
        </div>

        {/* 긴급도 */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            긴급도 <span className="text-red-500">*</span>
          </label>
          <div className="flex gap-3 flex-wrap">
            {URGENCY_OPTIONS.map(opt => (
              <label
                key={opt.value}
                className={`flex-1 min-w-[120px] flex flex-col items-center gap-0.5 px-3 py-2.5 rounded-xl border-2 cursor-pointer transition-all text-sm font-semibold ${
                  form.urgency === opt.value ? opt.color : "border-gray-200 text-gray-500 hover:border-gray-300"
                }`}
              >
                <input
                  type="radio" name="urgency" value={opt.value}
                  checked={form.urgency === opt.value}
                  onChange={() => set("urgency", opt.value)}
                  className="hidden"
                />
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
            <select
              value={form.projectId}
              onChange={e => set("projectId", e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">-- 없음 --</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>[{p.projectCode}] {p.projectName}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">호선명 직접 입력</label>
            <Input
              value={form.vesselName}
              onChange={e => set("vesselName", e.target.value)}
              placeholder="예: 4560호"
              disabled={!!form.projectId}
            />
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
          <select
            value={form.remnantId}
            onChange={e => set("remnantId", e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">-- 선택 안 함 --</option>
            {remnants.map(r => (
              <option key={r.id} value={r.id}>
                {r.remnantNo} — {r.material} t{r.thickness} · {r.weight}kg
                {r.needsConsult ? " ⚠️" : ""}
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
          <textarea
            value={form.memo}
            onChange={e => set("memo", e.target.value)}
            rows={2}
            className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
          <Button type="button" variant="outline" onClick={() => router.push("/cutpart/urgent/list")}>
            목록으로
          </Button>
          <Button type="submit" disabled={saving} className="bg-orange-500 hover:bg-orange-600 font-bold">
            <Save size={14} className="mr-1.5" />
            {saving ? "등록 중..." : "돌발 등록"}
          </Button>
        </div>
      </form>
    </div>
  );
}

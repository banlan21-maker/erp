"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Zap, Save, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Project { id: string; projectCode: string; projectName: string }
interface Remnant { id: string; remnantNo: string; type: string; material: string; thickness: number; weight: number; heatNo: string | null; needsConsult: boolean }

// 발생 등록잔재 입력 항목 (여유원재/등록잔재 사용 시)
type GenItem = { remnantNo: string; shape: string; width1: string; length1: string; width2: string; length2: string };
const emptyGen: GenItem = { remnantNo: "", shape: "RECTANGLE", width1: "", length1: "", width2: "", length2: "" };
const REMNANT_TYPES: [string, string][] = [["SURPLUS", "여유원재"], ["REGISTERED", "등록잔재"], ["REMNANT", "현장잔재"]];

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
  useWeight: "",
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

  // 사용 예정 잔재: 유형 먼저 선택 → 해당 유형 목록만 표시
  const [remnantType, setRemnantType] = useState("");   // "" | SURPLUS | REGISTERED | REMNANT
  const [genItems, setGenItems] = useState<GenItem[]>([]);
  const updateGen = (i: number, k: keyof GenItem, v: string) =>
    setGenItems(arr => arr.map((it, idx) => idx === i ? { ...it, [k]: v } : it));

  const selRemnant = remnants.find(r => r.id === form.remnantId);
  const filteredRemnants = remnantType ? remnants.filter(r => r.type === remnantType) : [];
  // 여유원재·등록잔재 사용 시에만 발생 등록잔재 등록 가능 (현장잔재는 불가)
  const canGenRemnant = !!form.remnantId && (remnantType === "SURPLUS" || remnantType === "REGISTERED");

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
          useWeight:    form.useWeight    || null,
          remnantId:    form.remnantId    || null,
          generatedRemnants: canGenRemnant ? genItems.filter(it => it.width1 && it.length1) : [],
          registeredBy: form.registeredBy || null,
          memo:         form.memo         || null,
        }),
      });
      const data = await res.json();
      if (!data.success) { setError(data.error); return; }
      // 발생 등록잔재 일부 실패 시 안내 (잔재번호 중복·치수 오류 등)
      if (data.generated && data.generated.failed > 0) {
        alert(`발생 등록잔재 ${data.generated.created}건 등록, ${data.generated.failed}건 실패 (잔재번호 중복 또는 치수 오류). 잔재관리에서 확인해 주세요.`);
      }
      setOk(true);
      setForm({ ...INIT });
      setRemnantType("");
      setGenItems([]);
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
            <label className="block text-xs font-medium text-gray-600 mb-1">
              사용중량 (kg) <span className="text-gray-400">(선택)</span>
            </label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={form.useWeight}
              onChange={e => set("useWeight", e.target.value)}
              placeholder="예: 12.5"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">등록자</label>
            <Input value={form.registeredBy} onChange={e => set("registeredBy", e.target.value)} placeholder="이름" />
          </div>
        </div>

        {/* 사용 예정 잔재 — 유형 먼저 선택 → 목록 표시 */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">
            사용 예정 잔재 <span className="text-gray-400">(선택)</span>
          </label>
          {/* 유형 선택 버튼 3개 */}
          <div className="flex gap-2 mb-2">
            {REMNANT_TYPES.map(([v, l]) => (
              <button
                type="button"
                key={v}
                onClick={() => { setRemnantType(remnantType === v ? "" : v); set("remnantId", ""); setGenItems([]); }}
                className={`flex-1 px-3 py-2 rounded-lg border text-sm font-medium transition-all ${
                  remnantType === v ? "border-orange-500 bg-orange-50 text-orange-700" : "border-gray-200 text-gray-500 hover:border-gray-300"
                }`}
              >
                {l}
              </button>
            ))}
          </div>
          {/* 선택된 유형의 목록 */}
          {!remnantType ? (
            <p className="text-xs text-gray-400 px-1 py-2">잔재 유형(여유원재 / 등록잔재 / 현장잔재)을 먼저 선택하세요.</p>
          ) : (
            <select
              value={form.remnantId}
              onChange={e => { set("remnantId", e.target.value); setGenItems([]); }}
              className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">-- 선택 안 함 ({filteredRemnants.length}건) --</option>
              {filteredRemnants.map(r => (
                <option key={r.id} value={r.id}>
                  {r.remnantNo} — {r.material} t{r.thickness} · {r.weight}kg
                  {r.heatNo ? ` · 판:${r.heatNo}` : ""}
                  {r.needsConsult ? " ⚠️" : ""}
                </option>
              ))}
            </select>
          )}
          {selRemnant?.needsConsult && (
            <p className="mt-1.5 text-xs text-purple-700 bg-purple-50 border border-purple-200 rounded-md px-3 py-2 flex items-center gap-1.5">
              <AlertTriangle size={12} />
              이 자재는 협의가 필요한 등록잔재입니다. 담당자 확인 후 진행하세요.
            </p>
          )}

          {/* 발생 등록잔재 — 여유원재/등록잔재 사용 시 (블록자재등록의 발생잔재와 동일) */}
          {canGenRemnant && (
            <div className="mt-3 border border-orange-200 bg-orange-50/40 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-orange-700">이 자재에서 발생하는 등록잔재</span>
                <button
                  type="button"
                  onClick={() => setGenItems(arr => [...arr, { ...emptyGen }])}
                  className="text-xs px-2 py-1 border border-orange-300 text-orange-700 rounded hover:bg-orange-100"
                >
                  + 잔재 추가
                </button>
              </div>
              {genItems.length === 0 && (
                <p className="text-[11px] text-gray-400">필요 시 [잔재 추가]로 발생 등록잔재를 등록하세요. 재질·두께·판번호는 사용 자재에서 자동 적용됩니다.</p>
              )}
              {genItems.map((it, i) => (
                <div key={i} className="flex flex-wrap gap-2 items-end bg-white border border-gray-200 rounded-md p-2">
                  <div>
                    <label className="text-[10px] text-gray-500 block mb-0.5">잔재번호</label>
                    <input className="h-7 text-xs border rounded px-2 w-24" placeholder="자동" value={it.remnantNo} onChange={e => updateGen(i, "remnantNo", e.target.value)} />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-500 block mb-0.5">형태</label>
                    <select className="h-7 text-xs border rounded px-1 bg-white" value={it.shape} onChange={e => updateGen(i, "shape", e.target.value)}>
                      <option value="RECTANGLE">사각형</option>
                      <option value="L_SHAPE">L자형</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-500 block mb-0.5">폭1 <span className="text-red-400">*</span></label>
                    <input type="number" className="h-7 text-xs border rounded px-2 w-20 text-right" placeholder="mm" value={it.width1} onChange={e => updateGen(i, "width1", e.target.value)} />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-500 block mb-0.5">길이1 <span className="text-red-400">*</span></label>
                    <input type="number" className="h-7 text-xs border rounded px-2 w-20 text-right" placeholder="mm" value={it.length1} onChange={e => updateGen(i, "length1", e.target.value)} />
                  </div>
                  {it.shape === "L_SHAPE" && (
                    <>
                      <div>
                        <label className="text-[10px] text-gray-500 block mb-0.5">폭2</label>
                        <input type="number" className="h-7 text-xs border rounded px-2 w-20 text-right" placeholder="mm" value={it.width2} onChange={e => updateGen(i, "width2", e.target.value)} />
                      </div>
                      <div>
                        <label className="text-[10px] text-gray-500 block mb-0.5">길이2</label>
                        <input type="number" className="h-7 text-xs border rounded px-2 w-20 text-right" placeholder="mm" value={it.length2} onChange={e => updateGen(i, "length2", e.target.value)} />
                      </div>
                    </>
                  )}
                  <button type="button" onClick={() => setGenItems(arr => arr.filter((_, idx) => idx !== i))} className="text-xs text-red-500 hover:text-red-700 pb-1.5">삭제</button>
                </div>
              ))}
            </div>
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
          <Button type="submit" disabled={saving} className="bg-orange-500 hover:bg-orange-600 font-bold">
            <Save size={14} className="mr-1.5" />
            {saving ? "등록 중..." : "돌발 등록"}
          </Button>
        </div>
      </form>
    </div>
  );
}

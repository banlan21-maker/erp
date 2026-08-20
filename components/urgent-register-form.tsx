"use client";

import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import { Zap, Save, AlertTriangle, CheckCircle2, Plus, Trash2, Package, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import UrgentRemnantPicker, { PickerRemnant } from "@/components/urgent-remnant-picker";

interface Project { id: string; projectCode: string; projectName: string }

// 발생 등록잔재 입력 항목 (여유원재/등록잔재 사용 시)
type GenItem = { remnantNo: string; shape: string; width1: string; length1: string; width2: string; length2: string };
const emptyGen: GenItem = { remnantNo: "", shape: "RECTANGLE", width1: "", length1: "", width2: "", length2: "" };

/** 작업 1건 = 도면 1장. 사용 강재·도면번호·사용중량은 행마다 다르다. */
type WorkItem = {
  key: string;
  remnant: PickerRemnant | null;
  drawingNo: string;
  useWeight: string;
  gen: GenItem[];
  genOpen: boolean;
};

let seq = 0;
const newItem = (): WorkItem => ({ key: `it${++seq}`, remnant: null, drawingNo: "", useWeight: "", gen: [], genOpen: false });

const URGENCY_OPTIONS = [
  { value: "URGENT",   label: "⚡ 긴급",    desc: "당일·즉시 처리 필요",    color: "border-red-400 bg-red-50 text-red-700" },
  { value: "FLEXIBLE", label: "✅ 여유있음", desc: "며칠 내 처리 가능",      color: "border-green-400 bg-green-50 text-green-700" },
  { value: "PRECUT",   label: "📦 선행절단", desc: "미리 준비해 두는 작업",  color: "border-blue-400 bg-blue-50 text-blue-700" },
];

const TYPE_LABEL: Record<string, string> = { SURPLUS: "여유원재", REGISTERED: "등록잔재", REMNANT: "현장잔재" };
const TYPE_CLS: Record<string, string> = {
  SURPLUS:    "bg-sky-50 text-sky-700 border-sky-300",
  REGISTERED: "bg-amber-50 text-amber-700 border-amber-300",
  REMNANT:    "bg-orange-50 text-orange-700 border-orange-300",
};

const INIT = {
  title: "", urgency: "URGENT",
  requester: "", department: "",
  projectId: "", vesselName: "",
  dueDate: "", destination: "",
  registeredBy: "", memo: "",
};

export default function UrgentRegisterForm({
  projects,
  remnants,
}: {
  projects: Project[];
  remnants: PickerRemnant[];
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);
  const [done,   setDone]   = useState<string[]>([]);   // 방금 등록된 돌발번호들
  const [form,   setForm]   = useState({ ...INIT });
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const [items, setItems] = useState<WorkItem[]>([newItem()]);
  const [pickFor, setPickFor] = useState<string | null>(null);   // 강재선택 모달을 연 행 key
  // 탭·검색어는 여기 둔다 — 여러 행을 연속으로 채울 때 행마다 다시 고르게 하면 태블릿에서 부담이 크다
  const [pickTab, setPickTab] = useState("SURPLUS");
  const [pickQ,   setPickQ]   = useState("");

  const upd = (key: string, patch: Partial<WorkItem>) =>
    setItems(arr => arr.map(it => (it.key === key ? { ...it, ...patch } : it)));
  const updGen = (key: string, i: number, k: keyof GenItem, v: string) =>
    setItems(arr => arr.map(it => it.key === key
      ? { ...it, gen: it.gen.map((g, idx) => (idx === i ? { ...g, [k]: v } : g)) }
      : it));

  const usedIds = items.map(it => it.remnant?.id).filter((x): x is string => !!x);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.title.trim()) { setError("작업명을 입력해주세요."); return; }
    // 사용 강재를 특정하지 않은 돌발 절단은 막는다 — 실물 없는 작업이 현장에 내려간다.
    const blank = items.findIndex(it => !it.remnant);
    if (blank >= 0) { setError(`${blank + 1}번째 작업의 사용 강재를 선택해주세요. 잔재관리 목록에 있는 강재만 쓸 수 있습니다.`); return; }

    // 발생 등록잔재 — 적다 만 줄은 예전엔 조용히 사라져 "등록됐다" 는 배너만 뜨고 잔재는 없었다.
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.remnant?.type === "REMNANT") continue;
      for (const g of it.gen) {
        const touched = g.remnantNo || g.width1 || g.length1 || g.width2 || g.length2;
        if (!touched) continue;
        if (!g.width1 || !g.length1) {
          setError(`${i + 1}번째 작업의 발생 잔재에 폭1·길이1을 입력하세요.\n적다 만 줄은 등록되지 않습니다.`);
          return;
        }
        // L자형인데 잘려나간 부분을 안 적으면 중량이 사각형 기준으로 과대 계산된다
        if (g.shape === "L_SHAPE" && (!g.width2 || !g.length2)) {
          setError(`${i + 1}번째 작업의 발생 잔재가 L자형인데 폭2·길이2가 비어 있습니다.\n잘려나간 부분을 적어야 중량이 맞습니다.`);
          return;
        }
      }
    }

    // 도면번호가 없으면 같은 요청으로 만든 여러 건이 작업일보에서 구분되지 않는다
    if (items.length > 1 && items.some(it => !it.drawingNo.trim())) {
      if (!confirm("도면번호가 비어 있는 작업이 있습니다.\n작업명이 모두 같아 현장에서 어느 것을 자를지 구분하기 어렵습니다.\n\n그래도 등록할까요?")) return;
    }

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
          destination:  form.destination  || null,
          registeredBy: form.registeredBy || null,
          memo:         form.memo         || null,
          items: items.map(it => ({
            remnantId: it.remnant!.id,
            drawingNo: it.drawingNo || null,
            useWeight: it.useWeight || null,
            // 여유원재·등록잔재에서만 발생잔재 등록 가능 (현장잔재는 자투리의 자투리라 제외)
            generatedRemnants:
              it.remnant!.type === "REMNANT" ? [] : it.gen.filter(g => g.width1 && g.length1),
          })),
        }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error);
        // 409 는 "그 사이 남이 가져갔다" 는 뜻 — 목록을 안 갱신하면 같은 강재를 또 고르고 또 409 다.
        if (res.status === 409) router.refresh();
        return;
      }
      if (data.generated && data.generated.failed > 0) {
        alert(`발생 등록잔재 ${data.generated.created}건 등록, ${data.generated.failed}건 실패 (잔재번호 중복 또는 치수 오류). 잔재관리에서 확인해 주세요.`);
      }
      const nos: string[] = Array.isArray(data.data)
        ? data.data.map((w: { urgentNo: string }) => w.urgentNo)
        : [data.data?.urgentNo].filter(Boolean);
      setDone(nos);
      setForm({ ...INIT });
      setItems([newItem()]);
      router.refresh();
    } catch {
      setError("서버 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const label = "block text-xs font-semibold text-gray-600 mb-1";

  return (
    <div>
      {done.length > 0 && (
        <div className="mb-4 bg-green-50 border border-green-200 text-green-800 rounded-lg px-4 py-3 text-sm">
          <div className="font-semibold flex items-center gap-2">
            <CheckCircle2 size={16} /> 돌발작업 {done.length}건이 등록됐습니다 — 현장작업일보·작업일보관리에서 바로 작업할 수 있습니다.
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {done.map(n => (
              <span key={n} className="px-2 py-0.5 rounded bg-white border border-green-300 font-mono text-xs font-bold">{n}</span>
            ))}
          </div>
          <button type="button" onClick={() => setDone([])} className="mt-2 text-xs text-green-700 underline">닫기</button>
        </div>
      )}
      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm flex items-start gap-2 whitespace-pre-line">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" /> {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* ── 요청 공통 정보 — 도면이 여러 장이어도 한 벌 ────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-bold text-gray-800 flex items-center gap-1.5 mb-4">
            <Zap size={14} className="text-amber-500" /> 요청 정보
            <span className="text-xs font-normal text-gray-400">— 아래 작업 전체에 공통으로 적용됩니다</span>
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
            <div className="md:col-span-2">
              <label className={label}>작업명 <span className="text-red-500">*</span></label>
              <Input value={form.title} onChange={e => set("title", e.target.value)}
                placeholder="예: 발전기실 보강판 절단" />
            </div>
            <div>
              <label className={label}>요청자</label>
              <Input value={form.requester} onChange={e => set("requester", e.target.value)} placeholder="이름" />
            </div>
            <div>
              <label className={label}>요청부서</label>
              <Input value={form.department} onChange={e => set("department", e.target.value)} placeholder="예: 의장부" />
            </div>

            <div>
              <label className={label}>납기일</label>
              <Input type="date" value={form.dueDate} onChange={e => set("dueDate", e.target.value)} />
            </div>
            <div>
              <label className={label}>연관 호선/블록</label>
              <select value={form.projectId}
                onChange={e => { set("projectId", e.target.value); if (e.target.value) set("vesselName", ""); }}
                className="w-full h-9 px-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400">
                <option value="">선택 안 함 (직접 입력)</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.projectCode} · {p.projectName}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={label}>호선명 직접 입력</label>
              <Input value={form.vesselName} onChange={e => set("vesselName", e.target.value)}
                disabled={!!form.projectId}
                placeholder={form.projectId ? "위에서 선택됨" : "목록에 없는 호선"} />
            </div>
            <div>
              <label className={label}>도착지</label>
              <Input value={form.destination} onChange={e => set("destination", e.target.value)} placeholder="예: 1도크 야드" />
            </div>

            <div className="md:col-span-3 lg:col-span-4">
              <label className={label}>긴급도</label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {URGENCY_OPTIONS.map(o => (
                  <button key={o.value} type="button" onClick={() => set("urgency", o.value)}
                    className={`px-3 py-2 rounded-lg border-2 text-left transition ${
                      form.urgency === o.value ? o.color : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"
                    }`}>
                    <div className="text-sm font-bold">{o.label}</div>
                    <div className="text-[11px] opacity-70">{o.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className={label}>등록자</label>
              <Input value={form.registeredBy} onChange={e => set("registeredBy", e.target.value)} placeholder="이름" />
            </div>
            <div className="md:col-span-2 lg:col-span-3">
              <label className={label}>메모</label>
              <Input value={form.memo} onChange={e => set("memo", e.target.value)} placeholder="특이사항" />
            </div>
          </div>
        </div>

        {/* ── 작업 목록 — 도면 1장 = 1행 ─────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-gray-800 flex items-center gap-1.5">
              <Package size={14} className="text-blue-600" /> 작업 목록
              <span className="text-xs font-normal text-gray-400">— 도면 1장이 작업 1건입니다</span>
            </h3>
            <Button type="button" variant="outline" size="sm" onClick={() => setItems(a => [...a, newItem()])}>
              <Plus size={13} className="mr-1" /> 작업 추가
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs">
                <tr>
                  <th className="px-2 py-2 w-10">#</th>
                  <th className="px-2 py-2 text-left font-semibold">사용 강재 <span className="text-red-500">*</span></th>
                  <th className="px-2 py-2 text-left font-semibold w-44">도면번호</th>
                  <th className="px-2 py-2 text-left font-semibold w-32">사용중량(kg)</th>
                  <th className="px-2 py-2 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map((it, i) => {
                  const r = it.remnant;
                  const canGen = !!r && r.type !== "REMNANT";
                  return (
                    <Fragment key={it.key}>
                      <tr className="align-top">
                        <td className="px-2 py-2 text-center text-gray-400 tabular-nums">{i + 1}</td>
                        <td className="px-2 py-2">
                          {r ? (
                            <div className="flex items-start gap-2 flex-wrap">
                              <span className={`px-1.5 py-0.5 rounded border text-[10px] font-bold ${TYPE_CLS[r.type] ?? ""}`}>
                                {TYPE_LABEL[r.type] ?? r.type}
                              </span>
                              <span className="font-mono text-xs font-semibold text-blue-700">{r.remnantNo}</span>
                              <span className="text-xs text-gray-600">
                                {r.material} {r.thickness}t · {r.width1 ?? "-"}×{r.length1 ?? "-"}
                                {r.width2 ? ` (${r.width2}×${r.length2})` : ""}
                                {r.location ? ` · ${r.location}` : ""} · {r.weight.toLocaleString()}kg
                              </span>
                              <button type="button" onClick={() => setPickFor(it.key)}
                                className="text-[11px] text-blue-600 underline">변경</button>
                            </div>
                          ) : (
                            <Button type="button" variant="outline" size="sm" onClick={() => setPickFor(it.key)}>
                              <Package size={13} className="mr-1" /> 강재 선택
                            </Button>
                          )}
                          {canGen && (
                            <button type="button"
                              onClick={() => upd(it.key, { genOpen: !it.genOpen, gen: it.gen.length ? it.gen : [{ ...emptyGen }] })}
                              className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-700">
                              {it.genOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                              발생 등록잔재 {it.gen.length > 0 && !it.genOpen ? `(${it.gen.length})` : ""}
                            </button>
                          )}
                        </td>
                        <td className="px-2 py-2">
                          <Input value={it.drawingNo} onChange={e => upd(it.key, { drawingNo: e.target.value })}
                            placeholder="도면번호" className="h-8 text-xs" />
                        </td>
                        <td className="px-2 py-2">
                          <Input type="number" step="0.1" value={it.useWeight}
                            onChange={e => upd(it.key, { useWeight: e.target.value })}
                            placeholder="선택" className="h-8 text-xs" />
                        </td>
                        <td className="px-2 py-2 text-center">
                          {items.length > 1 && (
                            <button type="button" onClick={() => setItems(a => a.filter(x => x.key !== it.key))}
                              className="p-1 text-gray-400 hover:text-red-600" title="이 작업 삭제">
                              <Trash2 size={14} />
                            </button>
                          )}
                        </td>
                      </tr>
                      {canGen && it.genOpen && (
                        <tr className="bg-gray-50/60">
                          <td></td>
                          <td colSpan={4} className="px-2 py-2">
                            <p className="text-[11px] text-gray-500 mb-1.5">
                              이 강재를 자르고 남을 잔재를 미리 등록합니다. 부모 판번호를 그대로 물려받습니다.
                            </p>
                            {it.gen.map((g, gi) => (
                              <div key={gi} className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                                <Input value={g.remnantNo} onChange={e => updGen(it.key, gi, "remnantNo", e.target.value)}
                                  placeholder="잔재번호(자동)" className="h-7 text-[11px] w-36" />
                                <select value={g.shape} onChange={e => updGen(it.key, gi, "shape", e.target.value)}
                                  className="h-7 text-[11px] border border-gray-300 rounded px-1">
                                  <option value="RECTANGLE">사각형</option>
                                  <option value="L_SHAPE">L자형</option>
                                </select>
                                <Input value={g.width1} onChange={e => updGen(it.key, gi, "width1", e.target.value)}
                                  placeholder="폭1" className="h-7 text-[11px] w-20" />
                                <Input value={g.length1} onChange={e => updGen(it.key, gi, "length1", e.target.value)}
                                  placeholder="길이1" className="h-7 text-[11px] w-20" />
                                {g.shape === "L_SHAPE" && (
                                  <>
                                    <Input value={g.width2} onChange={e => updGen(it.key, gi, "width2", e.target.value)}
                                      placeholder="폭2" className="h-7 text-[11px] w-20" />
                                    <Input value={g.length2} onChange={e => updGen(it.key, gi, "length2", e.target.value)}
                                      placeholder="길이2" className="h-7 text-[11px] w-20" />
                                  </>
                                )}
                                <button type="button"
                                  onClick={() => upd(it.key, { gen: it.gen.filter((_, x) => x !== gi) })}
                                  className="p-1 text-gray-400 hover:text-red-600"><Trash2 size={12} /></button>
                              </div>
                            ))}
                            <button type="button" onClick={() => upd(it.key, { gen: [...it.gen, { ...emptyGen }] })}
                              className="text-[11px] text-blue-600 hover:underline">＋ 잔재 추가</button>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="text-[11px] text-gray-400 mt-2">
            잔재관리 목록에 있는 여유원재·등록잔재·현장잔재 중에서만 고를 수 있습니다.
            재고 상태이고 다른 곳에 확정되지 않은 것만 나옵니다.
          </p>
        </div>

        <div className="flex justify-end gap-2">
          <Button type="submit" disabled={saving} className="min-w-40">
            <Save size={14} className="mr-1" />
            {saving ? "등록 중…" : `돌발작업 ${items.length}건 등록`}
          </Button>
        </div>
      </form>

      {pickFor && (
        <UrgentRemnantPicker
          remnants={remnants}
          usedIds={usedIds}
          currentId={items.find(it => it.key === pickFor)?.remnant?.id ?? null}
          tab={pickTab}
          setTab={setPickTab}
          q={pickQ}
          setQ={setPickQ}
          onPick={r => upd(pickFor, { remnant: r })}
          onClose={() => setPickFor(null)}
          onRefresh={() => router.refresh()}
        />
      )}
    </div>
  );
}

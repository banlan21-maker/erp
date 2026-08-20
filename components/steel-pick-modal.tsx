"use client";

/**
 * 사용 강재 선택 — 도면행 하나에 **4종 중 무엇으로 자를지** 지정한다.
 *   ① 정규강재(강재입출고 재고)  ② 여유원재  ③ 등록잔재  ④ 현장잔재
 *
 * 정규강재는 개별 판을 고르는 게 아니라 '확정 시 재고에서 자동 선점' 이므로 가능 수량만 보여주고,
 * 잔재 3종은 실제 목록에서 고른다. 사양이 안 맞는 잔재도 **막지 않고 경고만** 한다 —
 * 현장이 일부러 큰 판을 쓰는 경우가 있어서다(대신 빨갛게 표시).
 *
 * 확정(WAITING)·절단완료(CUT) 도면은 서버가 막는다 → [확정취소] 후 다시 지정.
 */

import { useCallback, useEffect, useState } from "react";
import { X, Loader2, Check, AlertTriangle, Package, Layers, Boxes, Search } from "lucide-react";

type Kind = "PLAN" | "SURPLUS" | "REGISTERED" | "REMNANT";

interface Opt {
  id: string; remnantNo: string; type: string; shape: string; material: string; thickness: number;
  width1: number | null; width2: number | null; length1: number | null; length2: number | null;
  weight: number; heatNo: string | null; location: string | null;
  sourceVessel: string | null; sourceBlock: string | null;
  fits: boolean; reason: string; isCurrent: boolean;
}
interface Payload {
  drawing: { id: string; block: string | null; drawingNo: string | null; status: string;
             material: string; thickness: number; width: number; length: number;
             vessel: string; assignedRemnantId: string | null };
  plan: { available: number; reservedElsewhere: number; shipoutMarked: number };
  surplus: Opt[]; registered: Opt[]; remnant: Opt[];
}

const TABS: { key: Kind; label: string; icon: React.ReactNode; cls: string }[] = [
  { key: "PLAN",       label: "정규강재",  icon: <Package size={13} />, cls: "border-blue-500 text-blue-700 bg-blue-50" },
  { key: "SURPLUS",    label: "여유원재",  icon: <Layers size={13} />,  cls: "border-purple-500 text-purple-700 bg-purple-50" },
  { key: "REGISTERED", label: "등록잔재",  icon: <Boxes size={13} />,   cls: "border-orange-500 text-orange-700 bg-orange-50" },
  { key: "REMNANT",    label: "현장잔재",  icon: <Package size={13} />, cls: "border-teal-500 text-teal-700 bg-teal-50" },
];

const dim = (o: Opt) =>
  o.shape === "L_SHAPE" && o.width2 != null && o.length2 != null
    ? `${o.thickness} × ${o.width1 ?? "-"}/${o.width2} × ${o.length1 ?? "-"}/${o.length2}`
    : `${o.thickness} × ${o.width1 ?? "-"} × ${o.length1 ?? "-"}`;

export default function SteelPickModal({
  drawingId, onClose, onSaved,
}: { drawingId: string; onClose: () => void; onSaved: () => void }) {
  const [data, setData]   = useState<Payload | null>(null);
  const [tab, setTab]     = useState<Kind>("PLAN");
  const [busy, setBusy]   = useState(false);
  const [err, setErr]     = useState("");
  const [q, setQ]         = useState("");
  const [onlyFit, setOnlyFit] = useState(true);

  const load = useCallback(async () => {
    setErr("");
    const r = await fetch(`/api/drawings/${drawingId}/steel-options`)
      .then(x => x.json()).catch(() => ({ success: false, error: "네트워크 오류" }));
    if (!r.success) { setErr(r.error ?? "불러오지 못했습니다."); return; }
    setData(r);
    // 지금 붙어 있는 잔재가 있으면 그 탭으로 시작
    const cur = [...r.surplus, ...r.registered, ...r.remnant].find((o: Opt) => o.isCurrent);
    setTab(cur ? (cur.type as Kind) : "PLAN");
  }, [drawingId]);
  useEffect(() => { load(); }, [load]);

  const apply = async (remnantId: string | null) => {
    if (busy) return;
    setBusy(true); setErr("");
    try {
      const r = await fetch(`/api/drawings/${drawingId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "assign", remnantId }),
      }).then(x => x.json()).catch(() => ({ success: false, error: "네트워크 오류" }));
      if (!r.success) { setErr(r.error ?? "적용 실패"); return; }
      onSaved(); onClose();
    } finally { setBusy(false); }
  };

  const d = data?.drawing;
  const list: Opt[] = data
    ? (tab === "SURPLUS" ? data.surplus : tab === "REGISTERED" ? data.registered : tab === "REMNANT" ? data.remnant : [])
    : [];
  const shown = list
    .filter(o => (onlyFit ? o.fits || o.isCurrent : true))
    .filter(o => !q.trim() ||
      `${o.remnantNo} ${o.material} ${o.heatNo ?? ""} ${o.location ?? ""} ${o.sourceVessel ?? ""}`
        .toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => !busy && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[88vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* 헤더 */}
        <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h4 className="font-bold text-gray-900">사용 강재 선택</h4>
            {d && (
              <p className="text-xs text-gray-500 mt-0.5">
                {d.block ?? "-"} / <span className="font-mono">{d.drawingNo ?? "-"}</span>
                <span className="ml-2 text-gray-700 font-medium">{d.material} {d.thickness} × {d.width} × {d.length}</span>
                <span className="ml-2 text-gray-400">호선 {d.vessel}</span>
              </p>
            )}
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full"><X size={16} /></button>
        </div>

        {err && (
          <div className="mx-5 mt-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 whitespace-pre-line">{err}</div>
        )}

        {!data ? (
          <div className="py-16 text-center text-gray-400"><Loader2 className="animate-spin inline mr-2" size={18} /> 불러오는 중...</div>
        ) : (
          <>
            {/* 탭 */}
            <div className="px-5 pt-3 flex gap-1 border-b border-gray-200">
              {TABS.map(t => {
                const n = t.key === "PLAN"
                  ? data.plan.available
                  : (t.key === "SURPLUS" ? data.surplus : t.key === "REGISTERED" ? data.registered : data.remnant)
                      .filter(o => o.fits).length;
                return (
                  <button key={t.key} onClick={() => setTab(t.key)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-t-md border-b-2 -mb-px inline-flex items-center gap-1.5 ${
                      tab === t.key ? t.cls : "border-transparent text-gray-500 hover:text-gray-700"}`}>
                    {t.icon} {t.label} <span className={tab === t.key ? "" : "text-gray-400"}>({n})</span>
                  </button>
                );
              })}
            </div>

            <div className="flex-1 overflow-auto p-5">
              {tab === "PLAN" ? (
                <div className="space-y-3">
                  <div className="border border-blue-200 bg-blue-50/50 rounded-xl p-4">
                    <p className="text-sm font-semibold text-blue-800">강재입출고 재고에서 사용</p>
                    <p className="text-xs text-gray-600 mt-1">
                      정규강재는 개별 판을 고르지 않고, <b>[확정]할 때 같은 사양 재고에서 자동으로 1장 선점</b>합니다.
                    </p>
                    <div className="grid grid-cols-3 gap-2 mt-3 text-center">
                      <div className="bg-white border border-blue-200 rounded-lg py-2">
                        <div className={`text-xl font-bold ${data.plan.available > 0 ? "text-blue-700" : "text-gray-300"}`}>{data.plan.available}</div>
                        <div className="text-[10px] text-gray-500">확정 가능</div>
                      </div>
                      <div className="bg-white border border-gray-200 rounded-lg py-2">
                        <div className="text-xl font-bold text-gray-400">{data.plan.reservedElsewhere}</div>
                        <div className="text-[10px] text-gray-500">다른 블록 확정</div>
                      </div>
                      <div className="bg-white border border-gray-200 rounded-lg py-2">
                        <div className="text-xl font-bold text-gray-400">{data.plan.shipoutMarked}</div>
                        <div className="text-[10px] text-gray-500">외부출고 선별</div>
                      </div>
                    </div>
                    {data.plan.available === 0 && (
                      <p className="text-xs text-amber-700 mt-2 inline-flex items-center gap-1">
                        <AlertTriangle size={12} /> 이 사양의 확정 가능한 정규강재가 없습니다. 잔재 탭에서 고르시거나 강재를 먼저 입고하세요.
                      </p>
                    )}
                  </div>
                  <button onClick={() => apply(null)} disabled={busy || !d?.assignedRemnantId}
                    className="w-full py-2.5 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40">
                    {d?.assignedRemnantId ? "정규강재 사용으로 되돌리기" : "이미 정규강재 사용 중입니다"}
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1 max-w-xs">
                      <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input value={q} onChange={e => setQ(e.target.value)} placeholder="잔재번호·재질·판번호·위치 검색"
                        className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400" />
                    </div>
                    <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                      <input type="checkbox" checked={onlyFit} onChange={e => setOnlyFit(e.target.checked)} className="rounded" />
                      사양 맞는 것만
                    </label>
                    <span className="ml-auto text-xs text-gray-400">{shown.length}건</span>
                  </div>
                  {shown.length === 0 ? (
                    <p className="py-12 text-center text-sm text-gray-400">
                      {onlyFit
                        ? "사양이 맞는 잔재가 없습니다. [사양 맞는 것만] 을 풀면 전체를 볼 수 있습니다."
                        : "사용 가능한 잔재가 없습니다."}
                    </p>
                  ) : (
                    <div className="border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-100">
                      {shown.map(o => (
                        <button key={o.id} onClick={() => apply(o.id)} disabled={busy}
                          className={`w-full text-left px-3 py-2 hover:bg-blue-50 flex items-center gap-3 disabled:opacity-50 ${o.isCurrent ? "bg-blue-50/60" : ""}`}>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-mono text-xs font-semibold text-blue-700">{o.remnantNo}</span>
                              {o.isCurrent && <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-600 text-white font-bold">현재 지정됨</span>}
                              {!o.fits && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700 inline-flex items-center gap-0.5">
                                  <AlertTriangle size={9} /> {o.reason}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-gray-600 mt-0.5">
                              <span className="font-medium">{o.material}</span> {dim(o)}
                              <span className="ml-2 text-gray-400">{o.weight.toFixed(1)}kg</span>
                              {o.heatNo && <span className="ml-2 font-mono text-gray-500">판 {o.heatNo}</span>}
                              {o.location && <span className="ml-2 text-gray-400">위치 {o.location}</span>}
                              {o.sourceVessel && <span className="ml-2 text-gray-400">출처 {o.sourceVessel}{o.sourceBlock ? ` / ${o.sourceBlock}` : ""}</span>}
                            </div>
                          </div>
                          <Check size={15} className={o.isCurrent ? "text-blue-600" : "text-gray-300"} />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        <div className="px-5 py-3 border-t border-gray-200 flex items-center justify-between">
          <span className="text-[11px] text-gray-400">
            사양이 안 맞아도 선택은 됩니다(빨간 경고). 확정·절단 후에는 바꿀 수 없습니다.
          </span>
          <button onClick={onClose} className="px-4 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">닫기</button>
        </div>
      </div>
    </div>
  );
}

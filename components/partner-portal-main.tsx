"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Search, Package, X, Check, AlertTriangle, Loader2 } from "lucide-react";

/**
 * 협력 설계업체 공유 화면 — 여유원재 현황을 보고 선점·사용확정을 남긴다.
 *
 * 남이 잡은 것도 보인다. 그래야 "없는 철판에 네스팅" 이 사라진다.
 * 업체는 선점할 때 고른다 — 링크가 하나뿐이라 자기 신고다.
 * 30초마다 자동으로 다시 읽어 서로의 선점이 실시간에 가깝게 보인다.
 */

interface Claim {
  id: string; vendorId: string; vendorName: string;
  vesselCode: string; block: string | null; actor: string | null; reservedAt: string;
}
interface Row {
  id: string; remnantNo: string; heatNo: string | null;
  material: string; thickness: number; width: number | null; length: number | null;
  weight: number; location: string | null;
  state: "AVAILABLE" | "RESERVED" | "INHOUSE" | "USED";
  claim: Claim | null;
  inhouseNote: string | null;
}
interface Vendor { id: string; name: string }

const STATE = {
  AVAILABLE: { label: "사용가능", cls: "bg-emerald-100 text-emerald-700 border-emerald-300" },
  RESERVED:  { label: "선점중",   cls: "bg-amber-100 text-amber-800 border-amber-300" },
  INHOUSE:   { label: "본사사용", cls: "bg-slate-200 text-slate-600 border-slate-300" },
  USED:      { label: "사용완료", cls: "bg-gray-100 text-gray-400 border-gray-200" },
} as const;

const num = (v: number | null) => (v == null ? "-" : v.toLocaleString());

export default function PartnerPortalMain({ token }: { token: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [q, setQ] = useState("");
  const [onlyAvail, setOnlyAvail] = useState(false);
  const [target, setTarget] = useState<Row | null>(null);

  // 선점 입력값 — 업체·담당자는 한 번 고르면 기억한다(연속 선점이 잦다)
  const [vendorId, setVendorId] = useState("");
  const [actor, setActor] = useState("");
  const [vessel, setVessel] = useState("");
  const [block, setBlock] = useState("");
  const [memo, setMemo] = useState("");

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const r = await fetch(`/api/partner/${token}`, { cache: "no-store" });
      const j = await r.json();
      if (j.success) { setRows(j.data.remnants); setVendors(j.data.vendors); }
    } finally { if (!silent) setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);
  // 여러 업체가 동시에 쓰므로 주기적으로 다시 읽는다 — 남이 방금 잡은 것을 또 잡지 않게
  useEffect(() => {
    const t = setInterval(() => load(true), 30000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (!vendorId && vendors.length > 0) {
      setVendorId(localStorage.getItem("partnerVendorId") || "");
      setActor(localStorage.getItem("partnerActor") || "");
    }
  }, [vendors, vendorId]);

  const shown = useMemo(() => {
    const terms = q.split(",").map(t => t.trim().toLowerCase()).filter(Boolean);
    return rows.filter(r => {
      if (onlyAvail && r.state !== "AVAILABLE") return false;
      if (terms.length === 0) return true;
      const hay = [
        r.remnantNo, r.heatNo ?? "", r.material, r.location ?? "",
        String(r.thickness), String(r.width ?? ""), String(r.length ?? ""),
        r.claim?.vendorName ?? "", r.claim?.vesselCode ?? "", r.claim?.block ?? "",
      ].join(" ").toLowerCase();
      return terms.some(t => hay.includes(t));
    });
  }, [rows, q, onlyAvail, ]);

  const counts = useMemo(() => {
    const c = { AVAILABLE: 0, RESERVED: 0, INHOUSE: 0, USED: 0 };
    for (const r of rows) c[r.state]++;
    return c;
  }, [rows]);

  const post = async (body: Record<string, unknown>) => {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch(`/api/partner/${token}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!j.success) { setMsg({ kind: "err", text: j.error ?? "처리 실패" }); await load(true); return false; }
      setMsg({ kind: "ok", text: j.message ?? "처리했습니다." });
      await load(true);
      return true;
    } catch {
      setMsg({ kind: "err", text: "네트워크 오류가 발생했습니다." });
      return false;
    } finally { setBusy(false); }
  };

  const doReserve = async () => {
    if (!target) return;
    if (!vendorId) { setMsg({ kind: "err", text: "업체를 선택하세요." }); return; }
    if (!vessel.trim()) { setMsg({ kind: "err", text: "호선을 입력하세요." }); return; }
    localStorage.setItem("partnerVendorId", vendorId);
    localStorage.setItem("partnerActor", actor);
    const ok = await post({ action: "reserve", remnantId: target.id, vendorId, vesselCode: vessel, block, actor, memo });
    if (ok) { setTarget(null); setBlock(""); setMemo(""); }
  };

  const label = "block text-xs font-semibold text-gray-600 mb-1";
  const input = "w-full h-9 px-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400";

  return (
    <div className="max-w-7xl mx-auto p-4 space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Package size={20} className="text-blue-600" />
        <h1 className="text-lg font-bold text-gray-900">여유원재 현황</h1>
        <span className="text-xs text-gray-400">진교 · 협력 설계업체 공유</span>
        <button onClick={() => load()} disabled={loading}
          className="ml-auto inline-flex items-center gap-1.5 h-9 px-3 text-sm border border-gray-300 rounded-lg bg-white hover:bg-gray-50">
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> 새로고침
        </button>
      </div>

      {msg && (
        <div className={`rounded-lg px-4 py-2.5 text-sm flex items-start gap-2 ${
          msg.kind === "ok" ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
                            : "bg-red-50 border border-red-200 text-red-700"}`}>
          {msg.kind === "ok" ? <Check size={15} className="shrink-0 mt-0.5" /> : <AlertTriangle size={15} className="shrink-0 mt-0.5" />}
          <span className="whitespace-pre-line">{msg.text}</span>
          <button onClick={() => setMsg(null)} className="ml-auto"><X size={14} /></button>
        </div>
      )}

      {/* 요약 + 검색 */}
      <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center gap-3 flex-wrap">
        {(Object.keys(STATE) as (keyof typeof STATE)[]).map(k => (
          <span key={k} className={`px-2 py-1 rounded-md border text-xs font-semibold ${STATE[k].cls}`}>
            {STATE[k].label} {counts[k]}
          </span>
        ))}
        <label className="flex items-center gap-1.5 text-xs text-gray-600 ml-2">
          <input type="checkbox" checked={onlyAvail} onChange={e => setOnlyAvail(e.target.checked)} />
          사용가능만 보기
        </label>
        <div className="relative flex-1 min-w-[220px]">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={q} onChange={e => setQ(e.target.value)}
            placeholder="재질·두께·폭·길이·판번호·호선 검색 (쉼표로 여러 조건)"
            className="w-full h-9 pl-8 pr-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
        </div>
      </div>

      {/* 목록 */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500">
            <tr>
              <th className="px-3 py-2 text-left">상태</th>
              <th className="px-3 py-2 text-left">잔재번호</th>
              <th className="px-3 py-2 text-left">판번호</th>
              <th className="px-3 py-2 text-left">재질</th>
              <th className="px-3 py-2 text-right">두께</th>
              <th className="px-3 py-2 text-right">폭</th>
              <th className="px-3 py-2 text-right">길이</th>
              <th className="px-3 py-2 text-right">중량(kg)</th>
              <th className="px-3 py-2 text-left">사용처</th>
              <th className="px-3 py-2 text-center w-32"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={10} className="py-16 text-center text-gray-400">불러오는 중…</td></tr>
            ) : shown.length === 0 ? (
              <tr><td colSpan={10} className="py-16 text-center text-gray-400">조건에 맞는 자재가 없습니다.</td></tr>
            ) : shown.map(r => {
              const st = STATE[r.state];
              return (
                <tr key={r.id} className={r.state === "USED" ? "bg-gray-50/60 text-gray-400" : "hover:bg-blue-50/40"}>
                  <td className="px-3 py-2">
                    <span className={`px-1.5 py-0.5 rounded border text-[10px] font-bold whitespace-nowrap ${st.cls}`}>{st.label}</span>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs font-semibold text-blue-700">{r.remnantNo}</td>
                  <td className="px-3 py-2 font-mono text-xs text-gray-500">{r.heatNo ?? "-"}</td>
                  <td className="px-3 py-2 text-xs">{r.material}</td>
                  <td className="px-3 py-2 text-right text-xs tabular-nums">{r.thickness}</td>
                  <td className="px-3 py-2 text-right text-xs tabular-nums">{num(r.width)}</td>
                  <td className="px-3 py-2 text-right text-xs tabular-nums">{num(r.length)}</td>
                  <td className="px-3 py-2 text-right text-xs tabular-nums">{r.weight.toLocaleString()}</td>
                  <td className="px-3 py-2 text-xs text-gray-600">
                    {r.claim
                      ? <span><b>{r.claim.vendorName}</b> · {r.claim.vesselCode}{r.claim.block ? `/${r.claim.block}` : ""}{r.claim.actor ? ` · ${r.claim.actor}` : ""}</span>
                      : r.inhouseNote
                      ? <span className="text-slate-500">{r.inhouseNote}</span>
                      : <span className="text-gray-300">-</span>}
                  </td>
                  <td className="px-3 py-2 text-center whitespace-nowrap">
                    {r.state === "AVAILABLE" && (
                      <button onClick={() => { setTarget(r); setMsg(null); }} disabled={busy}
                        className="px-2.5 py-1 text-xs font-semibold bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50">
                        선점하기
                      </button>
                    )}
                    {r.state === "RESERVED" && r.claim && (
                      <span className="inline-flex gap-1">
                        <button
                          onClick={() => {
                            if (!confirm(`${r.remnantNo} 를 사용확정 처리할까요?\n\n확정하면 본사 재고에서 소진 처리되어 되돌릴 수 없습니다.`)) return;
                            post({ action: "use", claimId: r.claim!.id });
                          }}
                          disabled={busy}
                          className="px-2 py-1 text-xs font-semibold bg-emerald-600 text-white rounded-md hover:bg-emerald-700 disabled:opacity-50">
                          사용확정
                        </button>
                        <button
                          onClick={() => {
                            if (!confirm(`${r.remnantNo} 선점을 해제할까요?`)) return;
                            post({ action: "release", claimId: r.claim!.id });
                          }}
                          disabled={busy}
                          className="px-2 py-1 text-xs border border-gray-300 text-gray-600 rounded-md hover:bg-gray-50 disabled:opacity-50">
                          해제
                        </button>
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-gray-400">
        선점하면 다른 업체가 그 자재를 가져갈 수 없습니다. 네스팅이 끝나면 <b>사용확정</b>을 눌러주세요 — 본사 재고에서 소진 처리됩니다.
        목록은 30초마다 자동으로 갱신됩니다.
      </p>

      {/* 선점 창 */}
      {target && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setTarget(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
              <h3 className="font-bold text-gray-900">자재 선점</h3>
              <button onClick={() => setTarget(null)} className="p-1 hover:bg-gray-100 rounded-full"><X size={16} /></button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="bg-gray-50 rounded-lg px-3 py-2 text-sm">
                <b className="font-mono text-blue-700">{target.remnantNo}</b>
                <span className="text-gray-600 ml-2">
                  {target.material} {target.thickness}t · {num(target.width)}×{num(target.length)} · {target.weight.toLocaleString()}kg
                </span>
                {target.heatNo && <div className="text-xs text-gray-500 mt-0.5">판번호 {target.heatNo}</div>}
              </div>
              <div>
                <label className={label}>업체 <span className="text-red-500">*</span></label>
                <select value={vendorId} onChange={e => setVendorId(e.target.value)} className={`${input} bg-white`}>
                  <option value="">선택하세요</option>
                  {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={label}>호선 <span className="text-red-500">*</span></label>
                  <input value={vessel} onChange={e => setVessel(e.target.value)} placeholder="예: 1023" className={input} />
                </div>
                <div>
                  <label className={label}>블록</label>
                  <input value={block} onChange={e => setBlock(e.target.value)} placeholder="예: B70P" className={input} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={label}>담당자</label>
                  <input value={actor} onChange={e => setActor(e.target.value)} placeholder="이름" className={input} />
                </div>
                <div>
                  <label className={label}>메모</label>
                  <input value={memo} onChange={e => setMemo(e.target.value)} placeholder="특이사항" className={input} />
                </div>
              </div>
            </div>
            <div className="px-5 py-3 border-t border-gray-200 flex justify-end gap-2">
              <button onClick={() => setTarget(null)} className="px-4 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">취소</button>
              <button onClick={doReserve} disabled={busy}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} 선점하기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

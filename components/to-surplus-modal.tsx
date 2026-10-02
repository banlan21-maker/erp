"use client";

import { useEffect, useMemo, useState } from "react";
import { X, Loader2, ArrowRightLeft, AlertTriangle } from "lucide-react";

/**
 * 프로젝트 강재 → 여유원재 이동 (2026-10-02)
 *
 * 선택한 강재를 사양별로 묶고, 묶음마다 따라갈 판번호를 고르게 한다.
 * 강재와 판번호는 사양 단위로만 연결돼 있어 어느 판번호가 이 철판인지 시스템이 모르기 때문이다.
 *   · 판번호 후보가 강재 장수 이하면 전부 미리 체크(대부분 — 실측 1,332장 중 1,270장이 장수 일치)
 *   · 후보가 더 많으면 비워 두고 고르게 한다(아무거나 골라 넣으면 틀린 판번호가 여유원재에 박힌다)
 *   · 덜 고르면 남는 강재는 판번호 없이 옮겨진다(현장 작업일보에서 입력)
 */

interface Group {
  key: string; vesselCode: string; material: string; thickness: number; width: number; length: number;
  planIds: string[]; heats: { id: string; heatNo: string }[];
}
interface Blocked { id: string; vesselCode: string; spec: string; reason: string }

const NAME_KEY = "to-surplus:registeredBy";

export default function ToSurplusModal({ ids, onClose, onDone }: { ids: string[]; onClose: () => void; onDone: () => void }) {
  const [loading, setLoading] = useState(true);
  const [groups, setGroups]   = useState<Group[]>([]);
  const [blocked, setBlocked] = useState<Blocked[]>([]);
  const [picked, setPicked]   = useState<Record<string, Set<string>>>({});
  const [name, setName]       = useState("");
  const [busy, setBusy]       = useState(false);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    try { setName(localStorage.getItem(NAME_KEY) ?? ""); } catch { /* 무시 */ }
    (async () => {
      try {
        const r = await fetch("/api/steel-plan/to-surplus", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "preview", ids }),
        });
        const d = await r.json();
        if (!d.success) { setError(d.error ?? "불러오기 실패"); return; }
        setGroups(d.groups); setBlocked(d.blocked);
        const init: Record<string, Set<string>> = {};
        for (const g of d.groups as Group[]) {
          init[g.key] = new Set(g.heats.length <= g.planIds.length ? g.heats.map(h => h.id) : []);
        }
        setPicked(init);
      } catch { setError("서버 오류"); }
      finally { setLoading(false); }
    })();
  }, [ids]);

  const toggle = (g: Group, heatId: string) => setPicked(prev => {
    const cur = new Set(prev[g.key] ?? []);
    if (cur.has(heatId)) cur.delete(heatId);
    else { if (cur.size >= g.planIds.length) return prev; cur.add(heatId); }
    return { ...prev, [g.key]: cur };
  });

  const plates   = useMemo(() => groups.reduce((s, g) => s + g.planIds.length, 0), [groups]);
  const withHeat = useMemo(() => groups.reduce((s, g) => s + (picked[g.key]?.size ?? 0), 0), [groups, picked]);
  const tons     = useMemo(() => groups.reduce((s, g) => s + g.planIds.length * g.thickness * g.width * g.length * 7.85 / 1e9, 0), [groups]);

  const submit = async () => {
    if (!name.trim()) { setError("처리자 이름을 입력하세요."); return; }
    const noHeat = plates - withHeat;
    if (!confirm(
      `강재 ${plates}장을 여유원재로 옮깁니다.\n` +
      `· 판번호 함께 이동 ${withHeat}장${noHeat ? `\n· 판번호 없이 이동 ${noHeat}장 (현장 작업일보에서 입력)` : ""}\n\n` +
      `프로젝트 강재 목록과 판번호 목록에서는 빠집니다.\n` +
      `잘못 옮긴 건 여유원재 상세에서 [프로젝트 강재로 되돌리기] 할 수 있습니다(아직 안 쓴 것만).\n\n계속할까요?`
    )) return;
    setBusy(true); setError(null);
    try { localStorage.setItem(NAME_KEY, name.trim()); } catch { /* 무시 */ }
    try {
      const r = await fetch("/api/steel-plan/to-surplus", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "move",
          ids: groups.flatMap(g => g.planIds),
          heatIds: groups.flatMap(g => [...(picked[g.key] ?? [])]),
          registeredBy: name.trim(),
        }),
      });
      const d = await r.json();
      if (!d.success) { setError(d.error ?? "처리 실패"); return; }
      alert(`여유원재로 ${d.moved}장 옮겼습니다 (${d.first}${d.moved > 1 ? ` ~ ${d.last}` : ""}).\n판번호 함께 이동 ${d.withHeat}장.\n잔재관리 → 여유원재에서 확인하세요.`);
      onDone();
    } catch { setError("서버 오류"); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="px-5 py-3 border-b flex items-center gap-2">
          <ArrowRightLeft size={16} className="text-amber-600" />
          <h3 className="font-bold text-gray-800">여유원재로 이동</h3>
          {!loading && <span className="text-sm text-gray-500">{plates}장 · 약 {tons.toFixed(1)}톤</span>}
          <button onClick={onClose} className="ml-auto text-gray-400 hover:text-gray-700"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 text-sm">
          {loading ? (
            <p className="text-gray-400 flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> 불러오는 중…</p>
          ) : (
            <>
              {blocked.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800 space-y-1">
                  <p className="font-semibold flex items-center gap-1"><AlertTriangle size={12} /> 옮길 수 없어 제외되는 강재 {blocked.length}장</p>
                  {blocked.slice(0, 8).map(b => <p key={b.id}>· {b.vesselCode} {b.spec} — {b.reason}</p>)}
                  {blocked.length > 8 && <p>· 외 {blocked.length - 8}장</p>}
                </div>
              )}
              {groups.length === 0 ? (
                <p className="text-gray-500">옮길 수 있는 강재가 없습니다. 입고 상태이면서 블록확정·출고선별이 없는 강재만 옮길 수 있습니다.</p>
              ) : groups.map(g => {
                const sel = picked[g.key] ?? new Set<string>();
                const need = g.planIds.length;
                return (
                  <div key={g.key} className="border border-gray-200 rounded-lg">
                    <div className="px-3 py-2 bg-gray-50 border-b flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-800">[{g.vesselCode}] {g.material} {g.thickness}×{g.width.toLocaleString()}×{g.length.toLocaleString()}</span>
                      <span className="text-gray-500">{need}장</span>
                      <span className={`ml-auto text-xs ${sel.size === need ? "text-green-700" : "text-amber-700"}`}>
                        판번호 {sel.size}/{need} 선택
                        {g.heats.length > need && sel.size < need && " — 실물에 맞는 판번호를 고르세요"}
                      </span>
                    </div>
                    <div className="px-3 py-2">
                      {g.heats.length === 0 ? (
                        <p className="text-xs text-gray-400">이 사양의 대기 판번호가 없습니다 — 판번호 없이 옮겨집니다.</p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {g.heats.map(h => {
                            const on = sel.has(h.id);
                            const full = !on && sel.size >= need;
                            return (
                              <button key={h.id} onClick={() => toggle(g, h.id)} disabled={full}
                                className={`px-2 py-1 rounded border font-mono text-xs ${on ? "bg-amber-100 border-amber-400 text-amber-900" : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"} disabled:opacity-40`}>
                                {on ? "✓ " : ""}{h.heatNo}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>

        <div className="px-5 py-3 border-t space-y-2">
          {error && <p className="text-sm text-red-600 whitespace-pre-line">{error}</p>}
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500">처리자</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="이름" className="w-32 px-2 py-1 text-sm border border-gray-300 rounded" />
            <span className="text-xs text-gray-400">판번호 함께 {withHeat}장 · 없이 {plates - withHeat}장</span>
            <button onClick={onClose} className="ml-auto px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">취소</button>
            <button onClick={submit} disabled={busy || loading || plates === 0}
              className="px-3 py-1.5 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-40">
              {busy ? "옮기는 중…" : `여유원재로 이동 (${plates}장)`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

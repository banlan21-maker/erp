"use client";

/**
 * 현장 출고관리 (모바일) — /field/shipout
 *  ① 판번호 입력 → 사양(호선/재질/사이즈) 확인 → 선별목록 매칭 후보
 *  ② 후보 선택 → 그 강재에 판번호 대입 → 출고 카트 담기
 *  ③ 출고장 만들기 (간소 1차분) → POST /api/shipments (PC와 동일 데이터·연계)
 *  ④ 출고장 목록 확인 (외부출고관리-출고장)
 *
 * 카트는 PC와 동일한 ShipoutCartProvider(sessionStorage) 사용.
 */

import { useCallback, useEffect, useState } from "react";
import {
  Search, PackageOpen, Truck, Trash2, X, Loader2, CheckCircle2, AlertTriangle,
  ChevronLeft, ChevronUp, ChevronDown, ListChecks, ClipboardList, MapPin, RefreshCw, History, Zap,
} from "lucide-react";
import { ShipoutCartProvider, useShipoutCart, type ShipoutCartItem } from "@/components/shipout-cart";

const calcWeight = (t: number, w: number, l: number) => parseFloat(((t * w * l * 7.85) / 1_000_000).toFixed(1));
const fmtT = (v: number) => parseFloat(v.toFixed(1));
const fmtL = (v: number) => Math.round(v);
const fmtKg = (n: number) => `${n.toLocaleString("ko-KR", { maximumFractionDigits: 1 })} kg`;
const todayKst = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());

/**
 * 판번호 입력 정리 — 바코드 스캐너가 붙이는 공백·개행·제어문자는 걸러내되
 * 실제 판번호에 쓰이는 하이픈은 살린다.
 *
 * 예전 규칙 `replace(/[^A-Z0-9]/g, "")` 은 하이픈까지 지워서, 실물 라벨이 "SUS-4" 인 철판을
 * 찍으면 "SUS4" 가 서버로 가고 "등록되지 않은 판번호" 가 떴다(현재 DB 에 하이픈 판번호 72개).
 * 더 나쁜 건 현장직접출고에서 그 상태로 담으면 "SUS4" 라는 가짜 판번호가 새로 등록되는 것.
 * 서버(lib/heat-lookup.ts)에도 정규화 폴백이 있어 하이픈을 빼고 쳐도 찾아준다.
 */
const cleanHeatNo = (s: string) => s.toUpperCase().replace(/[^A-Z0-9-]/g, "");
const firstOfMonthKst = () => { const t = todayKst(); return `${t.slice(0, 7)}-01`; };

// ── 최근 담은 내역(이 기기 localStorage, 최대 20) — "어디까지 했는지" 추적용 ──
const RECENT_KEY = "field-shipout-recent-v1";
interface RecentEntry { heatNo: string; label: string; at: number; kind?: "plate" | "remnant" }
const REM_TYPE_LABEL: Record<string, string> = { SURPLUS: "여유원재", REGISTERED: "등록잔재", REMNANT: "현장잔재" };
const fmtRecent = (ms: number) => {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(ms));
  const g = (t: string) => p.find(x => x.type === t)?.value ?? "";
  return `${g("month")}/${g("day")} ${g("hour")}:${g("minute")}`;
};

interface Candidate {
  id: string; vesselCode: string; material: string; thickness: number; width: number; length: number;
  weight: number; storageLocation: string | null; shipoutHeatNo: string | null; shipoutLabel: string | null;
  otherVessel?: boolean;   // 입력 판번호의 호선과 다른 호선의 강재 (야드에 호선이 섞여 쌓이므로 정상)
}
interface LookResult {
  matched: boolean; reason?: string; heatNo: string; heatId?: string;
  spec?: { vesselCode: string; material: string; thickness: number; width: number; length: number };
  candidates?: Candidate[];
}
interface RemnantInfo {
  id: string; remnantNo: string; type: string; vesselCode: string; material: string;
  thickness: number; width1: number | null; length1: number | null; weight: number; heatNo: string | null; location: string | null;
}
interface RemLookResult { matched: boolean; reason?: string; remnantNo: string; remnant?: RemnantInfo }
interface Vendor {
  id: string; bizNo: string | null; name: string; ceo: string | null; address: string | null;
  bizType: string | null; bizItem: string | null; phone: string | null; fax: string | null;
}

export default function FieldShipout() {
  return (
    <ShipoutCartProvider storageKey="field-shipout-cart-v1">
      <Inner />
    </ShipoutCartProvider>
  );
}

function Inner() {
  const cart = useShipoutCart();
  const [tab, setTab] = useState<"add" | "adhoc" | "list">("add");
  const [wizardOpen, setWizardOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);   // 하단 카트바 "담은 목록" 펼침

  return (
    <div className="min-h-screen bg-gray-950 text-white pb-28">
      {/* 헤더 */}
      <header className="sticky top-0 z-20 bg-gray-900/95 backdrop-blur border-b border-gray-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <a href="/field" className="p-1.5 -ml-1.5 rounded-lg hover:bg-gray-800 text-gray-400"><ChevronLeft size={20} /></a>
          <h1 className="text-base font-bold flex items-center gap-1.5"><Truck size={18} className="text-amber-400" /> 현장 출고관리</h1>
        </div>
        <div className="flex items-center gap-1 text-xs text-gray-400">
          <PackageOpen size={15} className="text-purple-400" />
          <span className="font-bold text-white">{cart.items.length}</span>건
        </div>
      </header>

      {/* 탭 */}
      <div className="grid grid-cols-3 border-b border-gray-800 bg-gray-900 sticky top-[57px] z-10">
        <button onClick={() => setTab("add")}
          className={`py-3 text-xs font-semibold flex items-center justify-center gap-1 ${tab === "add" ? "text-amber-400 border-b-2 border-amber-400" : "text-gray-500"}`}>
          <ListChecks size={15} /> 출고 담기
        </button>
        <button onClick={() => setTab("adhoc")}
          className={`py-3 text-xs font-semibold flex items-center justify-center gap-1 ${tab === "adhoc" ? "text-cyan-300 border-b-2 border-cyan-400" : "text-gray-500"}`}>
          <Zap size={15} /> 현장직접출고
        </button>
        <button onClick={() => setTab("list")}
          className={`py-3 text-xs font-semibold flex items-center justify-center gap-1 ${tab === "list" ? "text-amber-400 border-b-2 border-amber-400" : "text-gray-500"}`}>
          <ClipboardList size={15} /> 출고장 목록
        </button>
      </div>

      {tab === "add" ? <AddTab /> : tab === "adhoc" ? <AdHocTab /> : <ShipmentListTab />}

      {/* 하단 카트바 (+ 펼친 담은 목록 — 개별 🗑️ 취소) */}
      {cart.items.length > 0 && tab !== "list" && (
        <div className="fixed bottom-0 left-0 right-0 z-20">
          {/* 펼친 담은 목록 — 잘못 담은 자재를 1건씩 취소 */}
          {cartOpen && (
            <div className="max-h-[55vh] overflow-y-auto bg-gray-900 border-t border-purple-800 px-3 py-2.5 space-y-1.5">
              {cart.items.map(it => (
                <div key={it.steelPlanId} className="flex items-center justify-between gap-2 bg-gray-800/70 border border-gray-700 rounded-lg px-3 py-2">
                  <div className="min-w-0">
                    <div className="text-xs text-gray-200 truncate">
                      {it.vesselCode} · {it.material} · {fmtT(it.thickness)}×{fmtL(it.width)}×{fmtL(it.length)} · {fmtKg(it.weight)}
                      {it.kind === "remnant" && <span className="ml-1 text-[10px] px-1 rounded bg-amber-900/50 text-amber-300">잔재</span>}
                      {it.adHocFromField && (
                        <span className="ml-1 text-[10px] px-1 rounded bg-cyan-900/50 text-cyan-300">
                          현장직접{it.originShipoutLabel ? ` (원선별: ${it.originShipoutLabel})` : ""}
                        </span>
                      )}
                    </div>
                    {(it.kind === "remnant" ? it.remnantNo : it.prefilledHeatNo) && (
                      <div className="font-mono text-xs text-gray-400 mt-0.5 truncate">
                        {it.kind === "remnant" ? `잔재번호 ${it.remnantNo}` : `판번호 ${it.prefilledHeatNo}`}
                      </div>
                    )}
                  </div>
                  <button onClick={() => cart.remove(it.steelPlanId)} aria-label="카트에서 제거"
                    className="p-2 text-gray-400 hover:text-red-400 shrink-0"><Trash2 size={18} /></button>
                </div>
              ))}
            </div>
          )}

          <div className="bg-purple-900 border-t-2 border-purple-700 px-4 py-3 flex items-center justify-between">
            <div className="text-sm flex items-center gap-2">
              <button onClick={() => setCartOpen(o => !o)} className="flex items-center gap-1">
                <span className="font-bold text-white">{cart.items.length}</span>건 · {fmtKg(cart.totalWeight)}
                {cartOpen ? <ChevronDown size={15} className="text-purple-300" /> : <ChevronUp size={15} className="text-purple-300" />}
              </button>
              <button onClick={() => { if (confirm("카트를 비우시겠습니까?")) { cart.clear(); setCartOpen(false); } }} className="text-purple-300 underline text-xs">비우기</button>
            </div>
            <button onClick={() => setWizardOpen(true)}
              className="px-5 py-2.5 bg-amber-500 text-black font-bold rounded-xl text-sm flex items-center gap-1.5">
              <Truck size={16} /> 출고장 만들기
            </button>
          </div>
        </div>
      )}

      {wizardOpen && <Wizard onClose={() => setWizardOpen(false)} onDone={() => { setWizardOpen(false); setTab("list"); }} />}
    </div>
  );
}

/* ── 출고 담기 ─────────────────────────────────────────────────────────── */
function AddTab() {
  const cart = useShipoutCart();
  const [remMode, setRemMode] = useState(false);   // true=잔재출고(잔재번호) / false=원판(판번호)
  const [heatNo, setHeatNo] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<LookResult | null>(null);
  const [remResult, setRemResult] = useState<RemLookResult | null>(null);
  const [recent, setRecent] = useState<RecentEntry[]>([]);

  useEffect(() => {
    try { const raw = localStorage.getItem(RECENT_KEY); if (raw) setRecent(JSON.parse(raw)); } catch {}
  }, []);
  const pushRecent = (e: RecentEntry) => setRecent(prev => {
    const next = [e, ...prev].slice(0, 20);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch {}
    return next;
  });
  const clearRecent = () => { setRecent([]); try { localStorage.removeItem(RECENT_KEY); } catch {} };

  const lookup = async () => {
    const h = heatNo.trim();
    if (!h) return;
    setBusy(true); setResult(null); setRemResult(null);
    try {
      const url = remMode
        ? `/api/remnants/shipout-field?remnantNo=${encodeURIComponent(h)}`
        : `/api/steel-plan/shipout-field?heatNo=${encodeURIComponent(h)}`;
      const r = await fetch(url).then(r => r.json());
      if (!r.success) { alert(r.error ?? "조회 실패"); return; }
      if (remMode) setRemResult(r as RemLookResult); else setResult(r as LookResult);
    } catch (e) { alert(e instanceof Error ? e.message : "네트워크 오류"); }
    finally { setBusy(false); }
  };

  const addCandidate = (c: Candidate) => {
    const h = (result?.heatNo ?? "").trim();
    if (cart.items.some(it => (it.prefilledHeatNo ?? "") === h && h)) {
      alert(`판번호 ${h} 는 이미 카트에 담겨 있습니다.`);
      return;
    }
    const item: ShipoutCartItem = {
      steelPlanId: c.id, kind: "plate",
      vesselCode: c.vesselCode, material: c.material,
      thickness: c.thickness, width: c.width, length: c.length,
      weight: c.weight, prefilledHeatNo: h || undefined,
      steelPlanHeatId: result?.heatId,   // 입력 판번호의 WAITING heat → 출고 시 SHIPPED 전환
    };
    const { added, duplicates } = cart.add([item]);
    if (duplicates) { alert("이미 카트에 담긴 강재입니다."); return; }
    if (added) {
      // 최근 담은 내역 기록 (어디까지 했는지 추적용)
      pushRecent({ heatNo: h, kind: "plate", label: `${c.vesselCode} · ${c.material} ${fmtT(c.thickness)}×${fmtL(c.width)}×${fmtL(c.length)}`, at: Date.now() });
      // 다음 판번호 스캔을 위해 입력/결과 초기화
      setHeatNo(""); setResult(null);
    }
  };

  const addRemnant = (r: RemnantInfo) => {
    if (cart.has(r.id)) { alert(`잔재 ${r.remnantNo} 는 이미 카트에 담겨 있습니다.`); return; }
    const item: ShipoutCartItem = {
      steelPlanId: r.id, kind: "remnant", remnantId: r.id,
      vesselCode: r.vesselCode, material: r.material,
      thickness: r.thickness, width: r.width1 ?? 0, length: r.length1 ?? 0,
      weight: r.weight, prefilledHeatNo: r.heatNo ?? undefined, remnantNo: r.remnantNo,
    };
    const { added, duplicates } = cart.add([item]);
    if (duplicates) { alert("이미 카트에 담긴 잔재입니다."); return; }
    if (added) {
      pushRecent({ heatNo: r.remnantNo, kind: "remnant", label: `${REM_TYPE_LABEL[r.type] ?? r.type} · ${r.material} ${fmtT(r.thickness)}×${r.width1 ? fmtL(r.width1) : "-"}×${r.length1 ? fmtL(r.length1) : "-"}`, at: Date.now() });
      setHeatNo(""); setRemResult(null);
    }
  };

  const reasonMsg = (reason?: string) =>
    reason === "NOT_FOUND" ? (remMode ? "등록되지 않은 잔재번호입니다. 입력을 다시 확인하세요." : "등록되지 않은 판번호입니다. 입력을 다시 확인하세요.") :
    reason === "ALREADY_USED" ? "이미 절단/출고로 소진된 판번호입니다." :
    reason === "EXHAUSTED" ? "이미 소진(출고/절단)된 잔재입니다." :
    reason === "RESERVED" ? "절단용으로 블록확정된 잔재입니다. 확정취소 후 출고하세요." :
    reason === "PENDING" ? "아직 출고 가능(재고) 상태가 아닙니다." :
    reason === "ALREADY_SHIPPED" ? "이미 출고장에 포함된 잔재입니다." :
    "매칭 실패";

  return (
    <div className="p-4 space-y-4">
      {/* 판번호/잔재번호 입력 */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
        {/* 잔재출고 토글 — 체크 시 잔재번호, 해제 시 판번호 */}
        <label className="flex items-center gap-2 mb-3 cursor-pointer select-none">
          <input type="checkbox" checked={remMode}
            onChange={e => { setRemMode(e.target.checked); setHeatNo(""); setResult(null); setRemResult(null); }}
            className="w-4 h-4 accent-amber-500" />
          <span className={`text-sm font-bold ${remMode ? "text-amber-300" : "text-gray-300"}`}>잔재 출고</span>
          <span className="text-[11px] text-gray-500">체크 시 잔재번호로 출고 (여유원재·등록잔재·현장잔재)</span>
        </label>
        <label className="block text-xs font-semibold text-gray-400 mb-2">
          {remMode ? "잔재번호 입력" : "판번호 입력"}{" "}
          <span className="font-normal text-gray-500">{remMode ? "(대문자·숫자·특수문자)" : "(대문자·숫자·하이픈 — 키보드·바코드 모두 자동 정리)"}</span>
        </label>
        <div className="flex gap-2">
          <input
            value={heatNo}
            // 판번호: 대문자영문+숫자만. 잔재번호: 대문자영문+숫자+특수문자 허용(소문자만 대문자화).
            // 바코드(PDA) 스캔 입력도 onChange 를 거치므로 동일하게 정리됨.
            onChange={e => setHeatNo(remMode ? e.target.value.toUpperCase() : cleanHeatNo(e.target.value))}
            onKeyDown={e => { if (e.key === "Enter") lookup(); }}
            placeholder={remMode ? "예: REM-2026-031" : "예: HT240001"}
            inputMode="text" autoCapitalize="characters" autoComplete="off" autoCorrect="off" spellCheck={false}
            className="flex-1 px-4 py-3 text-lg font-mono bg-gray-800 border border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-400 text-white placeholder-gray-600"
          />
          <button onClick={lookup} disabled={busy || !heatNo.trim()}
            className="px-5 bg-amber-500 text-black font-bold rounded-xl disabled:opacity-40 flex items-center gap-1">
            {busy ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />}
          </button>
        </div>
      </div>

      {/* 결과 */}
      {result && !result.matched && (
        <div className="bg-red-950/60 border border-red-800 rounded-2xl p-4 flex items-start gap-2 text-sm text-red-300">
          <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" />
          <div><div className="font-bold text-red-200">{result.heatNo}</div>{reasonMsg(result.reason)}</div>
        </div>
      )}

      {result && result.matched && result.spec && (
        <>
          {/* 사양 확인 카드 */}
          <div className="bg-gray-900 border border-amber-700/40 rounded-2xl p-4">
            <div className="text-xs text-gray-400 mb-1">판번호 <span className="font-mono font-bold text-amber-300">{result.heatNo}</span> 사양</div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <span><span className="text-gray-500">호선</span> <b className="text-white">{result.spec.vesselCode}</b></span>
              <span><span className="text-gray-500">재질</span> <b className="text-white">{result.spec.material}</b></span>
              <span><span className="text-gray-500">규격</span> <b className="text-white font-mono">{fmtT(result.spec.thickness)}×{fmtL(result.spec.width)}×{fmtL(result.spec.length)}</b></span>
            </div>
          </div>

          {/* 선별목록 후보 */}
          <div>
            <div className="text-xs font-semibold text-gray-400 mb-2 px-1">
              선별목록 일치 강재 {result.candidates?.length ?? 0}건 — 실물과 맞는 강재를 선택
              <span className="text-gray-600 font-normal ml-1">(규격 기준 · 호선 무관)</span>
            </div>
            {(result.candidates?.length ?? 0) === 0 ? (
              // N10: 사무실 선별 요구 흐름의 후보 없음 안내 — 대안 흐름 명시
              <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 text-sm text-gray-400 space-y-2">
                <div className="text-center text-gray-500">일치하는 <b className="text-white">선별</b> 강재가 없습니다.</div>
                <div className="text-[11px] leading-relaxed border-t border-gray-800 pt-2">
                  가능한 이유:<br />
                  · 사무실이 아직 선별하지 않았음 → 사무실에 <b>출고등록/강재매칭</b> 요청<br />
                  · 자재가 블록확정(절단용)되어 있음 → 프로젝트에서 <b>확정취소</b> 필요<br />
                  · 실제 재고 없음 → <b>[현장직접출고]</b> 탭에서 사양으로 재검색해보세요
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {result.candidates!.map(c => {
                  const inCart = cart.has(c.id);
                  return (
                    <div key={c.id} className={`bg-gray-900 border rounded-2xl p-3.5 ${inCart ? "border-purple-700 opacity-60" : "border-gray-800"}`}>
                      <div className="flex items-center justify-between">
                        <div className="text-sm">
                          <div className="font-bold text-white flex items-center gap-1.5">
                            {c.vesselCode} · {c.material}
                            {c.otherVessel && (
                              <span className="text-[10px] px-1 py-0.5 rounded bg-cyan-900/60 text-cyan-300 font-normal">다른 호선</span>
                            )}
                          </div>
                          <div className="font-mono text-gray-400 text-xs mt-0.5">{fmtT(c.thickness)}×{fmtL(c.width)}×{fmtL(c.length)} · {fmtKg(c.weight)}</div>
                          <div className="flex items-center gap-2 mt-1 text-[11px] text-gray-500">
                            {c.storageLocation && <span className="flex items-center gap-0.5"><MapPin size={11} />{c.storageLocation}</span>}
                            <span className="px-1.5 py-0.5 rounded bg-red-900/40 text-red-300">{c.shipoutLabel ?? c.vesselCode} 선별</span>
                          </div>
                        </div>
                        {inCart ? (
                          <span className="text-purple-300 text-xs font-semibold flex items-center gap-1"><CheckCircle2 size={15} /> 담김</span>
                        ) : (
                          <button onClick={() => addCandidate(c)}
                            className="px-3.5 py-2 bg-purple-600 text-white text-sm font-bold rounded-xl flex-shrink-0">담기</button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* 잔재 결과 */}
      {remResult && !remResult.matched && (
        <div className="bg-red-950/60 border border-red-800 rounded-2xl p-4 flex items-start gap-2 text-sm text-red-300">
          <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" />
          <div><div className="font-bold text-red-200">{remResult.remnantNo}</div>{reasonMsg(remResult.reason)}</div>
        </div>
      )}
      {remResult && remResult.matched && remResult.remnant && (() => {
        const r = remResult.remnant!;
        const inCart = cart.has(r.id);
        return (
          <div className={`bg-gray-900 border rounded-2xl p-3.5 ${inCart ? "border-purple-700 opacity-60" : "border-amber-700/40"}`}>
            <div className="flex items-center justify-between">
              <div className="text-sm">
                <div className="font-bold flex items-center gap-1.5">
                  <span className="font-mono text-amber-300">{r.remnantNo}</span>
                  <span className="text-[10px] px-1 rounded bg-amber-900/50 text-amber-300">{REM_TYPE_LABEL[r.type] ?? r.type}</span>
                </div>
                <div className="text-gray-400 text-xs mt-0.5">{r.vesselCode || "-"} · {r.material}</div>
                <div className="font-mono text-gray-400 text-xs mt-0.5">{fmtT(r.thickness)}×{r.width1 ? fmtL(r.width1) : "-"}×{r.length1 ? fmtL(r.length1) : "-"} · {fmtKg(r.weight)}</div>
                {r.location && <div className="flex items-center gap-0.5 mt-1 text-[11px] text-gray-500"><MapPin size={11} />{r.location}</div>}
              </div>
              {inCart ? (
                <span className="text-purple-300 text-xs font-semibold flex items-center gap-1"><CheckCircle2 size={15} /> 담김</span>
              ) : (
                <button onClick={() => addRemnant(r)}
                  className="px-3.5 py-2 bg-purple-600 text-white text-sm font-bold rounded-xl flex-shrink-0">담기</button>
              )}
            </div>
          </div>
        );
      })()}

      {!result && !remResult && recent.length === 0 && (
        <p className="text-center text-sm text-gray-600 pt-6">{remMode ? "잔재번호를 입력하면 출고 가능한 잔재를 찾아줍니다." : "판번호를 입력하면 선별목록에서 일치하는 강재를 찾아줍니다."}</p>
      )}

      {/* 최근 담은 내역 — 일시와 함께(이 기기 기준). 어디까지 했는지 추적 */}
      {recent.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-400 flex items-center gap-1">
              <History size={13} /> 최근 담은 내역 <span className="text-gray-600">({recent.length})</span>
            </span>
            <button onClick={() => { if (confirm("최근 내역을 지우시겠습니까?")) clearRecent(); }} className="text-[11px] text-gray-500 underline">지우기</button>
          </div>
          <ul className="divide-y divide-gray-800">
            {recent.map((e, i) => (
              <li key={i} className="flex items-center justify-between gap-2 py-1.5 text-xs">
                <span className="font-mono font-bold text-amber-300 shrink-0 flex items-center gap-1">
                  {e.kind === "remnant" && <span className="text-[9px] px-1 rounded bg-amber-900/50 text-amber-300 font-sans">잔재</span>}
                  {e.heatNo}
                </span>
                <span className="text-gray-500 truncate flex-1 text-right">{e.label}</span>
                <span className="text-gray-600 tabular-nums shrink-0 w-[78px] text-right">{fmtRecent(e.at)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ── 현장직접출고 탭 ────────────────────────────────────────────────────────
   사무실 선별지시서(shipoutMarkedAt) 없이 현장에서 판번호 또는 사양으로
   직접 조회하여 담는 흐름. 담긴 자재는 adHocFromField=true 로 저장돼
   사후 감사/통계에서 구분됨. 카트는 [출고 담기] 탭과 공유. */

interface AdHocCandidate {
  id: string; vesselCode: string; material: string;
  thickness: number; width: number; length: number; weight: number;
  storageLocation: string | null;
  receivedAt: string | null;
  shipoutHeatNo: string | null; shipoutLabel: string | null;
  shipoutMarkedAt: string | null;
  otherVessel?: boolean;   // 입력 판번호의 호선과 다른 호선의 강재
}
interface AdHocSpec { vesselCode: string; material: string; thickness: number; width: number; length: number }
interface AdHocResult {
  matched: boolean; reason?: string; heatNo?: string; heatId?: string;
  spec?: AdHocSpec;
  candidates?: AdHocCandidate[];
  multiSpecCount?: number;   // I10: 같은 판번호가 여러 사양에 있으면 그 수
  otherSpecs?: AdHocSpec[];  // I10: 대표 사양 외 다른 사양들
  // N10: 후보 0건일 때 원인 카운트
  reservedCount?: number;    // 사양 매칭 자재 중 블록확정 상태
  notReceivedCount?: number; // 사양 매칭 자재 중 미입고/투입/절단/외부
  // 후보 0건일 때, 재질·치수가 같고 다른 호선에 남아 있는 입고 자재 (호선 유용 대응)
  otherVesselStock?: { vesselCode: string; count: number }[];
}

function AdHocTab() {
  const cart = useShipoutCart();
  const [heatNo, setHeatNo] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AdHocResult | null>(null);

  // 사양 폴백 폼 (판번호가 시스템에 없을 때 + 판번호는 있는데 그 호선 재고가 0건일 때)
  const [specVessel, setSpecVessel]   = useState("");
  const [specMaterial, setSpecMaterial] = useState("");
  const [specT, setSpecT] = useState("");
  const [specW, setSpecW] = useState("");
  const [specL, setSpecL] = useState("");
  const [specOpen, setSpecOpen] = useState(false);   // 0건일 때 사양 폼 펼침 여부

  // 담기 확인 다이얼로그 (카트에 자재가 있을 때만)
  const [pending, setPending] = useState<{ c: AdHocCandidate; heatNo: string; heatId?: string } | null>(null);

  const resetSpec = () => { setSpecVessel(""); setSpecMaterial(""); setSpecT(""); setSpecW(""); setSpecL(""); setSpecOpen(false); };

  const lookupByHeat = async () => {
    const h = heatNo.trim();
    if (!h) return;
    setBusy(true); setResult(null); resetSpec();
    try {
      const r = await fetch(`/api/steel-plan/shipout-field-adhoc?heatNo=${encodeURIComponent(h)}`).then(r => r.json());
      if (!r.success) { alert(r.error ?? "조회 실패"); return; }
      setResult(r as AdHocResult);
    } catch (e) { alert(e instanceof Error ? e.message : "네트워크 오류"); }
    finally { setBusy(false); }
  };

  /** 사양으로 후보 조회 — 폼 입력값 또는 "다른 호선 재고" 원터치 버튼에서 호출 */
  const runSpecLookup = async (s: {
    vesselCode: string; material: string; thickness: string; width: string; length: string;
  }) => {
    const t = parseFloat(s.thickness), w = parseFloat(s.width), l = parseFloat(s.length);
    if (!s.vesselCode.trim() || !s.material.trim() || !Number.isFinite(t) || !Number.isFinite(w) || !Number.isFinite(l)) {
      alert("호선·재질·두께·폭·길이를 모두 입력하세요."); return;
    }
    setBusy(true);
    try {
      const q = new URLSearchParams({
        vesselCode: s.vesselCode.trim(),
        material:   s.material.trim(),
        thickness:  String(t),
        width:      String(w),
        length:     String(l),
      });
      const r = await fetch(`/api/steel-plan/shipout-field-adhoc?${q}`).then(r => r.json());
      if (!r.success) { alert(r.error ?? "조회 실패"); return; }
      // 사양 조회 결과에도 heatNo 는 사용자가 입력한 값 유지 → 신규 SteelPlanHeat 로 생성됨
      setResult({ ...(r as AdHocResult), heatNo: heatNo.trim() || undefined });
      // 이어서 손보기 쉽도록 폼에도 방금 조회한 사양을 반영해 펼쳐둔다
      setSpecVessel(s.vesselCode.trim()); setSpecMaterial(s.material.trim());
      setSpecT(String(t)); setSpecW(String(w)); setSpecL(String(l));
      setSpecOpen(true);
    } catch (e) { alert(e instanceof Error ? e.message : "네트워크 오류"); }
    finally { setBusy(false); }
  };

  const lookupBySpec = () => runSpecLookup({
    vesselCode: specVessel, material: specMaterial, thickness: specT, width: specW, length: specL,
  });

  /** 현재 조회된 사양을 폼에 채우고 펼친다 (호선만 바꿔 재검색하는 용도) */
  const openSpecFromResult = () => {
    const s = result?.spec;
    if (s) {
      setSpecVessel(s.vesselCode); setSpecMaterial(s.material);
      setSpecT(String(s.thickness)); setSpecW(String(s.width)); setSpecL(String(s.length));
    }
    setSpecOpen(true);
  };

  const addToCart = (c: AdHocCandidate, heatText: string, heatId?: string) => {
    const item: ShipoutCartItem = {
      steelPlanId: c.id, kind: "plate",
      vesselCode: c.vesselCode, material: c.material,
      thickness: c.thickness, width: c.width, length: c.length,
      weight: c.weight,
      prefilledHeatNo: heatText || undefined,
      steelPlanHeatId: heatId,             // 매칭된 판번호가 있으면 그 heat 를 SHIPPED 로 전환
      adHocFromField: true,                // 현장직접출고 감사 태그
      originShipoutLabel: c.shipoutLabel,  // I1: 원 사무실 선별 라벨 스냅샷 (없으면 null)
    };
    const { added, duplicates } = cart.add([item]);
    if (duplicates) { alert("이미 카트에 담긴 강재입니다."); return; }
    if (added) {
      // 다음 판번호 스캔을 위해 초기화
      setHeatNo(""); setResult(null); resetSpec();
    }
  };

  const requestAdd = (c: AdHocCandidate) => {
    if (cart.has(c.id)) { alert("이미 카트에 담긴 강재입니다."); return; }
    const heatText = (result?.heatNo ?? heatNo).trim();
    if (!heatText) { alert("판번호를 먼저 입력하세요. (현장직접출고는 판번호 필수)"); return; }
    // I6: 같은 판번호(다른 원판)를 카트에 이미 담았으면 사전 차단
    // — 서버 POST 에서 최종 검증되지만 담기 시점에서 즉시 알림
    if (cart.items.some(it => (it.prefilledHeatNo ?? "").trim() === heatText)) {
      alert(`판번호 ${heatText} 는 이미 카트에 담긴 다른 자재에 사용됐습니다.`);
      return;
    }
    // I1: 사무실 선별된 자재는 담기 전 명시적 확인
    // shipoutMarkedAt 이 있으면 사무실이 특정 납품처용으로 골라둔 자재 — 조용히 가져가지 못하게
    if (c.shipoutMarkedAt) {
      const labelText = c.shipoutLabel ? `[${c.shipoutLabel}]` : "";
      const ok = confirm(
        `이 자재는 사무실이 ${labelText} 용으로 선별해둔 자재입니다.\n\n` +
        `이 출고장에 담으면 사무실 선별목록에서 사라집니다.\n` +
        `(원 선별 정보는 이력에 남아 추후 확인 가능)\n\n` +
        `계속 담으시겠습니까?`
      );
      if (!ok) return;
    }
    if (cart.items.length === 0) {
      addToCart(c, heatText, result?.heatId);
      return;
    }
    // 카트에 자재가 있으면 다이얼로그
    setPending({ c, heatNo: heatText, heatId: result?.heatId });
  };

  const confirmAppend = () => {
    if (!pending) return;
    addToCart(pending.c, pending.heatNo, pending.heatId);
    setPending(null);
  };
  const confirmNew = () => {
    if (!pending) return;
    cart.clear();
    addToCart(pending.c, pending.heatNo, pending.heatId);
    setPending(null);
  };

  // 사양 입력 폼 — [신규 판번호] 와 [후보 0건] 양쪽에서 재사용
  const specFormFields = (
    <>
      <div className="grid grid-cols-2 gap-2">
        <input value={specVessel}   onChange={e => setSpecVessel(e.target.value.toUpperCase())} placeholder="호선 (예: RS01)" className={inputCls} />
        <input value={specMaterial} onChange={e => setSpecMaterial(e.target.value.toUpperCase())} placeholder="재질 (예: AH36)" className={inputCls} />
        <input value={specT} onChange={e => setSpecT(e.target.value)} placeholder="두께 (예: 8)"    inputMode="decimal" className={inputCls} />
        <input value={specW} onChange={e => setSpecW(e.target.value)} placeholder="폭 (예: 1829)"    inputMode="decimal" className={inputCls} />
        <input value={specL} onChange={e => setSpecL(e.target.value)} placeholder="길이 (예: 6096)"  inputMode="decimal" className={inputCls + " col-span-2"} />
      </div>
      <button onClick={lookupBySpec} disabled={busy}
        className="w-full py-2.5 bg-cyan-500 text-black font-bold rounded-xl flex items-center justify-center gap-2 disabled:opacity-40">
        {busy ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
        사양으로 후보 조회
      </button>
    </>
  );

  return (
    <div className="p-4 space-y-4">
      {/* 안내 */}
      <div className="bg-cyan-950/40 border border-cyan-800/60 rounded-2xl p-3 text-xs text-cyan-200 flex items-start gap-2">
        <Zap size={14} className="mt-0.5 flex-shrink-0" />
        <div>
          <div className="font-bold mb-0.5">현장직접출고</div>
          사무실 선별지시서 없이 판번호(또는 사양)로 <b>입고 상태이고 아직 아무데도 안 잡힌</b> 자재를 즉시 담습니다.
          블록 확정된 자재나 다른 출고장에 잡힌 자재는 후보에서 자동 제외됩니다.
        </div>
      </div>

      {/* 판번호 입력 */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
        <label className="block text-xs font-semibold text-gray-400 mb-2">
          판번호 입력 <span className="font-normal text-gray-500">(대문자·숫자·하이픈 — 키보드·바코드 모두 자동 정리)</span>
        </label>
        <div className="flex gap-2">
          <input
            value={heatNo}
            onChange={e => setHeatNo(cleanHeatNo(e.target.value))}
            onKeyDown={e => { if (e.key === "Enter") lookupByHeat(); }}
            placeholder="예: HT240001"
            inputMode="text" autoCapitalize="characters" autoComplete="off" autoCorrect="off" spellCheck={false}
            className="flex-1 px-4 py-3 text-lg font-mono bg-gray-800 border border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-400 text-white placeholder-gray-600"
          />
          <button onClick={lookupByHeat} disabled={busy || !heatNo.trim()}
            className="px-5 bg-cyan-500 text-black font-bold rounded-xl disabled:opacity-40 flex items-center gap-1">
            {busy ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />}
          </button>
        </div>
      </div>

      {/* 조회 결과 — 판번호 이미 절단/출고 소진 */}
      {result && !result.matched && result.reason === "ALREADY_USED" && (
        <div className="bg-red-950/60 border border-red-800 rounded-2xl p-4 flex items-start gap-2 text-sm text-red-300">
          <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" />
          <div><div className="font-bold text-red-200">{heatNo}</div>이미 절단/출고로 소진된 판번호입니다.</div>
        </div>
      )}

      {/* 조회 결과 — 신규 판번호. 사양 폼 노출 */}
      {result && !result.matched && result.reason === "NOT_FOUND" && (
        <div className="bg-gray-900 border border-cyan-700/40 rounded-2xl p-4 space-y-3">
          <div className="text-sm text-cyan-200 flex items-start gap-2">
            <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
            <div>
              <b>{heatNo}</b> 는 시스템에 없는 신규 판번호입니다.<br/>
              사양을 입력해 <b>강재전체목록의 입고 자재 중 일치하는 것</b>을 찾으세요.<br/>
              선택 후 담으면 이 판번호가 자동으로 신규 등록됩니다.
            </div>
          </div>
          {specFormFields}
        </div>
      )}

      {/* 조회 결과 — 매칭됨 (판번호 or 사양) */}
      {result && result.matched && result.spec && (
        <>
          <div className="bg-gray-900 border border-cyan-700/40 rounded-2xl p-4">
            <div className="text-xs text-gray-400 mb-1">
              {result.heatId
                ? <>판번호 <span className="font-mono font-bold text-cyan-300">{result.heatNo}</span> 사양</>
                : <>사양 조회 결과 <span className="font-mono text-cyan-300">{heatNo}</span> (신규 판번호로 등록됩니다)</>}
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <span><span className="text-gray-500">호선</span> <b className="text-white">{result.spec.vesselCode}</b></span>
              <span><span className="text-gray-500">재질</span> <b className="text-white">{result.spec.material}</b></span>
              <span><span className="text-gray-500">규격</span> <b className="text-white font-mono">{fmtT(result.spec.thickness)}×{fmtL(result.spec.width)}×{fmtL(result.spec.length)}</b></span>
            </div>
            {/* I10: 같은 판번호가 여러 사양에 등록된 경우 (수입재) 안내 */}
            {(result.multiSpecCount ?? 0) > 1 && result.otherSpecs && result.otherSpecs.length > 0 && (
              <div className="mt-2 pt-2 border-t border-cyan-800/40 text-[11px] text-amber-300">
                ⚠ 같은 판번호 <b className="font-mono">{result.heatNo}</b> 가 <b>{result.multiSpecCount}개 사양</b>에 등록되어 있습니다. 실물이 위 사양이 아니면 아래 중 하나를 재검색하세요:
                <ul className="mt-1 space-y-0.5">
                  {result.otherSpecs.map((s, i) => (
                    <li key={i} className="ml-2 font-mono">
                      • {s.vesselCode} · {s.material} · {fmtT(s.thickness)}×{fmtL(s.width)}×{fmtL(s.length)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div>
            <div className="text-xs font-semibold text-gray-400 mb-2 px-1">
              입고 자재 {result.candidates?.length ?? 0}건 — 실물과 맞는 강재를 선택
              <span className="text-gray-600 font-normal ml-1">(규격 기준 · 호선·선별 여부 무관)</span>
            </div>
            {(result.candidates?.length ?? 0) === 0 ? (
              <div className="space-y-3">
                {/* N10: 후보 0건 원인 세분화 안내 */}
                {(result.reservedCount ?? 0) > 0 ? (
                  <div className="bg-amber-950/60 border border-amber-800 rounded-2xl p-4 text-sm text-amber-200">
                    <div className="flex items-start gap-2">
                      <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
                      <div>
                        <b>실제 입고 자재는 있지만 사용 불가</b><br />
                        이 사양의 자재 <b>{result.reservedCount}장</b>이 블록확정(절단용)되어 있어 외부출고 불가.<br />
                        <span className="text-amber-300">프로젝트 → 블록강재리스트에서 확정취소 후 다시 시도하세요.</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 text-sm text-gray-400">
                    이 규격의 [입고] 자재가 <b className="text-gray-200">어느 호선에도</b> 없습니다.
                    {(result.notReceivedCount ?? 0) > 0 && (
                      <> (이 규격 <b>{result.notReceivedCount}장</b>은 이미 절단/출고 처리됨)</>
                    )}
                  </div>
                )}

                {/* 호선 유용 대응 — 재질·치수가 같고 다른 호선에 남아 있는 입고 자재.
                    작업일보에 타 호선 판번호를 넣고 절단하면 재고가 호선끼리 어긋나므로,
                    야드 실물이 옆 호선 줄에 살아 있는 경우가 있다. 원터치로 그 호선 재검색. */}
                {(result.otherVesselStock?.length ?? 0) > 0 && (
                  <div className="bg-gray-900 border border-cyan-700/40 rounded-2xl p-4 space-y-2">
                    <div className="text-sm text-cyan-200 flex items-start gap-2">
                      <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
                      <div>
                        같은 규격(<span className="font-mono">{result.spec.material} {fmtT(result.spec.thickness)}×{fmtL(result.spec.width)}×{fmtL(result.spec.length)}</span>)
                        이 <b>다른 호선</b>에 입고 상태로 남아 있습니다.<br />
                        실물이 맞으면 아래 호선을 눌러 바로 조회하세요.
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {result.otherVesselStock!.map(v => (
                        <button key={v.vesselCode} disabled={busy}
                          onClick={() => runSpecLookup({
                            vesselCode: v.vesselCode,
                            material:   result.spec!.material,
                            thickness:  String(result.spec!.thickness),
                            width:      String(result.spec!.width),
                            length:     String(result.spec!.length),
                          })}
                          className="px-3.5 py-2.5 bg-cyan-600 text-white text-sm font-bold rounded-xl disabled:opacity-40 flex items-center gap-1.5">
                          <Search size={14} /> {v.vesselCode}
                          <span className="text-cyan-200 font-normal">{v.count}장</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* 수동 사양 재검색 — 호선/규격을 직접 고쳐서 찾기 */}
                {specOpen ? (
                  <div className="bg-gray-900 border border-cyan-700/40 rounded-2xl p-4 space-y-3">
                    <div className="text-xs text-gray-400">호선·규격을 고쳐서 다시 찾기</div>
                    {specFormFields}
                  </div>
                ) : (
                  <button onClick={openSpecFromResult}
                    className="w-full py-2.5 bg-gray-800 border border-gray-700 text-white font-semibold rounded-xl text-sm flex items-center justify-center gap-2">
                    <Search size={15} /> 다른 호선·규격으로 재검색
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {result.candidates!.map(c => {
                  const inCart = cart.has(c.id);
                  return (
                    <div key={c.id} className={`bg-gray-900 border rounded-2xl p-3.5 ${inCart ? "border-purple-700 opacity-60" : "border-gray-800"}`}>
                      <div className="flex items-center justify-between">
                        <div className="text-sm">
                          <div className="font-bold text-white flex items-center gap-1.5">
                            {c.vesselCode} · {c.material}
                            {c.otherVessel && (
                              <span className="text-[10px] px-1 py-0.5 rounded bg-cyan-900/60 text-cyan-300 font-normal">다른 호선</span>
                            )}
                          </div>
                          <div className="font-mono text-gray-400 text-xs mt-0.5">{fmtT(c.thickness)}×{fmtL(c.width)}×{fmtL(c.length)} · {fmtKg(c.weight)}</div>
                          <div className="flex flex-wrap items-center gap-2 mt-1 text-[11px] text-gray-500">
                            {c.storageLocation && <span className="flex items-center gap-0.5"><MapPin size={11} />{c.storageLocation}</span>}
                            {c.receivedAt && <span>입고 {c.receivedAt.slice(0, 10).replace(/-/g, ".")}</span>}
                            {c.shipoutMarkedAt && <span className="px-1.5 py-0.5 rounded bg-red-900/40 text-red-300">사무실선별됨</span>}
                          </div>
                        </div>
                        {inCart ? (
                          <span className="text-purple-300 text-xs font-semibold flex items-center gap-1"><CheckCircle2 size={15} /> 담김</span>
                        ) : (
                          <button onClick={() => requestAdd(c)}
                            className="px-3.5 py-2 bg-cyan-500 text-black text-sm font-bold rounded-xl flex-shrink-0">담기</button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* 담기 확인 다이얼로그 — 카트에 이미 자재가 있을 때 */}
      {pending && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-4"
             onClick={() => setPending(null)}>
          <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-md p-5 space-y-3"
               onClick={e => e.stopPropagation()}>
            <div className="font-bold text-white">담을 위치 선택</div>
            <div className="text-xs text-gray-400">
              카트에 이미 <b className="text-amber-300">{cart.items.length}건</b> 이 담겨 있습니다.<br/>
              새 자재를 어떻게 처리할까요?
            </div>
            <div className="bg-gray-800/60 rounded-lg p-2.5 text-xs text-gray-200">
              <div className="font-mono">{pending.heatNo}</div>
              <div className="text-gray-500 mt-0.5">
                {pending.c.vesselCode} · {pending.c.material} · {fmtT(pending.c.thickness)}×{fmtL(pending.c.width)}×{fmtL(pending.c.length)}
              </div>
            </div>
            <button onClick={confirmAppend}
              className="w-full py-2.5 bg-cyan-500 text-black font-bold rounded-xl text-sm">
              현재 카트에 추가 (같은 거래명세서로)
            </button>
            <button onClick={confirmNew}
              className="w-full py-2.5 bg-gray-800 border border-gray-700 text-white font-semibold rounded-xl text-sm">
              카트 비우고 새로 담기 (새 거래명세서)
            </button>
            <button onClick={() => setPending(null)}
              className="w-full py-2 text-gray-500 text-xs">취소</button>
          </div>
        </div>
      )}

      {!result && (
        <p className="text-center text-sm text-gray-600 pt-4">
          판번호를 입력하면 입고 상태의 자재 중 일치하는 것을 찾아줍니다.<br/>
          시스템에 없는 판번호면 사양 폼으로 폴백됩니다.
        </p>
      )}
    </div>
  );
}

/* ── 출고장 만들기 (간소 1차분) ───────────────────────────────────────────── */
function Wizard({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const cart = useShipoutCart();
  const [suppliers, setSuppliers]   = useState<Vendor[]>([]);
  const [deliveries, setDeliveries] = useState<Vendor[]>([]);
  const [shippedAt, setShippedAt]   = useState(todayKst());
  const [writerName, setWriterName] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [deliveryId, setDeliveryId] = useState("");
  const [vehicleNo, setVehicleNo]   = useState("");
  const [driverName, setDriverName] = useState("");
  const [blocks, setBlocks]         = useState<Record<string, string>>({}); // 자재별 블록 (steelPlanId → 블록)
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [vendorLoading, setVendorLoading] = useState(false);
  const [vendorError, setVendorError] = useState("");

  const loadVendors = useCallback(async () => {
    setVendorLoading(true); setVendorError("");
    try {
      const [s, d] = await Promise.all([
        fetch("/api/delivery-vendors?type=SUPPLIER").then(r => r.json()),
        fetch("/api/delivery-vendors?type=DELIVERY").then(r => r.json()),
      ]);
      if (!s.success) throw new Error(s.error || "공급처를 불러오지 못했습니다.");
      if (!d.success) throw new Error(d.error || "납품처를 불러오지 못했습니다.");
      setSuppliers(s.data); setDeliveries(d.data);
    } catch (e) {
      setVendorError(e instanceof Error ? e.message : "거래처를 불러오지 못했습니다.");
    } finally { setVendorLoading(false); }
  }, []);

  useEffect(() => {
    try {
      setWriterName(localStorage.getItem("shipout-writer-name") ?? "");
      setSupplierId(localStorage.getItem("shipout-supplier-id") ?? "");
    } catch { /* 무시 */ }
    loadVendors();
  }, [loadVendors]);

  const snap = (v: Vendor | undefined) => v ? {
    bizNo: v.bizNo, name: v.name, ceo: v.ceo, address: v.address,
    bizType: v.bizType, bizItem: v.bizItem, phone: v.phone, fax: v.fax,
  } : null;

  const submit = async () => {
    setError("");
    if (cart.items.length === 0) { setError("담은 자재가 없습니다."); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(shippedAt)) { setError("출고일을 선택하세요."); return; }
    if (!writerName.trim())  { setError("작성(출고)자를 입력하세요."); return; }
    if (!supplierId)         { setError("공급처를 선택하세요."); return; }
    if (!deliveryId)         { setError("납품처를 선택하세요."); return; }
    // 차량번호·운전자는 선택 입력 (거래명세표에서 출력 전 입력 가능)
    // 판번호 중복 방지 (한 물리 철판 중복 출고 차단)
    const heats = cart.items.map(i => (i.prefilledHeatNo ?? "").trim()).filter(Boolean);
    const dup = heats.find((h, i) => heats.indexOf(h) !== i);
    if (dup) { setError(`판번호 ${dup} 가 중복입니다.`); return; }

    setSubmitting(true);
    try {
      try {
        localStorage.setItem("shipout-writer-name", writerName.trim());
        localStorage.setItem("shipout-supplier-id", supplierId);
      } catch { /* 무시 */ }

      const payload = {
        shippedAt,
        vehicles: [{
          sequence: 1,
          vehicleNo: vehicleNo.trim(),
          driverName: driverName.trim() || undefined,
          loadLimit: null,
          supplierId, supplierSnapshot: snap(suppliers.find(s => s.id === supplierId)),
          deliveryId, deliverySnapshot: snap(deliveries.find(d => d.id === deliveryId)),
          writerName: writerName.trim(),
          items: cart.items.map(it => ({
            kind: it.kind ?? "plate",
            steelPlanId: it.kind === "remnant" ? undefined : it.steelPlanId,
            remnantId:   it.kind === "remnant" ? it.remnantId : undefined,
            steelPlanHeatId: it.steelPlanHeatId,
            vesselCode: it.vesselCode, material: it.material,
            thickness: it.thickness, width: it.width, length: it.length, weight: it.weight,
            block: blocks[it.steelPlanId]?.trim() || null,
            heatNo: it.prefilledHeatNo?.trim() || null,
            // heatId 있으면 그 heat 를 정확히 SHIPPED 전환(manual 아님). 없으면 사양+판번호로 find/create
            manualHeatNo: it.kind !== "remnant" && !it.steelPlanHeatId,
            adHocFromField: it.adHocFromField ?? false,
            originShipoutLabel: it.originShipoutLabel ?? null,
          })),
        }],
      };
      const res = await fetch("/api/shipments", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!json.success) { setError(json.error || "출고장 생성 실패"); return; }
      cart.clear();
      alert(`출고장 ${json.data?.shipmentNo ?? ""} 생성 완료`);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally { setSubmitting(false); }
  };

  return (
    <div className="fixed inset-0 z-40 bg-gray-950 flex flex-col">
      <header className="sticky top-0 bg-gray-900 border-b border-gray-800 px-4 py-3 flex items-center justify-between">
        <h2 className="font-bold flex items-center gap-1.5"><Truck size={18} className="text-amber-400" /> 출고장 만들기</h2>
        <button onClick={onClose} disabled={submitting} className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-400"><X size={20} /></button>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {error && <div className="bg-red-950/60 border border-red-800 rounded-xl px-3 py-2 text-sm text-red-300 flex items-center gap-2"><AlertTriangle size={15} /> {error}</div>}

        {/* 자재 리스트 */}
        <div>
          <div className="text-xs font-semibold text-gray-400 mb-2 px-1">출고 자재 {cart.items.length}건 · {fmtKg(cart.totalWeight)}</div>
          <div className="space-y-2">
            {cart.items.map(it => (
              <div key={it.steelPlanId} className="bg-gray-900 border border-gray-800 rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <div className="text-xs text-gray-200">
                      {it.vesselCode} · {it.material} · {fmtT(it.thickness)}×{fmtL(it.width)}×{fmtL(it.length)} · {fmtKg(it.weight)}
                      {it.kind === "remnant" && <span className="ml-1 text-[10px] px-1 rounded bg-amber-900/50 text-amber-300">잔재</span>}
                      {it.adHocFromField && (
                        <span className="ml-1 text-[10px] px-1 rounded bg-cyan-900/50 text-cyan-300">
                          현장직접{it.originShipoutLabel ? ` (원선별: ${it.originShipoutLabel})` : ""}
                        </span>
                      )}
                    </div>
                    {(it.kind === "remnant" ? it.remnantNo : it.prefilledHeatNo) && (
                      <div className="font-mono text-xs text-amber-300 mt-0.5">
                        {it.kind === "remnant" ? `잔재번호 ${it.remnantNo}` : `판번호 ${it.prefilledHeatNo}`}
                      </div>
                    )}
                  </div>
                  <button onClick={() => cart.remove(it.steelPlanId)} className="p-2 text-gray-500 hover:text-red-400"><Trash2 size={16} /></button>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-[11px] font-semibold text-gray-400 whitespace-nowrap">블록</label>
                  <input value={blocks[it.steelPlanId] ?? ""} onChange={e => setBlocks(b => ({ ...b, [it.steelPlanId]: e.target.value }))}
                    placeholder="블록 (예: F52P) — 선택" className="flex-1 px-2.5 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 송장 정보 */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 space-y-3">
          {vendorLoading && <div className="text-xs text-gray-400 flex items-center gap-1.5"><Loader2 size={13} className="animate-spin" /> 거래처 불러오는 중…</div>}
          {vendorError && (
            <div className="bg-red-950/60 border border-red-800 rounded-xl px-3 py-2 text-xs text-red-300 flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5"><AlertTriangle size={14} /> {vendorError}</span>
              <button onClick={loadVendors} className="underline text-red-200 flex-shrink-0">다시 시도</button>
            </div>
          )}
          {!vendorLoading && !vendorError && suppliers.length === 0 && deliveries.length === 0 && (
            <div className="text-xs text-amber-300">등록된 공급처/납품처가 없습니다. 사무실에서 거래처를 먼저 등록하세요.</div>
          )}
          <Field label="출고일 *">
            <input type="date" value={shippedAt} onChange={e => setShippedAt(e.target.value)} className={inputCls} />
          </Field>
          <Field label="작성(출고)자 *">
            <input value={writerName} onChange={e => setWriterName(e.target.value)} placeholder="이름" className={inputCls} />
          </Field>
          <Field label="공급처 *">
            <select value={supplierId} onChange={e => setSupplierId(e.target.value)} className={inputCls}>
              <option value="">— 선택 —</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="납품처 *">
            <select value={deliveryId} onChange={e => setDeliveryId(e.target.value)} className={inputCls}>
              <option value="">— 선택 —</option>
              {deliveries.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </Field>
          <Field label="차량번호 (선택)">
            <input value={vehicleNo} onChange={e => setVehicleNo(e.target.value)} placeholder="예: 12가3456 — 선택" className={inputCls} />
          </Field>
          <Field label="운전자 (선택)">
            <input value={driverName} onChange={e => setDriverName(e.target.value)} placeholder="운전자 이름" className={inputCls} />
          </Field>
        </div>
      </div>

      <div className="sticky bottom-0 bg-gray-900 border-t border-gray-800 p-4">
        <button onClick={submit} disabled={submitting}
          className="w-full py-3.5 bg-amber-500 text-black font-bold rounded-xl text-base flex items-center justify-center gap-2 disabled:opacity-50">
          {submitting ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
          {submitting ? "처리 중…" : "출고 확정"}
        </button>
      </div>
    </div>
  );
}

const inputCls = "w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-400";
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-400 mb-1">{label}</label>
      {children}
    </div>
  );
}

/* ── 출고장 목록 ─────────────────────────────────────────────────────────── */
interface SItem { id: string; weight: number }
interface SVehicle { id: string; sequence: number; vehicleNo: string; driverName: string | null; totalWeight: number | null; supplierSnapshot: { name?: string | null } | null; deliverySnapshot: { name?: string | null } | null; items: SItem[] }
interface Shipment { id: string; shipmentNo: string; shippedAt: string; status: "ACTIVE" | "CANCELLED"; vehicles: SVehicle[] }

function ShipmentListTab() {
  const [from, setFrom] = useState(firstOfMonthKst());
  const [to, setTo]     = useState(todayKst());
  const [list, setList] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const p = new URLSearchParams({ from, to, status: "ACTIVE" });
      const r = await fetch(`/api/shipments?${p}`).then(r => r.json());
      if (r.success) setList(r.data);
      else setError(r.error || "출고장을 불러오지 못했습니다.");
    } catch {
      setError("네트워크 오류로 출고장을 불러오지 못했습니다.");
    } finally { setLoading(false); }
  }, [from, to]);
  useEffect(() => { load(); }, [load]);

  const totalW = (s: Shipment) => s.vehicles.reduce((a, v) => a + (v.totalWeight ?? 0), 0);
  const itemCount = (s: Shipment) => s.vehicles.reduce((a, v) => a + v.items.length, 0);

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-2">
        <input type="date" value={from} onChange={e => setFrom(e.target.value)} className={`${inputCls} flex-1 min-w-0`} />
        <span className="text-gray-500 flex-shrink-0">~</span>
        <input type="date" value={to} onChange={e => setTo(e.target.value)} className={`${inputCls} flex-1 min-w-0`} />
        <button onClick={load} className="p-2.5 bg-gray-800 rounded-xl text-gray-300 flex-shrink-0"><RefreshCw size={16} /></button>
      </div>

      {loading ? (
        <p className="text-center text-gray-500 py-10">불러오는 중…</p>
      ) : error ? (
        <div className="bg-red-950/60 border border-red-800 rounded-2xl p-4 text-center text-sm text-red-300">
          <AlertTriangle size={18} className="inline mr-1" /> {error}
          <button onClick={load} className="block mx-auto mt-2 underline text-red-200">다시 시도</button>
        </div>
      ) : list.length === 0 ? (
        <p className="text-center text-gray-600 py-10">해당 기간 출고장이 없습니다.</p>
      ) : (
        <div className="space-y-3">
          {list.map(s => (
            <div key={s.id} className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="font-mono font-bold text-amber-300">{s.shipmentNo}</div>
                <div className="text-xs text-gray-400">{s.shippedAt.slice(0, 10).replace(/-/g, ".")}</div>
              </div>
              <div className="text-xs text-gray-400 mb-2">자재 {itemCount(s)}건 · {fmtKg(totalW(s))} · 차분 {s.vehicles.length}</div>
              <div className="space-y-1.5">
                {s.vehicles.map(v => (
                  <a key={v.id} href={`/cutpart/shipments/${s.id}/vehicles/${v.id}`} target="_blank" rel="noopener noreferrer"
                    className="flex items-center justify-between bg-gray-800/60 rounded-lg px-3 py-2 text-xs">
                    <span className="text-gray-200">
                      <b>#{v.sequence}</b> {v.vehicleNo || "차량미정"}
                      <span className="text-gray-500"> · {v.deliverySnapshot?.name ?? "납품처미정"}</span>
                    </span>
                    <span className="text-amber-300 underline">명세표</span>
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

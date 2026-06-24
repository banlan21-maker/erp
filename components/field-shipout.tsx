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
  ChevronLeft, ListChecks, ClipboardList, MapPin, RefreshCw,
} from "lucide-react";
import { ShipoutCartProvider, useShipoutCart, type ShipoutCartItem } from "@/components/shipout-cart";

const calcWeight = (t: number, w: number, l: number) => parseFloat(((t * w * l * 7.85) / 1_000_000).toFixed(1));
const fmtT = (v: number) => parseFloat(v.toFixed(1));
const fmtL = (v: number) => Math.round(v);
const fmtKg = (n: number) => `${n.toLocaleString("ko-KR", { maximumFractionDigits: 1 })} kg`;
const todayKst = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
const firstOfMonthKst = () => { const t = todayKst(); return `${t.slice(0, 7)}-01`; };

interface Candidate {
  id: string; vesselCode: string; material: string; thickness: number; width: number; length: number;
  weight: number; storageLocation: string | null; shipoutHeatNo: string | null; shipoutLabel: string | null;
}
interface LookResult {
  matched: boolean; reason?: string; heatNo: string; heatId?: string;
  spec?: { vesselCode: string; material: string; thickness: number; width: number; length: number };
  candidates?: Candidate[];
}
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
  const [tab, setTab] = useState<"add" | "list">("add");
  const [wizardOpen, setWizardOpen] = useState(false);

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
      <div className="grid grid-cols-2 border-b border-gray-800 bg-gray-900 sticky top-[57px] z-10">
        <button onClick={() => setTab("add")}
          className={`py-3 text-sm font-semibold flex items-center justify-center gap-1.5 ${tab === "add" ? "text-amber-400 border-b-2 border-amber-400" : "text-gray-500"}`}>
          <ListChecks size={16} /> 출고 담기
        </button>
        <button onClick={() => setTab("list")}
          className={`py-3 text-sm font-semibold flex items-center justify-center gap-1.5 ${tab === "list" ? "text-amber-400 border-b-2 border-amber-400" : "text-gray-500"}`}>
          <ClipboardList size={16} /> 출고장 목록
        </button>
      </div>

      {tab === "add" ? <AddTab /> : <ShipmentListTab />}

      {/* 하단 카트바 */}
      {cart.items.length > 0 && tab === "add" && (
        <div className="fixed bottom-0 left-0 right-0 z-20 bg-purple-900/95 backdrop-blur border-t-2 border-purple-700 px-4 py-3 flex items-center justify-between">
          <div className="text-sm">
            <span className="font-bold text-white">{cart.items.length}</span>건 · {fmtKg(cart.totalWeight)}
            <button onClick={() => { if (confirm("카트를 비우시겠습니까?")) cart.clear(); }} className="ml-2 text-purple-300 underline text-xs">비우기</button>
          </div>
          <button onClick={() => setWizardOpen(true)}
            className="px-5 py-2.5 bg-amber-500 text-black font-bold rounded-xl text-sm flex items-center gap-1.5">
            <Truck size={16} /> 출고장 만들기
          </button>
        </div>
      )}

      {wizardOpen && <Wizard onClose={() => setWizardOpen(false)} onDone={() => { setWizardOpen(false); setTab("list"); }} />}
    </div>
  );
}

/* ── 출고 담기 ─────────────────────────────────────────────────────────── */
function AddTab() {
  const cart = useShipoutCart();
  const [heatNo, setHeatNo] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<LookResult | null>(null);

  const lookup = async () => {
    const h = heatNo.trim();
    if (!h) return;
    setBusy(true); setResult(null);
    try {
      const r = await fetch(`/api/steel-plan/shipout-field?heatNo=${encodeURIComponent(h)}`).then(r => r.json());
      if (!r.success) { alert(r.error ?? "조회 실패"); return; }
      setResult(r as LookResult);
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
      // 다음 판번호 스캔을 위해 입력/결과 초기화
      setHeatNo(""); setResult(null);
    }
  };

  const reasonMsg = (reason?: string) =>
    reason === "NOT_FOUND" ? "등록되지 않은 판번호입니다. 입력을 다시 확인하세요." :
    reason === "ALREADY_USED" ? "이미 절단/출고로 소진된 판번호입니다." : "매칭 실패";

  return (
    <div className="p-4 space-y-4">
      {/* 판번호 입력 */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
        <label className="block text-xs font-semibold text-gray-400 mb-2">판번호 입력</label>
        <div className="flex gap-2">
          <input
            value={heatNo}
            onChange={e => setHeatNo(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") lookup(); }}
            placeholder="예: HT240001"
            inputMode="text" autoCapitalize="characters"
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
            <div className="text-xs font-semibold text-gray-400 mb-2 px-1">선별목록 일치 강재 {result.candidates?.length ?? 0}건 — 실물과 맞는 강재를 선택</div>
            {(result.candidates?.length ?? 0) === 0 ? (
              <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 text-center text-sm text-gray-500">
                일치하는 선별 강재가 없습니다.<br />사무실에서 먼저 선별(출고등록/강재매칭)했는지 확인하세요.
              </div>
            ) : (
              <div className="space-y-2">
                {result.candidates!.map(c => {
                  const inCart = cart.has(c.id);
                  return (
                    <div key={c.id} className={`bg-gray-900 border rounded-2xl p-3.5 ${inCart ? "border-purple-700 opacity-60" : "border-gray-800"}`}>
                      <div className="flex items-center justify-between">
                        <div className="text-sm">
                          <div className="font-bold text-white">{c.vesselCode} · {c.material}</div>
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

      {!result && (
        <p className="text-center text-sm text-gray-600 pt-6">판번호를 입력하면 선별목록에서 일치하는 강재를 찾아줍니다.</p>
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
                  <div className="text-sm">
                    <div className="font-bold text-white">{it.vesselCode} · {it.material} {it.kind === "remnant" && <span className="ml-1 text-[10px] px-1 rounded bg-amber-900/50 text-amber-300">잔재</span>}</div>
                    <div className="font-mono text-xs text-gray-400 mt-0.5">{fmtT(it.thickness)}×{fmtL(it.width)}×{fmtL(it.length)} · {fmtKg(it.weight)}</div>
                    {it.prefilledHeatNo && <div className="font-mono text-xs text-amber-300 mt-0.5">판번호 {it.prefilledHeatNo}</div>}
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

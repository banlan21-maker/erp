"use client";

import { useCallback, useEffect, useState } from "react";
import { X, Plus, Save, Trash2, Coins } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * 용차 단가표 관리 — 납품처별 기본단가 + 폭 구간별 할증.
 *
 * 출고장 목록에서 용차로 등록할 때 이 표로 금액을 계산한다.
 * 초기값은 과거 대장 실적을 역산해 넣어 두었고(scripts/seed-charter-rate.mjs),
 * 단가가 바뀌면 여기서 고친다. 계산된 금액은 대장에서도 수정할 수 있다.
 */

interface Rate { id: string; deliveryName: string; region: string | null; baseCost: number; memo: string | null }
interface Surcharge { id: string; minWidth: number; maxWidth: number | null; amount: number; label: string | null }

const cell = "h-8 text-xs";

export default function CharterRateModal({ onClose }: { onClose: () => void }) {
  const [rates, setRates] = useState<Rate[]>([]);
  const [surs, setSurs] = useState<Surcharge[]>([]);
  const [loading, setLoading] = useState(true);
  const [newRate, setNewRate] = useState({ deliveryName: "", region: "", baseCost: "" });
  const [newSur, setNewSur] = useState({ minWidth: "", maxWidth: "", amount: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/charter-rate");
      const j = await r.json();
      if (j.success) { setRates(j.data.rates); setSurs(j.data.surcharges); }
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  const patch = async (kind: "rate" | "surcharge", id: string, field: string, value: string) => {
    const r = await fetch("/api/charter-rate", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, id, [field]: value }),
    });
    const j = await r.json();
    if (!j.success) { alert(j.error ?? "수정 실패"); load(); }
  };

  const addRate = async () => {
    if (!newRate.deliveryName.trim() || !newRate.baseCost) { alert("납품처명과 기본단가를 입력하세요."); return; }
    const r = await fetch("/api/charter-rate", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "rate", ...newRate }),
    });
    const j = await r.json();
    if (!j.success) { alert(j.error ?? "등록 실패"); return; }
    setNewRate({ deliveryName: "", region: "", baseCost: "" });
    load();
  };

  const addSur = async () => {
    if (!newSur.minWidth || !newSur.amount) { alert("시작 폭과 할증액을 입력하세요."); return; }
    const r = await fetch("/api/charter-rate", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "surcharge", ...newSur }),
    });
    const j = await r.json();
    if (!j.success) { alert(j.error ?? "등록 실패"); return; }
    setNewSur({ minWidth: "", maxWidth: "", amount: "" });
    load();
  };

  const del = async (kind: "rate" | "surcharge", id: string, label: string) => {
    if (!confirm(`'${label}' 을(를) 삭제할까요?`)) return;
    const r = await fetch(`/api/charter-rate?kind=${kind}&id=${id}`, { method: "DELETE" });
    const j = await r.json();
    if (!j.success) { alert(j.error ?? "삭제 실패"); return; }
    load();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="용차 단가표"
           className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[88vh] flex flex-col"
           onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <h3 className="font-bold text-gray-900 flex items-center gap-2">
            <Coins size={16} className="text-amber-600" /> 용차 단가표
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full"><X size={16} /></button>
        </div>

        <div className="flex-1 overflow-auto px-5 py-4 space-y-6">
          <p className="text-xs text-gray-500">
            출고장 목록에서 용차로 등록할 때 이 표로 금액을 계산합니다 — <b>기본단가 + 폭 할증</b>.
            계산된 금액은 용차사용대장에서 다시 고칠 수 있습니다.
          </p>

          {/* 납품처별 기본단가 */}
          <div>
            <h4 className="text-sm font-bold text-gray-800 mb-2">납품처별 기본단가 <span className="text-xs font-normal text-gray-400">진교 출발 기준</span></h4>
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 text-gray-500">
                  <tr>
                    <th className="px-2 py-2 text-left font-semibold">납품처</th>
                    <th className="px-2 py-2 text-left font-semibold w-24">구간</th>
                    <th className="px-2 py-2 text-right font-semibold w-32">기본단가(원)</th>
                    <th className="px-2 py-2 text-left font-semibold">비고</th>
                    <th className="px-2 py-2 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {loading ? (
                    <tr><td colSpan={5} className="py-8 text-center text-gray-400">불러오는 중…</td></tr>
                  ) : rates.map(r => (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-2 py-1"><Input defaultValue={r.deliveryName} className={cell}
                        onBlur={e => e.target.value !== r.deliveryName && patch("rate", r.id, "deliveryName", e.target.value)} /></td>
                      <td className="px-2 py-1"><Input defaultValue={r.region ?? ""} className={cell}
                        onBlur={e => e.target.value !== (r.region ?? "") && patch("rate", r.id, "region", e.target.value)} /></td>
                      <td className="px-2 py-1"><Input type="number" defaultValue={r.baseCost} className={`${cell} text-right`}
                        onBlur={e => Number(e.target.value) !== r.baseCost && patch("rate", r.id, "baseCost", e.target.value)} /></td>
                      <td className="px-2 py-1 text-gray-400">{r.memo ?? ""}</td>
                      <td className="px-2 py-1 text-center">
                        <button onClick={() => del("rate", r.id, r.deliveryName)} className="p-1 text-gray-400 hover:text-red-600"><Trash2 size={13} /></button>
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-blue-50/40">
                    <td className="px-2 py-1"><Input value={newRate.deliveryName} placeholder="납품처명" className={cell}
                      onChange={e => setNewRate(p => ({ ...p, deliveryName: e.target.value }))} /></td>
                    <td className="px-2 py-1"><Input value={newRate.region} placeholder="구간" className={cell}
                      onChange={e => setNewRate(p => ({ ...p, region: e.target.value }))} /></td>
                    <td className="px-2 py-1"><Input type="number" value={newRate.baseCost} placeholder="0" className={`${cell} text-right`}
                      onChange={e => setNewRate(p => ({ ...p, baseCost: e.target.value }))} /></td>
                    <td className="px-2 py-1" colSpan={2}>
                      <Button size="sm" onClick={addRate} className="h-7 text-xs"><Plus size={12} className="mr-1" /> 추가</Button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-gray-400 mt-1">
              납품처명은 출고 송장의 납품처 이름과 정확히 같아야 계산에 잡힙니다.
            </p>
          </div>

          {/* 폭 구간별 할증 */}
          <div>
            <h4 className="text-sm font-bold text-gray-800 mb-2">폭 구간별 할증 <span className="text-xs font-normal text-gray-400">실은 철판의 최대 폭 기준</span></h4>
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 text-gray-500">
                  <tr>
                    <th className="px-2 py-2 text-right font-semibold w-28">시작 폭(mm)</th>
                    <th className="px-2 py-2 text-right font-semibold w-28">끝 폭(mm)</th>
                    <th className="px-2 py-2 text-right font-semibold w-32">할증액(원)</th>
                    <th className="px-2 py-2 text-left font-semibold">표기</th>
                    <th className="px-2 py-2 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {surs.map(s => (
                    <tr key={s.id} className="hover:bg-gray-50">
                      <td className="px-2 py-1"><Input type="number" defaultValue={s.minWidth} className={`${cell} text-right`}
                        onBlur={e => Number(e.target.value) !== s.minWidth && patch("surcharge", s.id, "minWidth", e.target.value)} /></td>
                      <td className="px-2 py-1"><Input type="number" defaultValue={s.maxWidth ?? ""} placeholder="무제한" className={`${cell} text-right`}
                        onBlur={e => e.target.value !== String(s.maxWidth ?? "") && patch("surcharge", s.id, "maxWidth", e.target.value)} /></td>
                      <td className="px-2 py-1"><Input type="number" defaultValue={s.amount} className={`${cell} text-right`}
                        onBlur={e => Number(e.target.value) !== s.amount && patch("surcharge", s.id, "amount", e.target.value)} /></td>
                      <td className="px-2 py-1 text-gray-400">{s.label ?? ""}</td>
                      <td className="px-2 py-1 text-center">
                        <button onClick={() => del("surcharge", s.id, s.label ?? String(s.minWidth))} className="p-1 text-gray-400 hover:text-red-600"><Trash2 size={13} /></button>
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-blue-50/40">
                    <td className="px-2 py-1"><Input type="number" value={newSur.minWidth} placeholder="3101" className={`${cell} text-right`}
                      onChange={e => setNewSur(p => ({ ...p, minWidth: e.target.value }))} /></td>
                    <td className="px-2 py-1"><Input type="number" value={newSur.maxWidth} placeholder="3400" className={`${cell} text-right`}
                      onChange={e => setNewSur(p => ({ ...p, maxWidth: e.target.value }))} /></td>
                    <td className="px-2 py-1"><Input type="number" value={newSur.amount} placeholder="40000" className={`${cell} text-right`}
                      onChange={e => setNewSur(p => ({ ...p, amount: e.target.value }))} /></td>
                    <td className="px-2 py-1" colSpan={2}>
                      <Button size="sm" onClick={addSur} className="h-7 text-xs"><Plus size={12} className="mr-1" /> 추가</Button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-gray-400 mt-1">
              과거 실적을 역산한 결과 할증은 길이가 아니라 폭으로 발동했습니다(정확도 95%).
              가변기·슬라이드(150,000)와 합짐(50,000/30,000)은 실린 자재만으로 판정할 수 없어 자동계산에 넣지 않았습니다 — 대장에서 더하세요.
            </p>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-gray-200 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}><Save size={13} className="mr-1" /> 닫기</Button>
        </div>
      </div>
    </div>
  );
}

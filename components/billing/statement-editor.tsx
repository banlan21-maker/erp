"use client";

import { useCallback, useEffect, useState } from "react";
import { X, Plus, Trash2, Save, FileSpreadsheet, Printer, Loader2 } from "lucide-react";
import { calcLineAmount, calcVat, round0, fmtWon, CATEGORY_LABEL } from "@/lib/billing";
import { downloadStatementXlsx, printStatement, type Stmt } from "@/lib/billing-xlsx";

interface EditItem { id?: string; category: string; itemDate: string; description: string; qty: string; weight: string; unitPrice: string; }
interface ClientInfo { id: string; name: string; bizNo?: string | null; ceo?: string | null; address?: string | null; unit: string; addCutRate?: number | null; }

const numOrNull = (s: string) => { if (s.trim() === "") return null; const n = Number(s); return Number.isFinite(n) ? n : null; };
const s2 = (v: unknown) => (v == null ? "" : String(v));

export default function StatementEditor({ statementId, onClose, onSaved }: { statementId: string; onClose: () => void; onSaved: () => void }) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [client, setClient] = useState<ClientInfo | null>(null);
  const [ym, setYm] = useState("");
  const [title, setTitle] = useState("기성청구서");
  const [memo, setMemo] = useState("");
  const [prevBalance, setPrevBalance] = useState("0");
  const [deposit, setDeposit] = useState("0");
  const [items, setItems] = useState<EditItem[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetch(`/api/billing/statements/${statementId}`).then(r => r.json()).catch(() => ({ success: false }));
    if (r.success) {
      const d = r.data;
      setClient(d.client);
      setYm(d.ym); setTitle(d.title ?? "기성청구서"); setMemo(d.memo ?? "");
      setPrevBalance(String(d.prevBalance ?? 0)); setDeposit(String(d.deposit ?? 0));
      setItems((d.items ?? []).map((it: Record<string, unknown>) => ({
        id: it.id as string, category: (it.category as string) ?? "MAIN", itemDate: s2(it.itemDate),
        description: s2(it.description), qty: s2(it.qty), weight: s2(it.weight), unitPrice: s2(it.unitPrice),
      })));
    }
    setLoading(false);
  }, [statementId]);
  useEffect(() => { load(); }, [load]);

  const lineAmount = (it: EditItem) => calcLineAmount({ weight: numOrNull(it.weight), qty: numOrNull(it.qty), unitPrice: numOrNull(it.unitPrice) });
  const supplyAmount = round0(items.reduce((s, it) => s + lineAmount(it), 0));
  const vat = round0(items.reduce((s, it) => s + calcVat(lineAmount(it)), 0));
  const total = supplyAmount + vat;
  const balance = round0((numOrNull(prevBalance) ?? 0) + total - (numOrNull(deposit) ?? 0));

  const setItem = (i: number, patch: Partial<EditItem>) => setItems(prev => prev.map((it, idx) => idx === i ? { ...it, ...patch } : it));
  const addRow = (category = "MAIN") => setItems(prev => [...prev, { category, itemDate: "", description: "", qty: "", weight: "", unitPrice: category === "ADDON" && client?.addCutRate ? String(client.addCutRate) : "" }]);
  const delRow = (i: number) => setItems(prev => prev.filter((_, idx) => idx !== i));

  const buildStmt = (): Stmt => ({
    ym, title, client: { name: client?.name ?? "", bizNo: client?.bizNo, ceo: client?.ceo, address: client?.address },
    items: items.map(it => { const a = lineAmount(it); return {
      category: it.category, itemDate: it.itemDate, description: it.description,
      qty: numOrNull(it.qty), weight: numOrNull(it.weight), unitPrice: numOrNull(it.unitPrice), amount: a, vatAmount: calcVat(a),
    }; }),
    supplyAmount, vat, total, prevBalance: numOrNull(prevBalance) ?? 0, deposit: numOrNull(deposit) ?? 0, balance,
  });

  const save = async (): Promise<boolean> => {
    setBusy(true);
    try {
      const r = await fetch(`/api/billing/statements/${statementId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ym, title, memo, prevBalance: numOrNull(prevBalance) ?? 0, deposit: numOrNull(deposit) ?? 0,
          items: items.map(it => ({ category: it.category, itemDate: it.itemDate, description: it.description, qty: numOrNull(it.qty), weight: numOrNull(it.weight), unitPrice: numOrNull(it.unitPrice) })),
        }),
      }).then(r => r.json());
      if (!r.success) { alert(r.error ?? "저장 실패"); return false; }
      onSaved();
      return true;
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-2 sm:p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[95vh] flex flex-col">
        <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
          <h3 className="font-bold text-gray-900">기성청구 작성 — {client?.name} <span className="text-gray-400 font-normal text-sm">({ym})</span></h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full text-gray-400"><X size={18} /></button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-gray-400"><Loader2 className="animate-spin inline mr-2" size={18} /> 불러오는 중...</div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <label className="text-xs text-gray-500">문서 제목
                  <input value={title} onChange={e => setTitle(e.target.value)} className="mt-0.5 w-full px-2 py-1.5 text-sm border border-gray-300 rounded" />
                </label>
                <label className="text-xs text-gray-500">청구월
                  <input type="month" value={ym} onChange={e => setYm(e.target.value)} className="mt-0.5 w-full px-2 py-1.5 text-sm border border-gray-300 rounded" />
                </label>
                <label className="text-xs text-gray-500">전잔금
                  <input value={prevBalance} onChange={e => setPrevBalance(e.target.value)} inputMode="numeric" className="mt-0.5 w-full px-2 py-1.5 text-sm border border-gray-300 rounded text-right" />
                </label>
                <label className="text-xs text-gray-500">입금
                  <input value={deposit} onChange={e => setDeposit(e.target.value)} inputMode="numeric" className="mt-0.5 w-full px-2 py-1.5 text-sm border border-gray-300 rounded text-right" />
                </label>
              </div>

              {/* 라인 */}
              <div className="border border-gray-200 rounded-lg overflow-x-auto">
                <table className="w-full text-xs whitespace-nowrap">
                  <thead className="bg-gray-50 text-gray-500">
                    <tr>
                      <th className="px-2 py-1.5 w-20">구분</th>
                      <th className="px-2 py-1.5 w-16">월일</th>
                      <th className="px-2 py-1.5 text-left min-w-[180px]">품목</th>
                      <th className="px-2 py-1.5 w-14">수량</th>
                      <th className="px-2 py-1.5 w-20">중량</th>
                      <th className="px-2 py-1.5 w-24">단가</th>
                      <th className="px-2 py-1.5 w-28">공급가액</th>
                      <th className="px-2 py-1.5 w-24">세액</th>
                      <th className="px-2 py-1.5 w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {items.length === 0 ? (
                      <tr><td colSpan={9} className="py-6 text-center text-gray-400">라인이 없습니다. 아래 버튼으로 추가하세요.</td></tr>
                    ) : items.map((it, i) => {
                      const a = lineAmount(it);
                      return (
                        <tr key={i} className={it.category === "ADDON" ? "bg-amber-50/40" : it.category === "TRANSPORT" ? "bg-sky-50/40" : ""}>
                          <td className="px-1 py-1">
                            <select value={it.category} onChange={e => setItem(i, { category: e.target.value })} className="w-full px-1 py-1 border border-gray-200 rounded text-xs">
                              {Object.entries(CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                            </select>
                          </td>
                          <td className="px-1 py-1"><input value={it.itemDate} onChange={e => setItem(i, { itemDate: e.target.value })} placeholder="05 31" className="w-full px-1 py-1 border border-gray-200 rounded text-center" /></td>
                          <td className="px-1 py-1"><input value={it.description} onChange={e => setItem(i, { description: e.target.value })} placeholder="4506호선 B309 절단" className="w-full px-1.5 py-1 border border-gray-200 rounded" /></td>
                          <td className="px-1 py-1"><input value={it.qty} onChange={e => setItem(i, { qty: e.target.value })} inputMode="numeric" className="w-full px-1 py-1 border border-gray-200 rounded text-right" /></td>
                          <td className="px-1 py-1"><input value={it.weight} onChange={e => setItem(i, { weight: e.target.value })} inputMode="decimal" className="w-full px-1 py-1 border border-gray-200 rounded text-right" /></td>
                          <td className="px-1 py-1"><input value={it.unitPrice} onChange={e => setItem(i, { unitPrice: e.target.value })} inputMode="numeric" className="w-full px-1 py-1 border border-gray-200 rounded text-right" /></td>
                          <td className="px-2 py-1 text-right font-mono">{fmtWon(a)}</td>
                          <td className="px-2 py-1 text-right font-mono text-gray-500">{fmtWon(calcVat(a))}</td>
                          <td className="px-1 py-1 text-center"><button onClick={() => delRow(i)} className="text-gray-400 hover:text-red-500"><Trash2 size={13} /></button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => addRow("MAIN")} className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50"><Plus size={13} /> 메인 기성</button>
                <button onClick={() => addRow("ADDON")} className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs border border-amber-300 text-amber-700 rounded-lg hover:bg-amber-50"><Plus size={13} /> 추가절단</button>
                <button onClick={() => addRow("TRANSPORT")} className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs border border-sky-300 text-sky-700 rounded-lg hover:bg-sky-50"><Plus size={13} /> 운송비</button>
                <button onClick={() => addRow("ETC")} className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50"><Plus size={13} /> 기타</button>
              </div>

              {/* 합계 */}
              <div className="flex justify-end">
                <div className="w-full sm:w-72 text-sm border border-gray-200 rounded-lg overflow-hidden">
                  <Row label="공급가액" value={fmtWon(supplyAmount)} />
                  <Row label="부가세 (10%)" value={fmtWon(vat)} />
                  <Row label="합계금액" value={fmtWon(total)} strong />
                  <Row label="전잔금" value={fmtWon(numOrNull(prevBalance) ?? 0)} muted />
                  <Row label="입금" value={fmtWon(numOrNull(deposit) ?? 0)} muted />
                  <Row label="잔금" value={fmtWon(balance)} strong />
                </div>
              </div>

              <label className="block text-xs text-gray-500">메모
                <input value={memo} onChange={e => setMemo(e.target.value)} className="mt-0.5 w-full px-2 py-1.5 text-sm border border-gray-300 rounded" />
              </label>
            </div>

            <div className="px-5 py-3 border-t border-gray-200 flex items-center justify-between gap-2">
              <div className="flex gap-2">
                <button onClick={() => { const s = buildStmt(); printStatement(s); }} className="inline-flex items-center gap-1 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"><Printer size={14} /> 인쇄</button>
                <button onClick={() => { const s = buildStmt(); downloadStatementXlsx(s); }} className="inline-flex items-center gap-1 px-3 py-2 text-sm border border-emerald-300 text-emerald-700 rounded-lg hover:bg-emerald-50"><FileSpreadsheet size={14} /> XLSX 다운로드</button>
              </div>
              <div className="flex gap-2">
                <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">닫기</button>
                <button onClick={save} disabled={busy} className="inline-flex items-center gap-1 px-4 py-2 text-sm bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50"><Save size={14} /> {busy ? "저장 중..." : "저장"}</button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, strong, muted }: { label: string; value: string; strong?: boolean; muted?: boolean }) {
  return (
    <div className={`flex items-center justify-between px-3 py-1.5 border-b border-gray-100 last:border-0 ${strong ? "bg-gray-50 font-bold" : ""} ${muted ? "text-gray-500" : ""}`}>
      <span className="text-xs">{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}

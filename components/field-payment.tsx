"use client";

import { useState, useEffect } from "react";
import { CreditCard, CheckCircle2, Loader2 } from "lucide-react";

function nowKST() { return new Date(Date.now() + 9 * 3600000); }
function todayStr() { return nowKST().toISOString().slice(0, 10); }

const fieldCls = "w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-3 text-white text-base placeholder-gray-500 focus:outline-none focus:border-blue-500";
const labelCls = "block text-xs font-semibold text-gray-400 mb-1.5";

interface Card { id: string; cardNo: string; label: string | null; }

export default function FieldPayment() {
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const [form, setForm] = useState({
    usedDate: todayStr(), cardNo: "", detail: "", amount: "", userName: "", memo: "",
  });

  useEffect(() => {
    fetch("/api/card").then(r => r.json()).then(d => {
      if (d.success) {
        setCards(d.data);
        if (d.data[0]) setForm(f => ({ ...f, cardNo: d.data[0].cardNo }));
      }
    });
  }, []);

  const set = (k: keyof typeof form, v: string) => setForm(p => ({ ...p, [k]: v }));

  const submit = async () => {
    if (!form.cardNo) { alert("카드를 선택하세요."); return; }
    if (!form.detail.trim()) { alert("사용내역을 입력하세요."); return; }
    setLoading(true);
    try {
      const r = await fetch("/api/card-usage", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const d = await r.json();
      if (!d.success) { alert(d.error ?? "저장 실패"); return; }
      setForm(f => ({ ...f, detail: "", amount: "", memo: "" }));
      setDone(true); setTimeout(() => setDone(false), 2000);
    } catch { alert("서버 오류"); } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      <div className="bg-gray-900 px-4 py-4 border-b border-gray-800">
        <p className="text-xs text-gray-500 font-medium">결제관리</p>
        <h1 className="text-lg font-bold text-white mt-0.5 flex items-center gap-2"><CreditCard size={18} /> 법인카드 사용 등록</h1>
      </div>

      <div className="flex-1 p-4 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>사용일자</label>
            <input type="date" value={form.usedDate} onChange={e => set("usedDate", e.target.value)} className={fieldCls} />
          </div>
          <div>
            <label className={labelCls}>카드번호</label>
            <select value={form.cardNo} onChange={e => set("cardNo", e.target.value)} className={fieldCls}>
              <option value="">선택...</option>
              {cards.map(c => <option key={c.id} value={c.cardNo}>{c.cardNo}{c.label ? ` (${c.label})` : ""}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className={labelCls}>사용내역</label>
          <input value={form.detail} onChange={e => set("detail", e.target.value)} placeholder="예: 자재 구매, 식대" className={fieldCls} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>금액 (원)</label>
            <input type="number" inputMode="numeric" value={form.amount} onChange={e => set("amount", e.target.value)} placeholder="금액" className={fieldCls} />
          </div>
          <div>
            <label className={labelCls}>사용자</label>
            <input value={form.userName} onChange={e => set("userName", e.target.value)} placeholder="이름" className={fieldCls} />
          </div>
        </div>

        <div>
          <label className={labelCls}>비고</label>
          <textarea value={form.memo} onChange={e => set("memo", e.target.value)} rows={2} className={fieldCls} placeholder="특이사항" />
        </div>

        <button onClick={submit} disabled={loading}
          className="w-full py-4 rounded-2xl bg-blue-600 text-white font-bold text-base active:bg-blue-700 disabled:opacity-60 flex items-center justify-center gap-2">
          {loading ? <><Loader2 size={18} className="animate-spin" /> 저장 중...</> : "사용 등록"}
        </button>
      </div>

      {done && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-green-600 text-white px-5 py-3 rounded-full font-bold flex items-center gap-2 shadow-lg z-50">
          <CheckCircle2 size={18} /> 사용내역이 등록되었습니다
        </div>
      )}
    </div>
  );
}

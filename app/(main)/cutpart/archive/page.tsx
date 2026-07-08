"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, RefreshCw, Undo2, Loader2, ChevronUp, ChevronDown } from "lucide-react";

interface Row {
  id: string; heatNo: string; status: string; archivedAt: string;
  inVessel: string; inBlock: string; material: string; thickness: number; width: number; length: number; weight: number;
  useVessel: string; useBlock: string; drawingNo: string; equipment: string; useDate: string | null;
  outVessel: string; outBlock: string; dest: string; outDate: string | null;
}

const fmtDate = (v: string | null) => v ? new Date(v).toLocaleDateString("ko-KR", { year: "2-digit", month: "2-digit", day: "2-digit" }) : "";
const fmtT = (v: number) => parseFloat(v.toFixed(1));
const fmtL = (v: number) => Math.round(v);

export default function ArchivePage() {
  const [tab, setTab] = useState<"plates" | "surplus" | "registered" | "remnant">("plates");
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Archive size={22} className="text-gray-600" /> 아카이브</h2>
        <p className="text-sm text-gray-500 mt-1">완료·출고된 오래된 자재를 활성 목록에서 숨겨 보관 (전 생애 추적 유지, 복원 가능)</p>
      </div>
      <div className="flex gap-1 border-b border-gray-200 flex-wrap">
        {([["plates", "정규작업"], ["surplus", "여유원재"], ["registered", "등록잔재"], ["remnant", "현장잔재"]] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px ${tab === k ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-800"}`}>{label}</button>
        ))}
      </div>
      {tab === "plates" ? <PlatesTab /> : (
        <div className="bg-white border border-gray-200 rounded-xl py-16 text-center text-gray-400 text-sm">
          잔재 아카이브(여유원재·등록잔재·현장잔재)는 차후 구현 예정입니다.
        </div>
      )}
    </div>
  );
}

type SortKey = keyof Row;
function PlatesTab() {
  const [rows, setRows] = useState<Row[]>([]);
  const [eligible, setEligible] = useState(0);
  const [months, setMonths] = useState(1);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey | null>("archivedAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetch(`/api/cutpart/archive?months=${months}`).then(r => r.json()).catch(() => ({ success: false }));
    if (r.success) { setRows(r.data); setEligible(r.eligible); }
    setLoading(false);
  }, [months]);
  useEffect(() => { load(); }, [load]);

  const run = async () => {
    if (!confirm(`완료·출고된 지 ${months}개월 이상인 판번호 ${eligible}건을 아카이브(숨김)하시겠습니까?\n(강재전체목록·판번호리스트에서 숨겨지고, 여기서 조회·복원 가능)`)) return;
    setBusy(true);
    try {
      const r = await fetch("/api/cutpart/archive", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "run", months }) }).then(r => r.json());
      if (!r.success) { alert(r.error ?? "실패"); return; }
      alert(`판번호 ${r.archivedHeats}건, 강재 ${r.archivedPlans}건 아카이브됨.`);
      load();
    } finally { setBusy(false); }
  };
  const restore = async (heatIds: string[], all = false) => {
    if (!confirm(all ? "아카이브된 전체를 활성 목록으로 복원하시겠습니까?" : `선택 ${heatIds.length}건을 복원하시겠습니까?`)) return;
    const r = await fetch("/api/cutpart/archive", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "restore", heatIds, all }) }).then(r => r.json());
    if (!r.success) { alert(r.error ?? "복원 실패"); return; }
    load();
  };

  const sort = (k: SortKey) => { if (sortKey === k) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortKey(k); setSortDir("asc"); } };

  const view = useMemo(() => {
    let v = rows;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      v = v.filter(r => `${r.heatNo} ${r.inVessel} ${r.material} ${r.useVessel} ${r.useBlock} ${r.drawingNo} ${r.equipment} ${r.outVessel} ${r.outBlock} ${r.dest}`.toLowerCase().includes(q));
    }
    if (sortKey) {
      v = [...v].sort((a, b) => {
        const x = a[sortKey] ?? "", y = b[sortKey] ?? "";
        const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "ko", { numeric: true });
        return sortDir === "asc" ? c : -c;
      });
    }
    return v;
  }, [rows, search, sortKey, sortDir]);

  const Th = ({ k, label, cls }: { k: SortKey; label: string; cls?: string }) => (
    <th className={`px-2 py-1.5 whitespace-nowrap cursor-pointer select-none hover:bg-gray-100 ${cls ?? ""}`} onClick={() => sort(k)}>
      <span className="inline-flex items-center gap-0.5">{label}{sortKey === k && (sortDir === "asc" ? <ChevronUp size={11} /> : <ChevronDown size={11} />)}</span>
    </th>
  );

  return (
    <div className="space-y-3">
      <div className="bg-white border border-gray-200 rounded-xl p-3 flex flex-wrap items-center gap-2">
        <span className="text-sm text-gray-600">완료·출고된 지</span>
        <select value={months} onChange={e => setMonths(Number(e.target.value))} className="px-2 py-1.5 text-sm border border-gray-300 rounded-lg">
          {[1, 2, 3, 6, 12].map(m => <option key={m} value={m}>{m}개월</option>)}
        </select>
        <span className="text-sm text-gray-600">이상 →</span>
        <button onClick={run} disabled={busy || eligible === 0} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50">
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Archive size={14} />} 아카이브 실행 ({eligible}건)
        </button>
        <div className="ml-auto flex items-center gap-2">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="판번호·호선·재질·도면·도착지 검색" className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg w-64" />
          <button onClick={load} className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50" title="새로고침"><RefreshCw size={14} /></button>
          {rows.length > 0 && <button onClick={() => restore([], true)} className="inline-flex items-center gap-1 px-3 py-1.5 text-sm border border-amber-300 text-amber-700 rounded-lg hover:bg-amber-50"><Undo2 size={14} /> 전체 복원</button>}
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-2 border-b border-gray-200 bg-gray-50 text-sm font-bold text-gray-700">아카이브된 판번호 <span className="text-gray-400 font-normal">({view.length})</span></div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs whitespace-nowrap">
            <thead className="text-gray-600">
              <tr className="bg-gray-100 text-center border-b border-gray-200">
                <th rowSpan={2} className="px-2 py-1.5 border-r border-gray-200">판번호</th>
                <th colSpan={7} className="px-2 py-1 bg-sky-50 text-sky-700 border-r border-gray-200">입고정보</th>
                <th colSpan={5} className="px-2 py-1 bg-amber-50 text-amber-700 border-r border-gray-200">사용정보 (절단)</th>
                <th colSpan={4} className="px-2 py-1 bg-emerald-50 text-emerald-700 border-r border-gray-200">출고정보</th>
                <th rowSpan={2} className="px-2 py-1.5">복원</th>
              </tr>
              <tr className="bg-gray-50 text-center border-b border-gray-200">
                <Th k="inVessel" label="호선" /><Th k="inBlock" label="블록" /><Th k="material" label="재질" /><Th k="thickness" label="두께" /><Th k="width" label="폭" /><Th k="length" label="길이" /><Th k="weight" label="중량" cls="border-r border-gray-200" />
                <Th k="useVessel" label="호선" /><Th k="useBlock" label="블록" /><Th k="drawingNo" label="도면번호" /><Th k="equipment" label="절단장비" /><Th k="useDate" label="사용일자" cls="border-r border-gray-200" />
                <Th k="outVessel" label="호선" /><Th k="outBlock" label="블록" /><Th k="dest" label="도착지" /><Th k="outDate" label="출고일자" cls="border-r border-gray-200" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={18} className="py-10 text-center text-gray-400"><Loader2 className="animate-spin inline mr-2" size={16} /> 불러오는 중...</td></tr>
              ) : view.length === 0 ? (
                <tr><td colSpan={18} className="py-10 text-center text-gray-400">아카이브된 항목이 없습니다. 위에서 [아카이브 실행]으로 오래된 완료·출고분을 보관하세요.</td></tr>
              ) : view.map(r => (
                <tr key={r.id} className="hover:bg-gray-50 text-center">
                  <td className="px-2 py-1.5 font-mono font-semibold border-r border-gray-100">{r.heatNo}</td>
                  <td className="px-2 py-1.5">{r.inVessel}</td><td className="px-2 py-1.5">{r.inBlock || "-"}</td><td className="px-2 py-1.5">{r.material}</td>
                  <td className="px-2 py-1.5 font-mono">{fmtT(r.thickness)}</td><td className="px-2 py-1.5 font-mono">{fmtL(r.width)}</td><td className="px-2 py-1.5 font-mono">{fmtL(r.length)}</td><td className="px-2 py-1.5 font-mono border-r border-gray-100">{r.weight}</td>
                  <td className="px-2 py-1.5">{r.useVessel || "-"}</td><td className="px-2 py-1.5">{r.useBlock || "-"}</td><td className="px-2 py-1.5 font-mono">{r.drawingNo || "-"}</td><td className="px-2 py-1.5">{r.equipment || "-"}</td><td className="px-2 py-1.5 border-r border-gray-100">{fmtDate(r.useDate) || "-"}</td>
                  <td className="px-2 py-1.5">{r.outVessel || "-"}</td><td className="px-2 py-1.5">{r.outBlock || "-"}</td><td className="px-2 py-1.5">{r.dest || "-"}</td><td className="px-2 py-1.5 border-r border-gray-100">{fmtDate(r.outDate) || "-"}</td>
                  <td className="px-2 py-1.5"><button onClick={() => restore([r.id])} className="text-amber-600 hover:underline"><Undo2 size={13} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

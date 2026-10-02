"use client";

import { useMemo, useRef, useState } from "react";
import { X, ScanLine, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { kstTodayYmd } from "@/lib/work-date";

/**
 * 송장 스캔 입고 (강재입출고 상단) — 2026-10-02
 *
 * 프린터로 스캔한 철판 입고송장 PDF → NAS 의 설치형 OCR 이 판번호·규격·재질·호선을 읽음 →
 * 여기서 행마다 확인(파란 칸은 고칠 수 있음) → [입고 확정] = 「입고 LIST」 엑셀 업로드 + 일괄 입고와 같은 결과.
 * 이미 등록된 판번호는 기본으로 뺀다. 노란 줄은 확인사항이 있는 줄. PDF 는 서버에 남지 않는다.
 */

type Row = {
  page: number; heatNo: string; material: string | null; thickness: number | null; width: number | null; length: number | null;
  weightKg: number | null; vesselCode: string; existing: boolean; checks: string[]; line: string;
};
type Line = { on: boolean; page: number; heatNo: string; vesselCode: string; material: string; thickness: string; width: string; length: string; storageLocation: string; weightKg: number | null; existing: boolean; checks: string[] };

const kg = (t: string, w: string, l: string) => { const v = (Number(t) * Number(w) * Number(l) * 7.85) / 1e6; return v > 0 ? v : 0; };

export default function InvoiceScanModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[] | null>(null);
  const [meta, setMeta] = useState<{ bizNos: string[]; dates: string[]; vessels: string[]; pages: number; seconds: number } | null>(null);
  const [receivedAt, setReceivedAt] = useState(kstTodayYmd());
  const [bulkLoc, setBulkLoc] = useState("");
  const [saving, setSaving] = useState(false);

  const read = async () => {
    if (!file) return;
    setBusy(true); setErr(null); setLines(null);
    try {
      const fd = new FormData(); fd.append("file", file);
      const r = await fetch("/api/steel-plan/invoice-ocr", { method: "POST", body: fd });
      const d = await r.json();
      if (!d.success) { setErr(d.error ?? "판독 실패"); return; }
      setMeta({ bizNos: d.bizNos, dates: d.dates, vessels: d.vessels, pages: d.pages, seconds: d.seconds });
      setLines((d.rows as Row[]).map(x => ({
        on: !x.existing, page: x.page, heatNo: x.heatNo, vesselCode: x.vesselCode, material: x.material ?? "",
        thickness: x.thickness?.toString() ?? "", width: x.width?.toString() ?? "", length: x.length?.toString() ?? "",
        storageLocation: "", weightKg: x.weightKg, existing: x.existing, checks: x.checks,
      })));
    } catch { setErr("서버 오류"); }
    finally { setBusy(false); }
  };

  const set = (i: number, p: Partial<Line>) => setLines(ls => ls!.map((l, j) => (j === i ? { ...l, ...p } : l)));
  const picked = useMemo(() => (lines ?? []).filter(l => l.on), [lines]);
  const pickedKg = picked.reduce((s, l) => s + kg(l.thickness, l.width, l.length), 0);
  const incomplete = picked.filter(l => !l.vesselCode.trim() || !l.material.trim() || !(Number(l.thickness) > 0) || !(Number(l.width) > 0) || !(Number(l.length) > 0) || !l.heatNo.trim());

  const confirmReceive = async () => {
    if (!picked.length) return;
    if (incomplete.length) { alert(`빈 칸이 있는 줄이 ${incomplete.length}개 있습니다: ${incomplete.map(l => l.heatNo).join(", ")}`); return; }
    if (!confirm(`${picked.length}장 (${Math.round(pickedKg).toLocaleString()} kg) 을 ${receivedAt} 입고로 등록합니다.\n판번호도 함께 등록됩니다. 계속할까요?`)) return;
    setSaving(true);
    try {
      const r = await fetch("/api/steel-plan/invoice-receive", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file?.name ?? "송장", receivedAt,
          rows: picked.map(l => ({ vesselCode: l.vesselCode, material: l.material, thickness: Number(l.thickness), width: Number(l.width), length: Number(l.length), heatNo: l.heatNo, storageLocation: l.storageLocation })),
        }),
      });
      const d = await r.json();
      if (!d.success) { alert(d.error ?? "입고 실패"); return; }
      alert(`${d.count}장을 입고 처리했습니다. (업로드번호 ${d.uploadBatchNo})\n종이 송장은 따로 보관하세요.`);
      onDone(); onClose();
    } catch { alert("서버 오류"); }
    finally { setSaving(false); }
  };

  const inp = "h-7 px-1.5 border border-blue-200 bg-blue-50/40 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-400";

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-3">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-6xl max-h-[92vh] flex flex-col">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
          <ScanLine size={16} className="text-teal-600" />
          <h3 className="text-sm font-bold text-gray-800">송장 스캔 입고</h3>
          <span className="text-xs text-gray-400">프린터로 스캔한 입고송장 PDF → 판번호·규격 자동 판독 → 확인 후 입고</span>
          <button onClick={onClose} className="ml-auto p-1 rounded hover:bg-gray-100"><X size={16} /></button>
        </div>

        <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2 flex-wrap text-sm">
          <input ref={fileRef} type="file" accept=".pdf,application/pdf" className="hidden" onChange={e => { setFile(e.target.files?.[0] ?? null); setLines(null); setErr(null); }} />
          <button onClick={() => fileRef.current?.click()} className="h-8 px-3 border border-gray-300 rounded-lg hover:bg-gray-50">PDF 선택</button>
          <span className="text-xs text-gray-600 max-w-[280px] truncate">{file ? file.name : "선택된 파일 없음"}</span>
          <button onClick={read} disabled={!file || busy} className="h-8 px-3 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-40 inline-flex items-center gap-1">
            {busy ? <Loader2 size={14} className="animate-spin" /> : <ScanLine size={14} />} {busy ? "판독 중… (장당 10~15초)" : "판독"}
          </button>
          {meta && (
            <span className="text-xs text-gray-500">
              {meta.pages}쪽 · {meta.seconds}초 · 판번호 {lines?.length ?? 0}장
              {meta.bizNos.length > 0 && <> · 사업자번호 {meta.bizNos.join(", ")}</>}
              {meta.dates.length > 0 && <> · 송장 날짜 {meta.dates.join(", ")}</>}
            </span>
          )}
        </div>
        {err && <p className="px-4 py-2 text-sm text-red-600">{err}</p>}

        {lines && (
          <>
            <div className="px-4 py-2 border-b border-gray-100 flex items-center gap-2 flex-wrap text-xs">
              <span className="text-gray-500">입고일</span>
              <input type="date" value={receivedAt} onChange={e => setReceivedAt(e.target.value)} className="h-7 px-1.5 border border-gray-300 rounded" />
              <span className="ml-3 text-gray-500">보관위치 일괄</span>
              <input value={bulkLoc} onChange={e => setBulkLoc(e.target.value)} placeholder="예: A0" className="w-20 h-7 px-1.5 border border-gray-300 rounded" />
              <button onClick={() => setLines(ls => ls!.map(l => (l.on ? { ...l, storageLocation: bulkLoc } : l)))} className="h-7 px-2 border border-gray-300 rounded hover:bg-gray-50">선택한 줄에 넣기</button>
              <span className="ml-auto text-gray-400">파란 칸은 고칠 수 있습니다 · 노란 줄은 확인사항이 있는 줄</span>
            </div>
            <datalist id="invoice-vessels">{meta?.vessels.map(v => <option key={v} value={v} />)}</datalist>
            <div className="flex-1 overflow-auto">
              <table className="w-full text-xs whitespace-nowrap">
                <thead className="bg-gray-50 text-gray-500 sticky top-0 z-10">
                  <tr>
                    <th className="px-2 py-1.5 w-8"><input type="checkbox" checked={lines.every(l => l.on)} onChange={e => setLines(ls => ls!.map(l => ({ ...l, on: e.target.checked && !l.existing })))} /></th>
                    <th className="px-1 py-1.5">쪽</th>
                    <th className="px-1 py-1.5 text-left">판번호</th>
                    <th className="px-1 py-1.5 text-left">호선</th>
                    <th className="px-1 py-1.5 text-left">재질</th>
                    <th className="px-1 py-1.5 text-left">두께</th>
                    <th className="px-1 py-1.5 text-left">폭</th>
                    <th className="px-1 py-1.5 text-left">길이</th>
                    <th className="px-1 py-1.5 text-right">중량(kg)</th>
                    <th className="px-1 py-1.5 text-left">보관위치</th>
                    <th className="px-2 py-1.5 text-left">확인</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {lines.map((l, i) => (
                    <tr key={i} className={l.existing ? "bg-gray-50 text-gray-400" : l.checks.length ? "bg-amber-50/70" : ""}>
                      <td className="px-2 py-1 text-center"><input type="checkbox" checked={l.on} onChange={e => set(i, { on: e.target.checked })} /></td>
                      <td className="px-1 py-1 text-center text-gray-400">{l.page}</td>
                      <td className="px-1 py-1"><input value={l.heatNo} onChange={e => set(i, { heatNo: e.target.value.toUpperCase() })} className={`${inp} w-28 font-mono`} /></td>
                      <td className="px-1 py-1"><input list="invoice-vessels" value={l.vesselCode} onChange={e => set(i, { vesselCode: e.target.value })} className={`${inp} w-24`} /></td>
                      <td className="px-1 py-1"><input value={l.material} onChange={e => set(i, { material: e.target.value.toUpperCase() })} className={`${inp} w-14`} /></td>
                      <td className="px-1 py-1"><input value={l.thickness} onChange={e => set(i, { thickness: e.target.value })} className={`${inp} w-12 text-right`} /></td>
                      <td className="px-1 py-1"><input value={l.width} onChange={e => set(i, { width: e.target.value })} className={`${inp} w-14 text-right`} /></td>
                      <td className="px-1 py-1"><input value={l.length} onChange={e => set(i, { length: e.target.value })} className={`${inp} w-16 text-right`} /></td>
                      <td className="px-1 py-1 text-right font-mono">{Math.round(kg(l.thickness, l.width, l.length)).toLocaleString()}</td>
                      <td className="px-1 py-1"><input value={l.storageLocation} onChange={e => set(i, { storageLocation: e.target.value })} className={`${inp} w-16`} /></td>
                      <td className="px-2 py-1 whitespace-normal min-w-[180px]">
                        {l.checks.length === 0
                          ? <span className="inline-flex items-center gap-1 text-emerald-600"><CheckCircle2 size={12} /> 정상</span>
                          : l.checks.map((c, k) => <div key={k} className="flex items-start gap-1 text-amber-700"><AlertTriangle size={11} className="mt-0.5 shrink-0" /> {c}</div>)}
                      </td>
                    </tr>
                  ))}
                  {lines.length === 0 && <tr><td colSpan={11} className="py-8 text-center text-gray-400">판번호를 찾지 못했습니다. 스캔 상태(해상도·방향)를 확인하세요.</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-3 border-t border-gray-100 flex items-center gap-2 flex-wrap">
              <span className="text-xs text-gray-600">선택 <strong>{picked.length}</strong>장 · {Math.round(pickedKg).toLocaleString()} kg
                {incomplete.length > 0 && <span className="ml-2 text-red-600">빈 칸 있는 줄 {incomplete.length}개</span>}
              </span>
              <div className="ml-auto flex gap-2">
                <button onClick={onClose} className="h-8 px-3 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">닫기</button>
                <button onClick={confirmReceive} disabled={saving || !picked.length}
                  className="h-8 px-4 text-sm bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-40">
                  {saving ? "입고 중…" : `입고 확정 (${picked.length}장)`}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

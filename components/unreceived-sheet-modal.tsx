"use client";

import { useState } from "react";
import { X, Printer, Download } from "lucide-react";
import { downloadUnreceived, printUnreceived, todayMd, unreceivedTitle, type UnreceivedRow } from "@/lib/selection-sheet";

/**
 * 미입고 강재 출력 (강재매칭) — 2026-10-02
 *
 * 매칭에 올린 Steellist 중 아직 선별·출고되지 않은 사양을 사무실 '미입고 강재' 양식으로 찍는다.
 * 비고는 매칭 결과로 초안을 채운다(입고 대기 = 판번호 목록엔 있고 아직 안 들어옴 · 재고 있음 = 들어와 있는데 안 고름 ·
 * 절단 확정 = 블록에 잡혀 있음). 줄을 빼거나 비고를 고친 뒤 인쇄·엑셀.
 * ⚠ 매칭을 지우면 원본 사양이 없어져 다시 뽑을 수 없다 — 지우기 전에 출력할 것.
 */

type Line = UnreceivedRow & { on: boolean };

export default function UnreceivedSheetModal({ rows, onClose }: { rows: UnreceivedRow[]; onClose: () => void }) {
  const [md, setMd] = useState(todayMd());
  const [suffix, setSuffix] = useState("");
  const [lines, setLines] = useState<Line[]>(() => rows.map(r => ({ ...r, on: true })));
  const set = (i: number, p: Partial<Line>) => setLines(ls => ls.map((l, j) => (j === i ? { ...l, ...p } : l)));
  const picked = lines.filter(l => l.on);
  const title = unreceivedTitle(md, suffix.trim());

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-3" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
          <h3 className="text-sm font-bold text-gray-800">미입고 강재 출력</h3>
          <span className="text-xs text-gray-400">선별·출고되지 않은 사양 {rows.length}건</span>
          <button onClick={onClose} className="ml-auto p-1 rounded hover:bg-gray-100"><X size={16} /></button>
        </div>
        <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2 flex-wrap text-sm">
          <span className="text-xs text-gray-500">제목</span>
          <span className="text-gray-700">미입고 강재 (</span>
          <input value={md} onChange={e => setMd(e.target.value)} className="w-16 h-7 px-1.5 border border-gray-300 rounded text-center" />
          <span className="text-gray-700">)</span>
          <input value={suffix} onChange={e => setSuffix(e.target.value)} placeholder="덧붙일 말 (예: 추가)" className="w-40 h-7 px-2 border border-gray-300 rounded text-xs" />
        </div>
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 text-gray-500 sticky top-0">
              <tr>
                <th className="px-2 py-1.5 w-8"><input type="checkbox" checked={lines.every(l => l.on)} onChange={e => setLines(ls => ls.map(l => ({ ...l, on: e.target.checked })))} /></th>
                <th className="px-2 py-1.5 text-left">호선</th><th className="px-2 py-1.5 text-left">블록</th><th className="px-2 py-1.5 text-left">재질</th>
                <th className="px-2 py-1.5 text-right">두께</th><th className="px-2 py-1.5 text-right">폭</th><th className="px-2 py-1.5 text-right">길이</th>
                <th className="px-2 py-1.5 text-left w-48">비고</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {lines.map((l, i) => (
                <tr key={i} className={l.on ? "" : "opacity-40"}>
                  <td className="px-2 py-1 text-center"><input type="checkbox" checked={l.on} onChange={e => set(i, { on: e.target.checked })} /></td>
                  <td className="px-2 py-1">{l.vesselCode}</td>
                  <td className="px-2 py-1"><input value={l.block} onChange={e => set(i, { block: e.target.value })} className="w-20 h-6 px-1 border border-gray-200 rounded" /></td>
                  <td className="px-2 py-1">{l.material}</td>
                  <td className="px-2 py-1 text-right font-mono">{l.thickness}</td>
                  <td className="px-2 py-1 text-right font-mono">{l.width}</td>
                  <td className="px-2 py-1 text-right font-mono">{l.length}</td>
                  <td className="px-2 py-1"><input value={l.note} onChange={e => set(i, { note: e.target.value })} className="w-full h-6 px-1 border border-gray-200 rounded" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 border-t border-gray-100 flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-600">총 <strong>{picked.length}</strong>장</span>
          <div className="ml-auto flex gap-2">
            <button onClick={onClose} className="h-8 px-3 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">닫기</button>
            <button disabled={!picked.length} onClick={() => downloadUnreceived(md, title, picked)}
              className="h-8 px-3 text-sm border border-emerald-500 text-emerald-700 rounded-lg hover:bg-emerald-50 disabled:opacity-40 inline-flex items-center gap-1">
              <Download size={14} /> 엑셀
            </button>
            <button disabled={!picked.length} onClick={() => { const w = window.open("", "_blank", "width=900,height=800"); if (w) printUnreceived(w, title, picked); }}
              className="h-8 px-3 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 inline-flex items-center gap-1">
              <Printer size={14} /> 인쇄
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

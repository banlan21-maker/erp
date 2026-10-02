"use client";

import { useMemo, useState } from "react";
import { X, Printer, Download } from "lucide-react";
import { sheetBlockFromLabel, destFromLabel } from "@/lib/block-from-label";
import { downloadSelectionSheet, plateKg, printSelectionSheet, sheetTitle, todayMd, ymdDot, type SheetRow } from "@/lib/selection-sheet";

/**
 * 선별지시서 출력 (선별목록 탭) — 2026-10-02
 *
 * 선별된 자재를 매칭(블록) 단위로 묶어 보여주고, 넣을 묶음을 골라 하루치 한 장으로 찍는다.
 * 블록·착지는 매칭이름(Steellist-1023-H40P(월드-덕광))에서 기본값을 뽑고 여기서 고친다 —
 * 운송사가 출하 직전에 바뀌는 일이 있다(월드 → 세림). 고친 값은 이 출력에만 쓴다.
 * 정렬은 보관위치 순, 양식은 사무실 엑셀 그대로(lib/selection-sheet).
 */

export type SheetSource = {
  id: string; kind: "plate" | "remnant";
  vesselCode: string; material: string; thickness: number; width: number; length: number;
  storageLocation: string | null; receivedAt: string | null;
  label: string | null;          // 원판: 매칭이름(shipoutLabel)
  groupName?: string;            // 잔재: "여유원재" 등
};

type Group = { key: string; title: string; items: SheetSource[]; on: boolean; block: string; dest: string };

export default function SelectionSheetModal({ items, onClose }: { items: SheetSource[]; onClose: () => void }) {
  const [md, setMd] = useState(todayMd());
  const [suffix, setSuffix] = useState("");
  const [groups, setGroups] = useState<Group[]>(() => {
    const m = new Map<string, Group>();
    for (const it of items) {
      const key = it.kind === "plate" ? `p|${it.label ?? ""}` : `r|${it.groupName ?? "잔재"}`;
      if (!m.has(key)) {
        const title = it.kind === "plate" ? (it.label || "(매칭이름 없음)") : `잔재 · ${it.groupName ?? ""}`;
        m.set(key, { key, title, items: [], on: true, block: it.kind === "plate" ? sheetBlockFromLabel(it.label) : "", dest: it.kind === "plate" ? destFromLabel(it.label) : "" });
      }
      m.get(key)!.items.push(it);
    }
    return [...m.values()].sort((a, b) => a.title.localeCompare(b.title, "ko", { numeric: true }));
  });

  const patch = (key: string, p: Partial<Group>) => setGroups(gs => gs.map(g => (g.key === key ? { ...g, ...p } : g)));

  const rows: SheetRow[] = useMemo(() => groups.filter(g => g.on).flatMap(g => g.items.map(it => ({
    vesselCode: it.vesselCode, block: g.block, dest: g.dest, material: it.material,
    thickness: it.thickness, width: it.width, length: it.length,
    location: it.storageLocation ?? "", receivedAt: ymdDot(it.receivedAt),
  }))), [groups]);
  const kg = rows.reduce((s, r) => s + plateKg(r.thickness, r.width, r.length), 0);
  const title = sheetTitle(md, suffix.trim());
  const noLoc = rows.filter(r => !r.location).length;

  const print = () => {
    const win = window.open("", "_blank", "width=1200,height=800");
    if (win) printSelectionSheet(win, title, rows);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-3" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
          <h3 className="text-sm font-bold text-gray-800">선별지시서 출력</h3>
          <span className="text-xs text-gray-400">넣을 묶음을 고르고 블록·착지를 확인하세요 · 보관위치 순으로 찍힙니다</span>
          <button onClick={onClose} className="ml-auto p-1 rounded hover:bg-gray-100"><X size={16} /></button>
        </div>

        <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2 flex-wrap text-sm">
          <span className="text-xs text-gray-500">제목</span>
          <span className="text-gray-700">선 별 지 시 서 (</span>
          <input value={md} onChange={e => setMd(e.target.value)} className="w-16 h-7 px-1.5 border border-gray-300 rounded text-center" />
          <span className="text-gray-700">)</span>
          <input value={suffix} onChange={e => setSuffix(e.target.value)} placeholder="덧붙일 말 (예: 추가, 긴급)" className="w-44 h-7 px-2 border border-gray-300 rounded text-xs" />
        </div>

        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 text-gray-500 sticky top-0">
              <tr>
                <th className="px-2 py-1.5 w-8">
                  <input type="checkbox" checked={groups.every(g => g.on)} onChange={e => setGroups(gs => gs.map(g => ({ ...g, on: e.target.checked })))} />
                </th>
                <th className="px-2 py-1.5 text-left">매칭이름</th>
                <th className="px-2 py-1.5 text-right w-14">장수</th>
                <th className="px-2 py-1.5 text-right w-20">중량(kg)</th>
                <th className="px-2 py-1.5 text-left w-32">블록</th>
                <th className="px-2 py-1.5 text-left w-40">착지</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {groups.map(g => {
                const gkg = g.items.reduce((s, it) => s + plateKg(it.thickness, it.width, it.length), 0);
                return (
                  <tr key={g.key} className={g.on ? "" : "opacity-40"}>
                    <td className="px-2 py-1 text-center"><input type="checkbox" checked={g.on} onChange={e => patch(g.key, { on: e.target.checked })} /></td>
                    <td className="px-2 py-1 text-gray-700">{g.title}</td>
                    <td className="px-2 py-1 text-right font-mono">{g.items.length}</td>
                    <td className="px-2 py-1 text-right font-mono">{Math.round(gkg).toLocaleString()}</td>
                    <td className="px-2 py-1"><input value={g.block} onChange={e => patch(g.key, { block: e.target.value })} className="w-full h-7 px-1.5 border border-gray-200 rounded" /></td>
                    <td className="px-2 py-1"><input value={g.dest} onChange={e => patch(g.key, { dest: e.target.value })} placeholder="운송사-착지" className="w-full h-7 px-1.5 border border-gray-200 rounded" /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="px-4 py-3 border-t border-gray-100 flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-600">
            총 <strong>{rows.length}</strong>장 · {Math.round(kg).toLocaleString()} kg
            {noLoc > 0 && <span className="ml-2 text-amber-600">보관위치 없는 판 {noLoc}장 — 맨 뒤에 찍힙니다</span>}
          </span>
          <div className="ml-auto flex gap-2">
            <button onClick={onClose} className="h-8 px-3 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">닫기</button>
            <button disabled={!rows.length} onClick={() => downloadSelectionSheet(md, title, rows)}
              className="h-8 px-3 text-sm border border-emerald-500 text-emerald-700 rounded-lg hover:bg-emerald-50 disabled:opacity-40 inline-flex items-center gap-1">
              <Download size={14} /> 엑셀
            </button>
            <button disabled={!rows.length} onClick={print}
              className="h-8 px-3 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 inline-flex items-center gap-1">
              <Printer size={14} /> 인쇄
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

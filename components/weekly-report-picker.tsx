"use client";

import { useEffect, useMemo, useState } from "react";
import { X, Loader2 } from "lucide-react";
import { STATUS_META, type LineStatus } from "@/lib/work-line-status";

/**
 * 주간보고 — 업무일지·일정에서 보고서에 넣을 항목 고르기 (2026-10-02)
 *
 * 그 주 업무일지 줄(사람별)과 이번 주·다음 주 일정을 체크해서 '금주 실적' / '차주 계획' 글칸에 덧붙인다.
 * 줄마다 어느 칸에 넣을지 바꿀 수 있다(기본: 업무일지·이번 주 일정 → 금주, 내일 계획·다음 주 일정 → 차주).
 * 이미 글칸에 들어 있는 줄은 '포함됨'으로 표시하고 기본 선택하지 않는다.
 */

type LogItem = { text: string; status: LineStatus; kind: "today" | "plan"; dates: string[] };
type EventItem = { date: string; text: string; who: string | null; week: "this" | "next" };
type Target = "this" | "next";
type Row = { id: string; group: string; text: string; line: string; target: Target; status?: LineStatus; sub: string };

const md = (ymd: string) => `${Number(ymd.slice(5, 7))}/${Number(ymd.slice(8, 10))}`;

export default function WeeklyReportPicker({ from, to, thisWeek, nextWeek, onAdd, onClose }: {
  from: string; to: string; thisWeek: string; nextWeek: string;
  onAdd: (add: { thisWeek: string; nextWeek: string }) => void;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`/api/weekly-report/sources?from=${from}&to=${to}`);
        const d = await r.json();
        if (!d.success) { setErr(d.error ?? "불러오기 실패"); return; }
        const out: Row[] = [];
        for (const g of d.logs as { user: string; items: LogItem[] }[]) {
          g.items.forEach((it, i) => out.push({
            id: `log|${g.user}|${i}`, group: `업무일지 · ${g.user}`, text: it.text,
            line: it.status === "doing" && it.kind === "today" ? `${it.text} (진행 중)` : it.text,
            target: it.kind === "plan" ? "next" : "this", status: it.status,
            sub: it.kind === "plan" ? `${md(it.dates[0])} 내일 계획` : it.dates.map(md).join(", "),
          }));
        }
        (d.events as EventItem[]).forEach((e, i) => out.push({
          id: `ev|${i}`, group: e.week === "this" ? "일정 · 이번 주" : "일정 · 다음 주",
          text: e.text, line: `${md(e.date)} ${e.text}`, target: e.week, sub: [md(e.date), e.who].filter(Boolean).join(" · "),
        }));
        setRows(out);
      } catch { setErr("서버 오류"); }
    })();
  }, [from, to]);

  // 이미 글칸에 들어간 줄 — 공백 차이는 무시하고 본문 포함 여부로 본다
  const included = useMemo(() => {
    const hay = (thisWeek + "\n" + nextWeek).replace(/\s+/g, " ");
    return new Set((rows ?? []).filter(r => hay.includes(r.text.replace(/\s+/g, " "))).map(r => r.id));
  }, [rows, thisWeek, nextWeek]);

  const groups = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const r of rows ?? []) { if (!m.has(r.group)) m.set(r.group, []); m.get(r.group)!.push(r); }
    return [...m];
  }, [rows]);

  const toggle = (id: string) => setChecked(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleGroup = (items: Row[]) => setChecked(s => {
    const n = new Set(s);
    const all = items.every(r => n.has(r.id));
    for (const r of items) { if (all) n.delete(r.id); else n.add(r.id); }
    return n;
  });
  const setTarget = (id: string, target: Target) => setRows(rs => rs!.map(r => (r.id === id ? { ...r, target } : r)));

  /** 고른 줄을 글칸 형식(" <제목>" / " - 내용")으로 — 업무일지는 사람별, 일정은 '일정' 묶음 */
  const build = (target: Target) => {
    const sel = (rows ?? []).filter(r => checked.has(r.id) && r.target === target);
    if (!sel.length) return "";
    const out: string[] = [];
    const heads = new Map<string, string[]>();
    for (const r of sel) {
      const head = r.group.startsWith("일정") ? "일정" : r.group.replace("업무일지 · ", "");
      if (!heads.has(head)) heads.set(head, []);
      heads.get(head)!.push(` - ${r.line}`);
    }
    for (const [head, lines] of heads) out.push(` <${head}>`, ...lines);
    return out.join("\n");
  };
  const nThis = (rows ?? []).filter(r => checked.has(r.id) && r.target === "this").length;
  const nNext = (rows ?? []).filter(r => checked.has(r.id) && r.target === "next").length;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-3" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
          <h3 className="text-sm font-bold text-gray-800">업무일지·일정에서 가져오기</h3>
          <span className="text-xs text-gray-400">{md(from)}~{md(to)} · 보고서에 넣을 줄을 고르세요</span>
          <button onClick={onClose} className="ml-auto p-1 rounded hover:bg-gray-100"><X size={16} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          {err && <p className="text-sm text-red-600">{err}</p>}
          {!rows && !err && <p className="text-sm text-gray-400 flex items-center gap-1"><Loader2 size={14} className="animate-spin" /> 불러오는 중…</p>}
          {rows && !rows.length && <p className="text-sm text-gray-400">이 기간에 작성된 업무일지·일정이 없습니다.</p>}
          {groups.map(([group, items]) => (
            <div key={group}>
              <div className="flex items-center gap-2 mb-1">
                <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 cursor-pointer">
                  <input type="checkbox" checked={items.every(r => checked.has(r.id))} onChange={() => toggleGroup(items)} />
                  {group}
                </label>
                <span className="text-[11px] text-gray-400">{items.length}줄</span>
              </div>
              <ul className="border border-gray-100 rounded-lg divide-y divide-gray-100">
                {items.map(r => {
                  const inc = included.has(r.id);
                  return (
                    <li key={r.id} className={`flex items-start gap-2 px-2 py-1.5 text-xs ${inc ? "bg-gray-50" : ""}`}>
                      <input type="checkbox" className="mt-0.5" checked={checked.has(r.id)} onChange={() => toggle(r.id)} />
                      <button type="button" onClick={() => toggle(r.id)} className="flex-1 min-w-0 text-left">
                        <span className={inc ? "text-gray-400" : "text-gray-800"}>
                          {r.status && r.status !== "none" && (
                            <span className={`inline-block w-1.5 h-1.5 rounded-full align-middle mr-1 ${STATUS_META[r.status].dot}`} title={STATUS_META[r.status].label} />
                          )}
                          {r.text}
                        </span>
                        <span className="ml-1.5 text-[10px] text-gray-400 whitespace-nowrap">
                          {r.status && r.status !== "none" ? `${STATUS_META[r.status].label} · ` : ""}{r.sub}
                        </span>
                        {inc && <span className="ml-1.5 text-[10px] px-1 rounded bg-gray-200 text-gray-500">포함됨</span>}
                      </button>
                      <div className="shrink-0 inline-flex rounded border border-gray-200 overflow-hidden text-[10px]">
                        {(["this", "next"] as Target[]).map(t => (
                          <button key={t} type="button" onClick={() => setTarget(r.id, t)}
                            className={`px-1.5 py-0.5 ${r.target === t ? "bg-blue-600 text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}>
                            {t === "this" ? "금주" : "차주"}
                          </button>
                        ))}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>

        <div className="px-4 py-3 border-t border-gray-100 flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-500">금주 실적 {nThis}줄 · 차주 계획 {nNext}줄 선택</span>
          <div className="ml-auto flex gap-2">
            <button onClick={onClose} className="h-8 px-3 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">취소</button>
            <button disabled={!nThis && !nNext} onClick={() => { onAdd({ thisWeek: build("this"), nextWeek: build("next") }); onClose(); }}
              className="h-8 px-3 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40">
              보고서에 추가
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

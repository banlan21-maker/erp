"use client";

/**
 * 업무일지 줄 단위 에디터 — 공책처럼 한 줄씩 입력. 각 줄 앞 상태 아이콘 클릭 → 미니 팝업
 * (없음/완료/진행중/중요). 완료=취소선. 저장은 부모의 같은 텍스트 필드에 줄머리 토큰으로 직렬화.
 * Enter=새 줄, 빈 줄에서 Backspace=줄 삭제. @멘션 칩은 포커스된 줄에 "@이름 " 추가.
 */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AtSign } from "lucide-react";
import { parseLine, serializeLine, STATUS_META, STATUS_ORDER, type LineStatus } from "@/lib/work-line-status";

interface Row { id: number; status: LineStatus; text: string }
let _seq = 0;
const toRows = (value: string): Row[] => {
  const lines = value ? value.split("\n") : [""];
  return lines.map((l) => { const { status, text } = parseLine(l); return { id: _seq++, status, text }; });
};
const toValue = (rows: Row[]) => rows.map((r) => serializeLine(r.status, r.text)).join("\n");

export default function WorkJournalLineEditor({
  value, onChange, placeholder, mentionUsers = [],
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mentionUsers?: { id: string; name: string }[];
}) {
  const [rows, setRows] = useState<Row[]>(() => toRows(value));
  const lastSerialized = useRef(value);
  const inputRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const focusNext = useRef<number | null>(null);
  const focusedId = useRef<number | null>(null);
  const [menuFor, setMenuFor] = useState<number | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const openMenu = (id: number, btn: HTMLElement) => {
    const r = btn.getBoundingClientRect();
    setMenuPos({ top: r.bottom + 4, left: r.left });
    setMenuFor(id);
  };

  // 외부 value 변경(날짜 전환 등)이면 rows 재생성. 내가 올린 값(echo)은 무시.
  useEffect(() => {
    if (value !== lastSerialized.current) {
      setRows(toRows(value));
      lastSerialized.current = value;
    }
  }, [value]);

  // Enter/Backspace 후 포커스 이동
  useEffect(() => {
    if (focusNext.current != null) {
      const el = inputRefs.current[focusNext.current];
      if (el) { el.focus(); const v = el.value; el.setSelectionRange(v.length, v.length); }
      focusNext.current = null;
    }
  });

  const commit = (next: Row[]) => {
    setRows(next);
    const v = toValue(next);
    lastSerialized.current = v;
    onChange(v);
  };

  const setText = (id: number, text: string) => commit(rows.map((r) => (r.id === id ? { ...r, text } : r)));
  const setStatus = (id: number, status: LineStatus) => { commit(rows.map((r) => (r.id === id ? { ...r, status } : r))); setMenuFor(null); };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, idx: number) => {
    const r = rows[idx];
    if (e.key === "Enter") {
      e.preventDefault();
      const nr: Row = { id: _seq++, status: "none", text: "" };
      focusNext.current = nr.id;
      commit([...rows.slice(0, idx + 1), nr, ...rows.slice(idx + 1)]);
    } else if (e.key === "Backspace" && r.text === "" && rows.length > 1) {
      e.preventDefault();
      const prev = rows[idx - 1];
      if (prev) focusNext.current = prev.id;
      commit(rows.filter((_, i) => i !== idx));
    }
  };

  // @멘션 칩 — 포커스된 줄(없으면 마지막 줄)에 "@이름 " 추가
  const appendMention = (name: string) => {
    const targetId = focusedId.current ?? rows[rows.length - 1]?.id;
    if (targetId == null) return;
    focusNext.current = targetId;
    commit(rows.map((r) => {
      if (r.id !== targetId) return r;
      const t = r.text;
      return { ...r, text: `${t}${t && !t.endsWith(" ") ? " " : ""}@${name} ` };
    }));
  };

  return (
    <div className="text-sm">
      <div className="p-2 space-y-0.5">
        {rows.map((r, idx) => {
          const meta = STATUS_META[r.status];
          return (
            <div key={r.id} className="group flex items-center gap-1.5">
              {/* 상태 아이콘 버튼 — 팝업은 아래 portal 로 최상단 렌더(프레임 잘림 방지) */}
              <button
                type="button"
                onClick={(e) => (menuFor === r.id ? setMenuFor(null) : openMenu(r.id, e.currentTarget))}
                title={`상태: ${meta.label} (클릭해 변경)`}
                className={`shrink-0 w-3.5 h-3.5 rounded-full ${meta.dot} ${r.status === "none" ? "opacity-50 group-hover:opacity-100" : ""} transition-opacity`}
              />
              {/* 텍스트 입력 */}
              <input
                ref={(el) => { inputRefs.current[r.id] = el; }}
                value={r.text}
                onChange={(e) => setText(r.id, e.target.value)}
                onKeyDown={(e) => onKeyDown(e, idx)}
                onFocus={() => { focusedId.current = r.id; }}
                placeholder={idx === 0 ? placeholder : ""}
                className={`flex-1 bg-transparent focus:outline-none py-0.5 ${meta.textClass} placeholder:text-gray-300 placeholder:no-underline`}
              />
            </div>
          );
        })}
      </div>

      {/* @멘션 소환 칩 */}
      {mentionUsers.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap px-3 py-1.5 border-t border-gray-100 bg-gray-50/60">
          <AtSign size={12} className="text-gray-400" />
          <span className="text-[10px] text-gray-400 mr-0.5">소환:</span>
          {mentionUsers.map((u) => (
            <button key={u.id} type="button" onMouseDown={(e) => { e.preventDefault(); appendMention(u.name); }}
              className="px-1.5 py-0.5 text-[10px] rounded-full border border-gray-200 text-gray-600 hover:bg-indigo-50 hover:border-indigo-300">@{u.name}</button>
          ))}
        </div>
      )}

      {/* 상태 미니 팝업 — portal+fixed 로 최상단(카드 overflow-hidden 에 잘리지 않음) */}
      {menuFor !== null && typeof document !== "undefined" && createPortal(
        <>
          <div className="fixed inset-0 z-[200]" onClick={() => setMenuFor(null)} />
          <div className="fixed z-[201] bg-white border border-gray-200 rounded-lg shadow-xl py-1 w-28" style={{ top: menuPos.top, left: menuPos.left }}>
            {STATUS_ORDER.map((s) => {
              const cur = rows.find((r) => r.id === menuFor)?.status;
              return (
                <button key={s} type="button" onClick={() => setStatus(menuFor, s)}
                  className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-xs hover:bg-gray-50 ${s === cur ? "bg-gray-50 font-semibold" : ""}`}>
                  <span className={`w-2.5 h-2.5 rounded-full ${STATUS_META[s].dot}`} />
                  {STATUS_META[s].label}
                </button>
              );
            })}
          </div>
        </>,
        document.body
      )}
    </div>
  );
}

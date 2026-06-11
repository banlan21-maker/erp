"use client";

/**
 * MobileAutocomplete — iOS Safari 호환 자동완성 input.
 * input 을 누르면 아래로 옵션 목록이 펼쳐지고, 입력 중에는 query 기반 필터링.
 * 현장 차량운행일지 / 용차사용에서 운전자 선택용으로 공용.
 */

import { useState, useRef, useEffect } from "react";

export interface MobileAutocompleteOption {
  label: string;
  sub?:  string;
}

interface Props {
  value:        string;
  onChange:     (v: string) => void;
  options:      MobileAutocompleteOption[];
  placeholder?: string;
  className?:   string; // input 스타일 override
  listClassName?: string; // 옵션 ul 스타일 override (rounded·padding 조정)
}

const DEFAULT_INPUT_CLS =
  "w-full bg-gray-800 border border-gray-700 rounded-2xl px-4 py-4 text-white text-base placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 appearance-none";
const DEFAULT_LIST_CLS =
  "absolute z-50 left-0 right-0 mt-1 bg-gray-800 border border-gray-600 rounded-2xl overflow-hidden shadow-xl max-h-60 overflow-y-auto";

export default function MobileAutocomplete({
  value, onChange, options, placeholder, className, listClassName,
}: Props) {
  const [open,  setOpen]  = useState(false);
  const [query, setQuery] = useState(value);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, [open]);

  // 상위 value 가 변경되면 query 동기화 (reset 또는 다른 source 가 form 을 바꿀 때)
  useEffect(() => { setQuery(value); }, [value]);

  const filtered = query.trim()
    ? options.filter(o => o.label.includes(query) || (o.sub && o.sub.includes(query)))
    : options;

  const select = (label: string) => {
    onChange(label);
    setQuery(label);
    setOpen(false);
  };

  return (
    <div ref={wrapRef} className="relative">
      <input
        type="text"
        value={query}
        placeholder={placeholder}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        className={className ?? DEFAULT_INPUT_CLS}
        onFocus={() => setOpen(true)}
        onChange={e => {
          setQuery(e.target.value);
          onChange(e.target.value);
          setOpen(true);
        }}
      />
      {open && filtered.length > 0 && (
        <ul className={listClassName ?? DEFAULT_LIST_CLS}>
          {filtered.map((o, i) => (
            <li key={i}>
              <button
                type="button"
                onMouseDown={e => { e.preventDefault(); select(o.label); }}
                onTouchEnd={e => { e.preventDefault(); select(o.label); }}
                className="w-full text-left px-4 py-3 text-white text-base active:bg-gray-700 border-b border-gray-700 last:border-0"
              >
                <div>{o.label}</div>
                {o.sub && <div className="text-gray-400 text-xs mt-0.5 font-mono">{o.sub}</div>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

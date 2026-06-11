"use client";

import { useEffect, useRef, useState } from "react";
import { Search, X, ArrowUp, ArrowDown, XCircle } from "lucide-react";
import type { TextPredicate, TextOp } from "@/lib/cascading-filters";

export interface FilterValue {
  value: string;
  label: string;
}

interface Props {
  anchorEl: HTMLElement;
  values: FilterValue[];
  selected: string[]; // empty = all selected (no filter)
  onApply: (selected: string[]) => void;
  onClose: () => void;

  // ── 엑셀스타일 통합 (옵션 — 미지정 시 기존 동작 그대로) ──
  /** 이 컬럼의 현재 정렬 상태 (asc/desc/null) — null 이면 정렬 없음 */
  sortDir?: "asc" | "desc" | null;
  /** 정렬 변경 콜백 — onSort(null) = 정렬 해제. 미지정 시 정렬 메뉴 숨김 */
  onSort?: (dir: "asc" | "desc" | null) => void;
  /** 현재 텍스트 조건 — null/undefined 면 조건 없음 */
  predicate?: TextPredicate | null;
  /** 텍스트 조건 변경 콜백. 미지정 시 텍스트 조건 메뉴 숨김 */
  onPredicate?: (p: TextPredicate | null) => void;
}

const OP_LABEL: Record<TextOp, string> = {
  contains:   "포함",
  startsWith: "~로 시작",
  endsWith:   "~로 끝남",
  equals:     "정확히 일치",
  notEquals:  "같지 않음",
  empty:      "비어있음",
  notEmpty:   "비어있지 않음",
};

export default function ColumnFilterDropdown({
  anchorEl, values, selected, onApply, onClose,
  sortDir, onSort, predicate, onPredicate,
}: Props) {
  // If no filter active (selected=[]), treat all values as checked
  const initialChecked = selected.length === 0
    ? new Set(values.map((v) => v.value))
    : new Set(selected);

  const [checked, setChecked] = useState<Set<string>>(initialChecked);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  // 텍스트 조건 — 드롭다운 내 임시 상태 (적용 누르면 onPredicate 호출)
  const [predOp,  setPredOp]  = useState<TextOp>(predicate?.op ?? "contains");
  const [predVal, setPredVal] = useState<string>(predicate?.val ?? "");
  const [predOpen, setPredOpen] = useState(!!predicate);

  // Position: 마운트 시 한 번만 계산 (리렌더 시 재계산 방지)
  const [pos] = useState(() => {
    const rect = anchorEl.getBoundingClientRect();
    const W = 240;
    return {
      left: Math.min(rect.left, window.innerWidth - W - 8),
      top:  rect.bottom + 2,
    };
  });

  // Click-outside to close
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        ref.current &&
        !ref.current.contains(e.target as Node) &&
        !anchorEl.contains(e.target as Node)
      ) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [anchorEl, onClose]);

  const filtered = values.filter((v) =>
    v.label.toLowerCase().includes(search.toLowerCase())
  );
  const allChecked = filtered.length > 0 && filtered.every((v) => checked.has(v.value));

  const toggleAll = () => {
    const next = new Set(checked);
    if (allChecked) filtered.forEach((v) => next.delete(v.value));
    else            filtered.forEach((v) => next.add(v.value));
    setChecked(next);
  };

  const toggle = (val: string) => {
    const next = new Set(checked);
    if (next.has(val)) next.delete(val); else next.add(val);
    setChecked(next);
  };

  const handleApply = () => {
    // 1) 텍스트 조건 적용
    if (onPredicate) {
      const needsVal = predOp !== "empty" && predOp !== "notEmpty";
      if (predOpen && (!needsVal || predVal.trim().length > 0)) {
        onPredicate({ op: predOp, val: predVal });
      } else {
        onPredicate(null);
      }
    }
    // 2) 체크박스 필터 적용
    if (search.trim()) {
      const result = filtered.filter((v) => checked.has(v.value)).map((v) => v.value);
      onApply(result);
    } else {
      const result = [...checked];
      onApply(result.length === values.length ? [] : result);
    }
  };

  const handleReset = () => {
    onApply([]);
    if (onPredicate) onPredicate(null);
    onClose();
  };

  const showSort = !!onSort;
  const showPredicate = !!onPredicate;

  return (
    <div
      ref={ref}
      style={{ position: "fixed", top: pos.top, left: pos.left, width: 240, zIndex: 9999 }}
      className="bg-white border border-gray-200 rounded-lg shadow-2xl flex flex-col text-xs"
    >
      {/* ── 정렬 메뉴 (sortDir/onSort 지정 시) ── */}
      {showSort && (
        <div className="p-1 border-b border-gray-100">
          <button
            onClick={() => { onSort?.("asc"); onClose(); }}
            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left hover:bg-blue-50 ${sortDir === "asc" ? "bg-blue-50 text-blue-700 font-semibold" : "text-gray-700"}`}
          >
            <ArrowUp size={12} /> 오름차순 정렬
          </button>
          <button
            onClick={() => { onSort?.("desc"); onClose(); }}
            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left hover:bg-blue-50 ${sortDir === "desc" ? "bg-blue-50 text-blue-700 font-semibold" : "text-gray-700"}`}
          >
            <ArrowDown size={12} /> 내림차순 정렬
          </button>
          {sortDir && (
            <button
              onClick={() => { onSort?.(null); onClose(); }}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left hover:bg-gray-50 text-gray-500"
            >
              <XCircle size={12} /> 정렬 해제
            </button>
          )}
        </div>
      )}

      {/* ── 텍스트 조건 필터 (onPredicate 지정 시) ── */}
      {showPredicate && (
        <div className="p-2 border-b border-gray-100 space-y-1">
          <button
            onClick={() => setPredOpen(o => !o)}
            className="w-full text-left text-[11px] text-gray-500 hover:text-gray-700 flex items-center justify-between"
          >
            <span>텍스트 필터</span>
            <span className="text-gray-400">{predOpen ? "▴" : "▾"}</span>
          </button>
          {predOpen && (
            <>
              <select
                value={predOp}
                onChange={e => setPredOp(e.target.value as TextOp)}
                className="w-full px-1.5 py-1 text-[11px] border border-gray-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
              >
                {(Object.keys(OP_LABEL) as TextOp[]).map(op => (
                  <option key={op} value={op}>{OP_LABEL[op]}</option>
                ))}
              </select>
              {(predOp !== "empty" && predOp !== "notEmpty") && (
                <input
                  value={predVal}
                  onChange={e => setPredVal(e.target.value)}
                  placeholder="값 입력"
                  className="w-full px-2 py-1 text-[11px] border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
              )}
            </>
          )}
        </div>
      )}

      {/* ── 검색창 ── */}
      <div className="p-2 border-b border-gray-100">
        <div className="relative">
          <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="검색..."
            className="w-full pl-7 pr-6 py-1 text-[11px] border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
            autoFocus={!showSort && !showPredicate}
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X size={10} />
            </button>
          )}
        </div>
      </div>

      {/* ── 전체선택 ── */}
      <div className="px-2 py-1 border-b border-gray-100">
        <label className="flex items-center gap-2 cursor-pointer font-medium text-gray-700 hover:bg-gray-50 rounded px-1 py-0.5">
          <input
            type="checkbox"
            checked={allChecked}
            onChange={toggleAll}
            className="w-3 h-3 accent-blue-600"
          />
          전체 선택&nbsp;
          <span className="text-gray-400 font-normal">({filtered.length})</span>
        </label>
      </div>

      {/* ── 값 목록 ── */}
      <div className="overflow-y-auto max-h-52 py-1">
        {filtered.length === 0 ? (
          <p className="text-gray-400 text-center py-3">결과 없음</p>
        ) : (
          filtered.map(({ value, label }) => (
            <label
              key={value}
              className="flex items-center gap-2 cursor-pointer text-gray-700 hover:bg-blue-50 px-3 py-0.5"
            >
              <input
                type="checkbox"
                checked={checked.has(value)}
                onChange={() => toggle(value)}
                className="w-3 h-3 accent-blue-600 shrink-0"
              />
              <span className="truncate">{label}</span>
            </label>
          ))
        )}
      </div>

      {/* ── 액션 ── */}
      <div className="p-2 border-t border-gray-100 flex gap-2">
        <button
          onClick={handleReset}
          className="flex-1 py-1 border border-gray-300 rounded hover:bg-gray-50 text-gray-600"
        >
          초기화
        </button>
        <button
          onClick={handleApply}
          className="flex-1 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 font-medium"
        >
          적용
        </button>
      </div>
    </div>
  );
}

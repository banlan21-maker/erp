"use client";

import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";

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
}

export default function ColumnFilterDropdown({ anchorEl, values, selected, onApply, onClose }: Props) {
  // If no filter active (selected=[]), treat all values as checked
  const initialChecked = selected.length === 0
    ? new Set(values.map((v) => v.value))
    : new Set(selected);

  const [checked, setChecked] = useState<Set<string>>(initialChecked);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  // Position: 마운트 시 한 번만 계산 (리렌더 시 재계산 방지)
  const [pos] = useState(() => {
    const rect = anchorEl.getBoundingClientRect();
    const W = 220;
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
    next.has(val) ? next.delete(val) : next.add(val);
    setChecked(next);
  };

  const handleApply = () => {
    if (search.trim()) {
      // 검색 중: 보이는 항목 중 체크된 것만 필터로 적용
      const result = filtered.filter((v) => checked.has(v.value)).map((v) => v.value);
      onApply(result);
    } else {
      const result = [...checked];
      // 전체 선택된 경우 필터 없음(빈 배열)으로 처리
      onApply(result.length === values.length ? [] : result);
    }
  };

  const handleReset = () => {
    // 초기화 = 필터 완전 해제
    onApply([]);
    onClose();
  };

  return (
    <div
      ref={ref}
      style={{ position: "fixed", top: pos.top, left: pos.left, width: 220, zIndex: 9999 }}
      className="bg-white border border-gray-200 rounded-lg shadow-2xl flex flex-col text-xs"
    >
      {/* Search */}
      <div className="p-2 border-b border-gray-100">
        <div className="relative">
          <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="검색..."
            className="w-full pl-7 pr-6 py-1 text-[11px] border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
            autoFocus
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

      {/* 전체선택 */}
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

      {/* 값 목록 */}
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

      {/* 버튼 */}
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

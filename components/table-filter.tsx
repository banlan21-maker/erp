"use client";

/**
 * 공용 엑셀 스타일 컬럼 필터 컴포넌트
 * DrawingTable, BomMain 등에서 공유해서 사용
 */

import { useEffect, useRef, useState } from "react";
import { ListFilter, XCircle } from "lucide-react";
import { Input } from "@/components/ui/input";

// ── 드롭다운 ─────────────────────────────────────────────────

interface FilterDropdownProps {
  col: string;
  allValues: string[];
  selected: string[];
  onChange: (col: string, values: string[]) => void;
  onClose: () => void;
  anchorRect: DOMRect;
}

export function FilterDropdown({ col, allValues, selected, onChange, onClose, anchorRect }: FilterDropdownProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const filtered   = allValues.filter(v => v.toLowerCase().includes(search.toLowerCase()));
  const allChecked = selected.length === 0 || selected.length === allValues.length;

  const toggle = (v: string) => {
    if (selected.includes(v)) {
      const next = selected.filter(x => x !== v);
      onChange(col, next.length === allValues.length ? [] : next);
    } else {
      const next = [...selected, v];
      onChange(col, next.length === allValues.length ? [] : next);
    }
  };

  const left = Math.min(anchorRect.left, window.innerWidth - 220);
  const top  = anchorRect.bottom + 4;

  return (
    <div
      ref={ref}
      style={{ position: "fixed", top, left, zIndex: 9999, minWidth: 200 }}
      className="bg-white border border-gray-200 rounded-lg shadow-xl text-xs"
    >
      <div className="p-2 border-b">
        <Input autoFocus placeholder="검색..." value={search}
          onChange={e => setSearch(e.target.value)} className="h-7 text-xs" />
      </div>
      <div className="px-2 py-1.5 border-b">
        <label className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 rounded px-1 py-0.5">
          <input type="checkbox" checked={allChecked}
            onChange={() => onChange(col, [])} className="rounded" />
          <span className="font-semibold text-gray-600">전체 선택</span>
        </label>
      </div>
      <div className="max-h-52 overflow-y-auto py-1">
        {filtered.length === 0 ? (
          <div className="px-3 py-2 text-gray-400">검색 결과 없음</div>
        ) : (
          filtered.map(v => (
            <label key={v} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 px-3 py-1">
              <input type="checkbox" checked={selected.length === 0 || selected.includes(v)}
                onChange={() => toggle(v)} className="rounded" />
              <span className="text-gray-700 truncate max-w-[160px]">{v}</span>
            </label>
          ))
        )}
      </div>
      {selected.length > 0 && (
        <div className="p-2 border-t">
          <button onClick={() => onChange(col, [])}
            className="w-full text-center text-xs text-red-500 hover:text-red-700 py-0.5">
            필터 초기화
          </button>
        </div>
      )}
    </div>
  );
}

// ── 헤더 버튼 ────────────────────────────────────────────────

interface FilterHeaderProps {
  col: string;
  label: string;
  align?: "left" | "right" | "center";
  allValues: string[];       // 해당 컬럼의 고유값 목록
  filters: Record<string, string[]>;
  onFilterChange: (col: string, values: string[]) => void;
  openCol: string | null;
  anchorRect: DOMRect | null;
  onOpen: (col: string, rect: DOMRect) => void;
  onClose: () => void;
  className?: string;
}

export function FilterHeader({
  col, label, align = "left", allValues, filters,
  onFilterChange, openCol, anchorRect, onOpen, onClose, className = "",
}: FilterHeaderProps) {
  const selected = filters[col] ?? [];
  const isActive = selected.length > 0;

  return (
    <th className={`px-2 py-2.5 text-xs font-semibold text-gray-500 whitespace-nowrap ${className}`}>
      <div className={`flex items-center gap-1 w-full ${
        align === "right"  ? "justify-end"   :
        align === "center" ? "justify-center" : ""
      }`}>
        <span>{label}</span>
        <button
          onClick={e => {
            e.stopPropagation();
            if (openCol === col) { onClose(); return; }
            onOpen(col, e.currentTarget.getBoundingClientRect());
          }}
          className={`p-0.5 rounded hover:bg-gray-200 transition-colors ${isActive ? "text-blue-600" : "text-gray-400"}`}
          title={isActive ? `필터 적용 중 (${selected.length}개)` : "필터"}
        >
          <ListFilter size={11} />
        </button>
      </div>
      {openCol === col && anchorRect && (
        <FilterDropdown
          col={col} allValues={allValues} selected={selected}
          onChange={onFilterChange} onClose={onClose} anchorRect={anchorRect}
        />
      )}
    </th>
  );
}

// ── 필터 상태 표시 배지 ──────────────────────────────────────

export function FilterBadge({
  count, total, filterCount, onClear,
}: {
  count: number; total: number; filterCount: number; onClear: () => void;
}) {
  if (filterCount === 0) return null;
  return (
    <div className="flex items-center gap-1.5 text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded-md">
      <ListFilter size={11} />
      <span>필터 {filterCount}개 적용 ({count}/{total}행)</span>
      <button onClick={onClear} className="ml-0.5 hover:text-blue-800" title="모든 필터 초기화">
        <XCircle size={12} />
      </button>
    </div>
  );
}

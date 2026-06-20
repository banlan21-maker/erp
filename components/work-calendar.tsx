"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

export interface CalMarker { label: string; color?: string | null }

/**
 * 업무관리 공용 월간 달력 — 날짜 선택 + 마커(일정/일지) 표시.
 * 날짜는 모두 "YYYY-MM-DD"(달력일) 문자열. TZ 드리프트 방지 위해 UTC 기준 계산.
 */
export default function WorkCalendar({
  month, onMonthChange, selectedDate, onSelectDate, markers = {}, todayYmd, maxMarkers = 3,
}: {
  month: string;                         // "YYYY-MM"
  onMonthChange: (m: string) => void;
  selectedDate?: string | null;
  onSelectDate?: (ymd: string) => void;
  markers?: Record<string, CalMarker[]>;
  todayYmd: string;
  maxMarkers?: number;
}) {
  const [y, m] = month.split("-").map(Number);
  const startWeekday = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(); // 0=일
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();

  const cells: (string | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(`${month}-${String(d).padStart(2, "0")}`);
  while (cells.length % 7 !== 0) cells.push(null);

  const shiftMonth = (delta: number) => {
    const nd = new Date(Date.UTC(y, m - 1 + delta, 1));
    onMonthChange(`${nd.getUTCFullYear()}-${String(nd.getUTCMonth() + 1).padStart(2, "0")}`);
  };

  const weekdays = ["일", "월", "화", "수", "목", "금", "토"];

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50">
        <button onClick={() => shiftMonth(-1)} className="p-1 hover:bg-gray-200 rounded"><ChevronLeft size={16} /></button>
        <span className="text-sm font-bold text-gray-800">{y}년 {m}월</span>
        <button onClick={() => shiftMonth(1)} className="p-1 hover:bg-gray-200 rounded"><ChevronRight size={16} /></button>
      </div>
      <div className="grid grid-cols-7 text-center text-[11px] font-medium border-b border-gray-100">
        {weekdays.map((w, i) => (
          <div key={w} className={`py-1.5 ${i === 0 ? "text-red-500" : i === 6 ? "text-blue-500" : "text-gray-500"}`}>{w}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((ymd, i) => {
          if (!ymd) return <div key={i} className="min-h-[64px] border-b border-r border-gray-50 bg-gray-50/30" />;
          const dow = i % 7;
          const day = Number(ymd.slice(8));
          const isToday = ymd === todayYmd;
          const isSel = ymd === selectedDate;
          const mk = markers[ymd] ?? [];
          return (
            <button
              key={i}
              onClick={() => onSelectDate?.(ymd)}
              className={`min-h-[64px] border-b border-r border-gray-50 p-1 text-left align-top transition-colors
                ${onSelectDate ? "hover:bg-indigo-50 cursor-pointer" : "cursor-default"}
                ${isSel ? "bg-indigo-50 ring-2 ring-inset ring-indigo-400" : ""}`}
            >
              <div className={`text-[11px] font-semibold mb-0.5 inline-flex items-center justify-center w-5 h-5 rounded-full
                ${isToday ? "bg-indigo-600 text-white" : dow === 0 ? "text-red-500" : dow === 6 ? "text-blue-500" : "text-gray-600"}`}>
                {day}
              </div>
              <div className="space-y-0.5">
                {mk.slice(0, maxMarkers).map((x, j) => (
                  <div key={j} className="text-[10px] leading-tight truncate px-1 py-0.5 rounded text-white"
                    style={{ backgroundColor: x.color || "#6366f1" }} title={x.label}>
                    {x.label}
                  </div>
                ))}
                {mk.length > maxMarkers && <div className="text-[10px] text-gray-400 px-1">+{mk.length - maxMarkers}</div>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

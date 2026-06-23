"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

export interface CalMarker { label: string; color?: string | null }

// ISO 8601 주차 (월요일 시작, 1월 4일 속한 주가 1주차) — UTC 기준
function isoWeek(utc: Date): number {
  const t = new Date(Date.UTC(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate()));
  const dayNr = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - dayNr + 3);
  const firstThu = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  const firstThuNr = (firstThu.getUTCDay() + 6) % 7;
  firstThu.setUTCDate(firstThu.getUTCDate() - firstThuNr + 3);
  return 1 + Math.round((t.getTime() - firstThu.getTime()) / (7 * 86400000));
}

/**
 * 업무관리 공용 월간 달력 — 주차 컬럼 + 날짜 선택 + 마커(일정/일지) 표시.
 * 랜딩 페이지 달력과 동일 스타일. 날짜는 "YYYY-MM-DD"(달력일) 문자열, UTC 기준 계산.
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

  // 7칸씩 행으로 분할 + 각 행의 주차(월요일 기준)
  const rows: { cells: (string | null)[]; week: number }[] = [];
  for (let r = 0; r * 7 < cells.length; r++) {
    const monday = new Date(Date.UTC(y, m - 1, 1 - startWeekday + r * 7 + 1));
    rows.push({ cells: cells.slice(r * 7, r * 7 + 7), week: isoWeek(monday) });
  }

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
      <div className="grid grid-cols-[34px_repeat(7,minmax(0,1fr))] text-center text-[11px] font-medium border-b border-gray-100 bg-gray-50">
        <div className="py-1.5 text-gray-400">주</div>
        {weekdays.map((w, i) => (
          <div key={w} className={`py-1.5 ${i === 0 ? "text-red-500" : i === 6 ? "text-blue-500" : "text-gray-500"}`}>{w}</div>
        ))}
      </div>
      {rows.map((row, r) => (
        <div key={r} className="grid grid-cols-[34px_repeat(7,minmax(0,1fr))]">
          <div className="flex items-center justify-center bg-gray-50 text-[11px] font-bold text-gray-400 border-r border-b border-gray-50">{row.week}</div>
          {row.cells.map((ymd, c) => {
            if (!ymd) return <div key={c} className="min-h-[64px] border-b border-r border-gray-50 bg-gray-50/30" />;
            const dow = c; // 0=일 … 6=토
            const day = Number(ymd.slice(8));
            const isToday = ymd === todayYmd;
            const isSel = ymd === selectedDate;
            const mk = markers[ymd] ?? [];
            return (
              <button
                key={c}
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
      ))}
    </div>
  );
}

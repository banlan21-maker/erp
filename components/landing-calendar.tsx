"use client";

/**
 * 랜딩 페이지 달력 — 월 단위 + 주차 컬럼 + 일자 클릭 → 일정 등록 모달
 *
 * 요구:
 *   - 1달씩 표시, 이전/다음/오늘 네비
 *   - 첫 컬럼에 "주차" (ISO 8601 — 월요일 시작)
 *   - 요일 헤더: 일·월·화·수·목·금·토 (일요일이 표시상 첫 칸)
 *   - 일자 클릭 → 모달 (등록자, 일정내용)
 *   - 일정 있는 날은 점/내용 미리보기 표시
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Plus, X, Trash2, Pencil, Check } from "lucide-react";

interface CalendarEvent {
  id:        string;
  date:      string; // YYYY-MM-DD
  registrar: string;
  content:   string;
  createdAt: string;
  updatedAt: string;
}

const DAY_LABEL = ["일", "월", "화", "수", "목", "금", "토"];

const pad2 = (n: number) => String(n).padStart(2, "0");
const ymd  = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

/** ISO 8601 주차 — 월요일 시작. 1월 4일이 속한 주가 1주차. */
function isoWeekNumber(d: Date): number {
  const target = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  // ISO 의 요일: 1(월) … 7(일)
  const dayNr = (target.getUTCDay() + 6) % 7;
  // 이번 주 목요일로 이동
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const firstThursdayDayNr = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstThursdayDayNr + 3);
  const weekDiff = (target.getTime() - firstThursday.getTime()) / (7 * 86400000);
  return 1 + Math.round(weekDiff);
}

interface CellInfo {
  date:       Date;
  inMonth:    boolean;
  isToday:    boolean;
  yyyymmdd:   string;
}

/** 일요일 시작으로 6행 × 7열 = 42칸 셀 만들기 (해당 월 + 앞뒤 패딩) */
function buildCells(year: number, month0: number): CellInfo[] {
  const first = new Date(year, month0, 1);
  const startOffset = first.getDay(); // 0=일 … 6=토
  const todayStr = ymd(new Date());

  const cells: CellInfo[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(year, month0, 1 - startOffset + i);
    cells.push({
      date:     d,
      inMonth:  d.getMonth() === month0,
      isToday:  ymd(d) === todayStr,
      yyyymmdd: ymd(d),
    });
  }
  return cells;
}

export default function LandingCalendar() {
  const now = new Date();
  const [year,   setYear]   = useState(now.getFullYear());
  const [month0, setMonth0] = useState(now.getMonth()); // 0-based

  const cells = useMemo(() => buildCells(year, month0), [year, month0]);
  const rows  = useMemo(() => {
    // 6행 × 7열 — 행 단위로 분할
    const r: CellInfo[][] = [];
    for (let i = 0; i < 6; i++) r.push(cells.slice(i * 7, i * 7 + 7));
    return r;
  }, [cells]);

  const [events,  setEvents]  = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/calendar-events?year=${year}&month=${month0 + 1}`);
      const json = await res.json();
      if (json.success) setEvents(json.data);
    } finally { setLoading(false); }
  }, [year, month0]);

  useEffect(() => { load(); }, [load]);

  // 날짜별 이벤트 그룹
  const eventsByDate = useMemo(() => {
    const m = new Map<string, CalendarEvent[]>();
    for (const e of events) {
      const arr = m.get(e.date) ?? [];
      arr.push(e);
      m.set(e.date, arr);
    }
    return m;
  }, [events]);

  const prevMonth = () => {
    if (month0 === 0) { setYear(y => y - 1); setMonth0(11); }
    else setMonth0(m => m - 1);
  };
  const nextMonth = () => {
    if (month0 === 11) { setYear(y => y + 1); setMonth0(0); }
    else setMonth0(m => m + 1);
  };
  const goToday = () => {
    const t = new Date();
    setYear(t.getFullYear()); setMonth0(t.getMonth());
  };

  // 클릭한 날짜의 일정 보기/등록 모달
  const [openDate, setOpenDate] = useState<string | null>(null);
  const openDayEvents = openDate ? (eventsByDate.get(openDate) ?? []) : [];

  // 신규 입력
  const [newRegistrar, setNewRegistrar] = useState("");
  const [newContent,   setNewContent]   = useState("");
  const [saving,       setSaving]       = useState(false);
  const [err,          setErr]          = useState("");

  // 인라인 수정
  const [editId,        setEditId]        = useState<string | null>(null);
  const [editRegistrar, setEditRegistrar] = useState("");
  const [editContent,   setEditContent]   = useState("");

  const closeModal = () => {
    setOpenDate(null);
    setNewRegistrar(""); setNewContent(""); setErr("");
    setEditId(null);
  };

  const handleCreate = async () => {
    if (!openDate) return;
    setErr("");
    if (!newRegistrar.trim()) { setErr("등록자를 입력하세요."); return; }
    if (!newContent.trim())   { setErr("일정 내용을 입력하세요."); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/calendar-events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: openDate, registrar: newRegistrar, content: newContent }),
      });
      const json = await res.json();
      if (!json.success) { setErr(json.error || "등록 실패"); return; }
      setEvents(prev => [...prev, json.data]);
      setNewRegistrar(""); setNewContent("");
    } catch (e) { setErr(e instanceof Error ? e.message : "네트워크 오류"); }
    finally { setSaving(false); }
  };

  const startEdit = (e: CalendarEvent) => {
    setEditId(e.id);
    setEditRegistrar(e.registrar);
    setEditContent(e.content);
    setErr("");
  };
  const cancelEdit = () => { setEditId(null); setErr(""); };
  const saveEdit = async () => {
    if (!editId) return;
    setErr("");
    if (!editRegistrar.trim() || !editContent.trim()) { setErr("등록자와 내용을 모두 입력하세요."); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/calendar-events/${editId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registrar: editRegistrar, content: editContent }),
      });
      const json = await res.json();
      if (!json.success) { setErr(json.error || "수정 실패"); return; }
      setEvents(prev => prev.map(x => x.id === editId ? json.data : x));
      setEditId(null);
    } catch (e) { setErr(e instanceof Error ? e.message : "네트워크 오류"); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("이 일정을 삭제하시겠습니까?")) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/calendar-events/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!json.success) { alert(json.error || "삭제 실패"); return; }
      setEvents(prev => prev.filter(x => x.id !== id));
    } finally { setSaving(false); }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
      {/* 헤더 */}
      <div className="px-4 sm:px-5 py-3 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarDays size={18} className="text-blue-600" />
          <h3 className="font-bold text-base sm:text-lg text-gray-900">
            {year}년 {month0 + 1}월
          </h3>
          {loading && <span className="text-xs text-gray-400">불러오는 중…</span>}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-gray-100" title="이전 달"><ChevronLeft size={16} /></button>
          <button onClick={goToday}   className="px-2.5 py-1 rounded-lg text-xs font-semibold border border-gray-300 hover:bg-gray-50">오늘</button>
          <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-gray-100" title="다음 달"><ChevronRight size={16} /></button>
        </div>
      </div>

      {/* 요일 헤더 — [주차][일][월][화][수][목][금][토] */}
      <div className="grid grid-cols-[44px_repeat(7,minmax(0,1fr))] border-b border-gray-200 bg-gray-50 text-xs font-semibold text-gray-500">
        <div className="py-1.5 text-center">주차</div>
        {DAY_LABEL.map((label, i) => (
          <div key={label} className={`py-1.5 text-center ${i === 0 ? "text-red-500" : i === 6 ? "text-blue-500" : ""}`}>
            {label}
          </div>
        ))}
      </div>

      {/* 본문 — 6주 */}
      <div className="divide-y divide-gray-100">
        {rows.map((row, rowIdx) => {
          // 그 주의 주차 번호: 월요일 기준 (row[1] = 월요일)
          const weekRef = row[1].date;
          const wk = isoWeekNumber(weekRef);
          return (
            <div key={rowIdx} className="grid grid-cols-[44px_repeat(7,minmax(0,1fr))]">
              <div className="flex items-center justify-center bg-gray-50 text-xs font-bold text-gray-500 border-r border-gray-100">
                {wk}
              </div>
              {row.map((c, colIdx) => {
                const list = eventsByDate.get(c.yyyymmdd) ?? [];
                const dayOfWeek = c.date.getDay();
                const txtColor =
                  !c.inMonth          ? "text-gray-300" :
                  dayOfWeek === 0     ? "text-red-500"  :
                  dayOfWeek === 6     ? "text-blue-500" :
                                        "text-gray-700";
                return (
                  <button
                    key={colIdx}
                    onClick={() => setOpenDate(c.yyyymmdd)}
                    className={`relative min-h-[68px] sm:min-h-[78px] px-1.5 sm:px-2 py-1 text-left border-l border-gray-100 first:border-l-0 hover:bg-blue-50/40 transition-colors ${c.inMonth ? "" : "bg-gray-50/50"}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`text-xs sm:text-sm font-semibold ${txtColor} ${c.isToday ? "bg-blue-600 text-white rounded-full w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center" : ""}`}>
                        {c.date.getDate()}
                      </span>
                      {list.length > 0 && (
                        <span className="text-[9px] bg-amber-100 text-amber-700 rounded-full px-1.5 py-0.5 font-bold">
                          {list.length}
                        </span>
                      )}
                    </div>
                    {/* 일정 미리보기 최대 2건 */}
                    <div className="mt-0.5 space-y-0.5">
                      {list.slice(0, 2).map(e => (
                        <div key={e.id} className="text-[10px] sm:text-[11px] text-amber-800 bg-amber-50 rounded px-1 py-0.5 truncate">
                          {e.content}
                        </div>
                      ))}
                      {list.length > 2 && (
                        <div className="text-[9px] text-gray-400">+ {list.length - 2}건 더</div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* 일자 모달 */}
      {openDate && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => !saving && closeModal()}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
              <h4 className="font-bold text-gray-900">
                {openDate} 일정
                <span className="ml-2 text-xs font-normal text-gray-500">({DAY_LABEL[new Date(openDate + "T00:00:00").getDay()]})</span>
              </h4>
              <button onClick={closeModal} className="p-1 hover:bg-gray-100 rounded-full"><X size={16} /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {err && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">{err}</div>}

              {/* 등록된 일정 목록 */}
              {openDayEvents.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-gray-500 uppercase">등록된 일정 {openDayEvents.length}건</div>
                  {openDayEvents.map(e => (
                    <div key={e.id} className="border border-gray-200 rounded-lg p-2.5 bg-gray-50/50">
                      {editId === e.id ? (
                        <div className="space-y-2">
                          <input value={editRegistrar} onChange={ev => setEditRegistrar(ev.target.value)}
                            placeholder="등록자" className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500" />
                          <textarea value={editContent} onChange={ev => setEditContent(ev.target.value)}
                            placeholder="일정 내용" rows={2}
                            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                          <div className="flex gap-1 justify-end">
                            <button onClick={saveEdit} disabled={saving} className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50">
                              <Check size={11} /> 저장
                            </button>
                            <button onClick={cancelEdit} disabled={saving} className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold border border-gray-300 rounded hover:bg-white disabled:opacity-50">
                              취소
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="text-sm text-gray-900 whitespace-pre-wrap break-words">{e.content}</div>
                            <div className="text-[10px] text-gray-500 mt-1">등록자: {e.registrar}</div>
                          </div>
                          <div className="flex flex-shrink-0 gap-0.5">
                            <button onClick={() => startEdit(e)} className="p-1 text-blue-600 hover:bg-blue-50 rounded" title="수정"><Pencil size={12} /></button>
                            <button onClick={() => handleDelete(e.id)} className="p-1 text-red-600 hover:bg-red-50 rounded" title="삭제"><Trash2 size={12} /></button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* 새 일정 등록 */}
              <div className="bg-blue-50/50 border border-blue-200 rounded-lg p-3 space-y-2">
                <div className="text-xs font-semibold text-blue-700 uppercase">새 일정 등록</div>
                <input value={newRegistrar} onChange={e => setNewRegistrar(e.target.value)}
                  placeholder="등록자 이름"
                  className="w-full px-2.5 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <textarea value={newContent} onChange={e => setNewContent(e.target.value)}
                  placeholder="일정 내용 (예: 거래처 미팅, 장비점검 등)"
                  rows={3}
                  className="w-full px-2.5 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                <button onClick={handleCreate} disabled={saving}
                  className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                  <Plus size={14} /> {saving ? "저장 중…" : "일정 등록"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

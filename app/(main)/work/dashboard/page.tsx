"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Star, Trash2, Send, Users, NotebookPen, ChevronLeft, ChevronRight, MessageSquare, Archive, CalendarDays } from "lucide-react";
import { useWorkUser, MentionText } from "@/components/work-user-context";
import { JournalText } from "@/components/journal-text";
import LandingCalendar, { type CalendarEvent } from "@/components/landing-calendar";
import { parseMentions } from "@/lib/work-mentions";
import { shiftYmd } from "@/lib/work-date";

const todayKst = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
const fmtTime = (iso: string) => new Date(iso).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
const WD = ["일", "월", "화", "수", "목", "금", "토"];
const fmtDate = (ymd: string) => {
  const [y, m, d] = ymd.split("-");
  return `${y}.${m}.${d} (${WD[new Date(`${ymd}T00:00:00.000Z`).getUTCDay()]})`;
};
const MEMO_PREVIEW = 5;   // 중요 메모 기본 표시 건수
const fmtShort = (ymd: string) => {
  const [, m, d] = ymd.split("-");
  return `${Number(m)}/${Number(d)}(${WD[new Date(`${ymd}T00:00:00.000Z`).getUTCDay()]})`;
};

interface PUser { id: string; name: string; color: string | null; dept?: string | null }
interface Post { id: string; content: string; important: boolean; createdAt: string; author: PUser; mentions: { user: PUser }[] }
interface TeamLog { id: string; todayWork: string; tomorrowPlan: string; user: PUser }
interface LogComment { id: string; targetUserId: string; authorId: string; content: string; createdAt: string; author: PUser }

export default function WorkDashboardPage() {
  const { currentUserId, currentUser, users } = useWorkUser();

  const [selectedDate, setSelectedDate] = useState(todayKst());
  const [importantPosts, setImportantPosts] = useState<Post[]>([]);
  const [teamLogs, setTeamLogs] = useState<TeamLog[]>([]);   // 당일
  const [prevLogs, setPrevLogs] = useState<TeamLog[]>([]);   // 전날
  const [memo, setMemo] = useState("");
  const [busy, setBusy] = useState(false);
  const [comments, setComments] = useState<LogComment[]>([]); // 선택 날짜의 팀원 댓글 전체
  const [draft, setDraft] = useState<Record<string, string>>({}); // 팀원별 댓글 입력창
  const [cBusy, setCBusy] = useState(false);
  const [tick, setTick] = useState(0); // 변경 후 재조회 트리거
  const [showAllMemo, setShowAllMemo] = useState(false);
  // 달력이 표시 중인 달의 일정 — 달력이 직접 통지한다(중복 조회 없이 항상 동기)
  const [monthInfo, setMonthInfo] = useState<{ year: number; month: number; events: CalendarEvent[]; loading: boolean }>(
    { year: 0, month: 0, events: [], loading: true });

  const prevYmd     = shiftYmd(selectedDate, -1);
  const tomorrowYmd = shiftYmd(selectedDate, 1);

  const loadImportant = useCallback(async () => {
    const r = await fetch(`/api/work/posts?important=true`).then(r => r.json()).catch(() => ({}));
    if (r.success) setImportantPosts(r.data);
  }, []);

  // 당일 + 전날 팀 전체 일지 — 날짜 연타 시 늦게 온 옛 응답이 화면을 덮지 않도록 stale 폐기
  useEffect(() => {
    const reqDate = selectedDate;
    const ctrl = new AbortController();
    (async () => {
      const prev = shiftYmd(reqDate, -1);
      const [r, rp] = await Promise.all([
        fetch(`/api/work/logs?all=true&date=${reqDate}`, { signal: ctrl.signal }).then(r => r.json()).catch(() => ({})),
        fetch(`/api/work/logs?all=true&date=${prev}`,    { signal: ctrl.signal }).then(r => r.json()).catch(() => ({})),
      ]);
      if (ctrl.signal.aborted || reqDate !== selectedDate) return;
      if (r.success)  setTeamLogs(r.data);
      if (rp.success) setPrevLogs(rp.data);
    })();
    return () => ctrl.abort();
  }, [selectedDate, tick]);

  // 선택 날짜의 팀원 일지 댓글 (팀원 카드별 스레드) — 동일 가드
  useEffect(() => {
    const reqDate = selectedDate;
    const ctrl = new AbortController();
    (async () => {
      const r = await fetch(`/api/work/log-comments?date=${reqDate}`, { signal: ctrl.signal })
        .then(r => r.json()).catch(() => ({}));
      if (ctrl.signal.aborted || reqDate !== selectedDate) return;
      if (r.success) setComments(r.data);
    })();
    return () => ctrl.abort();
  }, [selectedDate, tick]);

  useEffect(() => { loadImportant(); }, [loadImportant]);

  const logByUser = useMemo(() => {
    const m = new Map<string, TeamLog>();
    for (const l of teamLogs) m.set(l.user.id, l);
    return m;
  }, [teamLogs]);
  const prevLogByUser = useMemo(() => {
    const m = new Map<string, TeamLog>();
    for (const l of prevLogs) m.set(l.user.id, l);
    return m;
  }, [prevLogs]);
  const commentsByUser = useMemo(() => {
    const m = new Map<string, LogComment[]>();
    for (const c of comments) { const arr = m.get(c.targetUserId) ?? []; arr.push(c); m.set(c.targetUserId, arr); }
    return m;
  }, [comments]);
  const teamRows = useMemo(() => {
    const hasAny = (u: { id: string }) => {
      const t = logByUser.get(u.id), p = prevLogByUser.get(u.id);
      return !!((t?.todayWork ?? "").trim() || (t?.tomorrowPlan ?? "").trim() || (p?.todayWork ?? "").trim()
        || (commentsByUser.get(u.id)?.length ?? 0) > 0);
    };
    const active = users.filter(u => u.active);
    // 비활성(퇴사 등) 사용자도 그 날짜에 기록이 있으면 표시 — 과거 일지가 통째로 안 보이던 문제
    const inactiveWithData = users.filter(u => !u.active && hasAny(u));
    return [...active.filter(hasAny), ...inactiveWithData, ...active.filter(u => !hasAny(u))];
  }, [users, logByUser, prevLogByUser, commentsByUser]);

  // 그 달 일정 — 날짜별로 묶어 오름차순 (달력 아래 목록)
  //   달을 넘기면 year/month 는 즉시 바뀌지만 events 는 fetch 가 끝날 때까지 이전 달 값이고,
  //   fetch 가 실패하면 아예 갱신되지 않는다 → "9월 일정" 제목 아래 8월 목록이 남는다.
  //   표시 중인 달의 날짜만 통과시켜 헤더와 본문이 어긋나지 않게 한다.
  //   (prefix 끝 하이픈 필수 — 없으면 "2026-1" 이 10~12월을 오탐 매칭한다)
  const monthEventsByDate = useMemo(() => {
    const prefix = monthInfo.month ? `${monthInfo.year}-${String(monthInfo.month).padStart(2, "0")}-` : null;
    const m = new Map<string, CalendarEvent[]>();
    for (const e of monthInfo.events) {
      if (prefix && !e.date.startsWith(prefix)) continue;
      const a = m.get(e.date) ?? []; a.push(e); m.set(e.date, a);
    }
    return [...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  }, [monthInfo]);
  // 헤더 배지도 필터된 건수를 써야 목록과 어긋나지 않는다
  const monthEventCount = useMemo(
    () => monthEventsByDate.reduce((n, [, l]) => n + l.length, 0), [monthEventsByDate]);

  // 이 날 공유 내용 — 팀원 일지에서 @멘션이 들어간 줄 (작성자 → 소환 대상)
  const shared = useMemo(() => {
    const nameById = new Map(users.map(u => [u.id, u.name]));
    const out: { author: PUser; line: string; to: string[]; key: string }[] = [];
    for (const lg of teamLogs) {
      const text = `${lg.todayWork ?? ""}\n${lg.tomorrowPlan ?? ""}`;
      text.split("\n").map(s => s.trim()).filter(Boolean).forEach((line, i) => {
        if (!line.includes("@")) return;
        const ids = parseMentions(line, users);
        if (ids.length) out.push({ author: lg.user, line, to: ids.map(id => nameById.get(id)!).filter(Boolean), key: `${lg.id}-${i}` });
      });
    }
    return out;
  }, [teamLogs, users]);

  const addMemo = async () => {
    if (!currentUserId) { alert("상단에서 현재 사용자를 선택하세요."); return; }
    if (!memo.trim()) return;
    setBusy(true);
    try {
      const r = await fetch("/api/work/posts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authorId: currentUserId, content: memo.trim(), important: true }),
      });
      const d = await r.json();
      if (!d.success) { alert(d.error ?? "등록 실패"); return; }
      setMemo("");
      loadImportant();
    } finally { setBusy(false); }
  };
  const removePost = async (id: string) => {
    if (!currentUserId) return;
    if (!confirm("삭제하시겠습니까?")) return;
    const r = await fetch(`/api/work/posts/${id}?authorId=${currentUserId}`, { method: "DELETE" })
      .then(res => res.json()).catch(() => ({}));
    if (!r.success) { alert(r.error ?? "삭제 실패"); return; }
    loadImportant();
  };

  // 보관 — 고정 해제(important=false). 글은 남고 상단 목록에서만 내려간다.
  const archivePost = async (id: string) => {
    if (!currentUserId) return;
    if (!confirm("이 메모를 보관할까요? 상단 고정에서 내려갑니다. (내용은 삭제되지 않습니다)")) return;
    const r = await fetch(`/api/work/posts/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ important: false, authorId: currentUserId }),
    }).then(res => res.json()).catch(() => ({}));
    if (!r.success) { alert(r.error ?? "보관 실패"); return; }
    loadImportant();
  };

  const addComment = async (targetUserId: string) => {
    if (!currentUserId) { alert("상단에서 현재 사용자를 선택하세요."); return; }
    const text = (draft[targetUserId] ?? "").trim();
    if (!text || cBusy) return;
    setCBusy(true);
    try {
      const r = await fetch("/api/work/log-comments", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId, authorId: currentUserId, date: selectedDate, content: text }),
      });
      const d = await r.json();
      if (!d.success) { alert(d.error ?? "댓글 등록 실패"); return; }
      setDraft(prev => ({ ...prev, [targetUserId]: "" }));
      setTick(t => t + 1);
    } finally { setCBusy(false); }
  };
  const removeComment = async (id: string) => {
    if (!currentUserId) return;
    if (!confirm("댓글을 삭제하시겠습니까?")) return;
    const r = await fetch(`/api/work/log-comments/${id}?authorId=${currentUserId}`, { method: "DELETE" }).then(r => r.json()).catch(() => ({}));
    if (!r.success) { alert(r.error ?? "삭제 실패"); return; }
    setTick(t => t + 1);
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-gray-800">업무 대시보드</h2>
        <p className="text-sm text-gray-500 mt-0.5">팀원들의 업무일지·일정·공유 내용을 한곳에서 확인합니다. 공유는 각자 업무일지에 <b>@이름</b> 으로 남깁니다.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        {/* 왼쪽: 중요메모 → 팀원 업무일지 → 그날 공유 내용 */}
        <div className="space-y-4">

          {/* 중요 메모 — 팀 전체 공지 성격이라 업무일지 위 최상단 고정 */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-4 py-2.5 border-b border-gray-200 bg-amber-50 flex items-center gap-1.5">
              <Star size={14} className="text-amber-500" fill="currentColor" />
              <span className="text-sm font-bold text-amber-800">중요 메모</span>
            </div>
            <div className="p-3 space-y-2">
              <div className="flex gap-1.5">
                <input value={memo} onChange={e => setMemo(e.target.value)} placeholder={currentUserId ? "중요 메모 추가 (전체 고정)" : "현재 사용자를 먼저 선택하세요"}
                  disabled={!currentUserId} onKeyDown={e => { if (e.key === "Enter" && !e.nativeEvent.isComposing) addMemo(); }}
                  className="flex-1 px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:bg-gray-100" />
                <button onClick={addMemo} disabled={busy || !currentUserId} className="px-2.5 py-1.5 bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50"><Send size={14} /></button>
              </div>
              {importantPosts.length === 0 ? (
                <p className="text-xs text-gray-400 py-1 text-center">중요 메모가 없습니다.</p>
              ) : (showAllMemo ? importantPosts : importantPosts.slice(0, MEMO_PREVIEW)).map(p => (
                <div key={p.id} className="text-xs border border-amber-100 bg-amber-50/40 rounded-lg px-2.5 py-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold flex items-center gap-1" style={{ color: p.author.color || "#374151" }}>{p.author.name}</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-gray-400">{fmtTime(p.createdAt)}</span>
                      {p.author.id === currentUserId && (
                        <>
                          <button onClick={() => archivePost(p.id)} title="보관 (고정 해제 — 내용은 남음)" className="text-gray-300 hover:text-amber-600"><Archive size={11} /></button>
                          <button onClick={() => removePost(p.id)} title="내가 쓴 메모 삭제" className="text-gray-300 hover:text-red-500"><Trash2 size={11} /></button>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="text-gray-700 mt-0.5 whitespace-pre-wrap break-words"><MentionText content={p.content} /></div>
                </div>
              ))}
              {/* 메모 누적 시 화면 잠식 방지 — 기본 5건, 오래된 건은 작성자가 '보관' 으로 내린다 */}
              {importantPosts.length > MEMO_PREVIEW && (
                <button onClick={() => setShowAllMemo(v => !v)}
                  className="w-full py-1 text-[11px] text-amber-700 hover:bg-amber-50 rounded">
                  {showAllMemo ? "접기" : `+ ${importantPosts.length - MEMO_PREVIEW}건 더 보기`}
                </button>
              )}
            </div>
          </div>

          {/* 팀원 업무일지 */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between gap-2">
              <span className="text-sm font-bold text-gray-700 flex items-center gap-1.5"><Users size={15} className="text-indigo-500" /> 팀원 업무일지</span>
              <div className="flex items-center gap-1">
                <button onClick={() => setSelectedDate(prevYmd)} className="p-1 hover:bg-gray-200 rounded" title="이전 날"><ChevronLeft size={15} /></button>
                <span className="text-xs font-semibold text-gray-600 min-w-[100px] text-center">{fmtDate(selectedDate)}</span>
                <button onClick={() => setSelectedDate(tomorrowYmd)} className="p-1 hover:bg-gray-200 rounded" title="다음 날"><ChevronRight size={15} /></button>
                {selectedDate !== todayKst() && <button onClick={() => setSelectedDate(todayKst())} className="ml-1 px-2 py-0.5 text-[11px] border border-gray-300 rounded hover:bg-white">오늘</button>}
              </div>
            </div>
            {/* 위(중요메모)·아래(공유내용)와 한 컬럼을 나눠 쓰므로 78vh → 58vh 로 낮춘다 */}
            <div className="divide-y divide-gray-100 max-h-[58vh] overflow-auto">
              {teamRows.length === 0 ? (
                <p className="py-12 text-center text-sm text-gray-400">등록된 사용자가 없습니다. [사용자 등록]에서 추가하세요.</p>
              ) : teamRows.map(u => {
                const log = logByUser.get(u.id);
                const prev = (prevLogByUser.get(u.id)?.todayWork ?? "").trim(); // 전날 한 일
                const today = (log?.todayWork ?? "").trim();                    // 당일 한 일
                const tomorrow = (log?.tomorrowPlan ?? "").trim();              // 내일 계획
                const empty = !prev && !today && !tomorrow;
                return (
                  <div key={u.id} className="px-4 py-3">
                    <div className={empty ? "opacity-60" : ""}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: u.color || "#6366f1" }} />
                      <span className="text-sm font-bold text-gray-800">{u.name}</span>
                      {u.dept && <span className="text-[11px] text-gray-400">{u.dept}</span>}
                      {!u.active && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-200 text-gray-500">비활성</span>}
                      {u.id === currentUserId && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-600">나</span>}
                    </div>
                    {empty ? (
                      <p className="text-xs text-gray-400 pl-4">작성된 업무일지가 없습니다.</p>
                    ) : (
                      <div className="pl-4 space-y-1.5">
                        {prev && <div><span className="text-[11px] font-semibold text-gray-400">전날 {fmtShort(prevYmd)}</span><div className="text-[11px] text-gray-600"><JournalText content={prev} /></div></div>}
                        {today && <div><span className="text-[11px] font-semibold text-indigo-600">당일 {fmtShort(selectedDate)}</span><div className="text-[11px] text-gray-700"><JournalText content={today} /></div></div>}
                        {tomorrow && <div><span className="text-[11px] font-semibold text-emerald-600">내일 {fmtShort(tomorrowYmd)}</span><div className="text-[11px] text-gray-600"><JournalText content={tomorrow} /></div></div>}
                      </div>
                    )}
                    </div>

                    {/* 일별 댓글 — 팀원 카드별 스레드 (선택 날짜 기준) */}
                    {(() => {
                      const cs = commentsByUser.get(u.id) ?? [];
                      return (
                        <div className="mt-2 pt-2 border-t border-gray-100 pl-4 space-y-1">
                          {cs.length > 0 && (
                            <div className="flex items-center gap-1 text-[10px] font-semibold text-gray-400">
                              <MessageSquare size={11} className="text-indigo-400" /> 댓글 {cs.length}
                            </div>
                          )}
                          {cs.map(c => (
                            <div key={c.id} className="flex items-start justify-between gap-1.5 text-[11px]">
                              <div className="min-w-0">
                                <span className="font-semibold" style={{ color: c.author.color || "#374151" }}>{c.author.name}</span>
                                <span className="text-gray-700 ml-1 break-words whitespace-pre-wrap">{c.content}</span>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <span className="text-[10px] text-gray-300">{fmtTime(c.createdAt)}</span>
                                {c.authorId === currentUserId && (
                                  <button onClick={() => removeComment(c.id)} className="text-gray-300 hover:text-red-500" title="댓글 삭제"><Trash2 size={10} /></button>
                                )}
                              </div>
                            </div>
                          ))}
                          <div className="flex gap-1 pt-0.5">
                            <input
                              value={draft[u.id] ?? ""}
                              onChange={e => setDraft(prev => ({ ...prev, [u.id]: e.target.value }))}
                              onKeyDown={e => { if (e.key === "Enter" && !e.nativeEvent.isComposing) addComment(u.id); }}
                              placeholder={currentUserId ? "댓글 달기..." : "현재 사용자 선택 필요"}
                              disabled={!currentUserId}
                              className="flex-1 px-2 py-1 text-[11px] border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-indigo-300 disabled:bg-gray-50" />
                            <button onClick={() => addComment(u.id)} disabled={!currentUserId || cBusy}
                              className="px-2 py-1 bg-indigo-500 text-white rounded hover:bg-indigo-600 disabled:opacity-50"><Send size={11} /></button>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 그 날 공유 내용 — 일지 @멘션 줄. 팀원 업무일지와 같은 '그날' 기준이라 바로 아래 둔다 */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-4 py-2.5 border-b border-gray-200 bg-gray-50 flex items-center gap-1.5">
              <NotebookPen size={14} className="text-indigo-500" />
              <span className="text-sm font-bold text-gray-700">{fmtDate(selectedDate)} 공유 내용</span>
              {shared.length > 0 && (
                <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-bold">{shared.length}</span>
              )}
            </div>
            <div className="p-3 space-y-1.5">
              {shared.length === 0 ? (
                <p className="text-xs text-gray-400 py-1 text-center">이 날 일지에서 @로 공유된 내용이 없습니다.</p>
              ) : shared.map(s => (
                <div key={s.key} className="text-xs border border-gray-100 rounded-lg px-2.5 py-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold" style={{ color: s.author.color || "#374151" }}>{s.author.name}</span>
                    {s.to.length > 0 && <span className="text-[10px] text-indigo-500">→ {s.to.map(n => `@${n}`).join(" ")}</span>}
                  </div>
                  <div className="text-gray-700 mt-0.5"><JournalText content={s.line} /></div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 오른쪽: 공유 달력 + 그 달 일정 목록 */}
        <div className="space-y-4">
          {/* 날짜 클릭 = 좌측 팀 일지 날짜 전환(선택). 일정 등록·조회는 셀의 ＋ 로 연다. */}
          <LandingCalendar
            defaultRegistrar={currentUser?.name}
            onDaySelect={setSelectedDate}
            selectedDate={selectedDate}
            dayClickOpensModal={false}
            onMonthDataChange={setMonthInfo}
          />

          {/* 이번 달 일정 — 달력이 보여주는 달과 항상 같다(달 이동·등록·삭제 시 함께 갱신) */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-4 py-2.5 border-b border-gray-200 bg-gray-50 flex items-center gap-1.5">
              <CalendarDays size={14} className="text-blue-600" />
              <span className="text-sm font-bold text-gray-700">
                {monthInfo.month ? `${monthInfo.year}년 ${monthInfo.month}월 일정` : "이번 달 일정"}
              </span>
              {monthInfo.loading
                ? <span className="ml-auto text-[10px] text-gray-400">불러오는 중…</span>
                : monthEventCount > 0 && (
                    <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-bold">{monthEventCount}건</span>
                  )}
            </div>
            <div className="p-3 space-y-2 max-h-[42vh] overflow-auto">
              {monthEventsByDate.length === 0 ? (
                <p className="text-xs text-gray-400 py-2 text-center">
                  {monthInfo.loading ? "불러오는 중…" : "이 달에 등록된 일정이 없습니다. 달력의 날짜 위 ＋ 로 등록하세요."}
                </p>
              ) : monthEventsByDate.map(([date, list]) => (
                <div key={date} className={`rounded-lg border px-2.5 py-1.5 ${date === selectedDate ? "border-blue-300 bg-blue-50/50" : "border-gray-100"}`}>
                  <button onClick={() => setSelectedDate(date)}
                    className="w-full flex items-center gap-1.5 text-left mb-1 hover:opacity-70"
                    title="이 날짜로 팀원 업무일지 보기">
                    <span className={`text-[11px] font-bold ${date === todayKst() ? "text-blue-600" : "text-gray-600"}`}>{fmtShort(date)}</span>
                    {date === todayKst() && <span className="text-[9px] px-1 py-0.5 rounded bg-blue-600 text-white font-bold">오늘</span>}
                    <span className="text-[10px] text-gray-400">{list.length}건</span>
                  </button>
                  <div className="space-y-0.5">
                    {list.map(e => (
                      <div key={e.id} className="flex items-start gap-1.5 text-xs">
                        <span className="mt-[5px] w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                        <span className="text-gray-700 whitespace-pre-wrap break-words flex-1">{e.content}</span>
                        <span className="text-[10px] text-gray-400 shrink-0">{e.registrar}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Star, Trash2, Send, Users, NotebookPen, ChevronLeft, ChevronRight, MessageSquare } from "lucide-react";
import { useWorkUser, MentionText } from "@/components/work-user-context";
import { JournalText } from "@/components/journal-text";
import LandingCalendar from "@/components/landing-calendar";
import { parseMentions } from "@/lib/work-mentions";
import { shiftYmd } from "@/lib/work-date";

const todayKst = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
const fmtTime = (iso: string) => new Date(iso).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
const WD = ["일", "월", "화", "수", "목", "금", "토"];
const fmtDate = (ymd: string) => {
  const [y, m, d] = ymd.split("-");
  return `${y}.${m}.${d} (${WD[new Date(`${ymd}T00:00:00.000Z`).getUTCDay()]})`;
};
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

  const prevYmd     = shiftYmd(selectedDate, -1);
  const tomorrowYmd = shiftYmd(selectedDate, 1);

  const loadImportant = useCallback(async () => {
    const r = await fetch(`/api/work/posts?important=true`).then(r => r.json()).catch(() => ({}));
    if (r.success) setImportantPosts(r.data);
  }, []);

  // 당일 + 전날 팀 전체 일지 (전날 = 전날 한 일 표시용)
  const loadTeamLogs = useCallback(async () => {
    const prev = shiftYmd(selectedDate, -1);
    const [r, rp] = await Promise.all([
      fetch(`/api/work/logs?all=true&date=${selectedDate}`).then(r => r.json()).catch(() => ({})),
      fetch(`/api/work/logs?all=true&date=${prev}`).then(r => r.json()).catch(() => ({})),
    ]);
    if (r.success)  setTeamLogs(r.data);
    if (rp.success) setPrevLogs(rp.data);
  }, [selectedDate]);

  // 선택 날짜의 팀원 일지 댓글 (팀원 카드별 스레드)
  const loadComments = useCallback(async () => {
    const r = await fetch(`/api/work/log-comments?date=${selectedDate}`).then(r => r.json()).catch(() => ({}));
    if (r.success) setComments(r.data);
  }, [selectedDate]);

  useEffect(() => { loadImportant(); }, [loadImportant]);
  useEffect(() => { loadTeamLogs(); }, [loadTeamLogs]);
  useEffect(() => { loadComments(); }, [loadComments]);

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
    const active = users.filter(u => u.active);
    const hasAny = (u: { id: string }) => {
      const t = logByUser.get(u.id), p = prevLogByUser.get(u.id);
      return !!((t?.todayWork ?? "").trim() || (t?.tomorrowPlan ?? "").trim() || (p?.todayWork ?? "").trim());
    };
    return [...active.filter(hasAny), ...active.filter(u => !hasAny(u))];
  }, [users, logByUser, prevLogByUser]);

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
    if (!confirm("삭제하시겠습니까?")) return;
    await fetch(`/api/work/posts/${id}`, { method: "DELETE" });
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
      loadComments();
    } finally { setCBusy(false); }
  };
  const removeComment = async (id: string) => {
    if (!currentUserId) return;
    if (!confirm("댓글을 삭제하시겠습니까?")) return;
    const r = await fetch(`/api/work/log-comments/${id}?authorId=${currentUserId}`, { method: "DELETE" }).then(r => r.json()).catch(() => ({}));
    if (!r.success) { alert(r.error ?? "삭제 실패"); return; }
    loadComments();
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-gray-800">업무 대시보드</h2>
        <p className="text-sm text-gray-500 mt-0.5">팀원들의 업무일지·일정·공유 내용을 한곳에서 확인합니다. 공유는 각자 업무일지에 <b>@이름</b> 으로 남깁니다.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_460px] gap-4 items-start">
        {/* 왼쪽: 팀원 업무일지 리스트 */}
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
          <div className="divide-y divide-gray-100 max-h-[78vh] overflow-auto">
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
                            onKeyDown={e => { if (e.key === "Enter") addComment(u.id); }}
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

        {/* 오른쪽: 공유 달력(랜딩 동일) + 이 날 공유 내용 + 중요메모 */}
        <div className="space-y-4">
          <LandingCalendar defaultRegistrar={currentUser?.name} onDaySelect={setSelectedDate} />

          {/* 이 날 공유 내용 — 일지 @멘션 줄 */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-4 py-2.5 border-b border-gray-200 bg-gray-50 flex items-center gap-1.5">
              <NotebookPen size={14} className="text-indigo-500" />
              <span className="text-sm font-bold text-gray-700">{fmtDate(selectedDate)} 공유 내용</span>
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

          {/* 중요 메모 (항상 고정) */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-4 py-2.5 border-b border-gray-200 bg-amber-50 flex items-center gap-1.5">
              <Star size={14} className="text-amber-500" fill="currentColor" />
              <span className="text-sm font-bold text-amber-800">중요 메모</span>
            </div>
            <div className="p-3 space-y-2">
              <div className="flex gap-1.5">
                <input value={memo} onChange={e => setMemo(e.target.value)} placeholder={currentUserId ? "중요 메모 추가 (전체 고정)" : "현재 사용자를 먼저 선택하세요"}
                  disabled={!currentUserId} onKeyDown={e => { if (e.key === "Enter") addMemo(); }}
                  className="flex-1 px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:bg-gray-100" />
                <button onClick={addMemo} disabled={busy || !currentUserId} className="px-2.5 py-1.5 bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50"><Send size={14} /></button>
              </div>
              {importantPosts.length === 0 ? (
                <p className="text-xs text-gray-400 py-1 text-center">중요 메모가 없습니다.</p>
              ) : importantPosts.map(p => (
                <div key={p.id} className="text-xs border border-amber-100 bg-amber-50/40 rounded-lg px-2.5 py-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold flex items-center gap-1" style={{ color: p.author.color || "#374151" }}>{p.author.name}</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-gray-400">{fmtTime(p.createdAt)}</span>
                      <button onClick={() => removePost(p.id)} className="text-gray-300 hover:text-red-500"><Trash2 size={11} /></button>
                    </div>
                  </div>
                  <div className="text-gray-700 mt-0.5 whitespace-pre-wrap break-words"><MentionText content={p.content} /></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

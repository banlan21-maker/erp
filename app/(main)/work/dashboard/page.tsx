"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Send, Star, Trash2, Plus, CalendarDays, AtSign, Users, NotebookPen } from "lucide-react";
import { useWorkUser, MentionText } from "@/components/work-user-context";
import WorkCalendar, { type CalMarker } from "@/components/work-calendar";

const todayKst = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
const monthOf = (ymd: string) => ymd.slice(0, 7);
const kstDateOf = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date(iso));
const fmtTime = (iso: string) => new Date(iso).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
const fmtDate = (ymd: string) => {
  const [y, m, d] = ymd.split("-");
  const wd = ["일", "월", "화", "수", "목", "금", "토"][new Date(`${ymd}T00:00:00.000Z`).getUTCDay()];
  return `${y}.${m}.${d} (${wd})`;
};

interface PUser { id: string; name: string; color: string | null; dept?: string | null }
interface Post { id: string; content: string; important: boolean; createdAt: string; author: PUser; mentions: { user: PUser }[] }
interface Sched { id: string; date: string; title: string; color: string | null; user: PUser | null }
interface TeamLog { id: string; todayWork: string; tomorrowPlan: string; user: PUser }

export default function WorkDashboardPage() {
  const { currentUserId, currentUser, users } = useWorkUser();

  const [month, setMonth] = useState(monthOf(todayKst()));
  const [selectedDate, setSelectedDate] = useState(todayKst());

  const [schedules, setSchedules] = useState<Sched[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [importantPosts, setImportantPosts] = useState<Post[]>([]);
  const [teamLogs, setTeamLogs] = useState<TeamLog[]>([]);

  const [schedTitle, setSchedTitle] = useState("");
  const [content, setContent] = useState("");
  const [important, setImportant] = useState(false);
  const [busy, setBusy] = useState(false);

  const loadSchedules = useCallback(async () => {
    const r = await fetch(`/api/work/schedule?month=${month}`).then(r => r.json()).catch(() => ({}));
    if (r.success) setSchedules(r.data);
  }, [month]);

  const loadPosts = useCallback(async () => {
    const [all, imp] = await Promise.all([
      fetch(`/api/work/posts`).then(r => r.json()).catch(() => ({})),
      fetch(`/api/work/posts?important=true`).then(r => r.json()).catch(() => ({})),
    ]);
    if (all.success) setPosts(all.data);
    if (imp.success) setImportantPosts(imp.data);
  }, []);

  const loadTeamLogs = useCallback(async () => {
    const r = await fetch(`/api/work/logs?all=true&date=${selectedDate}`).then(r => r.json()).catch(() => ({}));
    if (r.success) setTeamLogs(r.data);
  }, [selectedDate]);

  useEffect(() => { loadSchedules(); }, [loadSchedules]);
  useEffect(() => { loadPosts(); }, [loadPosts]);
  useEffect(() => { loadTeamLogs(); }, [loadTeamLogs]);

  // 달력 마커 = 팀원 공유 메모(작성일 기준) + 일정
  const markers = useMemo<Record<string, CalMarker[]>>(() => {
    const map: Record<string, CalMarker[]> = {};
    for (const p of posts) {
      const ymd = kstDateOf(p.createdAt);
      (map[ymd] ??= []).push({ label: p.author.name, color: p.author.color || "#6366f1" });
    }
    for (const s of schedules) {
      const ymd = s.date.slice(0, 10);
      (map[ymd] ??= []).push({ label: `📌 ${s.title}`, color: s.color || s.user?.color || "#64748b" });
    }
    return map;
  }, [posts, schedules]);

  const daySchedules = useMemo(() => schedules.filter(s => s.date.slice(0, 10) === selectedDate), [schedules, selectedDate]);
  const dayPosts = useMemo(() => posts.filter(p => kstDateOf(p.createdAt) === selectedDate), [posts, selectedDate]);

  // 팀원 업무일지 — 활성 사용자 전원, 작성자 우선 정렬
  const logByUser = useMemo(() => {
    const m = new Map<string, TeamLog>();
    for (const l of teamLogs) m.set(l.user.id, l);
    return m;
  }, [teamLogs]);
  const teamRows = useMemo(() => {
    const active = users.filter(u => u.active);
    const has = active.filter(u => { const l = logByUser.get(u.id); return l && ((l.todayWork ?? "").trim() || (l.tomorrowPlan ?? "").trim()); });
    const none = active.filter(u => { const l = logByUser.get(u.id); return !(l && ((l.todayWork ?? "").trim() || (l.tomorrowPlan ?? "").trim())); });
    return [...has, ...none];
  }, [users, logByUser]);

  const addSchedule = async () => {
    if (!schedTitle.trim()) return;
    if (!currentUserId) { alert("상단에서 현재 사용자를 선택하세요."); return; }
    setBusy(true);
    try {
      const r = await fetch("/api/work/schedule", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: selectedDate, title: schedTitle.trim(), userId: currentUserId, color: currentUser?.color }),
      });
      const d = await r.json();
      if (!d.success) { alert(d.error ?? "등록 실패"); return; }
      setSchedTitle("");
      loadSchedules();
    } finally { setBusy(false); }
  };
  const delSchedule = async (id: string) => {
    if (!confirm("일정을 삭제하시겠습니까?")) return;
    await fetch(`/api/work/schedule/${id}`, { method: "DELETE" });
    loadSchedules();
  };

  const submitPost = async () => {
    if (!currentUserId) { alert("상단에서 현재 사용자를 선택하세요."); return; }
    if (!content.trim()) return;
    setBusy(true);
    try {
      const r = await fetch("/api/work/posts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authorId: currentUserId, content: content.trim(), important }),
      });
      const d = await r.json();
      if (!d.success) { alert(d.error ?? "등록 실패"); return; }
      setContent(""); setImportant(false);
      loadPosts();
    } finally { setBusy(false); }
  };
  const delPost = async (id: string) => {
    if (!confirm("삭제하시겠습니까?")) return;
    await fetch(`/api/work/posts/${id}`, { method: "DELETE" });
    loadPosts();
  };
  const insertMention = (name: string) => setContent(c => `${c}${c && !c.endsWith(" ") ? " " : ""}@${name} `);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-gray-800">업무 대시보드</h2>
        <p className="text-sm text-gray-500 mt-0.5">팀원들의 업무일지·공유 메모를 한곳에서 확인합니다. 날짜를 선택하면 그날의 일지와 메모가 표시됩니다.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-4 items-start">
        {/* 왼쪽: 팀원 업무일지 리스트 */}
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
            <span className="text-sm font-bold text-gray-700 flex items-center gap-1.5"><Users size={15} className="text-indigo-500" /> 팀원 업무일지</span>
            <span className="text-xs text-gray-400">{fmtDate(selectedDate)}</span>
          </div>
          <div className="divide-y divide-gray-100 max-h-[72vh] overflow-auto">
            {teamRows.length === 0 ? (
              <p className="py-12 text-center text-sm text-gray-400">등록된 사용자가 없습니다. [사용자 등록]에서 추가하세요.</p>
            ) : teamRows.map(u => {
              const log = logByUser.get(u.id);
              const today = (log?.todayWork ?? "").trim();
              const tomorrow = (log?.tomorrowPlan ?? "").trim();
              const empty = !today && !tomorrow;
              return (
                <div key={u.id} className={`px-4 py-3 ${empty ? "opacity-60" : ""}`}>
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
                      {today && (
                        <div>
                          <span className="text-[11px] font-semibold text-indigo-600">오늘</span>
                          <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">{today}</p>
                        </div>
                      )}
                      {tomorrow && (
                        <div>
                          <span className="text-[11px] font-semibold text-gray-400">내일</span>
                          <p className="text-sm text-gray-600 whitespace-pre-wrap break-words">{tomorrow}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* 오른쪽: 달력 + 선택일 공유 + 중요메모 + (컴팩트) 작성 */}
        <div className="space-y-4">
          <WorkCalendar
            month={month} onMonthChange={setMonth}
            selectedDate={selectedDate} onSelectDate={setSelectedDate}
            markers={markers} todayYmd={todayKst()}
          />

          {/* 선택 날짜 공유 메모 + 일정 */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-4 py-2.5 border-b border-gray-200 bg-gray-50 flex items-center gap-1.5">
              <NotebookPen size={14} className="text-indigo-500" />
              <span className="text-sm font-bold text-gray-700">{fmtDate(selectedDate)} 공유</span>
            </div>
            <div className="p-3 space-y-3">
              {/* 일정 */}
              <div>
                <div className="text-[11px] font-semibold text-gray-400 mb-1.5 flex items-center gap-1"><CalendarDays size={12} /> 일정</div>
                <div className="flex gap-1.5 mb-1.5">
                  <input value={schedTitle} onChange={e => setSchedTitle(e.target.value)} placeholder="일정 추가"
                    onKeyDown={e => { if (e.key === "Enter") addSchedule(); }}
                    className="flex-1 px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                  <button onClick={addSchedule} disabled={busy} className="px-2.5 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"><Plus size={14} /></button>
                </div>
                {daySchedules.length === 0 ? (
                  <p className="text-xs text-gray-400 py-1">등록된 일정이 없습니다.</p>
                ) : daySchedules.map(s => (
                  <div key={s.id} className="flex items-center justify-between text-sm border border-gray-100 rounded-lg px-2.5 py-1.5">
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: s.color || s.user?.color || "#6366f1" }} />
                      {s.title}{s.user && <span className="text-[10px] text-gray-400">· {s.user.name}</span>}
                    </span>
                    <button onClick={() => delSchedule(s.id)} className="text-gray-300 hover:text-red-500"><Trash2 size={13} /></button>
                  </div>
                ))}
              </div>

              {/* 그날의 공유 메모 */}
              <div>
                <div className="text-[11px] font-semibold text-gray-400 mb-1.5">공유 메모</div>
                {dayPosts.length === 0 ? (
                  <p className="text-xs text-gray-400 py-1">이 날 공유된 메모가 없습니다.</p>
                ) : <div className="space-y-1.5">{dayPosts.map(p => <PostRow key={p.id} p={p} onDelete={delPost} />)}</div>}
              </div>
            </div>
          </div>

          {/* 중요 메모 (항상 고정) */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-4 py-2.5 border-b border-gray-200 bg-amber-50 flex items-center gap-1.5">
              <Star size={14} className="text-amber-500" fill="currentColor" />
              <span className="text-sm font-bold text-amber-800">중요 메모</span>
            </div>
            <div className="p-3 space-y-1.5">
              {importantPosts.length === 0 ? (
                <p className="text-xs text-gray-400 py-1 text-center">중요 메모가 없습니다.</p>
              ) : importantPosts.map(p => <PostRow key={p.id} p={p} onDelete={delPost} amber />)}
            </div>
          </div>

          {/* 공유 메모 남기기 (보조) */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-2">
            <div className="text-[11px] font-semibold text-gray-400">공유 메모 남기기</div>
            <textarea value={content} onChange={e => setContent(e.target.value)}
              placeholder={currentUserId ? "팀에 공유할 내용. @이름 으로 소환" : "상단에서 현재 사용자를 먼저 선택하세요."}
              disabled={!currentUserId} rows={2}
              className="w-full p-2 text-sm border border-gray-200 rounded-lg resize-y focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:bg-gray-100" />
            <div className="flex items-center gap-1 flex-wrap">
              <AtSign size={12} className="text-gray-400" />
              {users.filter(u => u.active && u.id !== currentUserId).map(u => (
                <button key={u.id} onClick={() => insertMention(u.name)}
                  className="px-1.5 py-0.5 text-[10px] rounded-full border border-gray-200 text-gray-600 hover:bg-indigo-50 hover:border-indigo-300">@{u.name}</button>
              ))}
            </div>
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-1.5 text-xs text-amber-700 cursor-pointer select-none">
                <input type="checkbox" checked={important} onChange={e => setImportant(e.target.checked)} className="accent-amber-500" />
                <Star size={12} fill={important ? "currentColor" : "none"} /> 중요
              </label>
              <button onClick={submitPost} disabled={busy || !currentUserId || !content.trim()}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40">
                <Send size={14} /> 공유
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PostRow({ p, onDelete, amber = false }: { p: Post; onDelete: (id: string) => void; amber?: boolean }) {
  return (
    <div className={`text-xs border rounded-lg px-2.5 py-1.5 ${amber ? "border-amber-100 bg-amber-50/40" : "border-gray-100"}`}>
      <div className="flex items-center justify-between">
        <span className="font-semibold flex items-center gap-1" style={{ color: p.author.color || "#374151" }}>
          {p.author.name}
          {p.important && <Star size={10} className="text-amber-500" fill="currentColor" />}
        </span>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-gray-400">{fmtTime(p.createdAt)}</span>
          <button onClick={() => onDelete(p.id)} className="text-gray-300 hover:text-red-500"><Trash2 size={11} /></button>
        </div>
      </div>
      <div className="text-gray-700 mt-0.5 whitespace-pre-wrap break-words"><MentionText content={p.content} /></div>
      {p.mentions.length > 0 && (
        <div className="mt-1 flex items-center gap-1 flex-wrap">
          {p.mentions.map(m => <span key={m.user.id} className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-600">@{m.user.name}</span>)}
        </div>
      )}
    </div>
  );
}

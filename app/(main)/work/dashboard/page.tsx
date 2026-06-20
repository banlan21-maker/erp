"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Send, Star, Trash2, Plus, CalendarDays, AtSign } from "lucide-react";
import { useWorkUser, MentionText } from "@/components/work-user-context";
import WorkCalendar, { type CalMarker } from "@/components/work-calendar";

const todayKst = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
const monthOf = (ymd: string) => ymd.slice(0, 7);
const fmtTime = (iso: string) => new Date(iso).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
const fmtDateShort = (ymd: string) => { const [, m, d] = ymd.split("-"); return `${Number(m)}/${Number(d)}`; };

interface PUser { id: string; name: string; color: string | null }
interface Post { id: string; content: string; important: boolean; createdAt: string; author: PUser; mentions: { user: PUser }[] }
interface Sched { id: string; date: string; title: string; color: string | null; user: PUser | null }

export default function WorkDashboardPage() {
  const { currentUserId, currentUser, users } = useWorkUser();

  const [month, setMonth] = useState(monthOf(todayKst()));
  const [selectedDate, setSelectedDate] = useState(todayKst());

  const [schedules, setSchedules] = useState<Sched[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [importantPosts, setImportantPosts] = useState<Post[]>([]);

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

  useEffect(() => { loadSchedules(); }, [loadSchedules]);
  useEffect(() => { loadPosts(); }, [loadPosts]);

  const markers = useMemo<Record<string, CalMarker[]>>(() => {
    const map: Record<string, CalMarker[]> = {};
    for (const s of schedules) {
      const ymd = s.date.slice(0, 10);
      (map[ymd] ??= []).push({ label: s.title, color: s.color || s.user?.color || "#6366f1" });
    }
    return map;
  }, [schedules]);

  const daySchedules = useMemo(() => schedules.filter(s => s.date.slice(0, 10) === selectedDate), [schedules, selectedDate]);

  const addSchedule = async () => {
    if (!schedTitle.trim()) return;
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

  const toggleImportant = async (p: Post) => {
    await fetch(`/api/work/posts/${p.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ important: !p.important }),
    });
    loadPosts();
  };

  const insertMention = (name: string) => setContent(c => `${c}${c && !c.endsWith(" ") ? " " : ""}@${name} `);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-gray-800">업무 대시보드</h2>
        <p className="text-sm text-gray-500 mt-0.5">달력·일정과 사용자 업무내용을 한곳에서 공유합니다. @이름 으로 다른 사용자를 소환하면 그 사람 일지에도 기록됩니다.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-4 items-start">
        {/* 왼쪽: 달력 + 일정 + 중요 메모 */}
        <div className="space-y-4">
          <WorkCalendar
            month={month} onMonthChange={setMonth}
            selectedDate={selectedDate} onSelectDate={setSelectedDate}
            markers={markers} todayYmd={todayKst()}
          />

          {/* 선택 날짜 일정 */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-4 py-2.5 border-b border-gray-200 bg-gray-50 flex items-center gap-1.5">
              <CalendarDays size={14} className="text-indigo-500" />
              <span className="text-sm font-bold text-gray-700">{fmtDateShort(selectedDate)} 일정</span>
            </div>
            <div className="p-3 space-y-2">
              <div className="flex gap-1.5">
                <input value={schedTitle} onChange={e => setSchedTitle(e.target.value)} placeholder="일정 추가"
                  onKeyDown={e => { if (e.key === "Enter") addSchedule(); }}
                  className="flex-1 px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                <button onClick={addSchedule} disabled={busy} className="px-2.5 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"><Plus size={14} /></button>
              </div>
              {daySchedules.length === 0 ? (
                <p className="text-xs text-gray-400 py-2 text-center">등록된 일정이 없습니다.</p>
              ) : daySchedules.map(s => (
                <div key={s.id} className="flex items-center justify-between text-sm border border-gray-100 rounded-lg px-2.5 py-1.5">
                  <span className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: s.color || s.user?.color || "#6366f1" }} />
                    {s.title}
                    {s.user && <span className="text-[10px] text-gray-400">· {s.user.name}</span>}
                  </span>
                  <button onClick={() => delSchedule(s.id)} className="text-gray-300 hover:text-red-500"><Trash2 size={13} /></button>
                </div>
              ))}
            </div>
          </div>

          {/* 중요 메모 (계속 표시) */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-4 py-2.5 border-b border-gray-200 bg-amber-50 flex items-center gap-1.5">
              <Star size={14} className="text-amber-500" fill="currentColor" />
              <span className="text-sm font-bold text-amber-800">중요 메모</span>
            </div>
            <div className="p-3 space-y-2">
              {importantPosts.length === 0 ? (
                <p className="text-xs text-gray-400 py-2 text-center">중요 메모가 없습니다. 글 작성 시 [중요] 체크하면 여기에 고정됩니다.</p>
              ) : importantPosts.map(p => (
                <div key={p.id} className="text-xs border border-amber-100 bg-amber-50/40 rounded-lg px-2.5 py-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold" style={{ color: p.author.color || "#374151" }}>{p.author.name}</span>
                    <button onClick={() => removePostInline(p.id, loadPosts)} className="text-gray-300 hover:text-red-500"><Trash2 size={11} /></button>
                  </div>
                  <div className="text-gray-700 mt-0.5 whitespace-pre-wrap break-words"><MentionText content={p.content} /></div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 오른쪽: 공유 피드 */}
        <div className="space-y-3">
          {/* 작성 */}
          <div className="bg-white border border-gray-200 rounded-lg p-3 space-y-2">
            <textarea value={content} onChange={e => setContent(e.target.value)}
              placeholder={currentUserId ? "업무 내용을 공유하세요. @이름 으로 다른 사용자를 소환할 수 있습니다." : "상단에서 현재 사용자를 먼저 선택하세요."}
              disabled={!currentUserId} rows={3}
              className="w-full p-2 text-sm border border-gray-200 rounded-lg resize-y focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:bg-gray-50" />
            {/* @멘션 빠른삽입 */}
            <div className="flex items-center gap-1 flex-wrap">
              <AtSign size={13} className="text-gray-400" />
              {users.filter(u => u.active && u.id !== currentUserId).map(u => (
                <button key={u.id} onClick={() => insertMention(u.name)}
                  className="px-2 py-0.5 text-[11px] rounded-full border border-gray-200 text-gray-600 hover:bg-indigo-50 hover:border-indigo-300">
                  @{u.name}
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-1.5 text-xs text-amber-700 cursor-pointer select-none">
                <input type="checkbox" checked={important} onChange={e => setImportant(e.target.checked)} className="accent-amber-500" />
                <Star size={12} fill={important ? "currentColor" : "none"} /> 중요 메모로 고정
              </label>
              <button onClick={submitPost} disabled={busy || !currentUserId || !content.trim()}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40">
                <Send size={14} /> 공유
              </button>
            </div>
          </div>

          {/* 피드 */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-4 py-2.5 border-b border-gray-200 bg-gray-50 text-sm font-bold text-gray-700">업무 공유 피드</div>
            <div className="divide-y divide-gray-100">
              {posts.length === 0 ? (
                <p className="text-sm text-gray-400 py-10 text-center">공유된 글이 없습니다.</p>
              ) : posts.map(p => (
                <div key={p.id} className="px-4 py-3">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: p.author.color || "#6366f1" }} />
                      <span className="text-sm font-semibold text-gray-800">{p.author.name}</span>
                      {p.important && <Star size={12} className="text-amber-500" fill="currentColor" />}
                      <span className="text-[11px] text-gray-400">{fmtTime(p.createdAt)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => toggleImportant(p)} title="중요 토글"
                        className={`p-1 rounded hover:bg-amber-50 ${p.important ? "text-amber-500" : "text-gray-300"}`}><Star size={13} fill={p.important ? "currentColor" : "none"} /></button>
                      <button onClick={() => delPost(p.id)} className="p-1 text-gray-300 hover:text-red-500 rounded"><Trash2 size={13} /></button>
                    </div>
                  </div>
                  <div className="text-sm text-gray-700 whitespace-pre-wrap break-words"><MentionText content={p.content} /></div>
                  {p.mentions.length > 0 && (
                    <div className="mt-1.5 flex items-center gap-1 flex-wrap">
                      <span className="text-[10px] text-gray-400">소환:</span>
                      {p.mentions.map(m => (
                        <span key={m.user.id} className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-600 font-medium">@{m.user.name}</span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// 중요메모 인라인 삭제 (피드 reload 공유)
async function removePostInline(id: string, reload: () => void) {
  if (!confirm("삭제하시겠습니까?")) return;
  await fetch(`/api/work/posts/${id}`, { method: "DELETE" });
  reload();
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Star, Trash2, Send, Users, NotebookPen } from "lucide-react";
import { useWorkUser, MentionText } from "@/components/work-user-context";
import LandingCalendar from "@/components/landing-calendar";
import { parseMentions } from "@/lib/work-mentions";

const todayKst = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
const fmtTime = (iso: string) => new Date(iso).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
const fmtDate = (ymd: string) => {
  const [y, m, d] = ymd.split("-");
  const wd = ["일", "월", "화", "수", "목", "금", "토"][new Date(`${ymd}T00:00:00.000Z`).getUTCDay()];
  return `${y}.${m}.${d} (${wd})`;
};

interface PUser { id: string; name: string; color: string | null; dept?: string | null }
interface Post { id: string; content: string; important: boolean; createdAt: string; author: PUser; mentions: { user: PUser }[] }
interface TeamLog { id: string; todayWork: string; tomorrowPlan: string; user: PUser }

export default function WorkDashboardPage() {
  const { currentUserId, currentUser, users } = useWorkUser();

  const [selectedDate, setSelectedDate] = useState(todayKst());
  const [importantPosts, setImportantPosts] = useState<Post[]>([]);
  const [teamLogs, setTeamLogs] = useState<TeamLog[]>([]);
  const [memo, setMemo] = useState("");
  const [busy, setBusy] = useState(false);

  const loadImportant = useCallback(async () => {
    const r = await fetch(`/api/work/posts?important=true`).then(r => r.json()).catch(() => ({}));
    if (r.success) setImportantPosts(r.data);
  }, []);

  const loadTeamLogs = useCallback(async () => {
    const r = await fetch(`/api/work/logs?all=true&date=${selectedDate}`).then(r => r.json()).catch(() => ({}));
    if (r.success) setTeamLogs(r.data);
  }, [selectedDate]);

  useEffect(() => { loadImportant(); }, [loadImportant]);
  useEffect(() => { loadTeamLogs(); }, [loadTeamLogs]);

  const logByUser = useMemo(() => {
    const m = new Map<string, TeamLog>();
    for (const l of teamLogs) m.set(l.user.id, l);
    return m;
  }, [teamLogs]);
  const teamRows = useMemo(() => {
    const active = users.filter(u => u.active);
    const hasLog = (u: { id: string }) => { const l = logByUser.get(u.id); return !!(l && ((l.todayWork ?? "").trim() || (l.tomorrowPlan ?? "").trim())); };
    return [...active.filter(hasLog), ...active.filter(u => !hasLog(u))];
  }, [users, logByUser]);

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

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-gray-800">업무 대시보드</h2>
        <p className="text-sm text-gray-500 mt-0.5">팀원들의 업무일지·일정·공유 내용을 한곳에서 확인합니다. 공유는 각자 업무일지에 <b>@이름</b> 으로 남깁니다.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_460px] gap-4 items-start">
        {/* 왼쪽: 팀원 업무일지 리스트 */}
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
            <span className="text-sm font-bold text-gray-700 flex items-center gap-1.5"><Users size={15} className="text-indigo-500" /> 팀원 업무일지</span>
            <span className="text-xs text-gray-400">{fmtDate(selectedDate)}</span>
          </div>
          <div className="divide-y divide-gray-100 max-h-[78vh] overflow-auto">
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
                      {today && <div><span className="text-[11px] font-semibold text-indigo-600">오늘</span><p className="text-sm text-gray-700 whitespace-pre-wrap break-words"><MentionText content={today} /></p></div>}
                      {tomorrow && <div><span className="text-[11px] font-semibold text-gray-400">내일</span><p className="text-sm text-gray-600 whitespace-pre-wrap break-words"><MentionText content={tomorrow} /></p></div>}
                    </div>
                  )}
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
                  <div className="text-gray-700 mt-0.5 whitespace-pre-wrap break-words"><MentionText content={s.line} /></div>
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

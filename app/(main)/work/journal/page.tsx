"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Save, Star, Send, Trash2 } from "lucide-react";
import { useWorkUser, MentionText } from "@/components/work-user-context";
import WorkCalendar, { type CalMarker } from "@/components/work-calendar";

const todayKst = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
const monthOf = (ymd: string) => ymd.slice(0, 7);
const fmtDate = (ymd: string) => {
  const [y, m, d] = ymd.split("-");
  const wd = ["일", "월", "화", "수", "목", "금", "토"][new Date(`${ymd}T00:00:00.000Z`).getUTCDay()];
  return `${y}.${m}.${d} (${wd})`;
};
const fmtTime = (iso: string) => new Date(iso).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });

interface PostUser { id: string; name: string; color: string | null }
interface Post { id: string; content: string; important: boolean; createdAt: string; author: PostUser; mentions: { user: PostUser }[] }
interface LogRow { id: string; date: string; todayWork: string; tomorrowPlan: string }

export default function WorkJournalPage() {
  const { currentUserId, currentUser } = useWorkUser();

  const [month, setMonth] = useState(monthOf(todayKst()));
  const [selectedDate, setSelectedDate] = useState(todayKst());

  const [yesterdayWork, setYesterdayWork] = useState("");
  const [todayWork, setTodayWork] = useState("");
  const [tomorrowPlan, setTomorrowPlan] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const [monthLogs, setMonthLogs] = useState<LogRow[]>([]);
  const [importantPosts, setImportantPosts] = useState<Post[]>([]);
  const [myPosts, setMyPosts] = useState<Post[]>([]);
  const [memo, setMemo] = useState("");

  // 선택 날짜 일지 + 어제 자동 — 응답 race 가드(빠른 날짜전환 시 늦게 온 옛 응답 폐기)
  useEffect(() => {
    if (!currentUserId) return;
    const reqUser = currentUserId, reqDate = selectedDate;
    const ctrl = new AbortController();
    (async () => {
      const r = await fetch(`/api/work/logs?userId=${reqUser}&date=${reqDate}`, { signal: ctrl.signal })
        .then(res => res.json()).catch(() => ({}));
      if (reqUser !== currentUserId || reqDate !== selectedDate) return; // stale 폐기
      if (r.success) {
        setYesterdayWork(r.data.yesterdayWork ?? "");
        setTodayWork(r.data.log?.todayWork ?? "");
        setTomorrowPlan(r.data.log?.tomorrowPlan ?? "");
        setDirty(false);
      }
    })();
    return () => ctrl.abort();
  }, [currentUserId, selectedDate]);

  const loadMonth = useCallback(async () => {
    if (!currentUserId) return;
    const r = await fetch(`/api/work/logs?userId=${currentUserId}&month=${month}`).then(r => r.json()).catch(() => ({}));
    if (r.success) setMonthLogs(r.data);
  }, [currentUserId, month]);

  const loadPosts = useCallback(async () => {
    const [imp, mine] = await Promise.all([
      fetch(`/api/work/posts?important=true`).then(r => r.json()).catch(() => ({})),
      currentUserId ? fetch(`/api/work/posts?mentionUserId=${currentUserId}`).then(r => r.json()).catch(() => ({})) : Promise.resolve({}),
    ]);
    if (imp.success) setImportantPosts(imp.data);
    if (mine.success) setMyPosts(mine.data); else setMyPosts([]);
  }, [currentUserId]);

  useEffect(() => { loadMonth(); }, [loadMonth]);
  useEffect(() => { loadPosts(); }, [loadPosts]);

  // 미저장 변경 보호 — 탭 닫기/새로고침 경고
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  // 날짜 이동 시 미저장 변경 경고
  const guardedSelectDate = (d: string) => {
    if (dirty && !confirm("저장되지 않은 변경이 있습니다. 이동하면 입력 내용이 사라집니다. 계속할까요?")) return;
    setSelectedDate(d);
  };

  const markers = useMemo<Record<string, CalMarker[]>>(() => {
    const map: Record<string, CalMarker[]> = {};
    for (const l of monthLogs) {
      if ((l.todayWork ?? "").trim() || (l.tomorrowPlan ?? "").trim()) {
        const ymd = l.date.slice(0, 10);
        map[ymd] = [{ label: "작성", color: currentUser?.color || "#6366f1" }];
      }
    }
    return map;
  }, [monthLogs, currentUser]);

  const save = async () => {
    if (!currentUserId) { alert("상단에서 현재 사용자를 선택하세요."); return; }
    setSaving(true);
    try {
      const r = await fetch("/api/work/logs", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: currentUserId, date: selectedDate, todayWork, tomorrowPlan }),
      });
      const d = await r.json();
      if (!d.success) { alert(d.error ?? "저장 실패"); return; }
      setDirty(false);
      loadMonth();
    } finally { setSaving(false); }
  };

  const addMemo = async () => {
    if (!currentUserId) { alert("상단에서 현재 사용자를 선택하세요."); return; }
    if (!memo.trim()) return;
    const r = await fetch("/api/work/posts", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ authorId: currentUserId, content: memo.trim(), important: true }),
    });
    const d = await r.json();
    if (!d.success) { alert(d.error ?? "등록 실패"); return; }
    setMemo("");
    loadPosts();
  };

  const removePost = async (id: string) => {
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

  if (!currentUserId) {
    return (
      <div className="py-20 text-center text-gray-500">
        <p className="text-lg font-semibold">현재 사용자를 선택하세요</p>
        <p className="text-sm mt-1">우측 상단 [현재 사용자] 에서 본인을 선택하면 업무일지를 작성할 수 있습니다.</p>
      </div>
    );
  }

  const isToday = selectedDate === todayKst();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-800">업무일지 <span className="text-indigo-600">{currentUser?.name}</span></h2>
          <p className="text-sm text-gray-500 mt-0.5">달력에서 날짜를 선택해 일지를 작성합니다. 어제 칸은 전일 업무내용을 자동 표시합니다.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-4 items-start">
        {/* 왼쪽: 달력 + 중요 메모 */}
        <div className="space-y-4">
          <WorkCalendar
            month={month} onMonthChange={setMonth}
            selectedDate={selectedDate} onSelectDate={guardedSelectDate}
            markers={markers} todayYmd={todayKst()}
          />

          {/* 중요 메모 (계속 표시) */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-4 py-2.5 border-b border-gray-200 bg-amber-50 flex items-center gap-1.5">
              <Star size={14} className="text-amber-500" fill="currentColor" />
              <span className="text-sm font-bold text-amber-800">중요 메모</span>
            </div>
            <div className="p-3 space-y-2">
              <div className="flex gap-1.5">
                <input value={memo} onChange={e => setMemo(e.target.value)} placeholder="중요 메모 추가 (@이름 으로 소환)"
                  onKeyDown={e => { if (e.key === "Enter") addMemo(); }}
                  className="flex-1 px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400" />
                <button onClick={addMemo} className="px-2.5 py-1.5 bg-amber-500 text-white rounded-lg hover:bg-amber-600"><Send size={14} /></button>
              </div>
              {importantPosts.length === 0 ? (
                <p className="text-xs text-gray-400 py-2 text-center">중요 메모가 없습니다.</p>
              ) : importantPosts.map(p => (
                <div key={p.id} className="text-xs border border-amber-100 bg-amber-50/40 rounded-lg px-2.5 py-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold" style={{ color: p.author.color || "#374151" }}>{p.author.name}</span>
                    <div className="flex items-center gap-1">
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

        {/* 오른쪽: 어제 / 오늘 / 내일 + 멘션 기록 */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-700">{fmtDate(selectedDate)} {isToday && <span className="ml-1 text-[11px] text-indigo-600 font-bold">오늘</span>}</span>
            <button onClick={save} disabled={saving || !dirty}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40">
              <Save size={14} /> {saving ? "저장 중…" : dirty ? "저장" : "저장됨"}
            </button>
          </div>

          {/* 어제 (읽기 전용) */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-4 py-2 border-b border-gray-100 bg-gray-50 text-xs font-bold text-gray-500">어제 업무내용 (전일 자동)</div>
            <div className="p-3 text-sm text-gray-600 whitespace-pre-wrap min-h-[60px]">{yesterdayWork || <span className="text-gray-300">전일 작성 내용이 없습니다.</span>}</div>
          </div>

          {/* 오늘 (편집) */}
          <div className="bg-white border-2 border-indigo-200 rounded-lg overflow-hidden">
            <div className="px-4 py-2 border-b border-indigo-100 bg-indigo-50 text-xs font-bold text-indigo-700">오늘 업무내용</div>
            <textarea value={todayWork} onChange={e => { setTodayWork(e.target.value); setDirty(true); }}
              placeholder="오늘 진행한 업무를 입력하세요." rows={7}
              className="w-full p-3 text-sm resize-y focus:outline-none" />
          </div>

          {/* 내일 (편집) */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-4 py-2 border-b border-gray-100 bg-gray-50 text-xs font-bold text-gray-500">내일 계획</div>
            <textarea value={tomorrowPlan} onChange={e => { setTomorrowPlan(e.target.value); setDirty(true); }}
              placeholder="내일 할 일을 입력하세요." rows={5}
              className="w-full p-3 text-sm resize-y focus:outline-none" />
          </div>

          {/* 내 업무 공유/멘션 기록 */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-4 py-2 border-b border-gray-100 bg-gray-50 text-xs font-bold text-gray-500">
              내 공유·멘션 기록 <span className="text-gray-400 font-normal">(내가 쓰거나 @로 소환된 글)</span>
            </div>
            <div className="p-3 space-y-2">
              {myPosts.length === 0 ? (
                <p className="text-xs text-gray-400 py-2 text-center">기록이 없습니다.</p>
              ) : myPosts.map(p => (
                <div key={p.id} className="text-xs border border-gray-100 rounded-lg px-2.5 py-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold" style={{ color: p.author.color || "#374151" }}>
                      {p.author.name}
                      {p.author.id !== currentUserId && <span className="ml-1 text-[10px] text-indigo-500">→ 나 소환</span>}
                      {p.important && <Star size={10} className="inline ml-1 text-amber-500" fill="currentColor" />}
                    </span>
                    <span className="text-[10px] text-gray-400">{fmtTime(p.createdAt)}</span>
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

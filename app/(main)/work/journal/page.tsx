"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Save, Star, Send, Trash2, Inbox } from "lucide-react";
import { useWorkUser, MentionText } from "@/components/work-user-context";
import { JournalText } from "@/components/journal-text";
import WorkJournalLineEditor from "@/components/work-journal-line-editor";
import WorkCalendar, { type CalMarker } from "@/components/work-calendar";
import { parseMentions } from "@/lib/work-mentions";
import { shiftYmd } from "@/lib/work-date";

const todayKst = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
const monthOf = (ymd: string) => ymd.slice(0, 7);
const WD = ["일", "월", "화", "수", "목", "금", "토"];
const fmtDate = (ymd: string) => {
  const [y, m, d] = ymd.split("-");
  return `${y}.${m}.${d} (${WD[new Date(`${ymd}T00:00:00.000Z`).getUTCDay()]})`;
};
// 제목용 — 공백 없는 형식 (예: 2026.06.24(수))
const fmtDateTitle = (ymd: string) => {
  const [y, m, d] = ymd.split("-");
  return `${y}.${m}.${d}(${WD[new Date(`${ymd}T00:00:00.000Z`).getUTCDay()]})`;
};
const fmtTime = (iso: string) => new Date(iso).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });

interface PostUser { id: string; name: string; color: string | null }
interface Post { id: string; content: string; important: boolean; createdAt: string; author: PostUser; mentions: { user: PostUser }[] }
interface LogRow { id: string; date: string; todayWork: string; tomorrowPlan: string }
interface TeamLog { id: string; todayWork: string; tomorrowPlan: string; user: PostUser }

export default function WorkJournalPage() {
  const { currentUserId, currentUser, users } = useWorkUser();

  const [month, setMonth] = useState(monthOf(todayKst()));
  const [selectedDate, setSelectedDate] = useState(todayKst());

  const [yesterdayWork, setYesterdayWork] = useState("");
  const [todayWork, setTodayWork] = useState("");
  const [tomorrowPlan, setTomorrowPlan] = useState("");
  const [dirty, setDirty] = useState(false);
  const [seeded, setSeeded] = useState(false);   // 오늘 칸이 전일 내일계획에서 자동 이어받기됨(미저장)
  const [yesterdayDirty, setYesterdayDirty] = useState(false);  // 어제 칸 편집(전일 날짜에 저장)
  const [saving, setSaving] = useState(false);

  const [monthLogs, setMonthLogs] = useState<LogRow[]>([]);
  const [importantPosts, setImportantPosts] = useState<Post[]>([]);
  const [allDayLogs, setAllDayLogs] = useState<TeamLog[]>([]);
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
        const savedToday = r.data.log?.todayWork ?? "";
        const prevPlan   = r.data.prevTomorrowPlan ?? "";
        // 오늘 업무가 비어있고 전일 내일계획이 있으면 자동 이어받기(미저장) — 저장하면 오늘 업무로 확정
        if (!savedToday.trim() && prevPlan.trim()) {
          setTodayWork(prevPlan);
          setSeeded(true);
        } else {
          setTodayWork(savedToday);
          setSeeded(false);
        }
        setTomorrowPlan(r.data.log?.tomorrowPlan ?? "");
        setDirty(false);
        setYesterdayDirty(false);
      }
    })();
    return () => ctrl.abort();
  }, [currentUserId, selectedDate]);

  const loadMonth = useCallback(async () => {
    if (!currentUserId) return;
    const r = await fetch(`/api/work/logs?userId=${currentUserId}&month=${month}`).then(r => r.json()).catch(() => ({}));
    if (r.success) setMonthLogs(r.data);
  }, [currentUserId, month]);

  const loadImportant = useCallback(async () => {
    const r = await fetch(`/api/work/posts?important=true`).then(r => r.json()).catch(() => ({}));
    if (r.success) setImportantPosts(r.data);
  }, []);

  // 그 날짜 팀 전체 일지 — '공유받은 내용'(나를 @멘션한 줄) 계산용
  const loadAllDay = useCallback(async () => {
    const r = await fetch(`/api/work/logs?all=true&date=${selectedDate}`).then(r => r.json()).catch(() => ({}));
    if (r.success) setAllDayLogs(r.data);
  }, [selectedDate]);

  useEffect(() => { loadMonth(); }, [loadMonth]);
  useEffect(() => { loadImportant(); }, [loadImportant]);
  useEffect(() => { loadAllDay(); }, [loadAllDay]);

  // 미저장 변경 보호
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (dirty || yesterdayDirty) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty, yesterdayDirty]);

  const guardedSelectDate = (d: string) => {
    if ((dirty || yesterdayDirty) && !confirm("저장되지 않은 변경이 있습니다. 이동하면 입력 내용이 사라집니다. 계속할까요?")) return;
    setSelectedDate(d);
  };

  const markers = useMemo<Record<string, CalMarker[]>>(() => {
    const map: Record<string, CalMarker[]> = {};
    for (const l of monthLogs) {
      if ((l.todayWork ?? "").trim() || (l.tomorrowPlan ?? "").trim()) {
        map[l.date.slice(0, 10)] = [{ label: "작성", color: currentUser?.color || "#6366f1" }];
      }
    }
    return map;
  }, [monthLogs, currentUser]);

  // 공유받은 내용 — 다른 팀원의 그날 일지에서 나(@현재사용자)를 소환한 줄
  const received = useMemo(() => {
    if (!currentUserId) return [] as { author: PostUser; line: string; key: string }[];
    const out: { author: PostUser; line: string; key: string }[] = [];
    for (const lg of allDayLogs) {
      if (lg.user.id === currentUserId) continue;
      const text = `${lg.todayWork ?? ""}\n${lg.tomorrowPlan ?? ""}`;
      text.split("\n").map(s => s.trim()).filter(Boolean).forEach((line, i) => {
        if (!line.includes("@")) return;
        if (parseMentions(line, users).includes(currentUserId)) out.push({ author: lg.user, line, key: `${lg.id}-${i}` });
      });
    }
    return out;
  }, [allDayLogs, users, currentUserId]);

  const save = async () => {
    if (!currentUserId) { alert("상단에서 현재 사용자를 선택하세요."); return; }
    setSaving(true);
    try {
      const reqs: Promise<Response>[] = [];
      // 선택 날짜(오늘/내일) — 편집했거나 자동 이어받기(seeded) 확정
      if (dirty || seeded) {
        reqs.push(fetch("/api/work/logs", {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: currentUserId, date: selectedDate, todayWork, tomorrowPlan }),
        }));
      }
      // 어제 칸 — 전일 날짜에 todayWork 만 부분 저장(그날 내일계획 보존)
      if (yesterdayDirty) {
        reqs.push(fetch("/api/work/logs", {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: currentUserId, date: shiftYmd(selectedDate, -1), todayWork: yesterdayWork }),
        }));
      }
      if (reqs.length === 0) return;
      const results = await Promise.all(reqs.map(p => p.then(res => res.json()).catch(() => ({ success: false }))));
      const failed = results.find(d => !d.success);
      if (failed) { alert(failed.error ?? "저장 실패"); return; }
      setDirty(false);
      setSeeded(false);
      setYesterdayDirty(false);
      loadMonth(); loadAllDay();
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
    loadImportant();
  };
  const removePost = async (id: string) => {
    if (!confirm("삭제하시겠습니까?")) return;
    await fetch(`/api/work/posts/${id}`, { method: "DELETE" });
    loadImportant();
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
  const yesterdayYmd = shiftYmd(selectedDate, -1);
  const tomorrowYmd  = shiftYmd(selectedDate, 1);
  const others = users.filter(u => u.active && u.id !== currentUserId);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-gray-800">업무일지 <span className="text-indigo-600">{currentUser?.name}</span></h2>
        <p className="text-sm text-gray-500 mt-0.5">날짜를 선택해 일지를 작성합니다. 내용에 <b>@이름</b> 을 넣으면 그 줄이 상대방의 그날 일지에도 공유됩니다.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-4 items-start">
        {/* 왼쪽: 달력 + 중요 메모 */}
        <div className="space-y-4">
          <WorkCalendar
            month={month} onMonthChange={setMonth}
            selectedDate={selectedDate} onSelectDate={guardedSelectDate}
            markers={markers} todayYmd={todayKst()}
          />

          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-4 py-2.5 border-b border-gray-200 bg-amber-50 flex items-center gap-1.5">
              <Star size={14} className="text-amber-500" fill="currentColor" />
              <span className="text-sm font-bold text-amber-800">중요 메모</span>
            </div>
            <div className="p-3 space-y-2">
              <div className="flex gap-1.5">
                <input value={memo} onChange={e => setMemo(e.target.value)} placeholder="중요 메모 추가 (전체 고정 표시)"
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

        {/* 오른쪽: 어제 / 오늘 / 내일 + 공유받은 내용 */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-700">{fmtDate(selectedDate)} {isToday && <span className="ml-1 text-[11px] text-indigo-600 font-bold">오늘</span>}</span>
            <button onClick={save} disabled={saving || (!dirty && !seeded && !yesterdayDirty)}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40">
              <Save size={14} /> {saving ? "저장 중…" : (dirty || seeded || yesterdayDirty) ? "저장" : "저장됨"}
            </button>
          </div>

          {/* 어제 (편집 가능 — 전일 날짜에 저장) */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-4 py-2 border-b border-gray-100 bg-gray-50 text-xs font-bold text-gray-500">어제 업무내용 <span className="ml-1 font-normal text-gray-400">{fmtDateTitle(yesterdayYmd)} · 여기서 수정하면 전일자에 저장</span></div>
            <WorkJournalLineEditor value={yesterdayWork} onChange={v => { setYesterdayWork(v); setYesterdayDirty(true); }}
              placeholder="전일 업무내용. Enter로 줄 추가, 줄 앞 ● 로 상태 표시."
              mentionUsers={others} />
          </div>

          {/* 오늘 (편집) */}
          <div className="bg-white border-2 border-indigo-200 rounded-lg overflow-hidden">
            <div className="px-4 py-2 border-b border-indigo-100 bg-indigo-50 text-xs font-bold text-indigo-700">오늘 업무내용 <span className="ml-1 font-normal text-indigo-400">{fmtDateTitle(selectedDate)}</span> <span className="ml-1 font-normal text-gray-400">· 줄 앞 ● 클릭해 완료/진행중/중요</span></div>
            {seeded && (
              <div className="px-3 py-1.5 bg-amber-50 border-b border-amber-100 text-[11px] text-amber-700">전일 내일계획에서 자동으로 가져왔습니다. 확인·수정 후 <b>저장</b>하면 오늘 업무로 확정됩니다.</div>
            )}
            <WorkJournalLineEditor value={todayWork} onChange={v => { setTodayWork(v); setDirty(true); setSeeded(false); }}
              placeholder="오늘 진행한 업무를 입력하세요. Enter로 줄 추가, 줄 앞 ● 로 상태 표시, @이름으로 공유."
              mentionUsers={others} />
          </div>

          {/* 내일 (편집) */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-4 py-2 border-b border-gray-100 bg-gray-50 text-xs font-bold text-gray-500">내일 계획 <span className="ml-1 font-normal text-gray-400">{fmtDateTitle(tomorrowYmd)}</span></div>
            <WorkJournalLineEditor value={tomorrowPlan} onChange={v => { setTomorrowPlan(v); setDirty(true); }}
              placeholder="내일 할 일을 입력하세요. Enter로 줄 추가, 줄 앞 ● 로 상태 표시."
              mentionUsers={others} />
          </div>

          {/* 공유받은 내용 — 다른 팀원이 그날 일지에서 나를 @멘션한 줄 */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-4 py-2 border-b border-gray-100 bg-gray-50 text-xs font-bold text-gray-500 flex items-center gap-1.5">
              <Inbox size={13} className="text-indigo-500" /> 공유받은 내용 <span className="text-gray-400 font-normal">({fmtDate(selectedDate)} · 나를 @소환한 줄)</span>
            </div>
            <div className="p-3 space-y-2">
              {received.length === 0 ? (
                <p className="text-xs text-gray-400 py-2 text-center">이 날 공유받은 내용이 없습니다.</p>
              ) : received.map(r => (
                <div key={r.key} className="text-xs border border-indigo-100 bg-indigo-50/30 rounded-lg px-2.5 py-1.5">
                  <div className="font-semibold mb-0.5" style={{ color: r.author.color || "#374151" }}>{r.author.name}</div>
                  <div className="text-gray-700"><JournalText content={r.line} /></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

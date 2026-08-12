"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Save, Star, Send, Trash2, Inbox, MessageSquare, Archive } from "lucide-react";
import { useWorkUser, MentionText } from "@/components/work-user-context";
import { JournalText } from "@/components/journal-text";
import WorkJournalLineEditor from "@/components/work-journal-line-editor";
import WorkCalendar, { type CalMarker } from "@/components/work-calendar";
import { parseMentions } from "@/lib/work-mentions";
import { parseLine } from "@/lib/work-line-status";
import { shiftYmd, isYmd } from "@/lib/work-date";
import { registerUnsavedGuard } from "@/lib/unsaved-guard";

const todayKst = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
const monthOf = (ymd: string) => ymd.slice(0, 7);
const draftKey = (uid: string, ymd: string) => `workJournalDraft:${uid}:${ymd}`;
const MEMO_PREVIEW = 5;   // 중요 메모 기본 표시 건수
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
interface LogComment { id: string; content: string; createdAt: string; author: PostUser }

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
  // 화면 내용이 '현재 (사용자,날짜)' 의 것임을 확인하기 전에는 저장 금지 — 남의 일지 덮어쓰기 방지
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [prevDate, setPrevDate] = useState<string | null>(null); // 어제 칸의 실제 날짜(직전 근무일)
  const [prevPlan, setPrevPlan] = useState("");                  // 직전 근무일 내일계획(seed 재계산용)
  const [draftFound, setDraftFound] = useState(false);           // 임시저장 초안 복구됨
  // 낙관적 잠금 기준 — 불러온 시점의 updatedAt. 저장 시 서버가 대조해 다른 탭 변경분 덮어쓰기 차단
  const [baseUpdatedAt, setBaseUpdatedAt] = useState<string | null>(null);
  const [prevUpdatedAt, setPrevUpdatedAt] = useState<string | null>(null);
  const key = `${currentUserId}|${selectedDate}`;

  const [monthLogs, setMonthLogs] = useState<LogRow[]>([]);
  const [importantPosts, setImportantPosts] = useState<Post[]>([]);
  const [allDayLogs, setAllDayLogs] = useState<TeamLog[]>([]);
  const [memo, setMemo] = useState("");
  const [memoBusy, setMemoBusy] = useState(false);
  const [showAllMemo, setShowAllMemo] = useState(false);          // 중요 메모 더 보기
  const [myComments, setMyComments] = useState<LogComment[]>([]); // 내 일지에 달린 댓글

  // 알림에서 넘어온 경우 ?date=YYYY-MM-DD 로 그 날짜를 연다 (마운트 후 1회 — SSR 불일치 방지)
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("date");
    if (isYmd(q)) { setSelectedDate(q); setMonth(monthOf(q)); }
  }, []);

  // SPA 메뉴 이동·사용자 전환 시 작성 중 내용 보호 (beforeunload 가 못 잡는 경로)
  useEffect(() => registerUnsavedGuard(() => dirty || yesterdayDirty), [dirty, yesterdayDirty]);

  // 전일 진행중 + 내일계획 → 오늘 칸 자동 이어받기 줄 생성
  const buildSeed = (prevToday: string, plan: string): string[] => {
    const doing = prevToday.split("\n").filter(l => l.trim() && parseLine(l).status === "doing");
    const planL = plan.split("\n").filter(l => l.trim());
    const seen = new Set<string>();
    const out: string[] = [];
    for (const l of [...doing, ...planL]) { if (!seen.has(l)) { seen.add(l); out.push(l); } }
    return out;
  };

  // 선택 날짜 일지 로드 — 신원 가드(loadedKey) + race 가드 + 초안 복구
  useEffect(() => {
    if (!currentUserId) return;
    const reqUser = currentUserId, reqDate = selectedDate, reqKey = `${reqUser}|${reqDate}`;
    // ★ await 이전 동기 구간에서 화면을 비운다 — 이전 사용자 텍스트가 새 신원으로 저장되는 것을 원천 차단
    setLoadedKey(null); setLoadError(null); setDraftFound(false);
    setYesterdayWork(""); setTodayWork(""); setTomorrowPlan("");
    setDirty(false); setSeeded(false); setYesterdayDirty(false);
    const ctrl = new AbortController();
    (async () => {
      const r = await fetch(`/api/work/logs?userId=${reqUser}&date=${reqDate}`, { signal: ctrl.signal })
        .then(res => res.json()).catch(() => ({}));
      if (ctrl.signal.aborted) return;
      if (reqUser !== currentUserId || reqDate !== selectedDate) return; // stale 폐기
      if (!r.success) { setLoadError(r.error ?? "일지를 불러오지 못했습니다. 새로고침 후 다시 시도하세요."); return; }

      const prevToday: string = r.data.yesterdayWork ?? "";
      const plan: string      = r.data.prevTomorrowPlan ?? "";
      setYesterdayWork(prevToday);
      setPrevPlan(plan);
      setPrevDate(r.data.prevDate ?? null);
      setBaseUpdatedAt(r.data.updatedAt ?? null);
      setPrevUpdatedAt(r.data.prevUpdatedAt ?? null);

      const saved = r.data.log as { todayWork: string; tomorrowPlan: string } | null;
      // 저장 기록이 있으면 그대로 — 비워서 저장한 날에 전일 내용이 되살아나지 않게(명시적 '비움' 존중)
      if (saved) {
        setTodayWork(saved.todayWork ?? "");
        setTomorrowPlan(saved.tomorrowPlan ?? "");
        setSeeded(false);
      } else {
        const seedLines = buildSeed(prevToday, plan);
        setTodayWork(seedLines.join("\n"));
        setSeeded(seedLines.length > 0);
        setTomorrowPlan("");
      }

      // 임시저장 초안 복구 (저장 못 누르고 이탈/크래시 대비)
      try {
        const raw = localStorage.getItem(draftKey(reqUser, reqDate));
        if (raw) {
          const d = JSON.parse(raw) as { t?: string; p?: string; y?: string };
          const same = (d.t ?? "") === (saved?.todayWork ?? "") && (d.p ?? "") === (saved?.tomorrowPlan ?? "");
          if (!same && confirm("저장하지 않은 작성분이 있습니다. 복구할까요?")) {
            if (d.t !== undefined) setTodayWork(d.t);
            if (d.p !== undefined) setTomorrowPlan(d.p);
            if (d.y !== undefined) { setYesterdayWork(d.y); setYesterdayDirty(true); }
            setDirty(true); setDraftFound(true);
          } else if (same) {
            localStorage.removeItem(draftKey(reqUser, reqDate));
          }
        }
      } catch { /* 무시 */ }

      setLoadedKey(reqKey);
    })();
    return () => ctrl.abort();
  }, [currentUserId, selectedDate]);

  // 자동 임시저장 — 입력 500ms 후 localStorage 에 보관(서버 저장과 별개). 저장 성공 시 제거.
  useEffect(() => {
    if (!currentUserId || loadedKey !== key) return;
    if (!dirty && !yesterdayDirty) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(draftKey(currentUserId, selectedDate),
          JSON.stringify({ t: todayWork, p: tomorrowPlan, y: yesterdayWork, at: Date.now() }));
      } catch { /* 용량초과 등 무시 */ }
    }, 500);
    return () => clearTimeout(t);
  }, [todayWork, tomorrowPlan, yesterdayWork, dirty, yesterdayDirty, currentUserId, selectedDate, loadedKey, key]);

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

  // 내 일지에 달린 댓글 — 지금까지 대시보드에서만 보여 작성자가 피드백을 못 보던 문제
  useEffect(() => {
    if (!currentUserId) { setMyComments([]); return; }
    const reqUser = currentUserId, reqDate = selectedDate;
    const ctrl = new AbortController();
    (async () => {
      const r = await fetch(`/api/work/log-comments?date=${reqDate}&targetUserId=${reqUser}`, { signal: ctrl.signal })
        .then(res => res.json()).catch(() => ({}));
      if (ctrl.signal.aborted || reqUser !== currentUserId || reqDate !== selectedDate) return;
      if (r.success) setMyComments(r.data);
    })();
    return () => ctrl.abort();
  }, [currentUserId, selectedDate]);

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
    // 화면 내용이 현재 신원의 것인지 확인 — 사용자/날짜 전환 직후 저장으로 남의 일지를 덮어쓰는 것 방지
    if (loadedKey !== key) { alert("일지를 불러오는 중입니다. 잠시 후 다시 저장하세요."); return; }
    setSaving(true);
    try {
      const put = (payload: Record<string, unknown>) =>
        fetch("/api/work/logs", {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }).then(res => res.json()).catch(() => ({ success: false, error: "네트워크 오류" }));

      // 선택 날짜(오늘/내일) — 편집했거나 자동 이어받기(seeded) 확정
      const saveMain = dirty || seeded;
      // 어제 칸 — '직전 근무일'(prevDate)에 todayWork 만 부분 저장(그날 내일계획 보존)
      //   D-1 고정이면 월요일에 고친 내용이 일요일에 저장되던 문제 → prevDate 사용
      const savePrev = yesterdayDirty && !!prevDate;
      if (!saveMain && !savePrev) return;

      const [main, prev] = await Promise.all([
        saveMain ? put({ userId: currentUserId, date: selectedDate, todayWork, tomorrowPlan, expectedUpdatedAt: baseUpdatedAt }) : null,
        savePrev ? put({ userId: currentUserId, date: prevDate, todayWork: yesterdayWork, expectedUpdatedAt: prevUpdatedAt }) : null,
      ]);
      const failed = [main, prev].find(d => d && !d.success);
      if (failed) {
        if (failed.conflict) {
          if (confirm(`${failed.error}\n\n지금 새로고침할까요?\n(작성 중이던 내용은 임시저장에서 복구할 수 있습니다)`)) location.reload();
        } else alert(failed.error ?? "저장 실패");
        return;
      }
      // 저장 성공 — 잠금 기준 시각 갱신 (연속 저장 시 자기 자신과 충돌하지 않도록)
      if (main?.data?.updatedAt) setBaseUpdatedAt(main.data.updatedAt);
      if (prev?.data?.updatedAt) setPrevUpdatedAt(prev.data.updatedAt);
      setDirty(false);
      setSeeded(false);
      setYesterdayDirty(false);
      setDraftFound(false);
      try { localStorage.removeItem(draftKey(currentUserId, selectedDate)); } catch { /* 무시 */ }
      loadMonth(); loadAllDay();
    } finally { setSaving(false); }
  };

  const addMemo = async () => {
    if (!currentUserId) { alert("상단에서 현재 사용자를 선택하세요."); return; }
    if (!memo.trim() || memoBusy) return;   // 연타 중복 등록 방지
    setMemoBusy(true);
    try {
    const r = await fetch("/api/work/posts", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ authorId: currentUserId, content: memo.trim(), important: true }),
    });
    const d = await r.json();
    if (!d.success) { alert(d.error ?? "등록 실패"); return; }
    setMemo("");
    loadImportant();
    } finally { setMemoBusy(false); }
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

  if (!currentUserId) {
    return (
      <div className="py-20 text-center text-gray-500">
        <p className="text-lg font-semibold">현재 사용자를 선택하세요</p>
        <p className="text-sm mt-1">우측 상단 [현재 사용자] 에서 본인을 선택하면 업무일지를 작성할 수 있습니다.</p>
      </div>
    );
  }

  const isToday = selectedDate === todayKst();
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
                  onKeyDown={e => { if (e.key === "Enter" && !e.nativeEvent.isComposing) addMemo(); }}
                  className="flex-1 px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400" />
                <button onClick={addMemo} className="px-2.5 py-1.5 bg-amber-500 text-white rounded-lg hover:bg-amber-600"><Send size={14} /></button>
              </div>
              {importantPosts.length === 0 ? (
                <p className="text-xs text-gray-400 py-2 text-center">중요 메모가 없습니다.</p>
              ) : (showAllMemo ? importantPosts : importantPosts.slice(0, MEMO_PREVIEW)).map(p => (
                <div key={p.id} className="text-xs border border-amber-100 bg-amber-50/40 rounded-lg px-2.5 py-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold" style={{ color: p.author.color || "#374151" }}>{p.author.name}</span>
                    <div className="flex items-center gap-1">
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
              {/* 메모가 쌓이면 화면을 다 덮으므로 기본 5건만 — 오래된 건은 작성자가 '보관' 으로 내린다 */}
              {importantPosts.length > MEMO_PREVIEW && (
                <button onClick={() => setShowAllMemo(v => !v)}
                  className="w-full py-1 text-[11px] text-amber-700 hover:bg-amber-50 rounded">
                  {showAllMemo ? "접기" : `+ ${importantPosts.length - MEMO_PREVIEW}건 더 보기`}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* 오른쪽: 어제 / 오늘 / 내일 + 공유받은 내용 */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-700">{fmtDate(selectedDate)} {isToday && <span className="ml-1 text-[11px] text-indigo-600 font-bold">오늘</span>}</span>
            <button onClick={save} disabled={saving || loadedKey !== key || (!dirty && !seeded && !yesterdayDirty)}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40">
              <Save size={14} /> {saving ? "저장 중…" : (dirty || seeded || yesterdayDirty) ? "저장" : "저장됨"}
            </button>
          </div>

          {loadError && (
            <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
              {loadError}
            </div>
          )}
          {draftFound && (
            <div className="px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-700">
              저장하지 않았던 작성분을 복구했습니다. 확인 후 <b>저장</b>하세요.
            </div>
          )}

          {/* 직전 근무일 (편집 가능 — 그 날짜에 저장) */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-4 py-2 border-b border-gray-100 bg-gray-50 text-xs font-bold text-gray-500">
              직전 업무내용{" "}
              <span className="ml-1 font-normal text-gray-400">
                {prevDate ? `${fmtDateTitle(prevDate)} · 여기서 수정하면 그 날짜에 저장` : "이전 작성 일지 없음"}
              </span>
            </div>
            <WorkJournalLineEditor value={yesterdayWork} onChange={v => {
                setYesterdayWork(v); setYesterdayDirty(true);
                // 오늘 칸이 아직 '자동 이어받기' 상태(사용자 미편집)면 바뀐 직전 내용으로 다시 계산
                if (seeded && !dirty) { const sl = buildSeed(v, prevPlan); setTodayWork(sl.join("\n")); setSeeded(sl.length > 0); }
              }}
              placeholder="직전 근무일 업무내용. Enter로 줄 추가, 줄 앞 ● 로 상태 표시."
              mentionUsers={others} />
          </div>

          {/* 오늘 (편집) */}
          <div className="bg-white border-2 border-indigo-200 rounded-lg overflow-hidden">
            <div className="px-4 py-2 border-b border-indigo-100 bg-indigo-50 text-xs font-bold text-indigo-700">오늘 업무내용 <span className="ml-1 font-normal text-indigo-400">{fmtDateTitle(selectedDate)}</span> <span className="ml-1 font-normal text-gray-400">· 줄 앞 ● 클릭해 완료/진행중/중요</span></div>
            {seeded && (
              <div className="px-3 py-1.5 bg-amber-50 border-b border-amber-100 text-[11px] text-amber-700">전일 <b>진행중</b> 업무 + 내일계획을 자동으로 가져왔습니다. 확인·수정 후 <b>저장</b>하면 오늘 업무로 확정됩니다. (진행중은 완료/다른 상태로 바꾸기 전까지 매일 이어집니다)</div>
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

          {/* 내 일지에 달린 댓글 — 팀장·동료 피드백 (대시보드에서만 보이던 것을 작성자에게도 노출) */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-4 py-2 border-b border-gray-100 bg-gray-50 text-xs font-bold text-gray-500 flex items-center gap-1.5">
              <MessageSquare size={13} className="text-emerald-500" /> 내 일지에 달린 댓글
              <span className="text-gray-400 font-normal">({fmtDate(selectedDate)})</span>
              {myComments.length > 0 && (
                <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-bold">{myComments.length}</span>
              )}
            </div>
            <div className="p-3 space-y-2">
              {myComments.length === 0 ? (
                <p className="text-xs text-gray-400 py-2 text-center">이 날 받은 댓글이 없습니다.</p>
              ) : myComments.map(c => (
                <div key={c.id} className="text-xs border border-emerald-100 bg-emerald-50/30 rounded-lg px-2.5 py-1.5">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="font-semibold" style={{ color: c.author.color || "#374151" }}>{c.author.name}</span>
                    <span className="text-[10px] text-gray-400">{fmtTime(c.createdAt)}</span>
                  </div>
                  <div className="text-gray-700 whitespace-pre-wrap break-words"><MentionText content={c.content} /></div>
                </div>
              ))}
            </div>
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

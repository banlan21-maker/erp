"use client";

/**
 * 업무관리 알림 벨 — 나에게 온 댓글·@소환을 한곳에서 확인.
 *
 * 지금까지는 내 일지에 달린 댓글이 대시보드의 그 날짜 카드에만 있었고, 남이 나를 @소환한 줄도
 * 그 날짜 일지를 직접 열어야만 보였다 → 놓치기 쉬움. 상단에 미확인 개수를 띄운다.
 *
 * '읽음' 은 서버 스키마 변경 없이 localStorage(마지막 확인 시각)로 관리한다 —
 * 브라우저별로 따로 계산되지만, 개인 PC 사용 환경이라 실사용에 문제 없음.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, MessageSquare, AtSign, Star, Check } from "lucide-react";
import { useWorkUser } from "@/components/work-user-context";
import { confirmLeaveIfUnsaved } from "@/lib/unsaved-guard";

interface InboxItem {
  kind: "comment" | "post" | "mention";
  id: string;
  at: string;
  authorName: string;
  authorColor: string | null;
  text: string;
  date?: string;
}

const SEEN_KEY = (uid: string) => `workInboxSeen:${uid}`;
const POLL_MS = 60_000;

const fmtAt = (iso: string) => {
  const d = new Date(iso), now = Date.now(), diff = now - d.getTime();
  if (diff < 60_000) return "방금";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}분 전`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}시간 전`;
  return d.toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
};

const KIND_META = {
  comment: { icon: MessageSquare, color: "text-emerald-500", label: "내 일지 댓글" },
  mention: { icon: AtSign,        color: "text-indigo-500",  label: "일지 @소환" },
  post:    { icon: Star,          color: "text-amber-500",   label: "중요메모 @소환" },
} as const;

export default function WorkInboxBell() {
  const { currentUserId } = useWorkUser();
  const router = useRouter();
  const [items, setItems] = useState<InboxItem[]>([]);
  const [seen, setSeen] = useState<string>("");   // ISO
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);

  // 사용자 전환 시 그 사용자의 마지막 확인 시각 로드 (처음이면 7일 전 = 전부 미확인 아님)
  useEffect(() => {
    if (!currentUserId) { setItems([]); setSeen(""); return; }
    let s = "";
    try { s = localStorage.getItem(SEEN_KEY(currentUserId)) ?? ""; } catch { /* 무시 */ }
    setSeen(s || new Date(Date.now() - 7 * 86400000).toISOString());
  }, [currentUserId]);

  const load = useCallback(async (uid: string, signal?: AbortSignal) => {
    const r = await fetch(`/api/work/inbox?userId=${uid}&days=7`, { signal })
      .then(res => res.json()).catch(() => ({}));
    if (signal?.aborted) return;
    if (r.success) setItems(r.data);
  }, []);

  useEffect(() => {
    if (!currentUserId) return;
    const uid = currentUserId;
    const ctrl = new AbortController();
    load(uid, ctrl.signal);
    const t = setInterval(() => { if (!document.hidden) load(uid); }, POLL_MS);
    return () => { ctrl.abort(); clearInterval(t); };
  }, [currentUserId, load]);

  // 바깥 클릭으로 닫기
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  if (!currentUserId) return null;

  const unread = items.filter(i => i.at > seen);
  const markAllRead = () => {
    const now = new Date().toISOString();
    setSeen(now);
    try { localStorage.setItem(SEEN_KEY(currentUserId), now); } catch { /* 무시 */ }
  };
  const go = (it: InboxItem) => {
    if (!confirmLeaveIfUnsaved()) return;
    setOpen(false);
    markAllRead();
    router.push(it.date ? `/work/journal?date=${it.date}` : "/work/dashboard");
  };

  return (
    <div className="relative" ref={boxRef}>
      <button
        onClick={() => setOpen(o => !o)}
        title="나에게 온 댓글·@소환"
        className="relative p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
      >
        <Bell size={17} />
        {unread.length > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[15px] h-[15px] px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
            {unread.length > 99 ? "99+" : unread.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-1.5 w-[360px] max-h-[70vh] overflow-auto bg-white border border-gray-200 rounded-xl shadow-2xl z-50">
          <div className="sticky top-0 px-3 py-2 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
            <span className="text-xs font-bold text-gray-600">
              알림 <span className="text-gray-400 font-normal">최근 7일</span>
              {unread.length > 0 && <span className="ml-1.5 text-red-500">미확인 {unread.length}</span>}
            </span>
            {unread.length > 0 && (
              <button onClick={markAllRead} className="inline-flex items-center gap-1 text-[11px] text-indigo-600 hover:underline">
                <Check size={11} /> 모두 읽음
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <p className="py-8 text-center text-xs text-gray-400">최근 7일간 받은 알림이 없습니다.</p>
          ) : (
            <ul className="divide-y divide-gray-50">
              {items.map(it => {
                const meta = KIND_META[it.kind];
                const Icon = meta.icon;
                const isNew = it.at > seen;
                return (
                  <li key={it.id}>
                    <button onClick={() => go(it)}
                      className={`w-full text-left px-3 py-2 hover:bg-gray-50 flex gap-2 ${isNew ? "bg-indigo-50/40" : ""}`}>
                      <Icon size={13} className={`${meta.color} mt-0.5 shrink-0`} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 text-[11px]">
                          <span className="font-bold" style={{ color: it.authorColor || "#374151" }}>{it.authorName}</span>
                          <span className="text-gray-400">{meta.label}</span>
                          {it.date && <span className="text-gray-300">{it.date.slice(5)}</span>}
                          <span className="ml-auto text-gray-300 shrink-0">{fmtAt(it.at)}</span>
                          {isNew && <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />}
                        </div>
                        <div className="text-xs text-gray-700 mt-0.5 line-clamp-2 break-words">{it.text}</div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

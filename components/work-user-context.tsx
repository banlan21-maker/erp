"use client";

/**
 * 업무관리 현재 사용자 — 로그인 없이 "사용자 선택"(localStorage) 방식.
 * work 모듈 레이아웃에서 Provider 로 감싸고, 각 페이지가 useWorkUser() 로 현재 사용자 사용.
 */

import { createContext, useCallback, useContext, useEffect, useState } from "react";

export interface WorkUser {
  id: string;
  name: string;
  dept: string | null;
  color: string | null;
  active: boolean;
}

interface Ctx {
  users: WorkUser[];
  currentUserId: string | null;
  currentUser: WorkUser | null;
  setCurrentUserId: (id: string | null) => void;
  reloadUsers: () => Promise<void>;
  loading: boolean;
}

const C = createContext<Ctx | null>(null);
const KEY = "workUserId";

export function WorkUserProvider({ children }: { children: React.ReactNode }) {
  const [users, setUsers] = useState<WorkUser[]>([]);
  const [currentUserId, setCurrentUserIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reloadUsers = useCallback(async () => {
    const r = await fetch("/api/work/users").then(r => r.json()).catch(() => ({}));
    if (r.success) setUsers(r.data);
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const r = await fetch("/api/work/users").then(r => r.json()).catch(() => ({}));
        const list: WorkUser[] = r.success ? r.data : [];
        setUsers(list);
        const saved = typeof window !== "undefined" ? localStorage.getItem(KEY) : null;
        if (saved && list.some(u => u.id === saved)) setCurrentUserIdState(saved);
      } finally { setLoading(false); }
    })();
  }, []);

  const setCurrentUserId = useCallback((id: string | null) => {
    setCurrentUserIdState(id);
    try { if (id) localStorage.setItem(KEY, id); else localStorage.removeItem(KEY); } catch { /* 무시 */ }
  }, []);

  const currentUser = users.find(u => u.id === currentUserId) ?? null;

  return (
    <C.Provider value={{ users, currentUserId, currentUser, setCurrentUserId, reloadUsers, loading }}>
      {children}
    </C.Provider>
  );
}

export function useWorkUser(): Ctx {
  const v = useContext(C);
  if (!v) throw new Error("useWorkUser must be used within WorkUserProvider");
  return v;
}

/** 현재 사용자 선택 드롭다운 */
export function WorkUserPicker() {
  const { users, currentUserId, setCurrentUserId } = useWorkUser();
  const active = users.filter(u => u.active);
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-500 whitespace-nowrap">현재 사용자</span>
      <select
        value={currentUserId ?? ""}
        onChange={e => setCurrentUserId(e.target.value || null)}
        className="px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg bg-white font-medium focus:outline-none focus:ring-2 focus:ring-indigo-400"
      >
        <option value="">— 선택 —</option>
        {active.map(u => <option key={u.id} value={u.id}>{u.name}{u.dept ? ` · ${u.dept}` : ""}</option>)}
      </select>
    </div>
  );
}

/** @멘션 강조 렌더 — parseMentions 와 동일 규칙(등록 사용자·긴 이름 우선)으로 실제 멘션만 강조 */
export function MentionText({ content }: { content: string }) {
  const { users } = useWorkUser();
  const sorted = [...users].filter(u => u.name).sort((a, b) => b.name.length - a.name.length);
  const parts: { t: string; m: boolean }[] = [];
  let buf = "";
  for (let i = 0; i < content.length; ) {
    if (content[i] === "@") {
      const u = sorted.find(x => content.startsWith(x.name, i + 1));
      if (u) {
        if (buf) { parts.push({ t: buf, m: false }); buf = ""; }
        parts.push({ t: `@${u.name}`, m: true });
        i += 1 + u.name.length;
        continue;
      }
    }
    buf += content[i];
    i++;
  }
  if (buf) parts.push({ t: buf, m: false });
  return (
    <>
      {parts.map((p, i) =>
        p.m
          ? <span key={i} className="text-indigo-600 font-semibold">{p.t}</span>
          : <span key={i}>{p.t}</span>
      )}
    </>
  );
}

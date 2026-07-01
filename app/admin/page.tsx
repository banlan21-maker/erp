"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, KeyRound, UserPlus, Trash2, LogOut, Loader2, Users } from "lucide-react";

const MODULES = [
  { key: "cutpart",    label: "절단파트" },
  { key: "supply",     label: "구매/자재파트" },
  { key: "management", label: "관리파트" },
  { key: "work",       label: "업무관리" },
] as const;

interface Me { id: string; username: string; name: string | null; isAdmin: boolean; permissions: string[] }
interface Account { id: string; username: string; name: string | null; isAdmin: boolean; permissions: string[]; createdAt: string }

export default function AdminPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    (async () => {
      const r = await fetch("/api/admin/me").then(r => r.json()).catch(() => ({ success: false }));
      if (!r.success || !r.user?.isAdmin) { router.replace("/"); return; }
      setMe(r.user);
      setChecking(false);
    })();
  }, [router]);

  const logout = async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    router.replace("/");
  };

  if (checking) {
    return <div className="min-h-screen flex items-center justify-center text-gray-400"><Loader2 className="animate-spin mr-2" size={18} /> 확인 중...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="sticky top-0 z-10 bg-white border-b border-gray-200 px-4 sm:px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck size={20} className="text-blue-600" />
          <h1 className="font-bold text-gray-900">관리자 페이지</h1>
          <span className="text-xs text-gray-400 ml-1 hidden sm:inline">시스템 계정·권한 관리</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500">{me?.name || me?.username} 님</span>
          <button onClick={logout} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
            <LogOut size={13} /> 로그아웃
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
        <PasswordCard />
        <AccountsCard />
      </main>
    </div>
  );
}

/* ── 비밀번호 변경 ─────────────────────────────────────────── */
function PasswordCard() {
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const submit = async () => {
    setMsg(null);
    if (next !== confirm) { setMsg({ ok: false, text: "새 비밀번호가 일치하지 않습니다." }); return; }
    if (next.length < 4) { setMsg({ ok: false, text: "새 비밀번호는 4자 이상이어야 합니다." }); return; }
    setBusy(true);
    try {
      const r = await fetch("/api/admin/password", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: cur, newPassword: next }),
      }).then(r => r.json());
      if (!r.success) { setMsg({ ok: false, text: r.error ?? "변경 실패" }); return; }
      setMsg({ ok: true, text: "비밀번호가 변경되었습니다." });
      setCur(""); setNext(""); setConfirm("");
    } finally { setBusy(false); }
  };

  return (
    <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center gap-2">
        <KeyRound size={16} className="text-amber-500" />
        <h2 className="text-sm font-bold text-gray-700">내 비밀번호 변경</h2>
      </div>
      <div className="p-4 space-y-3 max-w-sm">
        <input type="password" value={cur} onChange={e => setCur(e.target.value)} placeholder="현재 비밀번호"
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400" />
        <input type="password" value={next} onChange={e => setNext(e.target.value)} placeholder="새 비밀번호 (4자 이상)"
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400" />
        <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="새 비밀번호 확인"
          onKeyDown={e => { if (e.key === "Enter") submit(); }}
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400" />
        {msg && <p className={`text-xs ${msg.ok ? "text-green-600" : "text-red-600"}`}>{msg.text}</p>}
        <button onClick={submit} disabled={busy} className="px-4 py-2 bg-amber-500 text-white text-sm font-semibold rounded-lg hover:bg-amber-600 disabled:opacity-50">
          {busy ? "변경 중..." : "비밀번호 변경"}
        </button>
      </div>
    </section>
  );
}

/* ── 계정 생성 + 목록 ──────────────────────────────────────── */
function AccountsCard() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [perms, setPerms] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/accounts").then(r => r.json()).catch(() => ({ success: false }));
    if (r.success) setAccounts(r.data);
  }, []);
  useEffect(() => { load(); }, [load]);

  const togglePerm = (k: string) => setPerms(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n; });

  const create = async () => {
    setMsg(null);
    setBusy(true);
    try {
      const r = await fetch("/api/admin/accounts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, name, permissions: [...perms] }),
      }).then(r => r.json());
      if (!r.success) { setMsg({ ok: false, text: r.error ?? "생성 실패" }); return; }
      setMsg({ ok: true, text: `계정 '${r.data.username}' 생성됨.` });
      setUsername(""); setPassword(""); setName(""); setPerms(new Set());
      load();
    } finally { setBusy(false); }
  };

  const remove = async (a: Account) => {
    if (!confirm(`계정 '${a.username}' 을(를) 삭제하시겠습니까?`)) return;
    const r = await fetch(`/api/admin/accounts/${a.id}`, { method: "DELETE" }).then(r => r.json()).catch(() => ({ success: false }));
    if (!r.success) { alert(r.error ?? "삭제 실패"); return; }
    load();
  };

  const labelOf = (k: string) => MODULES.find(m => m.key === k)?.label ?? k;

  return (
    <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center gap-2">
        <UserPlus size={16} className="text-blue-500" />
        <h2 className="text-sm font-bold text-gray-700">계정(아이디) 생성</h2>
      </div>
      <div className="p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <input value={username} onChange={e => setUsername(e.target.value)} placeholder="아이디 (영문/숫자 3~20자)"
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400" />
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="비밀번호 (4자 이상)"
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400" />
          <input value={name} onChange={e => setName(e.target.value)} placeholder="이름 (선택)"
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400" />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-semibold text-gray-500">접근 권한:</span>
          {MODULES.map(m => (
            <label key={m.key} className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer">
              <input type="checkbox" checked={perms.has(m.key)} onChange={() => togglePerm(m.key)} className="accent-blue-600" />
              {m.label}
            </label>
          ))}
        </div>
        {msg && <p className={`text-xs ${msg.ok ? "text-green-600" : "text-red-600"}`}>{msg.text}</p>}
        <button onClick={create} disabled={busy} className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 inline-flex items-center gap-1.5">
          <UserPlus size={15} /> {busy ? "생성 중..." : "계정 생성"}
        </button>
      </div>

      <div className="px-4 py-3 border-t border-gray-200 bg-gray-50 flex items-center gap-2">
        <Users size={16} className="text-gray-500" />
        <h2 className="text-sm font-bold text-gray-700">계정 목록 <span className="text-gray-400 font-normal">({accounts.length})</span></h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs">
            <tr>
              <th className="px-4 py-2 text-left">아이디</th>
              <th className="px-4 py-2 text-left">이름</th>
              <th className="px-4 py-2 text-left">권한</th>
              <th className="px-4 py-2 text-right">관리</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {accounts.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-400">계정이 없습니다.</td></tr>
            ) : accounts.map(a => (
              <tr key={a.id} className="hover:bg-gray-50">
                <td className="px-4 py-2 font-medium text-gray-800">
                  {a.username}
                  {a.isAdmin && <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-semibold">관리자</span>}
                </td>
                <td className="px-4 py-2 text-gray-600">{a.name || "-"}</td>
                <td className="px-4 py-2">
                  {a.isAdmin ? <span className="text-xs text-gray-500">전체</span> : (
                    a.permissions.length === 0
                      ? <span className="text-xs text-gray-400">없음</span>
                      : <span className="flex flex-wrap gap-1">{a.permissions.map(p => <span key={p} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">{labelOf(p)}</span>)}</span>
                  )}
                </td>
                <td className="px-4 py-2 text-right">
                  {a.username === "admin"
                    ? <span className="text-[11px] text-gray-300">기본계정</span>
                    : <button onClick={() => remove(a)} className="text-gray-400 hover:text-red-500"><Trash2 size={15} /></button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

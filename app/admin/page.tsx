"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, KeyRound, UserPlus, Trash2, LogOut, Loader2, Users, SlidersHorizontal, X, Activity } from "lucide-react";
import PermissionMatrix from "@/components/permission-matrix";

interface Me { id: string; username: string; name: string | null; isAdmin: boolean; permissions: string[] }
interface Account { id: string; username: string; name: string | null; isAdmin: boolean; permissions: string[]; createdAt: string }

// 토큰 배열 → "메뉴 N개" 요약 (액션 무관, 접근 가능한 서브메뉴 수)
const resourceCount = (perms: string[]) => new Set(perms.map(p => p.split(":")[0])).size;

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
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 text-xs text-amber-800">
          ⚠ 현재 권한은 <b>저장·표시만</b> 됩니다. 실제 접근 차단(로그인 필수화 + 페이지/API 강제)은 아직 꺼져 있으며, 준비되면 활성화합니다.
        </div>
        <IntegrityCard />
        <PasswordCard />
        <AccountsCard />
      </main>
    </div>
  );
}

/* ── 강재↔판번호 정합성 진단 ─────────────────────────────── */
interface IntegrityReport {
  totals: { steelPlans: number; steelPlanHeats: number; completedCutLogs: number; activeShipItems: number };
  summary: {
    dupCutLogs: number; heatMissedFlip: number; heatStaleCut: number; specStatusMismatch: number; dupWaitingHeat: number;
    orphanHeats: number; ghostReserved: number;
  };
}
function IntegrityCard() {
  const [data, setData] = useState<IntegrityReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const run = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/steel-plan/integrity", { cache: "no-store" }).then(r => r.json());
      if (r.error) { setErr(r.error); return; }
      setData(r as IntegrityReport);
    } catch { setErr("서버 오류"); } finally { setBusy(false); }
  };

  const tiles: { key: keyof IntegrityReport["summary"]; label: string }[] = [
    { key: "heatMissedFlip",     label: "전환누락" },
    { key: "specStatusMismatch", label: "사양 수량 불일치" },
    { key: "dupCutLogs",         label: "판번호 중복절단" },
    { key: "heatStaleCut",       label: "유령 절단/외부" },
    { key: "dupWaitingHeat",     label: "재고 판번호 중복행" },
  ];

  return (
    <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center gap-2">
        <Activity size={16} className="text-emerald-500" />
        <h2 className="text-sm font-bold text-gray-700">강재↔판번호 정합성 진단</h2>
        <span className="text-xs text-gray-400 ml-1 hidden sm:inline">강재전체목록·판번호리스트·작업일보·출고 대조 (읽기전용)</span>
      </div>
      <div className="p-4 space-y-3">
        <div className="flex items-center gap-3">
          <button onClick={run} disabled={busy}
            className="px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-50 inline-flex items-center gap-1.5">
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Activity size={15} />} {busy ? "진단 중..." : "진단 실행"}
          </button>
          <a href="/cutpart/steel-plan/integrity" className="text-xs text-blue-600 hover:underline">상세 페이지 열기 →</a>
        </div>
        {err && <p className="text-xs text-red-600">{err}</p>}
        {data && (
          <>
            <p className="text-xs text-gray-400">
              강재 {data.totals.steelPlans} · 판번호 {data.totals.steelPlanHeats} · 절단완료 작업일보 {data.totals.completedCutLogs} · 활성출고 {data.totals.activeShipItems}
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {tiles.map(t => (
                <div key={t.key} className="border border-gray-200 rounded-lg p-2.5 text-center">
                  <div className={`text-xl font-bold ${data.summary[t.key] > 0 ? "text-red-600" : "text-gray-300"}`}>{data.summary[t.key]}</div>
                  <div className="text-[10px] text-gray-500 mt-0.5 leading-tight">{t.label}</div>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-gray-400">건수가 0이 아니면 상세 페이지에서 어느 사양·판번호인지 확인할 수 있습니다.</p>

            <div className="pt-2 border-t border-gray-100">
              <p className="text-[11px] font-semibold text-gray-600 mb-1.5">🧹 안전 정리 대상 <span className="font-normal text-gray-400">— 어디에도 안 붙은 값 (지워도 문제 없음)</span></p>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { key: "orphanHeats" as const,   label: "유령 판번호", desc: "강재목록에 대응 사양 없는 판번호" },
                  { key: "ghostReserved" as const, label: "유령 확정",   desc: "존재하지 않는 블록에 확정된 강재" },
                ]).map(t => (
                  <div key={t.key} className="border border-gray-200 rounded-lg p-2.5 text-center">
                    <div className={`text-xl font-bold ${data.summary[t.key] > 0 ? "text-amber-600" : "text-gray-300"}`}>{data.summary[t.key]}</div>
                    <div className="text-[10px] font-medium text-gray-600 mt-0.5">{t.label}</div>
                    <div className="text-[9px] text-gray-400 leading-tight">{t.desc}</div>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-gray-400 mt-1">0이면 정리할 것 없음. 건수가 있으면 관리자에게 알려주시면 안전하게 정리됩니다(되돌리기 로그 유지).</p>
            </div>
          </>
        )}
      </div>
    </section>
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

/* ── 계정 생성 + 목록 + 권한 편집 ──────────────────────────── */
function AccountsCard() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [perms, setPerms] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [editing, setEditing] = useState<Account | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/accounts").then(r => r.json()).catch(() => ({ success: false }));
    if (r.success) setAccounts(r.data);
  }, []);
  useEffect(() => { load(); }, [load]);

  const create = async () => {
    setMsg(null);
    setBusy(true);
    try {
      const r = await fetch("/api/admin/accounts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, name, permissions: perms }),
      }).then(r => r.json());
      if (!r.success) { setMsg({ ok: false, text: r.error ?? "생성 실패" }); return; }
      setMsg({ ok: true, text: `계정 '${r.data.username}' 생성됨.` });
      setUsername(""); setPassword(""); setName(""); setPerms([]);
      load();
    } finally { setBusy(false); }
  };

  const remove = async (a: Account) => {
    if (!confirm(`계정 '${a.username}' 을(를) 삭제하시겠습니까?`)) return;
    const r = await fetch(`/api/admin/accounts/${a.id}`, { method: "DELETE" }).then(r => r.json()).catch(() => ({ success: false }));
    if (!r.success) { alert(r.error ?? "삭제 실패"); return; }
    load();
  };

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
        <div>
          <p className="text-xs font-semibold text-gray-500 mb-1.5">접근 권한 (메뉴·서브메뉴별 읽기/쓰기/수정)</p>
          <PermissionMatrix value={perms} onChange={setPerms} />
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
                <td className="px-4 py-2 text-gray-600">
                  {a.isAdmin ? <span className="text-xs text-gray-500">전체</span>
                    : resourceCount(a.permissions) === 0 ? <span className="text-xs text-gray-400">없음</span>
                    : <span className="text-xs">메뉴 {resourceCount(a.permissions)}개 · 토큰 {a.permissions.length}</span>}
                </td>
                <td className="px-4 py-2 text-right whitespace-nowrap">
                  {a.isAdmin ? <span className="text-[11px] text-gray-300">기본계정</span> : (
                    <span className="inline-flex items-center gap-2">
                      <button onClick={() => setEditing(a)} className="inline-flex items-center gap-1 text-blue-600 hover:underline text-xs">
                        <SlidersHorizontal size={13} /> 권한 편집
                      </button>
                      <button onClick={() => remove(a)} className="text-gray-400 hover:text-red-500"><Trash2 size={15} /></button>
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && <PermissionEditModal account={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </section>
  );
}

/* ── 계정별 권한 편집 모달 ─────────────────────────────────── */
function PermissionEditModal({ account, onClose, onSaved }: { account: Account; onClose: () => void; onSaved: () => void }) {
  const [perms, setPerms] = useState<string[]>(account.permissions);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      const r = await fetch(`/api/admin/accounts/${account.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissions: perms }),
      }).then(r => r.json());
      if (!r.success) { alert(r.error ?? "저장 실패"); return; }
      onSaved();
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
          <h3 className="font-bold text-gray-900 flex items-center gap-2">
            <SlidersHorizontal size={18} className="text-blue-600" /> 권한 편집 — {account.name || account.username}
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full text-gray-400"><X size={18} /></button>
        </div>
        <div className="p-4 overflow-y-auto">
          <PermissionMatrix value={perms} onChange={setPerms} />
        </div>
        <div className="px-5 py-3 border-t border-gray-200 flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">취소</button>
          <button onClick={save} disabled={busy} className="px-4 py-2 text-sm bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {busy ? "저장 중..." : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}

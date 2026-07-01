"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LogIn, Loader2, Lock } from "lucide-react";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}

function LoginInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get("next") || "/";

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (busy) return;
    setError("");
    if (!username.trim() || !password) { setError("아이디와 비밀번호를 입력하세요."); return; }
    setBusy(true);
    try {
      const r = await fetch("/api/admin/login", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const d = await r.json();
      if (!d.success) { setError(d.error ?? "로그인 실패"); return; }
      // 로그인 후 원래 가려던 페이지(next)로. 새로고침 경로로 이동해 미들웨어 통과.
      window.location.href = next.startsWith("/") ? next : "/";
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-5 bg-gray-900 text-white">
          <div className="flex items-center gap-2">
            <Lock size={18} className="text-amber-400" />
            <h1 className="font-bold text-lg">한국테크 ERP 로그인</h1>
          </div>
          <p className="text-xs text-gray-400 mt-1">CNC 절단 파트 · 사무실 시스템</p>
        </div>
        <div className="p-6 space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">아이디</label>
            <input value={username} onChange={e => setUsername(e.target.value)} autoFocus
              onKeyDown={e => { if (e.key === "Enter") submit(); }}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">비밀번호</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") submit(); }}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400" />
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button onClick={submit} disabled={busy}
            className="w-full py-2.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-1.5">
            {busy ? <Loader2 size={15} className="animate-spin" /> : <LogIn size={15} />} 로그인
          </button>
        </div>
      </div>
    </div>
  );
}

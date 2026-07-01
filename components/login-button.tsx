"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogIn, X, Loader2 } from "lucide-react";

/** 로그인 버튼 + 모달 — 성공 시 관리자 페이지(/admin)로 이동. */
export default function LoginButton({ className }: { className?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
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
      setOpen(false);
      setUsername(""); setPassword("");
      router.push("/admin");
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally { setBusy(false); }
  };

  return (
    <>
      <button
        onClick={() => { setError(""); setOpen(true); }}
        className={className ?? "inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"}
      >
        <LogIn size={13} /> 로그인
      </button>

      {open && (
        <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4"
          onMouseDown={e => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
              <h3 className="font-bold text-gray-900 flex items-center gap-2"><LogIn size={18} className="text-blue-600" /> 로그인</h3>
              <button onClick={() => setOpen(false)} className="p-1 hover:bg-gray-100 rounded-full text-gray-400"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-3">
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
                className="w-full py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-1.5">
                {busy ? <Loader2 size={15} className="animate-spin" /> : <LogIn size={15} />} 로그인
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

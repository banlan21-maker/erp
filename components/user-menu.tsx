"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, ShieldCheck, LogIn } from "lucide-react";

interface Me { username: string; name: string | null; isAdmin: boolean }

/** 로그인한 사용자 표시 + 로그아웃 (+ 관리자면 관리자 페이지 링크). 헤더/푸터 공용. */
export default function UserMenu() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/admin/me").then(r => r.json()).then(d => { if (d.success) setMe(d.user); })
      .catch(() => {}).finally(() => setLoaded(true));
  }, []);

  const logout = async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    window.location.href = "/login";
  };

  if (!loaded) return null;
  if (!me) {
    return (
      <a href="/login" className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
        <LogIn size={13} /> 로그인
      </a>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-600">{me.name || me.username} 님</span>
      {me.isAdmin && (
        <button onClick={() => router.push("/admin")}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50">
          <ShieldCheck size={13} /> 관리자
        </button>
      )}
      <button onClick={logout}
        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
        <LogOut size={13} /> 로그아웃
      </button>
    </div>
  );
}

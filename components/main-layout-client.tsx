"use client";

import { useState, useEffect } from "react";
import { ChevronRight } from "lucide-react";
import Sidebar from "@/components/sidebar";

type SidebarMode = "full" | "mini" | "hidden";

export default function MainLayoutClient({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<SidebarMode>("full");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("sidebarMode") as SidebarMode | null;
    if (saved) setMode(saved);
    setMounted(true);
  }, []);

  const setModeAndSave = (m: SidebarMode) => {
    setMode(m);
    localStorage.setItem("sidebarMode", m);
  };

  // 하이드레이션 불일치 방지: 마운트 전엔 full로 렌더
  const effectiveMode: SidebarMode = mounted ? mode : "full";

  return (
    <div className="flex min-h-screen">
      {/* 숨김 상태일 때 >> 버튼 */}
      {effectiveMode === "hidden" && (
        <button
          onClick={() => setModeAndSave("full")}
          className="fixed left-0 top-1/2 -translate-y-1/2 z-50 bg-gray-800 hover:bg-gray-700 text-white px-1.5 py-4 rounded-r-lg shadow-lg transition-colors"
          title="사이드바 열기"
        >
          <ChevronRight size={14} />
        </button>
      )}

      {effectiveMode !== "hidden" && (
        <Sidebar mode={effectiveMode} onModeChange={setModeAndSave} />
      )}

      <main className="flex-1 overflow-auto min-h-screen bg-gray-50">
        {children}
      </main>
    </div>
  );
}

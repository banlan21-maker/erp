"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import Sidebar, { ModuleType } from "@/components/sidebar";

type SidebarMode = "full" | "mini" | "hidden";

const moduleDashboardMap: Record<ModuleType, string> = {
  cnc: "/cutpart/dashboard",
  material: "/supply/dashboard",
  management: "/management/dashboard",
};

export default function MainLayoutClient({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [mode, setMode] = useState<SidebarMode>("full");
  const [activeModule, setActiveModule] = useState<ModuleType>("cnc");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const savedMode = localStorage.getItem("sidebarMode") as SidebarMode | null;
    const savedModule = localStorage.getItem("activeModule") as ModuleType | null;
    if (savedMode) setMode(savedMode);
    if (savedModule) setActiveModule(savedModule);
    setMounted(true);
  }, []);

  const setModeAndSave = (m: SidebarMode) => {
    setMode(m);
    localStorage.setItem("sidebarMode", m);
  };

  const setModuleAndSave = (mod: ModuleType) => {
    setActiveModule(mod);
    localStorage.setItem("activeModule", mod);
    router.push(moduleDashboardMap[mod]);
  };

  // 하이드레이션 불일치 방지
  const effectiveMode: SidebarMode = mounted ? mode : "full";

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 text-gray-900">
      {/* 상단 GNB */}
      <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 sticky top-0 z-40 shadow-sm">
        <div className="flex items-center gap-12">
          <div className="flex items-center pl-1 w-[220px] shrink-0">
            <span className="font-bold text-[19px] tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-blue-700 to-blue-500">
              한국테크 ERP 시스템
            </span>
          </div>
          
          <nav className="flex items-center gap-2 h-14">
            <button
              onClick={() => setModuleAndSave("cnc")}
              className={`px-4 h-full text-sm font-semibold transition-all relative ${
                activeModule === "cnc" 
                ? "text-blue-600 after:content-[''] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-blue-600" 
                : "text-gray-500 hover:text-gray-800 hover:bg-gray-50"
              }`}
            >
              절단 파트
            </button>
            <button
              onClick={() => setModuleAndSave("material")}
              className={`px-4 h-full text-sm font-semibold transition-all relative ${
                activeModule === "material" 
                ? "text-blue-600 after:content-[''] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-blue-600" 
                : "text-gray-500 hover:text-gray-800 hover:bg-gray-50"
              }`}
            >
              구매/자재 파트
            </button>
            <button
              onClick={() => setModuleAndSave("management")}
              className={`px-4 h-full text-sm font-semibold transition-all relative ${
                activeModule === "management" 
                ? "text-blue-600 after:content-[''] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-blue-600" 
                : "text-gray-500 hover:text-gray-800 hover:bg-gray-50"
              }`}
            >
              관리 파트
            </button>
          </nav>
        </div>

        <div className="flex items-center">
          <div className="text-right hidden sm:block">
            <p className="text-xs font-medium text-gray-600 tracking-tight">관리자 : <span className="font-bold text-gray-900">김남훈</span></p>
            <p className="text-[11px] text-gray-500 mt-0.5 tracking-tight">연락처 : <span className="font-medium text-gray-700">010-9704-5626</span></p>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* 숨김 상태일 때 >> 버튼 */}
        {effectiveMode === "hidden" && (
          <button
            onClick={() => setModeAndSave("full")}
            className="fixed left-0 top-1/2 -translate-y-1/2 z-50 bg-gray-900 hover:bg-gray-800 text-white px-1.5 py-4 rounded-r-lg shadow-xl transition-all border border-l-0 border-gray-700"
            title="사이드바 열기"
          >
            <ChevronRight size={14} />
          </button>
        )}

        {effectiveMode !== "hidden" && (
          <Sidebar 
            mode={effectiveMode} 
            onModeChange={setModeAndSave} 
            module={activeModule}
          />
        )}

        <main className="flex-1 overflow-auto bg-gray-50 relative">
          <div className="min-h-full p-6 md:p-8 max-w-[1600px] mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}


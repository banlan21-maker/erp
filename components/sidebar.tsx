"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, FolderOpen, FileSpreadsheet, ClipboardList,
  Users, BarChart2, ChevronLeft, ChevronRight, Menu, Smartphone,
  ExternalLink,
} from "lucide-react";

type SidebarMode = "full" | "mini" | "hidden";

const navItems = [
  { href: "/dashboard", label: "대시보드",      icon: LayoutDashboard },
  { href: "/workers",   label: "인원관리",      icon: Users },
  { href: "/projects",  label: "프로젝트",      icon: FolderOpen },
  { href: "/drawings",  label: "강재관리",      icon: FileSpreadsheet },
  { href: "/worklog",   label: "작업일보",      icon: ClipboardList },
  { href: "/reports",   label: "보고서",        icon: BarChart2 },
];

interface SidebarProps {
  mode: SidebarMode;
  onModeChange: (m: SidebarMode) => void;
}

export default function Sidebar({ mode, onModeChange }: SidebarProps) {
  const pathname = usePathname();

  const cycle = () => {
    if (mode === "full")   onModeChange("mini");
    else if (mode === "mini") onModeChange("hidden");
    else onModeChange("full");
  };

  if (mode === "hidden") return null;

  const isMini = mode === "mini";

  return (
    <aside
      className={`
        flex-shrink-0 min-h-screen bg-gray-900 text-gray-100 flex flex-col transition-all duration-200
        ${isMini ? "w-14" : "w-56"}
      `}
    >
      {/* 로고 */}
      <div className={`border-b border-gray-700 flex items-center ${isMini ? "justify-center px-0 py-4" : "px-5 py-5"}`}>
        {isMini ? (
          <span className="text-blue-400 font-bold text-sm">CNC</span>
        ) : (
          <div>
            <p className="text-xs text-gray-400 font-medium">CNC 절단 파트</p>
            <h1 className="text-base font-bold text-white mt-0.5">ERP 시스템</h1>
          </div>
        )}
      </div>

      {/* 메인 내비게이션 */}
      <nav className="flex-1 px-2 py-4 space-y-1">
        {navItems.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              title={isMini ? label : undefined}
              className={`
                flex items-center gap-3 rounded-lg text-sm font-medium transition-colors
                ${isMini ? "justify-center px-0 py-2.5" : "px-3 py-2"}
                ${isActive
                  ? "bg-blue-600 text-white"
                  : "text-gray-300 hover:bg-gray-800 hover:text-white"}
              `}
            >
              <Icon size={18} className="flex-shrink-0" />
              {!isMini && label}
            </Link>
          );
        })}

        {/* 구분선 + 현장 작업일보 */}
        <div className="pt-2 mt-2 border-t border-gray-700">
          <a
            href="/field/worklog"
            target="_blank"
            rel="noopener noreferrer"
            title={isMini ? "현장 작업일보 (새창)" : undefined}
            className={`
              flex items-center gap-3 rounded-lg text-sm font-medium transition-colors
              text-emerald-400 hover:bg-gray-800 hover:text-emerald-300
              ${isMini ? "justify-center px-0 py-2.5" : "px-3 py-2"}
            `}
          >
            <Smartphone size={18} className="flex-shrink-0" />
            {!isMini && (
              <span className="flex-1 flex items-center justify-between">
                현장 작업일보
                <ExternalLink size={12} className="opacity-60" />
              </span>
            )}
          </a>
        </div>
      </nav>

      {/* 하단: 토글 + 버전 */}
      <div className={`border-t border-gray-700 ${isMini ? "px-0 py-3 flex justify-center" : "px-5 py-3 flex items-center justify-between"}`}>
        {!isMini && <p className="text-xs text-gray-500">Phase 1-A · v0.1.0</p>}
        <button
          onClick={cycle}
          title={isMini ? "사이드바 최대화" : "사이드바 최소화"}
          className="text-gray-500 hover:text-gray-300 transition-colors p-1 rounded"
        >
          {isMini ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
        </button>
      </div>
    </aside>
  );
}

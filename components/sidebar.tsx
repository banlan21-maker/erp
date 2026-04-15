"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, FolderOpen, FileSpreadsheet, ClipboardList,
  Users, BarChart2, ChevronLeft, ChevronRight, Smartphone,
  ExternalLink, Package, Truck, History, CalendarDays, Eye, Wrench,
  UtensilsCrossed, Archive, Zap, List, PlusCircle,
} from "lucide-react";
import type { ComponentType } from "react";

export type ModuleType = "cnc" | "material" | "management" | "schedule";

type SidebarMode = "full" | "mini" | "hidden";

interface SidebarProps {
  mode: SidebarMode;
  onModeChange: (m: SidebarMode) => void;
  module: ModuleType;
}

type MenuLink  = { kind?: "link"; href: string; label: string; icon: ComponentType<{ size?: number; className?: string }> };
type MenuGroup = { kind: "group"; label: string; icon: ComponentType<{ size?: number; className?: string }>; children: { href: string; label: string; icon: ComponentType<{ size?: number; className?: string }> }[] };
type MenuItem  = MenuLink | MenuGroup;

const menuGroups: Record<string, MenuItem[]> = {
  cnc: [
    { href: "/cutpart/dashboard",  label: "절단 대시보드", icon: LayoutDashboard },
    { href: "/cutpart/steel-plan", label: "강재입고관리",  icon: ClipboardList },
    { href: "/cutpart/projects",   label: "프로젝트",      icon: FolderOpen },
    { href: "/cutpart/scrap",      label: "잔재관리",      icon: Archive },
    { kind: "group", label: "돌발작업", icon: Zap, children: [
      { href: "/cutpart/urgent/register", label: "돌발등록",   icon: PlusCircle },
      { href: "/cutpart/urgent/list",     label: "돌발리스트", icon: List },
    ]},
    { href: "/cutpart/worklog",    label: "작업일보",      icon: ClipboardList },
    { href: "/cutpart/reports",    label: "보고서",        icon: BarChart2 },
  ],
  schedule: [
    { href: "/cutpart/schedule",      label: "스케줄 생성", icon: CalendarDays },
    { href: "/cutpart/schedule/view", label: "스케줄 확인", icon: Eye },
  ],
  material: [
    { href: "/supply/dashboard",   label: "구매/자재 대시보드", icon: LayoutDashboard },
    { href: "/supply/inventory",   label: "재고관리",           icon: Package },
    { href: "/supply/history",     label: "입출고 이력/등록",   icon: ClipboardList },
    { href: "/supply/stats",       label: "월별 통계",          icon: BarChart2 },
  ],
  management: [
    { href: "/management/dashboard",  label: "관리 대시보드", icon: LayoutDashboard },
    { href: "/management/workers",    label: "인원관리",      icon: Users },
    { href: "/management/equipment",  label: "장비관리",      icon: Wrench },
    { href: "/management/transport",  label: "운송관리",      icon: Truck },
    { href: "/management/vendors",    label: "거래처 관리",   icon: Package },
    { href: "/meal",                  label: "식수 관리",     icon: UtensilsCrossed },
  ],
};

export default function Sidebar({ mode, onModeChange, module }: SidebarProps) {
  const pathname = usePathname();
  const items = menuGroups[module] || menuGroups.cnc;

  const cycle = () => {
    if (mode === "full")        onModeChange("mini");
    else if (mode === "mini")   onModeChange("hidden");
    else                        onModeChange("full");
  };

  if (mode === "hidden") return null;

  const isMini = mode === "mini";

  // 링크 활성 여부 (그룹 children 제외한 flat 링크 목록)
  const allLinks: string[] = items.flatMap(item =>
    item.kind === "group" ? item.children.map(c => c.href) : [item.href]
  );
  const isActive = (href: string) =>
    pathname === href ||
    (href !== "/cutpart/dashboard" &&
     pathname.startsWith(href) &&
     !allLinks.some(other => other !== href && other.startsWith(href) && pathname.startsWith(other)));

  let moduleLabel = "관리";
  if (module === "cnc")           moduleLabel = "CNC 절단";
  else if (module === "material") moduleLabel = "구매/자재";
  else if (module === "schedule") moduleLabel = "스케줄";

  let moduleShort = "MNG";
  if (module === "cnc")           moduleShort = "CNC";
  else if (module === "material") moduleShort = "MAT";
  else if (module === "schedule") moduleShort = "SCH";

  const linkClass = (href: string) => `
    flex items-center gap-3 rounded-lg text-sm font-medium transition-all duration-200
    ${isMini ? "justify-center px-0 py-2.5" : "px-3 py-2"}
    ${isActive(href)
      ? "bg-blue-600 text-white shadow-sm"
      : "text-gray-300 hover:bg-gray-800 hover:text-white"}
  `;

  return (
    <aside
      className={`
        flex-shrink-0 min-h-screen bg-gray-900 text-gray-100 flex flex-col transition-all duration-200
        ${isMini ? "w-14" : "w-56"}
      `}
    >
      {/* 로고 영역 */}
      <div className={`border-b border-gray-700 flex items-center ${isMini ? "justify-center px-0 py-4" : "px-5 py-5"}`}>
        {isMini ? (
          <span className="text-blue-400 font-bold text-sm tracking-tighter">{moduleShort}</span>
        ) : (
          <div>
            <p className="text-xs text-gray-400 font-medium tracking-wide uppercase">{moduleLabel} 파트</p>
            <h1 className="text-base font-bold text-white mt-0.5 tracking-tight text-nowrap">ERP 시스템</h1>
          </div>
        )}
      </div>

      {/* 내비게이션 */}
      <nav className="flex-1 px-2 py-4 space-y-1">
        {items.map((item) => {
          if (item.kind === "group") {
            const GroupIcon = item.icon;
            return (
              <div key={item.label}>
                {/* 그룹 헤더 (full 모드에서만) */}
                {!isMini && (
                  <div className="flex items-center gap-2 px-3 pt-2 pb-0.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                    <GroupIcon size={12} />
                    {item.label}
                  </div>
                )}
                {/* 그룹 자식 링크 */}
                {item.children.map((child) => {
                  const ChildIcon = child.icon;
                  return (
                    <Link
                      key={child.href}
                      href={child.href}
                      title={isMini ? child.label : undefined}
                      className={linkClass(child.href) + (isMini ? "" : " pl-6")}
                    >
                      <ChildIcon size={16} className="flex-shrink-0" />
                      {!isMini && <span>{child.label}</span>}
                    </Link>
                  );
                })}
              </div>
            );
          }

          // 일반 링크
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={isMini ? item.label : undefined}
              className={linkClass(item.href)}
            >
              <Icon size={18} className="flex-shrink-0" />
              {!isMini && <span>{item.label}</span>}
            </Link>
          );
        })}

        {/* CNC 모듈 - 현장 작업일보 링크 */}
        {module === "cnc" && (
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
        )}

        {/* 구매/자재 모듈 - 현장 입출고 링크 */}
        {module === "material" && (
          <div className="pt-2 mt-2 border-t border-gray-700">
            <a
              href="/field/supply"
              target="_blank"
              rel="noopener noreferrer"
              title={isMini ? "현장 입출고 (새창)" : undefined}
              className={`
                flex items-center gap-3 rounded-lg text-sm font-medium transition-colors
                text-emerald-400 hover:bg-gray-800 hover:text-emerald-300
                ${isMini ? "justify-center px-0 py-2.5" : "px-3 py-2"}
              `}
            >
              <Smartphone size={18} className="flex-shrink-0" />
              {!isMini && (
                <span className="flex-1 flex items-center justify-between">
                  현장 입출고
                  <ExternalLink size={12} className="opacity-60" />
                </span>
              )}
            </a>
          </div>
        )}
      </nav>

      {/* 하단: 토글 + 버전 */}
      <div className={`border-t border-gray-700 ${isMini ? "px-0 py-3 flex justify-center" : "px-5 py-3 flex items-center justify-between"}`}>
        {!isMini && <p className="text-xs text-gray-500">v0.1.0</p>}
        <button
          onClick={cycle}
          title={isMini ? "사이드바 최대화" : "사이드바 최소화"}
          className="text-gray-500 hover:text-gray-300 transition-colors p-1.5 hover:bg-gray-800 rounded-md"
        >
          {isMini ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
        </button>
      </div>
    </aside>
  );
}

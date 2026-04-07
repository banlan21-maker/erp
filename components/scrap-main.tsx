"use client";

import { useState } from "react";
import { Archive, PackagePlus, Package } from "lucide-react";
import { RemnantRegisterTab, RemnantManageTab } from "@/components/remnant-tabs";

interface ProjectOption {
  id: string;
  projectCode: string;
  projectName: string;
}

export default function ScrapMain({ projects }: { projects: ProjectOption[] }) {
  const [tab, setTab] = useState<"register" | "manage">("register");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Archive size={24} className="text-blue-600" />
          잔재관리
        </h2>
        <p className="text-sm text-gray-500 mt-0.5">현장잔재·여유원재·등록잔재를 등록하고 현황을 관리합니다.</p>
      </div>

      {/* 탭 */}
      <div className="flex border-b border-gray-200 gap-0">
        {[
          { key: "register", icon: <PackagePlus size={14} />, label: "잔재등록" },
          { key: "manage",   icon: <Package size={14} />,     label: "잔재리스트" },
        ].map(({ key, icon, label }) => (
          <button
            key={key}
            onClick={() => setTab(key as "register" | "manage")}
            className={`flex items-center gap-2 px-5 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              tab === key
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {icon} {label}
          </button>
        ))}
      </div>

      {tab === "register" && <RemnantRegisterTab projects={projects} />}
      {tab === "manage"   && <RemnantManageTab   projects={projects} />}
    </div>
  );
}

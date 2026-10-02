"use client";

import { useState } from "react";
import { FileBarChart } from "lucide-react";
import WeeklyReport from "@/components/weekly-report";

/**
 * 업무관리 > 보고서 — 보고서 양식을 탭으로 모은다 (2026-10-02).
 * 새 양식이 생기면 TABS 에 한 줄 추가하고 컴포넌트를 붙이면 된다.
 */
const TABS = [
  { key: "weekly", label: "주간보고" },
] as const;
type TabKey = typeof TABS[number]["key"];

export default function ReportsTabs() {
  const [tab, setTab] = useState<TabKey>("weekly");
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2"><FileBarChart size={20} className="text-blue-600" /> 보고서</h2>
      </div>
      <div className="flex border-b border-gray-200">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px ${tab === t.key ? "border-blue-600 text-blue-700" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === "weekly" && <WeeklyReport />}
    </div>
  );
}

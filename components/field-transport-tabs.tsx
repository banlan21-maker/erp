"use client";

/**
 * 현장 운송 모음 — 차량운행일지 / 용차사용 탭
 * 다크 톤 모바일 헤더 + 탭 + 본문
 */

import { useState } from "react";
import { Car, Truck } from "lucide-react";
import FieldDrivingLog from "@/components/field-driving-log";
import FieldCharterUsage from "@/components/field-charter-usage";

interface Vehicle { id: string; code: string; name: string; plateNo: string | null; mileage: number | null }

type Tab = "drivingLog" | "charterUsage";

export default function FieldTransportTabs({
  vehicles,
}: {
  vehicles: Vehicle[];
}) {
  const [tab, setTab] = useState<Tab>("drivingLog");

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      {/* 헤더 */}
      <div className="bg-gray-900 px-4 py-3 border-b border-gray-800">
        <p className="text-xs text-gray-500 font-medium">운송관리</p>
        <h1 className="text-lg font-bold text-white mt-0.5">현장 운송 등록</h1>
      </div>

      {/* 탭 */}
      <div className="bg-gray-900 border-b border-gray-800 flex">
        {([
          { key: "drivingLog",   label: "차량운행일지", icon: Car },
          { key: "charterUsage", label: "용차사용",     icon: Truck },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 py-3 flex items-center justify-center gap-2 text-sm font-bold border-b-2 transition-colors ${
              tab === key
                ? "border-blue-500 text-blue-300"
                : "border-transparent text-gray-500 active:text-gray-300"
            }`}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>

      {/* 본문 — 탭별 분기. 기존 FieldDrivingLog 컴포넌트는 자체 헤더가 있어 그대로 끼움 */}
      {tab === "drivingLog"
        ? <FieldDrivingLog vehicles={vehicles} embedded />
        : <FieldCharterUsage />
      }
    </div>
  );
}

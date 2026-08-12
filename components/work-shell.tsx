"use client";

import { WorkUserProvider, WorkUserPicker } from "@/components/work-user-context";
import WorkInboxBell from "@/components/work-inbox-bell";

/** 업무관리 모듈 공통 셸 — 현재 사용자 Provider + 상단 알림 벨 · 사용자 선택 바 */
export default function WorkShell({ children }: { children: React.ReactNode }) {
  return (
    <WorkUserProvider>
      <div className="flex items-center justify-end gap-3 mb-4 pb-3 border-b border-gray-200">
        <WorkInboxBell />
        <WorkUserPicker />
      </div>
      {children}
    </WorkUserProvider>
  );
}

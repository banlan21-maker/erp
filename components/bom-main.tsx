"use client";

import { ClipboardList } from "lucide-react";

interface ProjectOption {
  id: string;
  projectCode: string;
  projectName: string;
}

/* ════════════════════════════════════════════════════════════ */
/* 블록별 BOM리스트 — 구조 준비 (추후 구현)                    */
/* ════════════════════════════════════════════════════════════ */
export default function BomMain({ projectOptions }: { projectOptions: ProjectOption[] }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-gray-400 bg-white rounded-xl border">
      <ClipboardList size={44} className="mb-4 opacity-30" />
      <p className="text-base font-semibold text-gray-500">블록별 BOM리스트</p>
      <p className="text-sm mt-1 text-gray-400">준비 중입니다.</p>
      <p className="text-xs mt-3 text-gray-300">{projectOptions.length}개 블록 등록됨</p>
    </div>
  );
}

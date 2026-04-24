"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ChevronDown, ChevronRight, FolderOpen, Folder,
  FileSpreadsheet, Plus, MapPin, ClipboardList,
} from "lucide-react";
import ProjectDeleteButton from "@/components/project-delete-button";

interface Block {
  id: string;
  projectCode: string;
  projectName: string;
  type: string;
  client: string;
  status: string;
  drawingCount: number;
  createdAt: Date;
  storageLocation?: string | null;
}

interface VesselGroup {
  code: string;
  totalDrawings: number;
  blocks: Block[];
}

const STATUS_COLOR: Record<string, string> = {
  ACTIVE:    "bg-green-100 text-green-700",
  COMPLETED: "bg-gray-100 text-gray-600",
  ON_HOLD:   "bg-yellow-100 text-yellow-700",
};
const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "진행중", COMPLETED: "완료", ON_HOLD: "보류",
};
const TYPE_COLOR: Record<string, string> = {
  A: "bg-blue-100 text-blue-700",
  B: "bg-green-100 text-green-700",
};

export default function ProjectTree({ vessels }: { vessels: VesselGroup[] }) {
  // 호선 펼침 (기본 모두 열림)
  const [expanded, setExpanded] = useState<Record<string, boolean>>(
    Object.fromEntries(vessels.map((v) => [v.code, true]))
  );
  // 블록 폴더 펼침 (기본 모두 닫힘)
  const [expandedBlocks, setExpandedBlocks] = useState<Record<string, boolean>>({});

  const toggle      = (code: string) => setExpanded(p => ({ ...p, [code]: !p[code] }));
  const toggleBlock = (id: string)   => setExpandedBlocks(p => ({ ...p, [id]: !p[id] }));

  if (vessels.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-400 bg-white rounded-xl border">
        <FolderOpen size={40} className="mb-3 opacity-40" />
        <p className="text-base font-medium">등록된 호선이 없습니다.</p>
        <p className="text-sm mt-1">우측 상단 &apos;호선 등록&apos; 버튼으로 시작하세요.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {vessels.map((vessel) => {
        const isOpen = expanded[vessel.code] ?? true;
        return (
          <div key={vessel.code} className="bg-white rounded-xl border overflow-hidden">

            {/* ── 호선 헤더 ── */}
            <div className="flex items-center bg-gray-800 text-white">
              <button
                onClick={() => toggle(vessel.code)}
                className="flex items-center gap-2 px-4 py-3 flex-1 text-left hover:bg-gray-700 transition-colors"
              >
                {isOpen
                  ? <ChevronDown size={15} className="text-gray-400 flex-shrink-0" />
                  : <ChevronRight size={15} className="text-gray-400 flex-shrink-0" />}
                {isOpen
                  ? <FolderOpen size={16} className="text-yellow-400 flex-shrink-0" />
                  : <Folder size={16} className="text-yellow-400 flex-shrink-0" />}
                <span className="font-bold text-sm">호선 [{vessel.code}]</span>
                <span className="text-xs text-gray-400 ml-1">
                  {vessel.blocks.length}개 블록 · 강재리스트 {vessel.totalDrawings}행
                </span>
              </button>

              {/* 전체 강재리스트 버튼 — 호선 헤더 우측 */}
              <Link
                href={`/cutpart/projects/vessel/${encodeURIComponent(vessel.code)}`}
                className="flex items-center gap-1.5 px-4 py-3 text-xs text-blue-300 hover:text-white hover:bg-gray-700 transition-colors border-l border-gray-700 whitespace-nowrap"
              >
                <FileSpreadsheet size={13} />
                전체 강재리스트
              </Link>
            </div>

            {isOpen && (
              <div>
                {/* ── 블록 목록 ── */}
                {vessel.blocks.map((block) => {
                  const isBlockOpen = expandedBlocks[block.id] ?? false;
                  return (
                    <div key={block.id} className="border-b last:border-b-0">
                      {/* 블록 행 */}
                      <div className="flex items-center gap-0 px-6 py-2.5 hover:bg-gray-50 transition-colors">
                        <span className="w-3 border-l-2 border-b-2 border-gray-200 inline-block mr-1 self-stretch flex-shrink-0 rounded-bl" />

                        {/* 블록 폴더 토글 */}
                        <button
                          onClick={() => toggleBlock(block.id)}
                          className="flex items-center gap-2 flex-1 min-w-0 text-left"
                        >
                          {isBlockOpen
                            ? <ChevronDown size={13} className="text-gray-400 flex-shrink-0" />
                            : <ChevronRight size={13} className="text-gray-400 flex-shrink-0" />}
                          {isBlockOpen
                            ? <FolderOpen size={13} className="text-yellow-500 flex-shrink-0" />
                            : <Folder size={13} className="text-yellow-500 flex-shrink-0" />}

                          <span className="text-sm font-semibold text-gray-800 hover:text-blue-600">
                            {block.projectName}
                          </span>

                          {block.storageLocation && (
                            <span className="flex items-center gap-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                              <MapPin size={10} />
                              {block.storageLocation}
                            </span>
                          )}
                          <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLOR[block.status]}`}>
                            {STATUS_LABEL[block.status]}
                          </span>
                        </button>

                        {/* 우측: 강재 수 + 등록일 + 삭제 */}
                        <div className="flex items-center gap-3 ml-auto flex-shrink-0">
                          <span className="flex items-center gap-1 text-xs text-gray-400">
                            <FileSpreadsheet size={12} />
                            {block.drawingCount}행
                          </span>
                          <span className="text-xs text-gray-300">
                            {new Date(block.createdAt).toLocaleDateString("ko-KR")}
                          </span>
                          <ProjectDeleteButton
                            projectId={block.id}
                            projectCode={`${block.projectCode}-${block.projectName}`}
                          />
                        </div>
                      </div>

                      {/* 블록 하위 항목 (폴더 펼침 시) */}
                      {isBlockOpen && (
                        <div className="bg-gray-50 border-t">
                          {/* 강재리스트 */}
                          <Link
                            href={`/cutpart/projects?tab=list&projectId=${block.id}`}
                            className="flex items-center gap-2 px-10 py-2 hover:bg-blue-50 transition-colors group border-b"
                          >
                            <span className="w-3 border-l-2 border-b-2 border-gray-200 inline-block mr-1 flex-shrink-0 rounded-bl" />
                            <FileSpreadsheet size={12} className="text-blue-400 flex-shrink-0" />
                            <span className="text-xs text-gray-600 group-hover:text-blue-700 font-medium">강재리스트</span>
                            <span className="text-xs text-gray-400 ml-auto">{block.drawingCount}행</span>
                          </Link>

                          {/* BOM리스트 */}
                          <Link
                            href={`/cutpart/projects?tab=bom&projectId=${block.id}`}
                            className="flex items-center gap-2 px-10 py-2 hover:bg-purple-50 transition-colors group"
                          >
                            <span className="w-3 border-l-2 border-b-2 border-gray-200 inline-block mr-1 flex-shrink-0 rounded-bl" />
                            <ClipboardList size={12} className="text-purple-400 flex-shrink-0" />
                            <span className="text-xs text-gray-600 group-hover:text-purple-700 font-medium">BOM리스트</span>
                          </Link>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* ── 블록 추가 버튼 ── */}
                <Link
                  href={`/cutpart/projects/new?code=${encodeURIComponent(vessel.code)}`}
                  className="flex items-center gap-2 px-6 py-2 text-xs text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors border-t"
                >
                  <span className="w-3 ml-1 mr-1" />
                  <Plus size={12} />
                  블록 추가
                </Link>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

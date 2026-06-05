"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect, useRef, useCallback } from "react";
import { Anchor, List, FileSpreadsheet, Plus, ClipboardList, X, FileText } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import ProjectTree from "@/components/project-tree";
import DrawingsMain from "@/components/drawings-main";
import BomMain from "@/components/bom-main";
import BomUpload from "@/components/bom-upload";
import CuttingPdfTab from "@/components/cutting-pdf-tab";
import type { DrawingList } from "@prisma/client";

interface VesselBlock {
  id: string;
  projectCode: string;
  projectName: string;
  type: string;
  client: string;
  status: string | null;
  drawingCount: number;
  createdAt: Date;
  storageLocation: string | null;
}

interface Vessel {
  code: string;
  totalDrawings: number;
  blocks: VesselBlock[];
}

interface ProjectOption {
  id: string;
  projectCode: string;
  projectName: string;
  drawingCount: number;
  status: string | null;
  storageLocation?: string | null;
}

interface RecentUpload {
  projectId: string;
  sourceFile: string | null;
  createdAt: Date;
  project: { projectCode: string; projectName: string };
}

export default function ProjectsMain({
  tab,
  vessels,
  projectOptions,
  recentUploads,
  drawings,
  activeProject,
  projectId,
}: {
  tab: string;
  vessels: Vessel[];
  projectOptions: ProjectOption[];
  recentUploads: RecentUpload[];
  drawings: DrawingList[];
  activeProject: { id: string; projectCode: string; projectName: string; storageLocation: string | null } | null;
  projectId: string | null;
}) {
  const router = useRouter();
  const goTab = (t: string) => router.push(`/cutpart/projects?tab=${t}`);

  // 강재/BOM 등록 모달
  const [uploadModal, setUploadModal] = useState<"steel" | "bom" | null>(null);

  const tabs = [
    { key: "vessels",  icon: <List size={14} />,           label: "호선/블록" },
    { key: "list",     icon: <FileSpreadsheet size={14} />, label: "블록강재리스트" },
    { key: "bom",      icon: <ClipboardList size={14} />,   label: "블록BOM리스트" },
    { key: "pdf",      icon: <FileText size={14} />,        label: "절단도면 PDF" },
  ];

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Anchor size={24} className="text-blue-600" />
            호선/블록 프로젝트
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            호선/블록별 강재리스트 등록 및 관리
          </p>
        </div>
        {tab === "vessels" && (
          <div className="flex items-center gap-2">
            <Button variant="outline" className="flex items-center gap-2" onClick={() => setUploadModal("steel")}>
              <Plus size={16} /> 블록강재등록
            </Button>
            <Button variant="outline" className="flex items-center gap-2" onClick={() => setUploadModal("bom")}>
              <Plus size={16} /> 블록BOM등록
            </Button>
            <Link href="/cutpart/projects/new">
              <Button className="flex items-center gap-2">
                <Plus size={16} /> 호선 등록
              </Button>
            </Link>
          </div>
        )}
      </div>

      {/* 탭 */}
      <div className="flex border-b border-gray-200 gap-0 overflow-x-auto">
        {tabs.map(({ key, icon, label }) => (
          <button
            key={key}
            onClick={() => goTab(key)}
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

      {/* 호선리스트 탭 */}
      {tab === "vessels" && <ProjectTree vessels={vessels} />}

      {/* BOM리스트 탭 */}
      {tab === "bom" && <BomMain projectOptions={projectOptions} projectId={projectId} />}

      {/* 절단도면 PDF 탭 */}
      {tab === "pdf" && <CuttingPdfTab projectOptions={projectOptions} projectId={projectId} />}

      {/* 강재/BOM 등록 모달 */}
      {uploadModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-10 pb-6 px-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
              <h3 className="text-base font-semibold text-gray-800">
                {uploadModal === "steel" ? "블록 강재 등록" : "블록 BOM 등록"}
              </h3>
              <button onClick={() => setUploadModal(null)} className="text-gray-400 hover:text-gray-600 rounded p-1 hover:bg-gray-100">
                <X size={18} />
              </button>
            </div>
            <div className="p-5">
              {uploadModal === "steel" && (
                <DrawingsMain
                  tab="upload"
                  projectId={projectId}
                  projectOptions={projectOptions}
                  recentUploads={recentUploads}
                  drawings={drawings}
                  activeProject={activeProject}
                  baseUrl="/cutpart/projects"
                  hideHeader={true}
                  hideTabs={true}
                />
              )}
              {uploadModal === "bom" && (
                <BomUpload projectOptions={projectOptions} />
              )}
            </div>
          </div>
        </div>
      )}

      {/* 블록별강재리스트 탭 */}
      {tab === "list" && (
        <DrawingsMain
          tab={tab}
          projectId={projectId}
          projectOptions={projectOptions}
          recentUploads={recentUploads}
          drawings={drawings}
          activeProject={activeProject}
          baseUrl="/cutpart/projects"
          hideHeader={true}
          hideTabs={true}
        />
      )}

    </div>
  );
}

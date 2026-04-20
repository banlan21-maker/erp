"use client";

import { useRouter } from "next/navigation";
import { Anchor, List, Upload, FileSpreadsheet, Plus, ClipboardList } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import ProjectTree from "@/components/project-tree";
import DrawingsMain from "@/components/drawings-main";
import BomMain from "@/components/bom-main";
import type { DrawingList } from "@prisma/client";

interface VesselBlock {
  id: string;
  projectCode: string;
  projectName: string;
  type: string;
  client: string;
  status: string;
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
  status: string;
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

  const tabs = [
    { key: "vessels", icon: <List size={14} />,           label: "호선/블록 리스트" },
    { key: "upload",  icon: <Upload size={14} />,          label: "블록별 강재/BOM 등록" },
    { key: "list",    icon: <FileSpreadsheet size={14} />, label: "블록별강재리스트" },
    { key: "bom",     icon: <ClipboardList size={14} />,   label: "블록별BOM리스트" },
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
      {tab === "bom" && <BomMain projectOptions={projectOptions} />}

      {/* 호선강재등록 / 호선강재리스트 탭 */}
      {(tab === "upload" || tab === "list") && (
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

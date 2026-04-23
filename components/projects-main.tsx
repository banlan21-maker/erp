"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { Anchor, List, Upload, FileSpreadsheet, Plus, ClipboardList, Layers, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import ProjectTree from "@/components/project-tree";
import DrawingsMain from "@/components/drawings-main";
import BomMain from "@/components/bom-main";
import BomUpload from "@/components/bom-upload";
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

  // 강재/BOM 등록 탭 내 서브탭
  const [uploadSubTab, setUploadSubTab] = useState<"steel" | "bom">("steel");

  const tabs = [
    { key: "vessels",  icon: <List size={14} />,           label: "호선/블록 리스트" },
    { key: "upload",   icon: <Upload size={14} />,          label: "블록별 강재/BOM 등록" },
    { key: "list",     icon: <FileSpreadsheet size={14} />, label: "블록별강재리스트" },
    { key: "bom",      icon: <ClipboardList size={14} />,   label: "블록별BOM리스트" },
    { key: "remnants", icon: <Layers size={14} />,          label: "등록잔재리스트" },
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
      {tab === "bom" && <BomMain projectOptions={projectOptions} projectId={projectId} />}

      {/* 강재/BOM 등록 탭 — 서브탭 */}
      {tab === "upload" && (
        <div className="space-y-4">
          <div className="flex gap-0 border-b border-gray-200">
            {([
              { key: "steel", icon: <FileSpreadsheet size={13} />, label: "강재 등록" },
              { key: "bom",   icon: <ClipboardList size={13} />,   label: "BOM 등록" },
            ] as const).map(({ key, icon, label }) => (
              <button
                key={key}
                onClick={() => setUploadSubTab(key)}
                className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  uploadSubTab === key
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                {icon} {label}
              </button>
            ))}
          </div>

          {uploadSubTab === "steel" && (
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

          {uploadSubTab === "bom" && (
            <BomUpload projectOptions={projectOptions} />
          )}
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

      {/* 등록잔재리스트 탭 */}
      {tab === "remnants" && (
        <ProjectRemnantTab
          projectOptions={projectOptions}
          activeProject={activeProject}
          projectId={projectId}
        />
      )}
    </div>
  );
}

// ─── 등록잔재리스트 탭 ────────────────────────────────────────────────────────
const SHAPE_LABEL: Record<string, string> = { RECTANGLE: "사각형", L_SHAPE: "L자형" };

function ProjectRemnantTab({
  projectOptions, activeProject, projectId,
}: {
  projectOptions: ProjectOption[];
  activeProject: { id: string; projectCode: string; projectName: string } | null;
  projectId: string | null;
}) {
  type RemnantRow = {
    id: string; remnantNo: string; shape: string; material: string;
    thickness: number; width1: number | null; length1: number | null;
    width2: number | null; length2: number | null; weight: number;
    sourceBlock: string | null;
  };

  const router = useRouter();
  const [remnants, setRemnants] = useState<RemnantRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    fetch(`/api/remnants?projectId=${projectId}&type=REGISTERED`)
      .then(r => r.json())
      .then(d => { if (d.success) setRemnants(d.data); })
      .finally(() => setLoading(false));
  }, [projectId]);

  if (!projectId || !activeProject) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-gray-500 mb-3">블록(프로젝트)을 선택하세요.</p>
        <div className="grid gap-2 max-w-lg">
          {projectOptions.map(p => (
            <button key={p.id}
              onClick={() => router.push(`/cutpart/projects?tab=remnants&projectId=${p.id}`)}
              className="text-left px-4 py-3 bg-white border rounded-xl hover:border-blue-400 hover:bg-blue-50 transition-colors text-sm flex items-center gap-3">
              <span className="font-semibold text-gray-800">[{p.projectCode}]</span>
              <span className="text-gray-600">{p.projectName}</span>
              <span className="ml-auto text-xs text-gray-400">{p.drawingCount}행</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <button onClick={() => router.push("/cutpart/projects?tab=remnants")}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
          <ArrowLeft size={15} /> 목록으로
        </button>
        <h3 className="text-base font-semibold text-gray-800">
          [{activeProject.projectCode}] {activeProject.projectName} — 등록잔재리스트
        </h3>
        <span className="text-xs text-gray-400">{remnants.length}건</span>
      </div>

      {loading ? (
        <div className="text-center py-10 text-gray-400 text-sm">불러오는 중...</div>
      ) : remnants.length === 0 ? (
        <div className="text-center py-10 text-gray-400 bg-white rounded-xl border text-sm">
          등록된 잔재가 없습니다.
        </div>
      ) : (
        <div className="bg-white border rounded-xl overflow-x-auto">
          <table className="w-full text-xs whitespace-nowrap">
            <thead className="bg-gray-50 border-b">
              <tr>
                {["잔재번호","발생블록","형태","재질","두께(mm)","폭1","길이1","폭2","길이2","중량(kg)"].map(h => (
                  <th key={h} className="px-3 py-2.5 text-left text-gray-500 font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {remnants.map(r => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-mono text-blue-600 font-medium">{r.remnantNo}</td>
                  <td className="px-3 py-2 text-gray-700">{r.sourceBlock ?? "-"}</td>
                  <td className="px-3 py-2">
                    <span className="px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded text-[10px] font-medium">
                      {SHAPE_LABEL[r.shape] ?? r.shape}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span className="px-1.5 py-0.5 bg-slate-100 rounded font-medium">{r.material}</span>
                  </td>
                  <td className="px-3 py-2 text-right">{r.thickness}</td>
                  <td className="px-3 py-2 text-right">{r.width1?.toLocaleString() ?? "-"}</td>
                  <td className="px-3 py-2 text-right">{r.length1?.toLocaleString() ?? "-"}</td>
                  <td className="px-3 py-2 text-right">{r.width2?.toLocaleString() ?? "-"}</td>
                  <td className="px-3 py-2 text-right">{r.length2?.toLocaleString() ?? "-"}</td>
                  <td className="px-3 py-2 text-right font-semibold">{r.weight.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50 border-t">
              <tr>
                <td colSpan={9} className="px-3 py-2 text-gray-500 font-medium">합계 ({remnants.length}건)</td>
                <td className="px-3 py-2 text-right font-bold text-gray-700">
                  {remnants.reduce((s, r) => s + r.weight, 0).toFixed(1)}kg
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

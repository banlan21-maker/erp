"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { Anchor, List, Upload, FileSpreadsheet, Plus, ClipboardList, Layers, ArrowLeft, Filter, X } from "lucide-react";
import ColumnFilterDropdown from "@/components/column-filter-dropdown";
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

  // 강재/BOM 등록 탭 내 서브탭
  const [uploadSubTab, setUploadSubTab] = useState<"steel" | "bom">("steel");

  const tabs = [
    { key: "vessels",  icon: <List size={14} />,           label: "호선/블록" },
    { key: "upload",   icon: <Upload size={14} />,          label: "블록 강재/BOM 등록" },
    { key: "list",     icon: <FileSpreadsheet size={14} />, label: "블록강재리스트" },
    { key: "remnants", icon: <Layers size={14} />,          label: "블록등록잔재리스트" },
    { key: "bom",      icon: <ClipboardList size={14} />,   label: "블록BOM리스트" },
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
const STATUS_LABEL_R: Record<string, string> = { PENDING: "등록", IN_STOCK: "재고", EXHAUSTED: "소진" };
const STATUS_COLOR_R: Record<string, string> = {
  PENDING:   "bg-yellow-100 text-yellow-700",
  IN_STOCK:  "bg-green-100 text-green-700",
  EXHAUSTED: "bg-gray-100 text-gray-500",
};

type RemnantRow = {
  id: string; remnantNo: string; shape: string; material: string;
  thickness: number; width1: number | null; length1: number | null;
  width2: number | null; length2: number | null; weight: number;
  sourceBlock: string | null; sourceVesselName: string | null; status: string;
  heatNo: string | null;
  sourceProject: { projectCode: string } | null;
  assignedToLists: { block: string | null; project: { projectCode: string } | null }[];
};

function colVal(r: RemnantRow, col: string): string {
  switch (col) {
    case "remnantNo":   return r.remnantNo;
    case "vessel":      return r.sourceProject?.projectCode ?? r.sourceVesselName ?? "-";
    case "block":       return r.sourceBlock ?? "-";
    case "heatNo":      return r.heatNo ?? "-";
    case "shape":       return SHAPE_LABEL[r.shape] ?? r.shape;
    case "material":    return r.material;
    case "thickness":   return String(r.thickness);
    case "width1":      return r.width1 != null ? String(r.width1) : "-";
    case "width2":      return r.width2 != null ? String(r.width2) : "-";
    case "length1":     return r.length1 != null ? String(r.length1) : "-";
    case "length2":     return r.length2 != null ? String(r.length2) : "-";
    case "weight":      return r.weight.toFixed(1);
    case "status":      return STATUS_LABEL_R[r.status] ?? r.status;
    case "usedVessel": {
      if (r.status !== "EXHAUSTED" || !r.assignedToLists?.length) return "-";
      const first = r.assignedToLists[0];
      return `${first.project?.projectCode ?? "-"} / ${first.block ?? "-"}`;
    }
    default: return "";
  }
}

const COLS = [
  { key: "remnantNo", label: "잔재번호",   align: "left"  },
  { key: "vessel",    label: "발생호선",   align: "left"  },
  { key: "block",     label: "발생블록",   align: "left"  },
  { key: "heatNo",    label: "발생판번호", align: "left"  },
  { key: "shape",     label: "형태",       align: "left"  },
  { key: "material",  label: "재질",       align: "left"  },
  { key: "thickness", label: "두께",       align: "right" },
  { key: "width1",    label: "폭1",        align: "right" },
  { key: "width2",    label: "폭2",        align: "right" },
  { key: "length1",   label: "길이1",      align: "right" },
  { key: "length2",   label: "길이2",      align: "right" },
  { key: "weight",    label: "중량(kg)",   align: "right" },
  { key: "status",    label: "상태",        align: "center"},
  { key: "usedVessel", label: "사용호선/블록", align: "left"  },
] as const;

function ProjectRemnantTab({ projectOptions: _p }: { projectOptions: ProjectOption[]; activeProject: { id: string; projectCode: string; projectName: string } | null; projectId: string | null }) {
  const [remnants, setRemnants] = useState<RemnantRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<Record<string, string[]>>({});
  const [openCol, setOpenCol] = useState<string | null>(null);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const thRefs = useRef<Record<string, HTMLElement | null>>({});

  useEffect(() => {
    setLoading(true);
    fetch("/api/remnants?type=REGISTERED")
      .then(r => r.json())
      .then(d => { if (d.success) setRemnants(d.data); })
      .finally(() => setLoading(false));
  }, []);

  const filtered = remnants.filter(r =>
    COLS.every(({ key }) => {
      const sel = filters[key];
      return !sel?.length || sel.includes(colVal(r, key));
    })
  );

  const activeCount = Object.values(filters).filter(v => v.length > 0).length;
  const totalWeight = filtered.reduce((s, r) => s + r.weight, 0);

  const openFilter = (col: string, el: HTMLElement) => {
    if (openCol === col) { setOpenCol(null); setAnchorEl(null); return; }
    setOpenCol(col); setAnchorEl(el);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <h3 className="text-base font-semibold text-gray-800">등록잔재리스트</h3>
        <span className="text-xs text-gray-400">{remnants.length}건</span>
        {activeCount > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded-md">
            <Filter size={11} fill="currentColor" />
            필터 {activeCount}개 적용 ({filtered.length}/{remnants.length}건)
            <button onClick={() => setFilters({})} className="ml-0.5 hover:text-blue-800"><X size={11} /></button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="text-center py-10 text-gray-400 text-sm">불러오는 중...</div>
      ) : (
        <div className="bg-white border rounded-xl overflow-x-auto">
          <table className="w-full text-xs whitespace-nowrap">
            <thead className="bg-gray-50 border-b">
              <tr>
                {COLS.map(({ key, label, align }) => {
                  const active = (filters[key]?.length ?? 0) > 0;
                  return (
                    <th key={key} className={`px-3 py-2.5 text-${align} text-gray-500 font-semibold`}>
                      <button
                        ref={el => { thRefs.current[key] = el; }}
                        onClick={e => openFilter(key, e.currentTarget)}
                        className={`flex items-center gap-1 ${align === "right" ? "ml-auto" : ""} hover:text-gray-700`}
                      >
                        {label}
                        <Filter size={10} className={active ? "text-blue-500 fill-blue-500" : "text-gray-400"} fill={active ? "currentColor" : "none"} />
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.length === 0 ? (
                <tr><td colSpan={14} className="text-center py-8 text-gray-400">
                  {remnants.length === 0 ? "등록된 잔재가 없습니다." : "필터 조건에 맞는 데이터가 없습니다."}
                  {activeCount > 0 && <button onClick={() => setFilters({})} className="ml-2 text-blue-500 hover:underline">필터 초기화</button>}
                </td></tr>
              ) : filtered.map(r => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-mono text-blue-600 font-medium">{r.remnantNo}</td>
                  <td className="px-3 py-2 text-gray-700">{r.sourceProject?.projectCode ?? r.sourceVesselName ?? "-"}</td>
                  <td className="px-3 py-2 text-gray-700">{r.sourceBlock ?? "-"}</td>
                  <td className="px-3 py-2 font-mono text-gray-600">{r.heatNo ?? "-"}</td>
                  <td className="px-3 py-2"><span className="px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded text-[10px] font-medium">{SHAPE_LABEL[r.shape] ?? r.shape}</span></td>
                  <td className="px-3 py-2"><span className="px-1.5 py-0.5 bg-slate-100 rounded font-medium">{r.material}</span></td>
                  <td className="px-3 py-2 text-right">{r.thickness}</td>
                  <td className="px-3 py-2 text-right">{r.width1?.toLocaleString() ?? "-"}</td>
                  <td className="px-3 py-2 text-right">{r.width2?.toLocaleString() ?? "-"}</td>
                  <td className="px-3 py-2 text-right">{r.length1?.toLocaleString() ?? "-"}</td>
                  <td className="px-3 py-2 text-right">{r.length2?.toLocaleString() ?? "-"}</td>
                  <td className="px-3 py-2 text-right font-semibold">{r.weight.toFixed(1)}</td>
                  <td className="px-3 py-2 text-center">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${STATUS_COLOR_R[r.status] ?? "bg-gray-100 text-gray-500"}`}>
                      {STATUS_LABEL_R[r.status] ?? r.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-gray-700">
                    {r.status === "EXHAUSTED" && r.assignedToLists?.length > 0
                      ? `${r.assignedToLists[0].project?.projectCode ?? "-"} / ${r.assignedToLists[0].block ?? "-"}`
                      : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50 border-t">
              <tr>
                <td colSpan={11} className="px-3 py-2 text-gray-500 font-medium">합계 ({filtered.length}건)</td>
                <td className="px-3 py-2 text-right font-bold text-gray-700">{totalWeight.toFixed(1)}kg</td>
                <td /><td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {openCol && anchorEl && (
        <ColumnFilterDropdown
          anchorEl={anchorEl}
          values={[...new Set(remnants.map(r => colVal(r, openCol)))].sort().map(v => ({ value: v, label: v }))}
          selected={filters[openCol] ?? []}
          onApply={sel => { setFilters(f => ({ ...f, [openCol]: sel })); setOpenCol(null); setAnchorEl(null); }}
          onClose={() => { setOpenCol(null); setAnchorEl(null); }}
        />
      )}
    </div>
  );
}

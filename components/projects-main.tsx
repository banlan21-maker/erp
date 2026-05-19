"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect, useRef, useCallback } from "react";
import { Anchor, List, FileSpreadsheet, Plus, ClipboardList, Layers, ArrowLeft, Filter, X } from "lucide-react";
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

  // 강재/BOM 등록 모달
  const [uploadModal, setUploadModal] = useState<"steel" | "bom" | null>(null);

  const tabs = [
    { key: "vessels",  icon: <List size={14} />,           label: "호선/블록" },
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
const STATUS_LABEL_R: Record<string, string> = { IN_STOCK: "재고", EXHAUSTED: "소진" };
const STATUS_COLOR_R: Record<string, string> = {
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
  const [remnants,       setRemnants]       = useState<RemnantRow[]>([]);
  const [loading,        setLoading]        = useState(false);
  const [filters,        setFilters]        = useState<Record<string, string[]>>({});
  const [distinctValues, setDistinctValues] = useState<Record<string, { value: string; label: string }[]>>({});
  const [openCol,        setOpenCol]        = useState<string | null>(null);
  const [anchorEl,       setAnchorEl]       = useState<HTMLElement | null>(null);
  const [page,           setPage]           = useState(1);
  const [total,          setTotal]          = useState(0);
  const [totalPages,     setTotalPages]     = useState(1);

  // distinct 값 로드 (REGISTERED 타입만)
  useEffect(() => {
    fetch("/api/remnants/distinct?type=REGISTERED")
      .then(r => r.ok ? r.json() : {})
      .then(d => setDistinctValues(d));
  }, []);

  // 서버사이드 필터 + 페이지네이션 데이터 로드
  const fetchData = useCallback(async () => {
    setLoading(true);
    const p = new URLSearchParams();
    p.set("type", "REGISTERED");
    p.set("page", String(page));
    const cf = filters;
    if (cf.shape?.length)       p.set("shapes",      cf.shape.join(","));
    if (cf.material?.length)    p.set("materials",   cf.material.join(","));
    if (cf.thickness?.length)   p.set("thicknesses", cf.thickness.join(","));
    if (cf.width1?.length)      p.set("widths1",     cf.width1.join(","));
    if (cf.length1?.length)     p.set("lengths1",    cf.length1.join(","));
    if (cf.width2?.length)      p.set("widths2",     cf.width2.join(","));
    if (cf.length2?.length)     p.set("lengths2",    cf.length2.join(","));
    if (cf.weight?.length)      p.set("weights",     cf.weight.join(","));
    if (cf.heatNo?.length)      p.set("heatNos",     cf.heatNo.join(","));
    if (cf.status?.length)      p.set("statuses",    cf.status.join(","));
    if (cf.vessel?.length)      p.set("sources",     cf.vessel.join(","));
    if (cf.block?.length)       p.set("sourceBlocks",cf.block.join(","));

    fetch(`/api/remnants?${p}`)
      .then(r => r.json())
      .then(d => {
        if (d.data) {
          setRemnants(d.data);
          setTotal(d.total ?? d.data.length);
          setTotalPages(d.totalPages ?? 1);
        }
      })
      .finally(() => setLoading(false));
  }, [page, filters]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { setPage(1); }, [filters]);

  // 컬럼별 distinct 값 매핑 (API 키 → 드롭다운 소스)
  const getDistinctForCol = (col: string) => {
    const map: Record<string, string> = {
      vessel: "source", block: "sourceBlock", heatNo: "heatNo",
      shape: "shape", material: "material", thickness: "thickness",
      width1: "width1", length1: "length1", width2: "width2", length2: "length2",
      weight: "weight", status: "status",
    };
    return distinctValues[map[col] ?? col] ?? [];
  };

  const activeCount = Object.values(filters).filter(v => v.length > 0).length;
  const totalWeight = remnants.reduce((s, r) => s + r.weight, 0);

  const openFilter = (col: string, el: HTMLElement) => {
    if (openCol === col) { setOpenCol(null); setAnchorEl(null); return; }
    setOpenCol(col); setAnchorEl(el);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <h3 className="text-base font-semibold text-gray-800">등록잔재리스트</h3>
        <span className="text-xs text-gray-400">{total}건</span>
        {activeCount > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded-md">
            <Filter size={11} fill="currentColor" />
            필터 {activeCount}개 적용
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
              {remnants.length === 0 ? (
                <tr><td colSpan={14} className="text-center py-8 text-gray-400">
                  {activeCount > 0 ? "필터 조건에 맞는 데이터가 없습니다." : "등록된 잔재가 없습니다."}
                  {activeCount > 0 && <button onClick={() => setFilters({})} className="ml-2 text-blue-500 hover:underline">필터 초기화</button>}
                </td></tr>
              ) : remnants.map(r => (
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
                <td colSpan={11} className="px-3 py-2 text-gray-500 font-medium">합계 ({remnants.length}건 / 전체 {total}건)</td>
                <td className="px-3 py-2 text-right font-bold text-gray-700">{totalWeight.toFixed(1)}kg</td>
                <td /><td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>{(page - 1) * 50 + 1}–{Math.min(page * 50, total)} / {total}건</span>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage(1)} disabled={page === 1} className="px-2 py-1 rounded border border-gray-200 hover:bg-gray-100 disabled:opacity-30">«</button>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-2 py-1 rounded border border-gray-200 hover:bg-gray-100 disabled:opacity-30">‹</button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const start = Math.max(1, Math.min(page - 2, totalPages - 4));
              const pg = start + i;
              return (
                <button key={pg} onClick={() => setPage(pg)}
                  className={`px-2.5 py-1 rounded border text-xs ${pg === page ? "bg-blue-600 text-white border-blue-600" : "border-gray-200 hover:bg-gray-100"}`}
                >{pg}</button>
              );
            })}
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-2 py-1 rounded border border-gray-200 hover:bg-gray-100 disabled:opacity-30">›</button>
            <button onClick={() => setPage(totalPages)} disabled={page === totalPages} className="px-2 py-1 rounded border border-gray-200 hover:bg-gray-100 disabled:opacity-30">»</button>
          </div>
        </div>
      )}

      {openCol && anchorEl && (
        <ColumnFilterDropdown
          anchorEl={anchorEl}
          values={getDistinctForCol(openCol)}
          selected={filters[openCol] ?? []}
          onApply={sel => { setFilters(f => ({ ...f, [openCol]: sel })); setOpenCol(null); setAnchorEl(null); }}
          onClose={() => { setOpenCol(null); setAnchorEl(null); }}
        />
      )}
    </div>
  );
}

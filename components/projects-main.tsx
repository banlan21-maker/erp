"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect, useMemo, useRef, type ReactNode } from "react";
import { Anchor, Plus, X, FileText, List, ChevronDown, Pencil, FileSpreadsheet, ClipboardList, MapPin, Search } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import DrawingsMain from "@/components/drawings-main";
import BomMain from "@/components/bom-main";
import BomUpload from "@/components/bom-upload";
import CuttingPdfTab from "@/components/cutting-pdf-tab";
import BlockEditModal from "@/components/block-edit-modal";
import VesselEditModal from "@/components/vessel-edit-modal";
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
interface Vessel { code: string; totalDrawings: number; blocks: VesselBlock[]; }
interface ProjectOption { id: string; projectCode: string; projectName: string; drawingCount: number; status: string | null; storageLocation?: string | null; }
interface RecentUpload { projectId: string; sourceFile: string | null; createdAt: Date; project: { projectCode: string; projectName: string }; }

const STATUS_COLOR: Record<string, string> = { ACTIVE: "bg-green-100 text-green-700", COMPLETED: "bg-blue-100 text-blue-700" };
const STATUS_LABEL: Record<string, string> = { ACTIVE: "진행중", COMPLETED: "완료" };

/* ── 검색 가능한 드롭다운 ─────────────────────────────────────────────── */
function Combobox({ value, onChange, options, placeholder, width = "w-52" }: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string; hint?: string; badge?: ReactNode }[];
  placeholder: string;
  width?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const sel = options.find(o => o.value === value);
  const filtered = q.trim() ? options.filter(o => o.label.toLowerCase().includes(q.trim().toLowerCase())) : options;
  return (
    <div ref={ref} className={`relative ${width}`}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white hover:border-gray-400"
      >
        <span className={sel ? "text-gray-800 truncate" : "text-gray-400"}>{sel ? sel.label : placeholder}</span>
        <ChevronDown size={14} className="text-gray-400 shrink-0" />
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-xl">
          <div className="p-1.5 border-b border-gray-100 relative">
            <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="검색..."
              className="w-full pl-7 pr-2 py-1 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400" />
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-xs text-gray-400 text-center">결과 없음</p>
            ) : filtered.map(o => (
              <button key={o.value} type="button"
                onClick={() => { onChange(o.value); setOpen(false); setQ(""); }}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-blue-50 ${o.value === value ? "bg-blue-50 text-blue-700 font-semibold" : "text-gray-700"}`}>
                <span className="truncate flex-1">{o.label}</span>
                {o.badge}
                {o.hint && <span className="text-[11px] text-gray-400 shrink-0">{o.hint}</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ProjectsMain({
  tab, view, vessels, projectOptions, recentUploads, drawings, activeProject, projectId,
}: {
  tab: string;
  view: string;
  vessels: Vessel[];
  projectOptions: ProjectOption[];
  recentUploads: RecentUpload[];
  drawings: DrawingList[];
  activeProject: { id: string; projectCode: string; projectName: string; storageLocation: string | null } | null;
  projectId: string | null;
}) {
  const router = useRouter();
  const go = (params: Record<string, string>) => router.push(`/cutpart/projects?${new URLSearchParams(params).toString()}`);

  const [uploadModal, setUploadModal] = useState<"steel" | "bom" | null>(null);
  const [activeOnly, setActiveOnly] = useState(true); // 진행중만
  const [selVessel, setSelVessel] = useState(activeProject?.projectCode ?? "");
  const [editingBlock, setEditingBlock] = useState<VesselBlock | null>(null);
  const [editingVessel, setEditingVessel] = useState<Vessel | null>(null);

  // URL(projectId) 로 블록이 바뀌면 호선 선택도 동기화
  useEffect(() => { if (activeProject?.projectCode) setSelVessel(activeProject.projectCode); }, [activeProject?.projectCode]);

  const currentVessel = useMemo(() => vessels.find(v => v.code === selVessel) ?? null, [vessels, selVessel]);

  // 호선 드롭다운 옵션 (진행중만이면 진행중 블록 있는 호선만)
  const vesselOptions = useMemo(() => vessels
    .filter(v => !activeOnly || v.blocks.some(b => b.status === "ACTIVE"))
    .map(v => ({ value: v.code, label: `[${v.code}]`, hint: `${v.blocks.length}블록` })), [vessels, activeOnly]);

  // 블록 드롭다운 옵션 (선택 호선 + 진행중 필터)
  const blockOptions = useMemo(() => (currentVessel?.blocks ?? [])
    .filter(b => !activeOnly || b.status === "ACTIVE")
    .map(b => ({
      value: b.id,
      label: b.projectName,
      hint: `${b.drawingCount}행`,
      badge: b.status ? <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] ${STATUS_COLOR[b.status] ?? ""}`}>{STATUS_LABEL[b.status]}</span> : undefined,
    })), [currentVessel, activeOnly]);

  // 진입(블록 미선택) 시 진행중 블록 바로가기
  const activeBlocks = useMemo(() =>
    vessels.flatMap(v => v.blocks.filter(b => b.status === "ACTIVE").map(b => ({ ...b, vessel: v.code }))), [vessels]);

  const selectBlock = (id: string) => go({ tab: "vessels", projectId: id, view: view || "list" });

  const tabs = [
    { key: "vessels", icon: <List size={14} />,     label: "호선/블록" },
    { key: "pdf",     icon: <FileText size={14} />,  label: "절단도면 PDF" },
  ];

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Anchor size={24} className="text-blue-600" /> 호선/블록 프로젝트
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">호선·블록을 선택해 강재리스트/BOM을 조회·관리합니다.</p>
        </div>
        {tab === "vessels" && (
          <div className="flex items-center gap-2">
            <Button variant="outline" className="flex items-center gap-2" onClick={() => setUploadModal("steel")}><Plus size={16} /> 블록강재등록</Button>
            <Button variant="outline" className="flex items-center gap-2" onClick={() => setUploadModal("bom")}><Plus size={16} /> 블록BOM등록</Button>
            <Link href="/cutpart/projects/new"><Button className="flex items-center gap-2"><Plus size={16} /> 호선 등록</Button></Link>
          </div>
        )}
      </div>

      {/* 탭 */}
      <div className="flex border-b border-gray-200 gap-0 overflow-x-auto">
        {tabs.map(({ key, icon, label }) => (
          <button key={key} onClick={() => go({ tab: key })}
            className={`flex items-center gap-2 px-5 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              tab === key ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
            {icon} {label}
          </button>
        ))}
      </div>

      {/* 절단도면 PDF 탭 */}
      {tab === "pdf" && <CuttingPdfTab projectOptions={projectOptions} projectId={projectId} />}

      {/* 호선/블록 탭 */}
      {tab === "vessels" && (
        <>
          {/* 선택 바 */}
          <div className="bg-white border border-gray-200 rounded-xl p-3 flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-gray-700">호선</span>
            <Combobox value={selVessel} placeholder="호선 선택" options={vesselOptions}
              onChange={(v) => { setSelVessel(v); if (projectId && v !== activeProject?.projectCode) go({ tab: "vessels", view }); }} />
            <span className="text-sm font-semibold text-gray-700 ml-1">블록</span>
            <Combobox value={projectId ?? ""} placeholder={selVessel ? "블록 선택" : "먼저 호선 선택"} options={blockOptions}
              onChange={(id) => selectBlock(id)} />
            <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer ml-1">
              <input type="checkbox" checked={activeOnly} onChange={e => setActiveOnly(e.target.checked)} className="w-4 h-4 accent-green-600" />
              진행중만
            </label>
            {selVessel && currentVessel && (
              <div className="flex items-center gap-1.5 ml-auto">
                <Link href={`/cutpart/projects/vessel/${encodeURIComponent(selVessel)}`}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50">
                  <FileSpreadsheet size={12} /> 호선 전체 강재리스트
                </Link>
                <Link href={`/cutpart/projects/new?code=${encodeURIComponent(selVessel)}`}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50">
                  <Plus size={12} /> 블록 추가
                </Link>
                <button onClick={() => setEditingVessel(currentVessel)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs border border-gray-300 text-gray-500 rounded-lg hover:bg-gray-50" title="호선 수정/삭제">
                  <Pencil size={12} /> 호선
                </button>
              </div>
            )}
          </div>

          {/* 블록 미선택 → 진행중 블록 바로가기 */}
          {!projectId && (
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-sm text-gray-500 mb-3">호선·블록을 선택하거나, 아래 <b className="text-gray-700">진행중 블록</b>에서 바로 선택하세요.</p>
              {activeBlocks.length === 0 ? (
                <p className="text-center py-10 text-gray-400 text-sm">진행중인 블록이 없습니다.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {activeBlocks.map(b => (
                    <button key={b.id} onClick={() => selectBlock(b.id)}
                      className="flex items-center gap-2 text-left px-3 py-2.5 border border-gray-200 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition-colors">
                      <FileSpreadsheet size={15} className="text-blue-500 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-gray-800 truncate">{b.projectName}</div>
                        <div className="text-[11px] text-gray-400">[{b.vessel}] · {b.drawingCount}행</div>
                      </div>
                      {b.storageLocation && <span className="shrink-0 flex items-center gap-0.5 text-[10px] text-amber-700"><MapPin size={9} />{b.storageLocation}</span>}
                      <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] bg-green-100 text-green-700">진행중</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 블록 선택 → 헤더 + 뷰 토글 + 리스트 */}
          {projectId && activeProject && (
            <>
              <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center gap-3 flex-wrap">
                <FileSpreadsheet size={18} className="text-blue-600" />
                <span className="text-base font-bold text-gray-900">[{activeProject.projectCode}] {activeProject.projectName}</span>
                {(() => {
                  const b = currentVessel?.blocks.find(x => x.id === projectId);
                  return b?.status ? <span className={`px-2 py-0.5 rounded-full text-xs ${STATUS_COLOR[b.status] ?? ""}`}>{STATUS_LABEL[b.status]}</span> : null;
                })()}
                {activeProject.storageLocation && (
                  <span className="flex items-center gap-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                    <MapPin size={10} /> {activeProject.storageLocation}
                  </span>
                )}
                <button onClick={() => { const b = currentVessel?.blocks.find(x => x.id === projectId); if (b) setEditingBlock(b); }}
                  className="inline-flex items-center gap-1 px-2 py-1 text-xs text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded" title="블록 이름 변경/삭제">
                  <Pencil size={12} /> 수정
                </button>
                {/* 뷰 토글 */}
                <div className="ml-auto inline-flex rounded-lg border border-gray-300 overflow-hidden">
                  <button onClick={() => go({ tab: "vessels", projectId, view: "list" })}
                    className={`px-3 py-1.5 text-sm font-semibold flex items-center gap-1.5 ${view === "list" ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>
                    <FileSpreadsheet size={13} /> 강재리스트
                  </button>
                  <button onClick={() => go({ tab: "vessels", projectId, view: "bom" })}
                    className={`px-3 py-1.5 text-sm font-semibold flex items-center gap-1.5 border-l border-gray-300 ${view === "bom" ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>
                    <ClipboardList size={13} /> BOM
                  </button>
                </div>
              </div>

              {view === "bom" ? (
                <BomMain projectOptions={projectOptions} projectId={projectId} />
              ) : (
                <DrawingsMain
                  tab="list"
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
            </>
          )}
        </>
      )}

      {/* 강재/BOM 등록 모달 */}
      {uploadModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-10 pb-6 px-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
              <h3 className="text-base font-semibold text-gray-800">{uploadModal === "steel" ? "블록 강재 등록" : "블록 BOM 등록"}</h3>
              <button onClick={() => setUploadModal(null)} className="text-gray-400 hover:text-gray-600 rounded p-1 hover:bg-gray-100"><X size={18} /></button>
            </div>
            <div className="p-5">
              {uploadModal === "steel" && (
                <DrawingsMain tab="upload" projectId={projectId} projectOptions={projectOptions} recentUploads={recentUploads}
                  drawings={drawings} activeProject={activeProject} baseUrl="/cutpart/projects" hideHeader={true} hideTabs={true} />
              )}
              {uploadModal === "bom" && <BomUpload projectOptions={projectOptions} />}
            </div>
          </div>
        </div>
      )}

      {/* 수정 모달 */}
      {editingBlock && (
        <BlockEditModal projectId={editingBlock.id} projectCode={editingBlock.projectCode} projectName={editingBlock.projectName} onClose={() => setEditingBlock(null)} />
      )}
      {editingVessel && (
        <VesselEditModal vesselCode={editingVessel.code} blockIds={editingVessel.blocks.map(b => b.id)} onClose={() => setEditingVessel(null)} />
      )}
    </div>
  );
}

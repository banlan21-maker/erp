"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
} from "@/components/ui/select";
import { Upload, FileSpreadsheet, FolderOpen, CheckCircle2, AlertCircle, Settings2, List, ArrowLeft, Plus, Trash2, MapPin, X } from "lucide-react";
import PresetManager from "./preset-manager";
import DrawingTable from "./drawing-table";
import type { DrawingList } from "@prisma/client";

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

interface UploadResult {
  success: boolean;
  message: string;
  count?: number;
  warnings?: string[];
}

interface Preset {
  id: string;
  name: string;
  dataStartRow: number;
}

const STATUS_LABEL: Record<string, string> = { ACTIVE: "진행중", COMPLETED: "완료", ON_HOLD: "보류" };
const STATUS_COLOR: Record<string, string> = {
  ACTIVE: "bg-green-100 text-green-700",
  COMPLETED: "bg-gray-100 text-gray-600",
  ON_HOLD: "bg-yellow-100 text-yellow-700",
};

export default function DrawingsMain({
  tab,
  projectId,
  projectOptions,
  recentUploads,
  drawings,
  activeProject,
  confirmedDrawingIds = [],
  baseUrl = "/cutpart/drawings",
  hideHeader = false,
  hideTabs = false,
}: {
  tab: string;
  projectId: string | null;
  projectOptions: ProjectOption[];
  recentUploads: RecentUpload[];
  drawings: DrawingList[];
  activeProject: { id: string; projectCode: string; projectName: string; storageLocation?: string | null } | null;
  confirmedDrawingIds?: string[];
  baseUrl?: string;
  hideHeader?: boolean;
  hideTabs?: boolean;
}) {
  const router = useRouter();

  const goTab = (t: string) => router.push(`${baseUrl}?tab=${t}`);

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      {!hideHeader && (
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <FileSpreadsheet size={24} className="text-blue-600" />
            강재관리
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">강재 등록 및 현황을 관리합니다.</p>
        </div>
      )}

      {/* 탭 */}
      {!hideTabs && (
        <div className="flex border-b border-gray-200 gap-0 overflow-x-auto">
          {[
            { key: "upload", icon: <Upload size={14} />, label: "강재등록" },
            { key: "list",   icon: <List size={14} />,   label: "강재리스트" },
          ].map(({ key, icon, label }) => (
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
      )}

      {/* 강재등록 탭 */}
      {tab === "upload" && (
        <UploadTab
          projectOptions={projectOptions}
          recentUploads={recentUploads}
          router={router}
          baseUrl={baseUrl}
        />
      )}

      {/* 강재리스트 탭 */}
      {tab === "list" && (
        <ListTab
          projectOptions={projectOptions}
          drawings={drawings}
          activeProject={activeProject}
          projectId={projectId}
          confirmedDrawingIds={confirmedDrawingIds}
          router={router}
          baseUrl={baseUrl}
        />
      )}

    </div>
  );
}

interface ManualRow {
  block: string; drawingNo: string; heatNo: string; material: string;
  thickness: string; width: string; length: string; qty: string;
  steelWeight: string; useWeight: string;
}

const emptyManualRow = (): ManualRow => ({
  block: "", drawingNo: "", heatNo: "", material: "",
  thickness: "", width: "", length: "", qty: "1",
  steelWeight: "", useWeight: "",
});

/* ── 강재등록 탭 ─────────────────────────────────────────────────────────── */
function UploadTab({
  projectOptions,
  recentUploads,
  router,
  baseUrl = "/cutpart/drawings",
}: {
  projectOptions: ProjectOption[];
  recentUploads: RecentUpload[];
  router: ReturnType<typeof useRouter>;
  baseUrl?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [showPresetManager, setShowPresetManager] = useState(false);
  const [selectedPresetId, setSelectedPresetId] = useState<string>("__default__");
  const [presets, setPresets] = useState<Preset[]>([]);

  useEffect(() => {
    fetch("/api/excel-presets")
      .then((r) => r.json())
      .then((d) => { if (d.success) setPresets(d.data); });
  }, []);

  const grouped: Record<string, ProjectOption[]> = {};
  for (const p of projectOptions) {
    if (!grouped[p.projectCode]) grouped[p.projectCode] = [];
    grouped[p.projectCode].push(p);
  }

  const selectedProject = projectOptions.find((p) => p.id === selectedProjectId);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      setResult({ success: false, message: "Excel 파일(.xlsx, .xls)만 업로드 가능합니다." });
      return;
    }
    setSelectedFile(file);
    setResult(null);
  };

  const handleUpload = async () => {
    if (!selectedProjectId) { alert("호선/블록 선택은 필수입니다.\n프로젝트를 먼저 등록하고 호선/블록을 선택하세요."); return; }
    if (!selectedFile) { setResult({ success: false, message: "Excel 파일을 선택하세요." }); return; }
    setLoading(true);
    setResult(null);
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("projectId", selectedProjectId);
      if (selectedPresetId !== "__default__") formData.append("presetId", selectedPresetId);
      const res = await fetch("/api/drawings", { method: "POST", body: formData });
      const data = await res.json();
      if (data.success) {
        setResult({ success: true, message: `${data.data.count}행이 등록되었습니다.`, count: data.data.count, warnings: data.data.warnings });
        setSelectedFile(null);
        if (fileRef.current) fileRef.current.value = "";
        router.refresh();
      } else {
        setResult({ success: false, message: data.error, warnings: data.details });
      }
    } catch { setResult({ success: false, message: "서버 연결 오류가 발생했습니다." }); }
    finally { setLoading(false); }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-800 flex items-center gap-2">
            <Upload size={16} className="text-blue-500" /> 강재리스트 등록
          </h3>
          <Button variant="outline" size="sm" onClick={() => setShowPresetManager(true)} className="flex items-center gap-1.5 text-xs">
            <Settings2 size={13} /> 업로드 형식 지정
          </Button>
        </div>

        {projectOptions.length === 0 ? (
          <div className="text-center py-6 text-gray-400 border-2 border-dashed rounded-xl">
            <FolderOpen size={28} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm">등록된 호선이 없습니다.</p>
            <Link href="/cutpart/projects/new" className="text-xs text-blue-500 hover:underline mt-1 inline-block">호선 먼저 등록하기 →</Link>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Step 1 */}
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <span className="bg-blue-600 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold">1</span>
                호선 / 블록 선택
              </Label>
              <Select value={selectedProjectId} onValueChange={(v) => { setSelectedProjectId(v ?? ""); setResult(null); }}>
                <SelectTrigger className="w-full">
                  {selectedProjectId && selectedProject ? (
                    <span>{selectedProject.projectCode} - {selectedProject.projectName}</span>
                  ) : (
                    <span className="text-muted-foreground">호선 및 블록을 선택하세요</span>
                  )}
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(grouped).map(([code, blocks]) => (
                    <SelectGroup key={code}>
                      <SelectLabel className="text-xs font-bold text-gray-500">호선 [{code}]</SelectLabel>
                      {blocks.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          <span className="font-medium">{p.projectName}</span>
                          <span className="text-gray-400 text-xs ml-2">(현재 {p.drawingCount}행)</span>
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
              {selectedProject && (
                <p className="text-xs text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg">
                  선택: 호선 [{selectedProject.projectCode}] — {selectedProject.projectName}
                  {selectedProject.drawingCount > 0 && (
                    <span className="text-orange-600 ml-2">· 기존 {selectedProject.drawingCount}행에 추가됩니다</span>
                  )}
                </p>
              )}
            </div>

            {/* Step 2: Excel 파일 선택 */}
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <span className="bg-blue-600 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold">2</span>
                Excel 파일 선택
              </Label>
              <div
                onClick={() => fileRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
                  selectedFile ? "border-green-400 bg-green-50" : "border-gray-200 hover:border-blue-400 hover:bg-blue-50"
                }`}
              >
                {selectedFile ? (
                  <div className="flex items-center justify-center gap-2 text-green-700">
                    <FileSpreadsheet size={20} />
                    <span className="text-sm font-medium">{selectedFile.name}</span>
                    <span className="text-xs text-gray-500">({(selectedFile.size / 1024).toFixed(1)} KB)</span>
                  </div>
                ) : (
                  <div className="text-gray-400">
                    <FileSpreadsheet size={28} className="mx-auto mb-2 opacity-50" />
                    <p className="text-sm">클릭하여 Excel 파일 선택</p>
                    <p className="text-xs mt-1">.xlsx, .xls 지원</p>
                  </div>
                )}
              </div>
              <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFileSelect} className="hidden" />
            </div>

            {/* Step 3 */}
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <span className="bg-blue-600 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold">3</span>
                업로드 형식
              </Label>
              <Select value={selectedPresetId} onValueChange={(v) => setSelectedPresetId(v ?? "__default__")}>
                <SelectTrigger className="w-full">
                  {selectedPresetId === "__default__" ? (
                    <span>기본값 - 자동감지</span>
                  ) : (
                    <span>{presets.find((p) => p.id === selectedPresetId)?.name ?? "형식 선택"}</span>
                  )}
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__default__">기본값 - 자동감지</SelectItem>
                  {presets.map((preset) => (
                    <SelectItem key={preset.id} value={preset.id}>
                      {preset.name}
                      <span className="text-gray-400 text-xs ml-2">(시작행: {preset.dataStartRow})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {result && (
              <div className={`flex items-start gap-2 p-3 rounded-lg text-sm ${
                result.success ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"
              }`}>
                {result.success ? <CheckCircle2 size={16} className="flex-shrink-0 mt-0.5" /> : <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />}
                <div>
                  <p className="font-medium">{result.message}</p>
                  {result.warnings && result.warnings.length > 0 && (
                    <ul className="mt-1 space-y-0.5">
                      {result.warnings.slice(0, 5).map((w, i) => <li key={i} className="text-xs opacity-80">· {w}</li>)}
                      {result.warnings.length > 5 && <li className="text-xs opacity-60">외 {result.warnings.length - 5}건...</li>}
                    </ul>
                  )}
                </div>
              </div>
            )}

            <Button onClick={handleUpload} disabled={loading || !selectedProjectId || !selectedFile} className="w-full flex items-center gap-2">
              <Upload size={15} />
              {loading ? "파싱 중..." : "강재리스트 등록"}
            </Button>
          </div>
        )}
        </div>
      </div>

      {/* 최근 등록 현황 */}
      <div className="bg-white rounded-xl border p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">최근 등록 현황</h3>
        {recentUploads.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">아직 등록된 강재리스트가 없습니다.</p>
        ) : (
          <div className="space-y-1">
            {recentUploads.map((u) => (
              <Link
                key={u.projectId}
                href={`${baseUrl}?tab=list&projectId=${u.projectId}`}
                className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <FileSpreadsheet size={14} className="text-green-500 flex-shrink-0" />
                <span className="text-sm font-medium text-gray-800">[{u.project.projectCode}] {u.project.projectName}</span>
                <span className="text-xs text-gray-400 ml-auto">
                  {u.sourceFile ?? "파일명 없음"} · {new Date(u.createdAt).toLocaleDateString("ko-KR")}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {showPresetManager && (
        <PresetManager onClose={() => {
          setShowPresetManager(false);
          fetch("/api/excel-presets").then((r) => r.json()).then((d) => { if (d.success) setPresets(d.data); });
        }} />
      )}
    </div>
  );
}

/* ── 강재리스트 탭 ───────────────────────────────────────────────────────── */
function ListTab({
  projectOptions,
  drawings,
  activeProject,
  projectId,
  confirmedDrawingIds = [],
  router,
  baseUrl = "/cutpart/drawings",
}: {
  projectOptions: ProjectOption[];
  drawings: DrawingList[];
  activeProject: { id: string; projectCode: string; projectName: string; storageLocation?: string | null } | null;
  projectId: string | null;
  confirmedDrawingIds?: string[];
  router: ReturnType<typeof useRouter>;
  baseUrl?: string;
}) {
  const [steelStorageLocation, setSteelStorageLocation] = useState<string | null>(null);

  useEffect(() => {
    if (!activeProject) { setSteelStorageLocation(null); return; }
    fetch(`/api/steel-plan?vesselCode=${encodeURIComponent(activeProject.projectCode)}`)
      .then(r => r.json())
      .then((rows: Array<{ storageLocation?: string | null }>) => {
        const loc = rows.find(r => r.storageLocation)?.storageLocation ?? null;
        setSteelStorageLocation(loc);
      });
  }, [activeProject?.projectCode]);

  // 프로젝트가 선택된 경우 → 강재리스트 테이블 표시
  if (projectId && activeProject) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => router.push(`${baseUrl}?tab=list`)}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
          >
            <ArrowLeft size={15} /> 목록으로
          </button>
          <h3 className="text-base font-semibold text-gray-800">
            [{activeProject.projectCode}] {activeProject.projectName}
          </h3>
        </div>

        {/* 보관위치 배너 */}
        <div className="flex items-center gap-3 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-xl">
          <MapPin size={15} className="text-amber-600 flex-shrink-0" />
          <span className="text-sm font-medium text-amber-800 flex-1">
            보관위치 : {steelStorageLocation ?? <span className="text-amber-500 font-normal">미확정</span>}
          </span>
        </div>

        <DrawingTable drawings={drawings} projectId={activeProject.id} confirmedDrawingIds={confirmedDrawingIds} />
      </div>
    );
  }

  // 프로젝트 선택 전 → 프로젝트 목록 표시
  const grouped: Record<string, ProjectOption[]> = {};
  for (const p of projectOptions) {
    if (!grouped[p.projectCode]) grouped[p.projectCode] = [];
    grouped[p.projectCode].push(p);
  }

  if (projectOptions.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400 bg-white rounded-xl border text-sm">
        <FolderOpen size={28} className="mx-auto mb-2 opacity-50" />
        <p>등록된 호선이 없습니다.</p>
        <Link href="/cutpart/projects/new" className="text-xs text-blue-500 hover:underline mt-1 inline-block">호선 먼저 등록하기 →</Link>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {Object.entries(grouped).map(([code, blocks]) => (
        <div key={code} className="bg-white rounded-xl border overflow-hidden">
          <div className="px-4 py-2.5 bg-gray-50 border-b">
            <span className="text-xs font-bold text-gray-500">호선 [{code}]</span>
          </div>
          <div className="divide-y">
            {blocks.map((p) => (
              <Link
                key={p.id}
                href={`${baseUrl}?tab=list&projectId=${p.id}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-blue-50 transition-colors group"
              >
                <FileSpreadsheet size={15} className="text-gray-400 group-hover:text-blue-500 flex-shrink-0" />
                <span className="flex-1 text-sm font-medium text-gray-800">{p.projectName}</span>
                {p.storageLocation && (
                  <span className="flex items-center gap-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                    <MapPin size={10} />
                    보관장소: {p.storageLocation}
                  </span>
                )}
                <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLOR[p.status]}`}>
                  {STATUS_LABEL[p.status]}
                </span>
                <span className="text-xs text-gray-400">{p.drawingCount}행</span>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

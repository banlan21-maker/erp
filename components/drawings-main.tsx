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
import { Upload, FileSpreadsheet, FolderOpen, CheckCircle2, AlertCircle, Settings2, List, ArrowLeft, PackagePlus, Package, Plus, Trash2, MapPin, Pencil, X, Check } from "lucide-react";
import PresetManager from "./preset-manager";
import DrawingTable from "./drawing-table";
import { RemnantRegisterTab, RemnantManageTab } from "./remnant-tabs";
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
}: {
  tab: string;
  projectId: string | null;
  projectOptions: ProjectOption[];
  recentUploads: RecentUpload[];
  drawings: DrawingList[];
  activeProject: { id: string; projectCode: string; projectName: string; storageLocation?: string | null } | null;
}) {
  const router = useRouter();

  const goTab = (t: string) => router.push(`/drawings?tab=${t}`);

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <FileSpreadsheet size={24} className="text-blue-600" />
          강재관리
        </h2>
        <p className="text-sm text-gray-500 mt-0.5">강재 등록 및 현황을 관리합니다.</p>
      </div>

      {/* 탭 */}
      <div className="flex border-b border-gray-200 gap-0 overflow-x-auto">
        {[
          { key: "upload",  icon: <Upload size={14} />,       label: "강재등록" },
          { key: "list",    icon: <List size={14} />,          label: "강재리스트" },
          { key: "remnant-add",    icon: <PackagePlus size={14} />, label: "잔재등록" },
          { key: "remnant-manage", icon: <Package size={14} />,     label: "잔재관리" },
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

      {/* 강재등록 탭 */}
      {tab === "upload" && (
        <UploadTab
          projectOptions={projectOptions}
          recentUploads={recentUploads}
          router={router}
        />
      )}

      {/* 강재리스트 탭 */}
      {tab === "list" && (
        <ListTab
          projectOptions={projectOptions}
          drawings={drawings}
          activeProject={activeProject}
          projectId={projectId}
          router={router}
        />
      )}

      {/* 잔재등록 탭 */}
      {tab === "remnant-add" && (
        <RemnantRegisterTab projects={projectOptions} />
      )}

      {/* 잔재관리 탭 */}
      {tab === "remnant-manage" && (
        <RemnantManageTab projects={projectOptions} />
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
}: {
  projectOptions: ProjectOption[];
  recentUploads: RecentUpload[];
  router: ReturnType<typeof useRouter>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"excel" | "manual">("excel");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [storageLocation, setStorageLocation] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [showPresetManager, setShowPresetManager] = useState(false);
  const [selectedPresetId, setSelectedPresetId] = useState<string>("__default__");
  const [presets, setPresets] = useState<Preset[]>([]);

  // 추가등록 수동 행 목록
  const [manualRows, setManualRows] = useState<ManualRow[]>([emptyManualRow()]);
  const [manualLoading, setManualLoading] = useState(false);
  const [manualResult, setManualResult] = useState<UploadResult | null>(null);

  const updateRow = (i: number, field: keyof ManualRow, val: string) =>
    setManualRows(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: val } : r));
  const addRow = () => setManualRows(prev => [...prev, emptyManualRow()]);
  const removeRow = (i: number) => setManualRows(prev => prev.length === 1 ? prev : prev.filter((_, idx) => idx !== i));

  const submitManual = async () => {
    if (!selectedProjectId) { setManualResult({ success: false, message: "호선을 먼저 선택하세요." }); return; }
    const invalid = manualRows.find(r => !r.material.trim() || !r.thickness || !r.width || !r.length || !r.qty);
    if (invalid) { setManualResult({ success: false, message: "재질, 두께, 폭, 길이, 수량은 필수입니다." }); return; }
    setManualLoading(true); setManualResult(null);
    try {
      const res = await fetch("/api/drawings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: selectedProjectId,
          rows: manualRows.map(r => ({
            block: r.block || null,
            drawingNo: r.drawingNo || null,
            heatNo: r.heatNo || null,
            material: r.material,
            thickness: Number(r.thickness),
            width: Number(r.width),
            length: Number(r.length),
            qty: Number(r.qty),
            steelWeight: r.steelWeight ? Number(r.steelWeight) : null,
            useWeight: r.useWeight ? Number(r.useWeight) : null,
          })),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setManualResult({ success: true, message: `${data.data.count}행이 추가되었습니다.` });
        setManualRows([emptyManualRow()]);
        router.refresh();
      } else {
        setManualResult({ success: false, message: data.error });
      }
    } catch { setManualResult({ success: false, message: "서버 연결 오류" }); }
    finally { setManualLoading(false); }
  };

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
      if (storageLocation.trim()) formData.append("storageLocation", storageLocation.trim());
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
        {/* 신규등록 / 추가등록 서브탭 */}
        <div className="flex border-b border-gray-100">
          <button
            onClick={() => { setMode("excel"); setResult(null); setManualResult(null); }}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-colors ${
              mode === "excel" ? "border-blue-600 text-blue-600 bg-blue-50/40" : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            <Upload size={14} /> 신규등록 (Excel)
          </button>
          <button
            onClick={() => { setMode("manual"); setResult(null); setManualResult(null); }}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-colors ${
              mode === "manual" ? "border-blue-600 text-blue-600 bg-blue-50/40" : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            <Plus size={14} /> 추가등록 (직접 입력)
          </button>
        </div>

        {/* 추가등록 (수동 다중 행) */}
        {mode === "manual" && (
          <div className="p-5 space-y-4">
            <p className="text-xs text-gray-500">호선을 선택하고 추가할 강재 정보를 입력한 뒤 일괄 저장합니다.</p>

            {/* 호선 선택 */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
                <span className="bg-blue-600 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold">1</span>
                호선 선택
              </label>
              <Select value={selectedProjectId} onValueChange={v => { setSelectedProjectId(v ?? ""); setManualResult(null); }}>
                <SelectTrigger className="w-full max-w-sm">
                  {selectedProjectId && projectOptions.find(p => p.id === selectedProjectId) ? (
                    <span>{projectOptions.find(p => p.id === selectedProjectId)!.projectCode} - {projectOptions.find(p => p.id === selectedProjectId)!.projectName}</span>
                  ) : (
                    <span className="text-muted-foreground">호선 및 블록을 선택하세요</span>
                  )}
                </SelectTrigger>
                <SelectContent>
                  {Object.entries((() => { const g: Record<string, ProjectOption[]> = {}; for (const p of projectOptions) { if (!g[p.projectCode]) g[p.projectCode] = []; g[p.projectCode].push(p); } return g; })()).map(([code, blocks]) => (
                    <SelectGroup key={code}>
                      <SelectLabel className="text-xs font-bold text-gray-500">호선 [{code}]</SelectLabel>
                      {blocks.map(p => <SelectItem key={p.id} value={p.id}>{p.projectName} <span className="text-gray-400 text-xs ml-1">(현재 {p.drawingCount}행)</span></SelectItem>)}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* 행 입력 테이블 */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
                <span className="bg-blue-600 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold">2</span>
                강재 정보 입력
              </label>
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="w-full text-xs min-w-[900px]">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      {["블록", "도면번호/NEST", "Heat NO", "재질*", "두께(mm)*", "폭(mm)*", "길이(mm)*", "수량*", "강재중량(kg)", "사용중량(kg)", ""].map((h, i) => (
                        <th key={i} className={`px-2 py-2 font-semibold text-gray-500 whitespace-nowrap ${i >= 4 && i <= 9 ? "text-right" : "text-left"}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {manualRows.map((r, i) => (
                      <tr key={i} className="bg-white hover:bg-blue-50/30">
                        <td className="px-1 py-1"><input className="w-20 h-7 px-2 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-400" placeholder="FR20" value={r.block} onChange={e => updateRow(i, "block", e.target.value)} /></td>
                        <td className="px-1 py-1"><input className="w-28 h-7 px-2 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-400" placeholder="도면번호" value={r.drawingNo} onChange={e => updateRow(i, "drawingNo", e.target.value)} /></td>
                        <td className="px-1 py-1"><input className="w-24 h-7 px-2 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-400" placeholder="Heat NO" value={r.heatNo} onChange={e => updateRow(i, "heatNo", e.target.value)} /></td>
                        <td className="px-1 py-1"><input className="w-20 h-7 px-2 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-400 font-semibold" placeholder="SS400" value={r.material} onChange={e => updateRow(i, "material", e.target.value)} /></td>
                        <td className="px-1 py-1"><input type="number" className="w-16 h-7 px-2 border border-gray-200 rounded text-xs text-right focus:outline-none focus:ring-1 focus:ring-blue-400" placeholder="0" value={r.thickness} onChange={e => updateRow(i, "thickness", e.target.value)} /></td>
                        <td className="px-1 py-1"><input type="number" className="w-20 h-7 px-2 border border-gray-200 rounded text-xs text-right focus:outline-none focus:ring-1 focus:ring-blue-400" placeholder="0" value={r.width} onChange={e => updateRow(i, "width", e.target.value)} /></td>
                        <td className="px-1 py-1"><input type="number" className="w-20 h-7 px-2 border border-gray-200 rounded text-xs text-right focus:outline-none focus:ring-1 focus:ring-blue-400" placeholder="0" value={r.length} onChange={e => updateRow(i, "length", e.target.value)} /></td>
                        <td className="px-1 py-1"><input type="number" className="w-14 h-7 px-2 border border-gray-200 rounded text-xs text-right focus:outline-none focus:ring-1 focus:ring-blue-400" placeholder="1" value={r.qty} onChange={e => updateRow(i, "qty", e.target.value)} /></td>
                        <td className="px-1 py-1"><input type="number" className="w-20 h-7 px-2 border border-gray-200 rounded text-xs text-right focus:outline-none focus:ring-1 focus:ring-blue-400" placeholder="-" value={r.steelWeight} onChange={e => updateRow(i, "steelWeight", e.target.value)} /></td>
                        <td className="px-1 py-1"><input type="number" className="w-20 h-7 px-2 border border-gray-200 rounded text-xs text-right focus:outline-none focus:ring-1 focus:ring-blue-400" placeholder="-" value={r.useWeight} onChange={e => updateRow(i, "useWeight", e.target.value)} /></td>
                        <td className="px-1 py-1">
                          <button onClick={() => removeRow(i)} disabled={manualRows.length === 1} className="p-1 text-gray-300 hover:text-red-500 disabled:cursor-not-allowed">
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button onClick={addRow} className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 mt-1 px-1">
                <Plus size={13} /> 행 추가
              </button>
            </div>

            {manualResult && (
              <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${manualResult.success ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
                {manualResult.success ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
                {manualResult.message}
              </div>
            )}

            <Button onClick={submitManual} disabled={manualLoading || !selectedProjectId} className="w-full flex items-center gap-2">
              <Plus size={15} /> {manualLoading ? "저장 중..." : `${manualRows.length}행 추가 저장`}
            </Button>
          </div>
        )}

        {/* 신규등록 (Excel) */}
        {mode === "excel" && (
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
            <Link href="/projects/new" className="text-xs text-blue-500 hover:underline mt-1 inline-block">호선 먼저 등록하기 →</Link>
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

            {/* Step 2: 보관위치 */}
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <span className="bg-blue-600 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold">2</span>
                보관위치 지정 <span className="text-gray-400 font-normal text-xs ml-1">(선택)</span>
              </Label>
              <div className="relative max-w-sm">
                <MapPin size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={storageLocation}
                  onChange={(e) => setStorageLocation(e.target.value)}
                  placeholder="예: A구역 3번 열"
                  className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
              <p className="text-xs text-gray-400">야드 내 강재를 보관할 위치를 입력합니다. 이후 강재리스트에 표시됩니다.</p>
            </div>

            {/* Step 3: Excel 파일 선택 */}
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <span className="bg-blue-600 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold">3</span>
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

            {/* Step 2.5 */}
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <span className="bg-gray-400 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold">✦</span>
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
        )} {/* end mode === "excel" */}
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
                href={`/drawings?tab=list&projectId=${u.projectId}`}
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
  router,
}: {
  projectOptions: ProjectOption[];
  drawings: DrawingList[];
  activeProject: { id: string; projectCode: string; projectName: string; storageLocation?: string | null } | null;
  projectId: string | null;
  router: ReturnType<typeof useRouter>;
}) {
  const [editingLocation, setEditingLocation] = useState(false);
  const [locationInput, setLocationInput] = useState(activeProject?.storageLocation ?? "");
  const [savingLocation, setSavingLocation] = useState(false);
  const [currentLocation, setCurrentLocation] = useState(activeProject?.storageLocation ?? null);

  const hasReceived = drawings.some(d => d.status === "WAITING" || d.status === "CUT");
  const locationLabel = currentLocation
    ? `${currentLocation} 구역에 ${hasReceived ? "보관중" : "보관 예정"}`
    : null;

  const saveLocation = async () => {
    if (!activeProject) return;
    setSavingLocation(true);
    try {
      const res = await fetch(`/api/projects/${activeProject.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storageLocation: locationInput }),
      });
      const data = await res.json();
      if (data.success) {
        setCurrentLocation(locationInput.trim() || null);
        setEditingLocation(false);
      }
    } finally {
      setSavingLocation(false);
    }
  };

  // 프로젝트가 선택된 경우 → 강재리스트 테이블 표시
  if (projectId && activeProject) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => router.push("/drawings?tab=list")}
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
          {editingLocation ? (
            <>
              <input
                autoFocus
                type="text"
                value={locationInput}
                onChange={(e) => setLocationInput(e.target.value)}
                placeholder="예: A구역 3번 열"
                className="flex-1 text-sm px-2 py-1 border border-amber-300 rounded focus:outline-none focus:ring-2 focus:ring-amber-400"
                onKeyDown={(e) => { if (e.key === "Enter") saveLocation(); if (e.key === "Escape") setEditingLocation(false); }}
              />
              <button onClick={saveLocation} disabled={savingLocation} className="p-1 text-green-600 hover:text-green-800">
                <Check size={15} />
              </button>
              <button onClick={() => setEditingLocation(false)} className="p-1 text-gray-400 hover:text-gray-600">
                <X size={15} />
              </button>
            </>
          ) : (
            <>
              <span className="text-sm font-medium text-amber-800 flex-1">
                {locationLabel ?? <span className="text-amber-500 font-normal">보관위치 미지정</span>}
              </span>
              <button
                onClick={() => { setLocationInput(currentLocation ?? ""); setEditingLocation(true); }}
                className="flex items-center gap-1.5 text-xs font-medium text-amber-700 hover:text-amber-900 border border-amber-300 hover:border-amber-500 px-2.5 py-1 rounded-lg transition-colors"
              >
                <Pencil size={11} /> 보관장소 변경
              </button>
            </>
          )}
        </div>

        <DrawingTable drawings={drawings} projectId={activeProject.id} />
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
        <Link href="/projects/new" className="text-xs text-blue-500 hover:underline mt-1 inline-block">호선 먼저 등록하기 →</Link>
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
                href={`/drawings?tab=list&projectId=${p.id}`}
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

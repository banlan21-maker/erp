"use client";

import React, { useEffect, useRef, useState } from "react";
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
import { Upload, FileSpreadsheet, FolderOpen, CheckCircle2, AlertCircle, Settings2, List, ArrowLeft, MapPin, ChevronDown, ChevronRight } from "lucide-react";
import PresetManager from "./preset-manager";
import DrawingTable from "./drawing-table";
import type { DrawingList } from "@prisma/client";

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

const STATUS_LABEL: Record<string, string> = { ACTIVE: "진행중", COMPLETED: "완료" };
const STATUS_COLOR: Record<string, string> = {
  ACTIVE: "bg-green-100 text-green-700",
  COMPLETED: "bg-blue-100 text-blue-700",
};

export default function DrawingsMain({
  tab,
  projectId,
  projectOptions,
  recentUploads,
  drawings,
  activeProject,
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
  baseUrl?: string;
  hideHeader?: boolean;
  hideTabs?: boolean;
}) {
  const router = useRouter();
  const goTab = (t: string) => router.push(`${baseUrl}?tab=${t}`);

  return (
    <div className="space-y-4">
      {!hideHeader && (
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <FileSpreadsheet size={24} className="text-blue-600" />
            강재관리
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">강재 등록 및 현황을 관리합니다.</p>
        </div>
      )}
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
                tab === key ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {icon} {label}
            </button>
          ))}
        </div>
      )}

      {tab === "upload" && (
        <UploadTab projectOptions={projectOptions} recentUploads={recentUploads} router={router} baseUrl={baseUrl} />
      )}
      {tab === "list" && (
        <ListTab
          projectOptions={projectOptions} drawings={drawings} activeProject={activeProject}
          projectId={projectId} router={router} baseUrl={baseUrl}
        />
      )}
    </div>
  );
}

// ── 타입 정의 ────────────────────────────────────────────────────────────────

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

interface PreviewRow {
  block: string | null; drawingNo: string | null; heatNo: string | null;
  material: string; thickness: number; width: number; length: number;
  qty: number; steelWeight: number | null; useWeight: number | null;
}

interface RemnantInput {
  open: boolean; remnantNo: string; shape: "RECTANGLE" | "L_SHAPE";
  width1: string; length1: string; width2: string; length2: string;
}

interface RemnantOption {
  id: string; remnantNo: string; material: string; thickness: number; shape: string;
  width1: number | null; length1: number | null; width2: number | null; length2: number | null;
  weight: number;
}

/* ── 강재등록 탭 ─────────────────────────────────────────────────────────── */
function UploadTab({
  projectOptions, recentUploads, router, baseUrl = "/cutpart/drawings",
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
  const [file, setFile] = useState<File | null>(null);
  const [showPresetManager, setShowPresetManager] = useState(false);
  const [selectedPresetId, setSelectedPresetId] = useState<string>("__default__");
  const [presets, setPresets] = useState<Preset[]>([]);
  const [previewRows, setPreviewRows] = useState<PreviewRow[] | null>(null);
  // 행별 등록잔재 발생 입력 (원재사용 + 잔재사용 모두 가능)
  const [remnantInputs, setRemnantInputs] = useState<Record<number, RemnantInput>>({});
  // 행별 사용할 등록잔재 지정 (idx → remnantId, "" = 지정됐지만 아직 선택 전)
  const [remnantAssignments, setRemnantAssignments] = useState<Record<number, string>>({});
  // 선택 가능한 IN_STOCK 등록잔재 목록
  const [availableRemnants, setAvailableRemnants] = useState<RemnantOption[]>([]);

  useEffect(() => {
    fetch("/api/excel-presets").then(r => r.json()).then(d => { if (d.success) setPresets(d.data); });
  }, []);

  // 미리보기가 열릴 때 사용 가능한 등록잔재 불러오기
  useEffect(() => {
    if (!previewRows) { setAvailableRemnants([]); return; }
    fetch("/api/remnants?type=REGISTERED&status=IN_STOCK")
      .then(r => r.json())
      .then(d => { if (d.success) setAvailableRemnants(d.data); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!previewRows]);

  const grouped: Record<string, ProjectOption[]> = {};
  for (const p of projectOptions) {
    if (!grouped[p.projectCode]) grouped[p.projectCode] = [];
    grouped[p.projectCode].push(p);
  }
  const selectedProject = projectOptions.find(p => p.id === selectedProjectId);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.name.match(/\.(xlsx|xls)$/i)) {
      setResult({ success: false, message: "Excel 파일(.xlsx, .xls)만 업로드 가능합니다." });
      return;
    }
    setFile(f);
    setResult(null);
    setPreviewRows(null);
    setRemnantInputs({});
    setRemnantAssignments({});
  };

  const handlePreview = async () => {
    if (!file || !selectedProjectId) { alert("파일과 프로젝트를 선택하세요."); return; }
    setLoading(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("projectId", selectedProjectId);
    if (selectedPresetId !== "__default__") fd.append("presetId", selectedPresetId);
    const res = await fetch("/api/drawings?preview=true", { method: "POST", body: fd });
    const data = await res.json();
    setLoading(false);
    if (data.success) {
      setPreviewRows(data.rows);
      setRemnantInputs({});
      setRemnantAssignments({});
    } else {
      alert(data.error ?? "파싱 실패");
    }
  };

  const handleRegister = async () => {
    if (!file || !selectedProjectId || !previewRows) return;
    setLoading(true);

    const remnantsData = Object.entries(remnantInputs)
      .filter(([, v]) => v.open && v.width1 && v.length1)
      .map(([idx, v]) => ({
        rowIndex: Number(idx), remnantNo: v.remnantNo, shape: v.shape,
        width1: Number(v.width1), length1: Number(v.length1),
        width2: v.width2 ? Number(v.width2) : undefined,
        length2: v.length2 ? Number(v.length2) : undefined,
      }));

    // 등록잔재 지정 (빈 문자열 = 선택 안 됨 → 제외)
    const assignmentsData = Object.entries(remnantAssignments)
      .filter(([, remnantId]) => remnantId)
      .map(([idx, remnantId]) => ({ rowIndex: Number(idx), remnantId }));

    const fd = new FormData();
    fd.append("file", file);
    fd.append("projectId", selectedProjectId);
    if (selectedPresetId !== "__default__") fd.append("presetId", selectedPresetId);
    fd.append("remnants", JSON.stringify(remnantsData));
    fd.append("assignments", JSON.stringify(assignmentsData));

    const res = await fetch("/api/drawings", { method: "POST", body: fd });
    const data = await res.json();
    setLoading(false);
    if (data.success) {
      setResult({ success: true, message: `${data.data.count}행이 등록되었습니다.`, count: data.data.count, warnings: data.data.warnings });
      setPreviewRows(null);
      setRemnantInputs({});
      setRemnantAssignments({});
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    } else {
      alert(data.error ?? "등록 실패");
    }
  };

  const toggleRemnantInput = (idx: number) => {
    setRemnantInputs(prev => ({
      ...prev,
      [idx]: prev[idx]
        ? { ...prev[idx], open: !prev[idx].open }
        : { open: true, remnantNo: "", shape: "RECTANGLE", width1: "", length1: "", width2: "", length2: "" },
    }));
  };

  const moveToAssigned = (idx: number) => setRemnantAssignments(prev => ({ ...prev, [idx]: "" }));
  const moveToNormal = (idx: number) => setRemnantAssignments(prev => {
    const next = { ...prev }; delete next[idx]; return next;
  });
  const setAssignedRemnant = (idx: number, remnantId: string) =>
    setRemnantAssignments(prev => ({ ...prev, [idx]: remnantId }));

  const assignedIndices = new Set(Object.keys(remnantAssignments).map(Number));
  const normalCount  = previewRows ? previewRows.filter((_, i) => !assignedIndices.has(i)).length : 0;
  const assignedCount = assignedIndices.size;

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
              {!previewRows && (
                <>
                  {/* Step 1 */}
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-1.5">
                      <span className="bg-blue-600 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold">1</span>
                      호선 / 블록 선택
                    </Label>
                    <Select value={selectedProjectId} onValueChange={v => { setSelectedProjectId(v ?? ""); setResult(null); }}>
                      <SelectTrigger className="w-full">
                        {selectedProjectId && selectedProject
                          ? <span>{selectedProject.projectCode} - {selectedProject.projectName}</span>
                          : <span className="text-muted-foreground">호선 및 블록을 선택하세요</span>}
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(grouped).map(([code, blocks]) => (
                          <SelectGroup key={code}>
                            <SelectLabel className="text-xs font-bold text-gray-500">호선 [{code}]</SelectLabel>
                            {blocks.map(p => (
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

                  {/* Step 2 */}
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-1.5">
                      <span className="bg-blue-600 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold">2</span>
                      Excel 파일 선택
                    </Label>
                    <div
                      onClick={() => fileRef.current?.click()}
                      className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
                        file ? "border-green-400 bg-green-50" : "border-gray-200 hover:border-blue-400 hover:bg-blue-50"
                      }`}
                    >
                      {file ? (
                        <div className="flex items-center justify-center gap-2 text-green-700">
                          <FileSpreadsheet size={20} />
                          <span className="text-sm font-medium">{file.name}</span>
                          <span className="text-xs text-gray-500">({(file.size / 1024).toFixed(1)} KB)</span>
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
                    <Select value={selectedPresetId} onValueChange={v => setSelectedPresetId(v ?? "__default__")}>
                      <SelectTrigger className="w-full">
                        {selectedPresetId === "__default__"
                          ? <span>기본값 - 자동감지</span>
                          : <span>{presets.find(p => p.id === selectedPresetId)?.name ?? "형식 선택"}</span>}
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__default__">기본값 - 자동감지</SelectItem>
                        {presets.map(preset => (
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

                  <Button onClick={handlePreview} disabled={loading || !selectedProjectId || !file} className="w-full flex items-center gap-2">
                    <Upload size={15} />
                    {loading ? "파싱 중..." : "불러오기"}
                  </Button>
                </>
              )}

              {/* ── 미리보기 ────────────────────────────────────────────── */}
              {previewRows && (
                <div className="space-y-4">
                  {/* 헤더 */}
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <h4 className="text-sm font-semibold text-gray-700">
                      미리보기 — {previewRows.length}행
                      {assignedCount > 0 && (
                        <span className="ml-2 text-orange-600 text-xs">(잔재사용 {assignedCount}행)</span>
                      )}
                    </h4>
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setPreviewRows(null); setRemnantInputs({}); setRemnantAssignments({}); }}
                        className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600"
                      >
                        취소
                      </button>
                      <button
                        onClick={handleRegister} disabled={loading}
                        className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50"
                      >
                        {loading ? "등록 중..." : "강재리스트 등록"}
                      </button>
                    </div>
                  </div>

                  {/* 원재사용 목록 */}
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-gray-600">원재사용 목록</span>
                      <span className="text-xs text-gray-400">{normalCount}행</span>
                    </div>
                    <div className="bg-white border rounded-xl overflow-x-auto max-h-[400px] overflow-y-auto">
                      <table className="w-full text-xs whitespace-nowrap">
                        <thead className="bg-gray-50 border-b sticky top-0">
                          <tr>
                            {["블록","도면번호","재질","두께","폭","길이","",""].map((h, i) => (
                              <th key={i} className={`px-3 py-2 text-gray-500 font-semibold ${i >= 3 ? "text-right" : "text-left"}`}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {previewRows.map((row, idx) => {
                            if (assignedIndices.has(idx)) return null;
                            const rem = remnantInputs[idx];
                            const blockName = row.block ?? selectedProject?.projectName ?? "-";
                            return (
                              <React.Fragment key={idx}>
                                <tr className={`border-b ${rem?.open ? "bg-orange-50" : "hover:bg-gray-50"}`}>
                                  <td className="px-3 py-2 font-medium text-gray-800">{blockName}</td>
                                  <td className="px-3 py-2 font-mono text-gray-600">{row.drawingNo ?? "-"}</td>
                                  <td className="px-3 py-2"><span className="px-1.5 py-0.5 bg-slate-100 rounded font-medium">{row.material}</span></td>
                                  <td className="px-3 py-2 text-right">{row.thickness}</td>
                                  <td className="px-3 py-2 text-right">{row.width.toLocaleString()}</td>
                                  <td className="px-3 py-2 text-right">{row.length.toLocaleString()}</td>
                                  <td className="px-3 py-2 text-right">
                                    <button
                                      onClick={() => toggleRemnantInput(idx)}
                                      className={`px-2 py-0.5 text-xs rounded border font-medium transition-colors ${
                                        rem?.open
                                          ? "bg-orange-100 border-orange-300 text-orange-700"
                                          : "border-gray-300 text-gray-500 hover:border-orange-300 hover:text-orange-600"
                                      }`}
                                    >
                                      {rem?.open ? "▲ 잔재취소" : "+ 등록잔재"}
                                    </button>
                                  </td>
                                  <td className="px-3 py-2 text-right">
                                    <button
                                      onClick={() => moveToAssigned(idx)}
                                      className="px-2 py-0.5 text-xs rounded border border-blue-300 text-blue-600 hover:bg-blue-50 font-medium"
                                    >
                                      잔재지정 →
                                    </button>
                                  </td>
                                </tr>
                                {rem?.open && (
                                  <tr className="bg-orange-50 border-b">
                                    <td colSpan={8} className="px-4 py-3">
                                      <RemnantInputRow
                                        rem={rem} idx={idx}
                                        projectCode={selectedProject?.projectCode}
                                        blockName={blockName} material={row.material} thickness={row.thickness}
                                        onChange={(field, val) => setRemnantInputs(p => ({ ...p, [idx]: { ...p[idx], [field]: val } }))}
                                      />
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
                            );
                          })}
                          {normalCount === 0 && (
                            <tr><td colSpan={8} className="px-3 py-4 text-center text-gray-400">원재사용 항목이 없습니다.</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* 등록잔재사용 목록 */}
                  {assignedCount > 0 && (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-orange-700">등록잔재 사용 목록</span>
                        <span className="text-xs text-orange-400">{assignedCount}행</span>
                        {availableRemnants.length === 0 && (
                          <span className="text-xs text-red-500">사용 가능한 등록잔재(재고)가 없습니다</span>
                        )}
                      </div>
                      <div className="bg-orange-50 border border-orange-200 rounded-xl overflow-x-auto max-h-[350px] overflow-y-auto">
                        <table className="w-full text-xs whitespace-nowrap">
                          <thead className="bg-orange-100 border-b border-orange-200 sticky top-0">
                            <tr>
                              <th className="px-3 py-2 text-left text-orange-700 font-semibold">블록</th>
                              <th className="px-3 py-2 text-left text-orange-700 font-semibold">도면번호</th>
                              <th className="px-3 py-2 text-left text-orange-700 font-semibold">재질</th>
                              <th className="px-3 py-2 text-right text-orange-700 font-semibold">두께</th>
                              <th className="px-3 py-2 text-left text-orange-700 font-semibold">사용할 등록잔재</th>
                              <th className="px-3 py-2 text-orange-700 font-semibold"></th>
                              <th className="px-3 py-2 text-orange-700 font-semibold"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {previewRows.map((row, idx) => {
                              if (!assignedIndices.has(idx)) return null;
                              const rem = remnantInputs[idx];
                              const blockName = row.block ?? selectedProject?.projectName ?? "-";
                              const selectedRem = availableRemnants.find(r => r.id === remnantAssignments[idx]);
                              return (
                                <React.Fragment key={idx}>
                                  <tr className={`border-b border-orange-200 ${rem?.open ? "bg-amber-50" : "hover:bg-orange-100/50"}`}>
                                    <td className="px-3 py-2 font-medium text-gray-800">{blockName}</td>
                                    <td className="px-3 py-2 font-mono text-gray-600">{row.drawingNo ?? "-"}</td>
                                    <td className="px-3 py-2"><span className="px-1.5 py-0.5 bg-slate-100 rounded font-medium">{row.material}</span></td>
                                    <td className="px-3 py-2 text-right">{row.thickness}</td>
                                    <td className="px-3 py-2">
                                      <select
                                        value={remnantAssignments[idx] ?? ""}
                                        onChange={e => setAssignedRemnant(idx, e.target.value)}
                                        className="h-7 text-xs border rounded px-2 bg-white min-w-[220px]"
                                      >
                                        <option value="">잔재 선택...</option>
                                        {availableRemnants.map(r => (
                                          <option key={r.id} value={r.id}>
                                            {r.remnantNo} — {r.material} {r.thickness}t{" "}
                                            {r.width1}×{r.length1}
                                            {r.shape === "L_SHAPE" && r.width2 ? ` / ${r.width2}×${r.length2}` : ""}
                                            {" "}({r.weight}kg)
                                          </option>
                                        ))}
                                      </select>
                                      {selectedRem && (
                                        <div className="mt-1 text-[10px] text-orange-700 bg-orange-100 rounded px-2 py-0.5 inline-block">
                                          {selectedRem.remnantNo} · 폭 {selectedRem.width1}
                                          {selectedRem.shape === "L_SHAPE" && selectedRem.width2 ? `/${selectedRem.width2}` : ""}
                                          × 길이 {selectedRem.length1}
                                          {selectedRem.shape === "L_SHAPE" && selectedRem.length2 ? `/${selectedRem.length2}` : ""}
                                          · {selectedRem.weight}kg
                                        </div>
                                      )}
                                    </td>
                                    <td className="px-3 py-2">
                                      <button
                                        onClick={() => toggleRemnantInput(idx)}
                                        className={`px-2 py-0.5 text-xs rounded border font-medium transition-colors ${
                                          rem?.open
                                            ? "bg-amber-100 border-amber-300 text-amber-700"
                                            : "border-orange-300 text-orange-600 hover:bg-orange-100"
                                        }`}
                                      >
                                        {rem?.open ? "▲ 잔재취소" : "+ 자식잔재"}
                                      </button>
                                    </td>
                                    <td className="px-3 py-2">
                                      <button
                                        onClick={() => moveToNormal(idx)}
                                        className="px-2 py-0.5 text-xs rounded border border-gray-300 text-gray-500 hover:bg-gray-100 font-medium"
                                      >
                                        ← 원재로
                                      </button>
                                    </td>
                                  </tr>
                                  {rem?.open && (
                                    <tr className="bg-amber-50 border-b border-orange-200">
                                      <td colSpan={7} className="px-4 py-3">
                                        <RemnantInputRow
                                          rem={rem} idx={idx}
                                          projectCode={selectedProject?.projectCode}
                                          blockName={blockName} material={row.material} thickness={row.thickness}
                                          parentRemnantNo={selectedRem?.remnantNo}
                                          onChange={(field, val) => setRemnantInputs(p => ({ ...p, [idx]: { ...p[idx], [field]: val } }))}
                                        />
                                      </td>
                                    </tr>
                                  )}
                                </React.Fragment>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
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
            {recentUploads.map(u => (
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
          fetch("/api/excel-presets").then(r => r.json()).then(d => { if (d.success) setPresets(d.data); });
        }} />
      )}
    </div>
  );
}

/* ── 등록잔재 입력 행 (공통 컴포넌트) ─────────────────────────────────────── */
function RemnantInputRow({
  rem, idx, projectCode, blockName, material, thickness, parentRemnantNo, onChange,
}: {
  rem: RemnantInput; idx: number;
  projectCode?: string; blockName: string; material: string; thickness: number;
  parentRemnantNo?: string;
  onChange: (field: string, val: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-3 items-end">
      <div>
        <label className="text-[10px] text-gray-500 font-semibold block mb-1">잔재번호</label>
        <input className="h-7 text-xs border rounded px-2 w-28" placeholder="예: R-001" value={rem.remnantNo}
          onChange={e => onChange("remnantNo", e.target.value)} />
      </div>
      <div>
        <label className="text-[10px] text-gray-500 font-semibold block mb-1">형태</label>
        <select className="h-7 text-xs border rounded px-1 bg-white" value={rem.shape}
          onChange={e => onChange("shape", e.target.value)}>
          <option value="RECTANGLE">사각형</option>
          <option value="L_SHAPE">L자형</option>
        </select>
      </div>
      <div>
        <label className="text-[10px] text-gray-500 font-semibold block mb-1">폭1 <span className="text-red-400">*</span></label>
        <input type="number" className="h-7 text-xs border rounded px-2 w-20 text-right" placeholder="mm" value={rem.width1}
          onChange={e => onChange("width1", e.target.value)} />
      </div>
      <div>
        <label className="text-[10px] text-gray-500 font-semibold block mb-1">길이1 <span className="text-red-400">*</span></label>
        <input type="number" className="h-7 text-xs border rounded px-2 w-20 text-right" placeholder="mm" value={rem.length1}
          onChange={e => onChange("length1", e.target.value)} />
      </div>
      {rem.shape === "L_SHAPE" && (
        <>
          <div>
            <label className="text-[10px] text-gray-500 font-semibold block mb-1">폭2</label>
            <input type="number" className="h-7 text-xs border rounded px-2 w-20 text-right" placeholder="mm" value={rem.width2}
              onChange={e => onChange("width2", e.target.value)} />
          </div>
          <div>
            <label className="text-[10px] text-gray-500 font-semibold block mb-1">길이2</label>
            <input type="number" className="h-7 text-xs border rounded px-2 w-20 text-right" placeholder="mm" value={rem.length2}
              onChange={e => onChange("length2", e.target.value)} />
          </div>
        </>
      )}
      <div className="text-[10px] text-gray-500 self-end pb-1 bg-gray-50 border rounded px-2 py-1 space-x-2">
        {parentRemnantNo && <span className="text-orange-600 font-semibold">부모: {parentRemnantNo}</span>}
        <span><span className="font-semibold">발생호선:</span> {projectCode ?? "-"}</span>
        <span><span className="font-semibold">발생블록:</span> {blockName}</span>
        <span><span className="font-semibold">재질:</span> {material}</span>
        <span><span className="font-semibold">두께:</span> {thickness}t</span>
      </div>
    </div>
  );
}

/* ── 강재리스트 탭 ───────────────────────────────────────────────────────── */
function ListTab({
  projectOptions, drawings, activeProject, projectId, router, baseUrl = "/cutpart/drawings",
}: {
  projectOptions: ProjectOption[];
  drawings: DrawingList[];
  activeProject: { id: string; projectCode: string; projectName: string; storageLocation?: string | null } | null;
  projectId: string | null;
  router: ReturnType<typeof useRouter>;
  baseUrl?: string;
}) {
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
        <DrawingTable drawings={drawings} projectId={activeProject.id} projectCode={activeProject.projectCode} />
      </div>
    );
  }

  const grouped: Record<string, ProjectOption[]> = {};
  for (const p of projectOptions) {
    if (!grouped[p.projectCode]) grouped[p.projectCode] = [];
    grouped[p.projectCode].push(p);
  }

  const [expanded, setExpanded] = React.useState<Record<string, boolean>>(
    Object.fromEntries(Object.keys(grouped).map((c) => [c, true]))
  );

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
    <div className="space-y-1.5">
      {Object.entries(grouped).map(([code, blocks]) => {
        const isOpen = expanded[code] ?? true;
        return (
          <div key={code} className="bg-white rounded-xl border overflow-hidden">
            <button
              onClick={() => setExpanded(p => ({ ...p, [code]: !p[code] }))}
              className="w-full flex items-center gap-2 px-4 py-2 bg-gray-800 text-white hover:bg-gray-700 transition-colors text-left"
            >
              {isOpen ? <ChevronDown size={13} className="text-gray-400 flex-shrink-0" /> : <ChevronRight size={13} className="text-gray-400 flex-shrink-0" />}
              <span className="text-xs font-bold">호선 [{code}]</span>
              <span className="text-[11px] text-gray-400 ml-1">{blocks.length}개 블록</span>
            </button>
            {isOpen && (
              <div className="divide-y">
                {blocks.map(p => (
                  <Link
                    key={p.id}
                    href={`${baseUrl}?tab=list&projectId=${p.id}`}
                    className="flex items-center gap-2 px-4 py-1.5 hover:bg-blue-50 transition-colors group"
                  >
                    <FileSpreadsheet size={13} className="text-gray-400 group-hover:text-blue-500 flex-shrink-0" />
                    <span className="flex-1 text-xs font-medium text-gray-800">{p.projectName}</span>
                    {p.storageLocation && (
                      <span className="flex items-center gap-1 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full">
                        <MapPin size={9} />{p.storageLocation}
                      </span>
                    )}
                    {p.status && (
                      <span className={`text-[11px] px-1.5 py-0.5 rounded-full ${STATUS_COLOR[p.status] ?? ""}`}>
                        {STATUS_LABEL[p.status]}
                      </span>
                    )}
                    <span className="text-[11px] text-gray-400">{p.drawingCount}행</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

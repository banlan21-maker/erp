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
  SelectValue,
} from "@/components/ui/select";
import { Upload, FileSpreadsheet, FolderOpen, CheckCircle2, AlertCircle, Settings2 } from "lucide-react";
import PresetManager from "./preset-manager";

interface ProjectOption {
  id: string;
  projectCode: string;
  projectName: string;
  drawingCount: number;
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

export default function DrawingsMain({
  projectOptions,
  recentUploads,
}: {
  projectOptions: ProjectOption[];
  recentUploads: RecentUpload[];
}) {
  const router = useRouter();
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

  // 호선코드 기준 그룹핑
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
    if (!selectedProjectId) {
      setResult({ success: false, message: "호선/블록을 먼저 선택하세요." });
      return;
    }
    if (!selectedFile) {
      setResult({ success: false, message: "Excel 파일을 선택하세요." });
      return;
    }

    setLoading(true);
    setResult(null);
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("projectId", selectedProjectId);
      if (selectedPresetId !== "__default__") {
        formData.append("presetId", selectedPresetId);
      }

      const res = await fetch("/api/drawings", { method: "POST", body: formData });
      const data = await res.json();

      if (data.success) {
        setResult({
          success: true,
          message: `${data.data.count}행이 등록되었습니다.`,
          count: data.data.count,
          warnings: data.data.warnings,
        });
        setSelectedFile(null);
        if (fileRef.current) fileRef.current.value = "";
        router.refresh();
      } else {
        setResult({
          success: false,
          message: data.error,
          warnings: data.details,
        });
      }
    } catch {
      setResult({ success: false, message: "서버 연결 오류가 발생했습니다." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">강재리스트</h2>
        <p className="text-sm text-gray-500 mt-0.5">호선/블록을 선택하고 Excel 파일을 업로드하세요.</p>
      </div>

      {/* ── 업로드 패널 ── */}
      <div className="bg-white rounded-xl border p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-800 flex items-center gap-2">
            <Upload size={16} className="text-blue-500" />
            강재리스트 등록
          </h3>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowPresetManager(true)}
            className="flex items-center gap-1.5 text-xs"
          >
            <Settings2 size={13} /> 업로드 형식 지정
          </Button>
        </div>

        {projectOptions.length === 0 ? (
          <div className="text-center py-6 text-gray-400 border-2 border-dashed rounded-xl">
            <FolderOpen size={28} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm">등록된 호선이 없습니다.</p>
            <Link href="/projects/new" className="text-xs text-blue-500 hover:underline mt-1 inline-block">
              호선 먼저 등록하기 →
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Step 1: 호선/블록 선택 */}
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <span className="bg-blue-600 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold">1</span>
                호선 / 블록 선택
              </Label>
              <Select
                value={selectedProjectId}
                onValueChange={(v) => { setSelectedProjectId(v ?? ""); setResult(null); }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="호선 및 블록을 선택하세요" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(grouped).map(([code, blocks]) => (
                    <SelectGroup key={code}>
                      <SelectLabel className="text-xs font-bold text-gray-500">
                        호선 [{code}]
                      </SelectLabel>
                      {blocks.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          <span className="font-medium">{p.projectName}</span>
                          <span className="text-gray-400 text-xs ml-2">
                            (현재 {p.drawingCount}행)
                          </span>
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
                    <span className="text-orange-600 ml-2">
                      · 기존 {selectedProject.drawingCount}행에 추가됩니다 (덮어쓰기 아님)
                    </span>
                  )}
                </p>
              )}
            </div>

            {/* Step 2: 파일 선택 */}
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <span className="bg-blue-600 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold">2</span>
                Excel 파일 선택
              </Label>
              <div
                onClick={() => fileRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
                  selectedFile
                    ? "border-green-400 bg-green-50"
                    : "border-gray-200 hover:border-blue-400 hover:bg-blue-50"
                }`}
              >
                {selectedFile ? (
                  <div className="flex items-center justify-center gap-2 text-green-700">
                    <FileSpreadsheet size={20} />
                    <span className="text-sm font-medium">{selectedFile.name}</span>
                    <span className="text-xs text-gray-500">
                      ({(selectedFile.size / 1024).toFixed(1)} KB)
                    </span>
                  </div>
                ) : (
                  <div className="text-gray-400">
                    <FileSpreadsheet size={28} className="mx-auto mb-2 opacity-50" />
                    <p className="text-sm">클릭하여 Excel 파일 선택</p>
                    <p className="text-xs mt-1">.xlsx, .xls 지원</p>
                  </div>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>

            {/* Step 2.5: 업로드 형식 선택 */}
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <span className="bg-gray-400 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold">
                  ✦
                </span>
                업로드 형식
              </Label>
              <Select
                value={selectedPresetId}
                onValueChange={(v) => setSelectedPresetId(v ?? "__default__")}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="형식 선택" />
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
              {selectedPresetId === "__default__" ? (
                <p className="text-xs text-gray-400">헤더를 자동으로 감지합니다.</p>
              ) : (
                <p className="text-xs text-blue-600">
                  선택된 형식: {presets.find((p) => p.id === selectedPresetId)?.name}
                </p>
              )}
            </div>

            {/* 결과 메시지 */}
            {result && (
              <div className={`flex items-start gap-2 p-3 rounded-lg text-sm ${
                result.success
                  ? "bg-green-50 text-green-700 border border-green-200"
                  : "bg-red-50 text-red-700 border border-red-200"
              }`}>
                {result.success
                  ? <CheckCircle2 size={16} className="flex-shrink-0 mt-0.5" />
                  : <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />}
                <div>
                  <p className="font-medium">{result.message}</p>
                  {result.warnings && result.warnings.length > 0 && (
                    <ul className="mt-1 space-y-0.5">
                      {result.warnings.slice(0, 5).map((w, i) => (
                        <li key={i} className="text-xs opacity-80">· {w}</li>
                      ))}
                      {result.warnings.length > 5 && (
                        <li className="text-xs opacity-60">외 {result.warnings.length - 5}건...</li>
                      )}
                    </ul>
                  )}
                </div>
              </div>
            )}

            {/* Step 3: 업로드 실행 */}
            <Button
              onClick={handleUpload}
              disabled={loading || !selectedProjectId || !selectedFile}
              className="w-full flex items-center gap-2"
            >
              <Upload size={15} />
              {loading ? "파싱 중..." : "강재리스트 등록"}
            </Button>
          </div>
        )}
      </div>

      {/* ── 최근 업로드 현황 ── */}
      <div className="bg-white rounded-xl border p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">최근 등록 현황</h3>
        {recentUploads.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">아직 등록된 강재리스트가 없습니다.</p>
        ) : (
          <div className="space-y-1">
            {recentUploads.map((u) => (
              <Link
                key={u.projectId}
                href={`/projects/${u.projectId}`}
                className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <FileSpreadsheet size={14} className="text-green-500 flex-shrink-0" />
                <span className="text-sm font-medium text-gray-800">
                  [{u.project.projectCode}] {u.project.projectName}
                </span>
                <span className="text-xs text-gray-400 ml-auto">
                  {u.sourceFile ?? "파일명 없음"} · {new Date(u.createdAt).toLocaleDateString("ko-KR")}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* 프리셋 관리 다이얼로그 */}
      {showPresetManager && (
        <PresetManager
          onClose={() => {
            setShowPresetManager(false);
            // Refresh presets after closing
            fetch("/api/excel-presets")
              .then((r) => r.json())
              .then((d) => { if (d.success) setPresets(d.data); });
          }}
        />
      )}
    </div>
  );
}

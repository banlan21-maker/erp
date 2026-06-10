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

interface RemnantInputItem {
  remnantNo: string; shape: "RECTANGLE" | "L_SHAPE";
  width1: string; length1: string; width2: string; length2: string;
}
interface RemnantInput {
  open: boolean;
  items: RemnantInputItem[];
}
const emptyRemnantItem: RemnantInputItem = {
  remnantNo: "", shape: "RECTANGLE", width1: "", length1: "", width2: "", length2: "",
};

interface RemnantOption {
  id: string; remnantNo: string; type: string; material: string; thickness: number; shape: string;
  width1: number | null; length1: number | null; width2: number | null; length2: number | null;
  weight: number;
}

// 잔재 사용 지정: 등록잔재(REGISTERED) / 현장잔재(REMNANT) / 여유원재(SURPLUS)
type AssignKind = "REGISTERED" | "REMNANT" | "SURPLUS";
interface Assignment { kind: AssignKind; remnantId: string; }

// 잔재 옵션 라벨: "REM-... — AH36 - 12 × 1500 × 3000 (245.5kg)"
// L자형이면 두께 × 폭1 × 폭2 × 길이1 × 길이2 로 5종 표시
function formatRemnantOption(r: RemnantOption): string {
  const dims = r.shape === "L_SHAPE" && r.width2 != null && r.length2 != null
    ? `${r.thickness} × ${r.width1 ?? "-"} × ${r.width2} × ${r.length1 ?? "-"} × ${r.length2}`
    : `${r.thickness} × ${r.width1 ?? "-"} × ${r.length1 ?? "-"}`;
  return `${r.remnantNo} — ${r.material} - ${dims} (${r.weight}kg)`;
}

// 자동매칭 — 같은 재질·두께 + 잔재 사이즈가 도면 사이즈 이상 + 면적 최소 + 미사용
function findBestRemnant(
  kind: AssignKind,
  row: PreviewRow,
  pool: RemnantOption[],
  usedIds: Set<string>,
): string {
  const matMatch = (a: string, b: string) => a.trim().toUpperCase() === b.trim().toUpperCase();
  const candidates = pool
    .filter(r => r.type === kind)
    .filter(r => !usedIds.has(r.id))
    .filter(r => matMatch(r.material, row.material))
    .filter(r => r.thickness === row.thickness)
    .filter(r => (r.width1 ?? 0) >= row.width && (r.length1 ?? 0) >= row.length);
  if (candidates.length === 0) return "";
  candidates.sort((a, b) => {
    const aA = (a.width1 ?? 0) * (a.length1 ?? 0);
    const bA = (b.width1 ?? 0) * (b.length1 ?? 0);
    return aA - bA;
  });
  return candidates[0].id;
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
  // 행별 사용할 잔재 지정 (idx → { kind, remnantId }, remnantId "" = 지정됐지만 미선택)
  const [remnantAssignments, setRemnantAssignments] = useState<Record<number, Assignment>>({});
  // 선택 가능한 IN_STOCK 잔재 목록 (등록잔재 + 현장잔재)
  const [availableRemnants, setAvailableRemnants] = useState<RemnantOption[]>([]);

  useEffect(() => {
    fetch("/api/excel-presets").then(r => r.json()).then(d => { if (d.success) setPresets(d.data); });
  }, []);

  // 미리보기가 열릴 때 사용 가능한 잔재(등록잔재 + 현장잔재 + 여유원재) 불러오기
  useEffect(() => {
    if (!previewRows) { setAvailableRemnants([]); return; }
    Promise.all([
      fetch("/api/remnants?type=REGISTERED&status=IN_STOCK&onlyAvailable=true").then(r => r.json()),
      fetch("/api/remnants?type=REMNANT&status=IN_STOCK&onlyAvailable=true").then(r => r.json()),
      fetch("/api/remnants?type=SURPLUS&status=IN_STOCK&onlyAvailable=true").then(r => r.json()),
    ]).then(([reg, rem, sur]) => {
      const list: RemnantOption[] = [];
      if (reg.success) list.push(...reg.data);
      if (rem.success) list.push(...rem.data);
      if (sur.success) list.push(...sur.data);
      setAvailableRemnants(list);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!previewRows]);

  const remnantsByKind = (kind: AssignKind) =>
    availableRemnants.filter(r => r.type === kind);

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
      .filter(([, v]) => v.open)
      .flatMap(([idx, v]) =>
        v.items
          .filter(item => item.width1 && item.length1)
          .map(item => ({
            rowIndex: Number(idx), remnantNo: item.remnantNo, shape: item.shape,
            width1: Number(item.width1), length1: Number(item.length1),
            width2: item.width2 ? Number(item.width2) : undefined,
            length2: item.length2 ? Number(item.length2) : undefined,
          }))
      );

    // 잔재 사용 지정 (등록잔재/현장잔재 공통 — remnantId 미선택은 제외)
    const assignmentsData = Object.entries(remnantAssignments)
      .filter(([, a]) => a.remnantId)
      .map(([idx, a]) => ({ rowIndex: Number(idx), remnantId: a.remnantId }));

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
        : { open: true, items: [{ ...emptyRemnantItem }] },
    }));
  };

  const addRemnantItem = (idx: number) => {
    setRemnantInputs(prev => {
      const cur = prev[idx] ?? { open: true, items: [] };
      return { ...prev, [idx]: { ...cur, open: true, items: [...cur.items, { ...emptyRemnantItem }] } };
    });
  };

  const removeRemnantItem = (idx: number, itemIdx: number) => {
    setRemnantInputs(prev => {
      const cur = prev[idx];
      if (!cur) return prev;
      const items = cur.items.filter((_, i) => i !== itemIdx);
      if (items.length === 0) {
        // 마지막 항목 제거 → 영역 자체를 닫음
        const next = { ...prev };
        delete next[idx];
        return next;
      }
      return { ...prev, [idx]: { ...cur, items } };
    });
  };

  const updateRemnantItem = (idx: number, itemIdx: number, field: keyof RemnantInputItem, val: string) => {
    setRemnantInputs(prev => {
      const cur = prev[idx];
      if (!cur) return prev;
      const items = cur.items.map((it, i) => i === itemIdx ? { ...it, [field]: val } : it);
      return { ...prev, [idx]: { ...cur, items } };
    });
  };

  // 단건 — 자동매칭 시도. 매칭 없으면 빈 값 (사용자가 드롭다운에서 수동 선택)
  const assignTo = (idx: number, kind: AssignKind) => {
    if (!previewRows) return;
    const row = previewRows[idx];
    setRemnantAssignments(prev => {
      const usedIds = new Set(Object.entries(prev)
        .filter(([k]) => Number(k) !== idx)
        .map(([, a]) => a.remnantId).filter(Boolean));
      const matched = findBestRemnant(kind, row, availableRemnants, usedIds);
      return { ...prev, [idx]: { kind, remnantId: matched } };
    });
  };

  const moveToNormal = (idx: number) => setRemnantAssignments(prev => {
    const next = { ...prev }; delete next[idx]; return next;
  });
  const setAssignedRemnant = (idx: number, remnantId: string) =>
    setRemnantAssignments(prev => ({ ...prev, [idx]: { ...(prev[idx] ?? { kind: "REGISTERED" as AssignKind }), remnantId } }));

  // 체크박스 (원재사용 목록에서만 활성)
  const [checkedRows, setCheckedRows] = useState<Set<number>>(new Set());
  const toggleRow = (idx: number) => setCheckedRows(prev => {
    const next = new Set(prev);
    if (next.has(idx)) next.delete(idx); else next.add(idx);
    return next;
  });
  const clearCheckedRows = () => setCheckedRows(new Set());

  // 일괄 적용 — 선택된 모든 행에 자동매칭 (이미 자동매칭된 잔재는 중복 방지)
  const assignBulk = (kind: AssignKind) => {
    if (!previewRows || checkedRows.size === 0) return;
    const indices = [...checkedRows].sort((a, b) => a - b);
    setRemnantAssignments(prev => {
      const next = { ...prev };
      const usedIds = new Set(Object.entries(prev)
        .filter(([k]) => !checkedRows.has(Number(k)))
        .map(([, a]) => a.remnantId).filter(Boolean));
      for (const idx of indices) {
        const row = previewRows[idx];
        const matched = findBestRemnant(kind, row, availableRemnants, usedIds);
        if (matched) usedIds.add(matched);
        next[idx] = { kind, remnantId: matched };
      }
      return next;
    });
    clearCheckedRows();
  };

  const assignedIndices  = new Set(Object.keys(remnantAssignments).map(Number));
  const registeredIndices = new Set(Object.entries(remnantAssignments).filter(([, a]) => a.kind === "REGISTERED").map(([i]) => Number(i)));
  const remnantIndices    = new Set(Object.entries(remnantAssignments).filter(([, a]) => a.kind === "REMNANT").map(([i]) => Number(i)));
  const surplusIndices    = new Set(Object.entries(remnantAssignments).filter(([, a]) => a.kind === "SURPLUS").map(([i]) => Number(i)));
  const normalCount    = previewRows ? previewRows.filter((_, i) => !assignedIndices.has(i)).length : 0;
  const registeredCount = registeredIndices.size;
  const remnantCount    = remnantIndices.size;
  const surplusCount    = surplusIndices.size;

  // 원재사용 행 전체 선택
  const normalIndices = previewRows
    ? previewRows.map((_, i) => i).filter(i => !assignedIndices.has(i))
    : [];
  const allNormalChecked = normalIndices.length > 0 && normalIndices.every(i => checkedRows.has(i));
  const toggleAllNormal = () => {
    if (allNormalChecked) clearCheckedRows();
    else setCheckedRows(new Set(normalIndices));
  };

  // 잔재 사용 목록 렌더 (등록잔재 / 현장잔재 / 여유원재 공통)
  const renderAssignedList = (kind: AssignKind, indices: Set<number>, count: number) => {
    if (!previewRows || count === 0) return null;
    const KIND_LABEL = { REGISTERED: "등록잔재", REMNANT: "현장잔재", SURPLUS: "여유원재" } as const;
    const label = `${KIND_LABEL[kind]} 사용 목록`;
    const opts = remnantsByKind(kind);
    const PALETTE: Record<AssignKind, {
      wrap: string; head: string; txt: string; soft: string; chip: string; rowHover: string;
      openBg: string; childBorder: string; childTxt: string; addBtn: string; inputBtnOpen: string; inputBtn: string;
    }> = {
      REGISTERED: { wrap: "bg-orange-50 border-orange-200", head: "bg-orange-100 border-orange-200", txt: "text-orange-700", soft: "text-orange-400", chip: "bg-orange-100 text-orange-700", rowHover: "hover:bg-orange-100/50", openBg: "bg-amber-50", childBorder: "border-amber-300", childTxt: "text-amber-700", addBtn: "border-amber-400 text-amber-700 hover:bg-amber-100", inputBtnOpen: "bg-amber-100 border-amber-300 text-amber-700", inputBtn: "border-orange-300 text-orange-600 hover:bg-orange-100" },
      REMNANT:    { wrap: "bg-teal-50 border-teal-200",     head: "bg-teal-100 border-teal-200",     txt: "text-teal-700",   soft: "text-teal-400",   chip: "bg-teal-100 text-teal-700",     rowHover: "hover:bg-teal-100/50",   openBg: "bg-cyan-50",  childBorder: "border-cyan-300",  childTxt: "text-cyan-700",  addBtn: "border-cyan-400 text-cyan-700 hover:bg-cyan-100",   inputBtnOpen: "bg-cyan-100 border-cyan-300 text-cyan-700",   inputBtn: "border-teal-300 text-teal-600 hover:bg-teal-100" },
      SURPLUS:    { wrap: "bg-purple-50 border-purple-200", head: "bg-purple-100 border-purple-200", txt: "text-purple-700", soft: "text-purple-400", chip: "bg-purple-100 text-purple-700", rowHover: "hover:bg-purple-100/50", openBg: "bg-violet-50", childBorder: "border-violet-300", childTxt: "text-violet-700", addBtn: "border-violet-400 text-violet-700 hover:bg-violet-100", inputBtnOpen: "bg-violet-100 border-violet-300 text-violet-700", inputBtn: "border-purple-300 text-purple-600 hover:bg-purple-100" },
    };
    const C = PALETTE[kind];
    return (
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-semibold ${C.txt}`}>{label}</span>
          <span className={`text-xs ${C.soft}`}>{count}행</span>
          {opts.length === 0 && (
            <span className="text-xs text-red-500">사용 가능한 {KIND_LABEL[kind]}(재고)가 없습니다</span>
          )}
        </div>
        <div className={`${C.wrap} border rounded-xl overflow-x-auto max-h-[350px] overflow-y-auto`}>
          <table className="w-full text-xs whitespace-nowrap">
            <thead className={`${C.head} border-b sticky top-0`}>
              <tr>
                <th className={`px-3 py-2 text-left ${C.txt} font-semibold`}>블록</th>
                <th className={`px-3 py-2 text-left ${C.txt} font-semibold`}>도면번호</th>
                <th className={`px-3 py-2 text-left ${C.txt} font-semibold`}>재질</th>
                <th className={`px-3 py-2 text-right ${C.txt} font-semibold`}>두께</th>
                <th className={`px-3 py-2 text-left ${C.txt} font-semibold`}>사용할 {KIND_LABEL[kind]}</th>
                <th className={`px-3 py-2 ${C.txt} font-semibold`}></th>
                <th className={`px-3 py-2 ${C.txt} font-semibold`}></th>
              </tr>
            </thead>
            <tbody>
              {previewRows.map((row, idx) => {
                if (!indices.has(idx)) return null;
                const rem = remnantInputs[idx];
                const blockName = row.block ?? selectedProject?.projectName ?? "-";
                const curRemId = remnantAssignments[idx]?.remnantId ?? "";
                const selectedRem = opts.find(r => r.id === curRemId);
                return (
                  <React.Fragment key={idx}>
                    <tr className={`border-b ${C.head.split(" ")[1]} ${rem?.open ? C.openBg : C.rowHover}`}>
                      <td className="px-3 py-2 font-medium text-gray-800">{blockName}</td>
                      <td className="px-3 py-2 font-mono text-gray-600">{row.drawingNo ?? "-"}</td>
                      <td className="px-3 py-2"><span className="px-1.5 py-0.5 bg-slate-100 rounded font-medium">{row.material}</span></td>
                      <td className="px-3 py-2 text-right">{row.thickness}</td>
                      <td className="px-3 py-2">
                        <select
                          value={curRemId}
                          onChange={e => setAssignedRemnant(idx, e.target.value)}
                          className="h-7 text-xs border rounded px-2 bg-white min-w-[220px]"
                        >
                          <option value="">잔재 선택...</option>
                          {opts.map(r => (
                            <option key={r.id} value={r.id}>{formatRemnantOption(r)}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <button
                          onClick={() => toggleRemnantInput(idx)}
                          className={`px-2 py-0.5 text-xs rounded border font-medium transition-colors ${rem?.open ? C.inputBtnOpen : C.inputBtn}`}
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
                      <tr className={`${C.openBg} border-b ${C.head.split(" ")[1]}`}>
                        <td colSpan={7} className="px-4 py-3">
                          <div className="space-y-3">
                            {rem.items.map((item, itemIdx) => (
                              <div key={itemIdx} className={`bg-white border ${C.childBorder} rounded-lg p-3 relative`}>
                                <div className="flex items-center justify-between mb-2">
                                  <span className={`text-[11px] font-bold ${C.childTxt}`}>자식 잔재 #{itemIdx + 1}</span>
                                  <button
                                    onClick={() => removeRemnantItem(idx, itemIdx)}
                                    className="text-[10px] px-2 py-0.5 border border-red-300 text-red-600 rounded hover:bg-red-50"
                                  >
                                    삭제
                                  </button>
                                </div>
                                <RemnantInputRow
                                  item={item}
                                  projectCode={selectedProject?.projectCode}
                                  blockName={blockName} material={row.material} thickness={row.thickness}
                                  parentRemnantNo={selectedRem?.remnantNo}
                                  onChange={(field, val) => updateRemnantItem(idx, itemIdx, field, val)}
                                />
                              </div>
                            ))}
                            <button
                              onClick={() => addRemnantItem(idx)}
                              className={`w-full px-3 py-1.5 text-xs border border-dashed rounded-lg font-medium ${C.addBtn}`}
                            >
                              + 잔재 추가
                            </button>
                          </div>
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
    );
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
                      {registeredCount > 0 && (
                        <span className="ml-2 text-orange-600 text-xs">(등록잔재 {registeredCount}행)</span>
                      )}
                      {remnantCount > 0 && (
                        <span className="ml-2 text-teal-600 text-xs">(현장잔재 {remnantCount}행)</span>
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
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-gray-600">원재사용 목록</span>
                      <span className="text-xs text-gray-400">{normalCount}행</span>
                      {checkedRows.size > 0 && (
                        <div className="ml-auto flex items-center gap-1.5 bg-blue-50 border border-blue-200 rounded-lg px-2 py-1">
                          <span className="text-xs font-semibold text-blue-700">{checkedRows.size}개 선택 — 일괄 적용</span>
                          <button
                            onClick={() => assignBulk("REGISTERED")}
                            className="px-2 py-0.5 text-xs rounded border border-orange-300 text-orange-600 hover:bg-orange-50 font-medium"
                            title="선택된 도면을 등록잔재로 자동매칭"
                          >등록잔재 →</button>
                          <button
                            onClick={() => assignBulk("REMNANT")}
                            className="px-2 py-0.5 text-xs rounded border border-teal-300 text-teal-600 hover:bg-teal-50 font-medium"
                            title="선택된 도면을 현장잔재로 자동매칭"
                          >현장잔재 →</button>
                          <button
                            onClick={() => assignBulk("SURPLUS")}
                            className="px-2 py-0.5 text-xs rounded border border-purple-300 text-purple-600 hover:bg-purple-50 font-medium"
                            title="선택된 도면을 여유원재로 자동매칭"
                          >여유원재 →</button>
                          <button
                            onClick={clearCheckedRows}
                            className="px-1.5 py-0.5 text-xs text-gray-400 hover:text-gray-600"
                            title="선택 해제"
                          >✕</button>
                        </div>
                      )}
                    </div>
                    <div className="bg-white border rounded-xl overflow-x-auto max-h-[400px] overflow-y-auto">
                      <table className="w-full text-xs whitespace-nowrap">
                        <thead className="bg-gray-50 border-b sticky top-0">
                          <tr>
                            <th className="px-2 py-2 text-center w-8">
                              <input
                                type="checkbox"
                                checked={allNormalChecked}
                                onChange={toggleAllNormal}
                                className="cursor-pointer"
                                title="전체 선택"
                              />
                            </th>
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
                            const isChecked = checkedRows.has(idx);
                            return (
                              <React.Fragment key={idx}>
                                <tr className={`border-b ${rem?.open ? "bg-orange-50" : isChecked ? "bg-blue-50/40" : "hover:bg-gray-50"}`}>
                                  <td className="px-2 py-2 text-center">
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={() => toggleRow(idx)}
                                      className="cursor-pointer"
                                    />
                                  </td>
                                  <td className="px-3 py-2 font-medium text-gray-800">{blockName}</td>
                                  <td className="px-3 py-2 font-mono text-gray-600">{row.drawingNo ?? "-"}</td>
                                  <td className="px-3 py-2"><span className="px-1.5 py-0.5 bg-slate-100 rounded font-medium">{row.material}</span></td>
                                  <td className="px-3 py-2 text-right">{row.thickness}</td>
                                  <td className="px-3 py-2 text-right">{row.width.toLocaleString()}</td>
                                  <td className="px-3 py-2 text-right">{row.length.toLocaleString()}</td>
                                  <td className="px-3 py-2 text-right" colSpan={2}>
                                    <div className="flex items-center justify-end gap-1.5">
                                      <button
                                        onClick={() => toggleRemnantInput(idx)}
                                        className={`px-2 py-0.5 text-xs rounded border font-medium transition-colors ${
                                          rem?.open
                                            ? "bg-orange-100 border-orange-300 text-orange-700"
                                            : "border-gray-300 text-gray-500 hover:border-orange-300 hover:text-orange-600"
                                        }`}
                                        title="이 도면에서 발생하는 잔재를 등록"
                                      >
                                        {rem?.open ? "▲ 잔재등록취소" : "+ 잔재등록"}
                                      </button>
                                      <button
                                        onClick={() => assignTo(idx, "REGISTERED")}
                                        className="px-2 py-0.5 text-xs rounded border border-orange-300 text-orange-600 hover:bg-orange-50 font-medium"
                                        title="등록잔재 자동매칭 (수정 가능)"
                                      >
                                        등록잔재 →
                                      </button>
                                      <button
                                        onClick={() => assignTo(idx, "REMNANT")}
                                        className="px-2 py-0.5 text-xs rounded border border-teal-300 text-teal-600 hover:bg-teal-50 font-medium"
                                        title="현장잔재 자동매칭 (수정 가능)"
                                      >
                                        현장잔재 →
                                      </button>
                                      <button
                                        onClick={() => assignTo(idx, "SURPLUS")}
                                        className="px-2 py-0.5 text-xs rounded border border-purple-300 text-purple-600 hover:bg-purple-50 font-medium"
                                        title="여유원재 자동매칭 (수정 가능)"
                                      >
                                        여유원재 →
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                                {rem?.open && (
                                  <tr className="bg-orange-50 border-b">
                                    <td colSpan={9} className="px-4 py-3">
                                      <div className="space-y-3">
                                        {rem.items.map((item, itemIdx) => (
                                          <div key={itemIdx} className="bg-white border border-orange-200 rounded-lg p-3 relative">
                                            <div className="flex items-center justify-between mb-2">
                                              <span className="text-[11px] font-bold text-orange-700">잔재 #{itemIdx + 1}</span>
                                              <button
                                                onClick={() => removeRemnantItem(idx, itemIdx)}
                                                className="text-[10px] px-2 py-0.5 border border-red-300 text-red-600 rounded hover:bg-red-50"
                                              >
                                                삭제
                                              </button>
                                            </div>
                                            <RemnantInputRow
                                              item={item}
                                              projectCode={selectedProject?.projectCode}
                                              blockName={blockName} material={row.material} thickness={row.thickness}
                                              onChange={(field, val) => updateRemnantItem(idx, itemIdx, field, val)}
                                            />
                                          </div>
                                        ))}
                                        <button
                                          onClick={() => addRemnantItem(idx)}
                                          className="w-full px-3 py-1.5 text-xs border border-dashed border-orange-400 text-orange-700 rounded-lg hover:bg-orange-100 font-medium"
                                        >
                                          + 잔재 추가
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
                            );
                          })}
                          {normalCount === 0 && (
                            <tr><td colSpan={9} className="px-3 py-4 text-center text-gray-400">원재사용 항목이 없습니다.</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* 등록잔재 사용 목록 */}
                  {renderAssignedList("REGISTERED", registeredIndices, registeredCount)}
                  {/* 현장잔재 사용 목록 */}
                  {renderAssignedList("REMNANT", remnantIndices, remnantCount)}
                  {/* 여유원재 사용 목록 */}
                  {renderAssignedList("SURPLUS", surplusIndices, surplusCount)}
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
            {recentUploads.slice(0, 10).map(u => (
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
  item, projectCode, blockName, material, thickness, parentRemnantNo, onChange,
}: {
  item: RemnantInputItem;
  projectCode?: string; blockName: string; material: string; thickness: number;
  parentRemnantNo?: string;
  onChange: (field: keyof RemnantInputItem, val: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-3 items-end">
      <div>
        <label className="text-[10px] text-gray-500 font-semibold block mb-1">잔재번호</label>
        <input className="h-7 text-xs border rounded px-2 w-28" placeholder="예: R-001" value={item.remnantNo}
          onChange={e => onChange("remnantNo", e.target.value)} />
      </div>
      <div>
        <label className="text-[10px] text-gray-500 font-semibold block mb-1">형태</label>
        <select className="h-7 text-xs border rounded px-1 bg-white" value={item.shape}
          onChange={e => onChange("shape", e.target.value)}>
          <option value="RECTANGLE">사각형</option>
          <option value="L_SHAPE">L자형</option>
        </select>
      </div>
      <div>
        <label className="text-[10px] text-gray-500 font-semibold block mb-1">폭1 <span className="text-red-400">*</span></label>
        <input type="number" className="h-7 text-xs border rounded px-2 w-20 text-right" placeholder="mm" value={item.width1}
          onChange={e => onChange("width1", e.target.value)} />
      </div>
      <div>
        <label className="text-[10px] text-gray-500 font-semibold block mb-1">길이1 <span className="text-red-400">*</span></label>
        <input type="number" className="h-7 text-xs border rounded px-2 w-20 text-right" placeholder="mm" value={item.length1}
          onChange={e => onChange("length1", e.target.value)} />
      </div>
      {item.shape === "L_SHAPE" && (
        <>
          <div>
            <label className="text-[10px] text-gray-500 font-semibold block mb-1">폭2</label>
            <input type="number" className="h-7 text-xs border rounded px-2 w-20 text-right" placeholder="mm" value={item.width2}
              onChange={e => onChange("width2", e.target.value)} />
          </div>
          <div>
            <label className="text-[10px] text-gray-500 font-semibold block mb-1">길이2</label>
            <input type="number" className="h-7 text-xs border rounded px-2 w-20 text-right" placeholder="mm" value={item.length2}
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

  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({});

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
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 items-start">
      {Object.entries(grouped).map(([code, blocks]) => {
        const isOpen = expanded[code] ?? false;
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
                    <span className="text-xs font-medium text-gray-800">{p.projectName}</span>
                    {p.status && (
                      <span className={`text-[11px] px-1.5 py-0.5 rounded-full ${STATUS_COLOR[p.status] ?? ""}`}>
                        {STATUS_LABEL[p.status]}
                      </span>
                    )}
                    <span className="flex-1" />
                    {p.storageLocation && (
                      <span className="flex items-center gap-1 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full">
                        <MapPin size={9} />{p.storageLocation}
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

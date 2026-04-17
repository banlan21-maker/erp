"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  RefreshCw, X, Save, AlertTriangle, Edit2,
  Package, Archive, Filter, StickyNote, Trash2, Search, RotateCcw, Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import ColumnFilterDropdown, { type FilterValue } from "./column-filter-dropdown";

// ─── 타입 ──────────────────────────────────────────────────────────────────

interface ProjectOption {
  id: string;
  projectCode: string;
  projectName: string;
}

interface Remnant {
  id: string;
  remnantNo: string;
  type: string;
  shape: string;
  material: string;
  thickness: number;
  weight: number;
  width1: number | null;
  length1: number | null;
  width2: number | null;
  length2: number | null;
  sourceProjectId: string | null;
  sourceProject: { id: string; projectCode: string; projectName: string } | null;
  sourceVesselName: string | null;
  sourceBlock: string | null;
  location: string | null;
  memo: string | null;
  status: string;
  registeredBy: string;
  createdAt: string;
}

// ─── 상수 ──────────────────────────────────────────────────────────────────

const TYPE_LABEL: Record<string, string>  = { REMNANT: "현장잔재", SURPLUS: "여유원재", REGISTERED: "등록잔재" };
const TYPE_COLOR: Record<string, string>  = {
  REMNANT:    "bg-blue-100 text-blue-700",
  SURPLUS:    "bg-green-100 text-green-700",
  REGISTERED: "bg-purple-100 text-purple-700",
};
const SHAPE_LABEL: Record<string, string> = { RECTANGLE: "사각형", L_SHAPE: "L자형", IRREGULAR: "불규칙형" };
const STATUS_LABEL: Record<string, string>= { IN_STOCK: "재고있음", IN_USE: "사용중", EXHAUSTED: "소진" };
const STATUS_COLOR: Record<string, string>= {
  IN_STOCK:  "bg-emerald-100 text-emerald-700",
  IN_USE:    "bg-yellow-100 text-yellow-700",
  EXHAUSTED: "bg-gray-100 text-gray-500",
};

// ─── 표시 헬퍼 ────────────────────────────────────────────────────────────

function sizeText(r: Remnant): string {
  if (r.shape === "RECTANGLE") {
    return (r.width1 && r.length1) ? `${r.width1}×${r.length1}` : "-";
  }
  if (r.shape === "L_SHAPE") {
    const full = (r.width1 && r.length1) ? `${r.width1}×${r.length1}` : "";
    const cut  = (r.width2 && r.length2) ? `(절${r.width2}×${r.length2})` : "";
    return full ? `${full} ${cut}`.trim() : "-";
  }
  if (r.shape === "IRREGULAR") {
    return (r.width1 && r.length1) ? `최대 ${r.width1}×${r.length1}` : "-";
  }
  return "-";
}

function sourceInfo(r: Remnant): { vessel: string; block: string } {
  const vessel = r.sourceProject
    ? `[${r.sourceProject.projectCode}] ${r.sourceProject.projectName}`
    : (r.sourceVesselName || "");
  return { vessel: vessel || "-", block: r.sourceBlock || "" };
}

// 재질 비중 (g/mm³)
const DENSITY: Record<string, number> = {
  default: 7.85e-6,
  STS304:  7.93e-6,
};

function getDensity(material: string) {
  const m = material.toUpperCase();
  if (m.includes("STS") || m.includes("304")) return DENSITY.STS304;
  return DENSITY.default;
}

// 중량 자동계산 (mm 단위 입력 → kg)
function calcWeight(
  shape: string,
  thickness: number,
  material: string,
  w1: number, l1: number,
  w2: number, l2: number
): number | null {
  const d = getDensity(material);
  if (!thickness || thickness <= 0) return null;
  let area = 0;
  if (shape === "RECTANGLE") {
    if (!w1 || !l1) return null;
    area = w1 * l1;
  } else if (shape === "L_SHAPE") {
    if (!w1 || !l1) return null;
    area = w1 * l1 - (w2 || 0) * (l2 || 0);
    if (area <= 0) return null;
  } else {
    return null; // 불규칙형: 직접 입력
  }
  const weightKg = area * thickness * d; // kg (d 단위: kg/mm³)
  return Math.round(weightKg * 100) / 100; // kg, 소수점 2자리
}

// ─── L자형 도식 ────────────────────────────────────────────────────────────

function LShapeDiagram() {
  return (
    <div className="flex items-center justify-center p-4 bg-gray-50 rounded-lg border border-dashed border-gray-300">
      <svg width="180" height="140" viewBox="0 0 180 140" className="overflow-visible">
        {/* 전체 사각형 (점선) */}
        <rect x="10" y="10" width="130" height="110" fill="none" stroke="#cbd5e1" strokeDasharray="4 3" strokeWidth="1.5" />
        {/* L자형 도형 (실선, 채움) */}
        <polygon points="10,10 90,10 90,50 140,50 140,120 10,120" fill="#dbeafe" stroke="#3b82f6" strokeWidth="2" />
        {/* 절단부 (빗금) */}
        <polygon points="90,10 140,10 140,50 90,50" fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="4 3" />
        {/* W1 치수선 */}
        <line x1="10" y1="130" x2="140" y2="130" stroke="#64748b" strokeWidth="1" />
        <line x1="10" y1="127" x2="10" y2="133" stroke="#64748b" strokeWidth="1" />
        <line x1="140" y1="127" x2="140" y2="133" stroke="#64748b" strokeWidth="1" />
        <text x="75" y="140" textAnchor="middle" fontSize="11" fill="#475569" fontWeight="bold">W1 (전체폭)</text>
        {/* L1 치수선 */}
        <line x1="152" y1="10" x2="152" y2="120" stroke="#64748b" strokeWidth="1" />
        <line x1="149" y1="10" x2="155" y2="10" stroke="#64748b" strokeWidth="1" />
        <line x1="149" y1="120" x2="155" y2="120" stroke="#64748b" strokeWidth="1" />
        <text x="168" y="68" textAnchor="middle" fontSize="11" fill="#475569" fontWeight="bold" transform="rotate(90,168,68)">L1 (전체길이)</text>
        {/* W2 치수선 */}
        <line x1="90" y1="5" x2="140" y2="5" stroke="#9333ea" strokeWidth="1" />
        <line x1="90" y1="2" x2="90" y2="8" stroke="#9333ea" strokeWidth="1" />
        <line x1="140" y1="2" x2="140" y2="8" stroke="#9333ea" strokeWidth="1" />
        <text x="115" y="2" textAnchor="middle" fontSize="10" fill="#9333ea">W2 (절단폭)</text>
        {/* L2 치수선 */}
        <line x1="145" y1="10" x2="145" y2="50" stroke="#9333ea" strokeWidth="1" />
        <line x1="142" y1="10" x2="148" y2="10" stroke="#9333ea" strokeWidth="1" />
        <line x1="142" y1="50" x2="148" y2="50" stroke="#9333ea" strokeWidth="1" />
        <text x="162" y="33" textAnchor="middle" fontSize="10" fill="#9333ea" transform="rotate(90,162,33)">L2</text>
      </svg>
    </div>
  );
}

// ─── 잔재 등록 폼 ──────────────────────────────────────────────────────────

const INIT_FORM = {
  remnantNo: "",
  type: "REMNANT", shape: "RECTANGLE",
  material: "", thickness: "",
  width1: "", length1: "", width2: "", length2: "",
  sourceProjectId: "", sourceVesselName: "", sourceBlock: "",
  location: "", registeredBy: "", memo: "",
  manualWeight: "",
};

function RemnantDetailForm({ projects }: { projects: ProjectOption[] }) {
  const [form,   setForm]   = useState({ ...INIT_FORM });
  const [saving,        setSaving]        = useState(false);
  const [error,         setError]         = useState<string | null>(null);
  const [ok,            setOk]            = useState(false);

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  // 프로젝트 선택 시 호선+블록 자동 세팅 (Project 1건 = 호선×블록 조합)
  const handleProjectChange = (projectId: string) => {
    const selected = projects.find(p => p.id === projectId);
    setForm(f => ({
      ...f,
      sourceProjectId:   projectId,
      sourceBlock:       selected?.projectName ?? "",
      sourceVesselName:  "",
    }));
  };

  // 중량 자동계산
  const autoWeight = calcWeight(
    form.shape, Number(form.thickness), form.material,
    Number(form.width1), Number(form.length1),
    Number(form.width2), Number(form.length2)
  );
  const displayWeight = form.shape === "IRREGULAR"
    ? (form.manualWeight || "")
    : (autoWeight != null ? String(autoWeight) : "");

  // 형태 변경 시 치수 초기화
  const handleShapeChange = (shape: string) => {
    setForm(f => ({ ...f, shape, width1: "", length1: "", width2: "", length2: "", manualWeight: "" }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const weight = form.shape === "IRREGULAR" ? Number(form.manualWeight) : autoWeight;
    if (!form.material.trim()) { setError("재질을 입력해주세요."); return; }
    if (!form.thickness)       { setError("두께를 입력해주세요."); return; }
    if (!weight || weight <= 0){ setError("중량이 유효하지 않습니다."); return; }
    if (!form.registeredBy.trim()) { setError("등록자를 입력해주세요."); return; }

    setSaving(true);
    try {
      const res  = await fetch("/api/remnants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          remnantNo: form.remnantNo.trim() || null,
          type: form.type, shape: form.shape,
          material: form.material, thickness: form.thickness,
          weight,
          width1:  form.width1  || null,
          length1: form.length1 || null,
          width2:  form.width2  || null,
          length2: form.length2 || null,
          sourceProjectId: form.sourceProjectId || null,
          sourceVesselName: form.sourceVesselName || null,
          sourceBlock: form.sourceBlock || null,
          location: form.location || null,
          registeredBy: form.registeredBy,
          memo: form.memo || null,
        }),
      });
      const data = await res.json();
      if (!data.success) { setError(data.error); return; }
      setOk(true);
      setForm({ ...INIT_FORM });
      setTimeout(() => setOk(false), 3000);
    } catch { setError("서버 오류가 발생했습니다."); }
    finally { setSaving(false); }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      {ok && (
        <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-3 text-sm font-medium flex items-center gap-2">
          <Save size={15} /> 잔재가 등록됐습니다.
        </div>
      )}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm flex items-center gap-2">
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      {/* ① 잔재번호 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          잔재번호 <span className="text-gray-400 text-xs">(비워두면 자동 부여)</span>
        </label>
        <Input
          value={form.remnantNo}
          onChange={e => set("remnantNo", e.target.value)}
          placeholder="예: REM-2026-001  또는  현장-001"
          className="font-mono"
        />
      </div>

      {/* ② 종류 */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">종류 <span className="text-red-500">*</span></label>
        <div className="flex gap-3 flex-wrap">
          {Object.entries(TYPE_LABEL).map(([val, label]) => (
            <label key={val} className={`flex items-center gap-2 px-4 py-2 rounded-lg border-2 cursor-pointer transition-all text-sm font-medium
              ${form.type === val ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-600 hover:border-gray-300"}`}>
              <input type="radio" name="type" value={val} checked={form.type === val}
                onChange={() => set("type", val)} className="hidden" />
              {label}
            </label>
          ))}
        </div>
      </div>

      {/* ② 형태 */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">형태 <span className="text-red-500">*</span></label>
        <div className="flex gap-3 flex-wrap">
          {Object.entries(SHAPE_LABEL).map(([val, label]) => (
            <label key={val} className={`flex items-center gap-2 px-4 py-2 rounded-lg border-2 cursor-pointer transition-all text-sm font-medium
              ${form.shape === val ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-gray-200 text-gray-600 hover:border-gray-300"}`}>
              <input type="radio" name="shape" value={val} checked={form.shape === val}
                onChange={() => handleShapeChange(val)} className="hidden" />
              {label}
            </label>
          ))}
        </div>
      </div>

      {/* L자형 도식 */}
      {form.shape === "L_SHAPE" && <LShapeDiagram />}

      {/* ③ 재질 / 두께 */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">재질 <span className="text-red-500">*</span></label>
          <Input value={form.material} onChange={e => set("material", e.target.value)} placeholder="예: SS400, AH36, STS304" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">두께 (mm) <span className="text-red-500">*</span></label>
          <Input type="number" step="0.5" min="0" value={form.thickness}
            onChange={e => set("thickness", e.target.value)} placeholder="예: 9, 12, 16" />
        </div>
      </div>

      {/* ④ 치수 (형태별) */}
      {form.shape === "RECTANGLE" && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">치수 (mm)</label>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">폭 (W)</label>
              <Input type="number" min="0" value={form.width1} onChange={e => set("width1", e.target.value)} placeholder="폭 mm" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">길이 (L)</label>
              <Input type="number" min="0" value={form.length1} onChange={e => set("length1", e.target.value)} placeholder="길이 mm" />
            </div>
          </div>
        </div>
      )}

      {form.shape === "L_SHAPE" && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">치수 (mm)</label>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">전체폭 W1</label>
              <Input type="number" min="0" value={form.width1} onChange={e => set("width1", e.target.value)} placeholder="전체폭 mm" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">전체길이 L1</label>
              <Input type="number" min="0" value={form.length1} onChange={e => set("length1", e.target.value)} placeholder="전체길이 mm" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">절단폭 W2</label>
              <Input type="number" min="0" value={form.width2} onChange={e => set("width2", e.target.value)} placeholder="절단폭 mm" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">절단길이 L2</label>
              <Input type="number" min="0" value={form.length2} onChange={e => set("length2", e.target.value)} placeholder="절단길이 mm" />
            </div>
          </div>
        </div>
      )}

      {form.shape === "IRREGULAR" && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">치수 (mm) <span className="text-xs text-gray-400">— 바운딩박스 기준</span></label>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">최대폭</label>
              <Input type="number" min="0" value={form.width1} onChange={e => set("width1", e.target.value)} placeholder="최대폭 mm" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">최대길이</label>
              <Input type="number" min="0" value={form.length1} onChange={e => set("length1", e.target.value)} placeholder="최대길이 mm" />
            </div>
          </div>
        </div>
      )}

      {/* ⑤ 중량 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          중량 (kg)
          {form.shape !== "IRREGULAR" && <span className="text-xs text-blue-500 ml-2">자동계산</span>}
          {form.shape === "IRREGULAR" && <span className="text-xs text-orange-500 ml-2">직접 입력 (불규칙형)</span>}
        </label>
        {form.shape === "IRREGULAR" ? (
          <Input type="number" step="0.01" min="0" value={form.manualWeight}
            onChange={e => set("manualWeight", e.target.value)} placeholder="중량 kg 직접 입력" />
        ) : (
          <div className={`px-3 py-2 rounded-md border text-sm font-semibold ${
            autoWeight != null ? "bg-blue-50 border-blue-200 text-blue-700" : "bg-gray-50 border-gray-200 text-gray-400"
          }`}>
            {autoWeight != null ? `${autoWeight} kg` : "치수·두께·재질 입력 후 자동 표시"}
          </div>
        )}
      </div>

      {/* ⑥ 발생 출처 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">발생 출처 <span className="text-gray-400 text-xs">(선택)</span></label>

        {/* 기존 호선/블록 통합 선택 (Project 한 건 = 호선×블록 조합) */}
        <select value={form.sourceProjectId} onChange={e => handleProjectChange(e.target.value)}
          className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">-- 기존 호선/블록 선택 --</option>
          {projects.map(p => (
            <option key={p.id} value={p.id}>[{p.projectCode}] {p.projectName}</option>
          ))}
        </select>

        {/* 기존 호선 미선택 시 직접 입력 (호선/블록 한 필드) */}
        {!form.sourceProjectId && (
          <div className="mt-2">
            <label className="block text-xs text-gray-500 mb-1">호선/블록 직접 입력</label>
            <Input
              value={form.sourceVesselName}
              onChange={e => {
                // sourceBlock은 더는 별도 입력받지 않음 → 빈 값으로 동기화
                setForm(f => ({ ...f, sourceVesselName: e.target.value, sourceBlock: "" }));
              }}
              placeholder="예: 4560호 / 101-1"
            />
          </div>
        )}
      </div>

      {/* ⑦ 보관 위치 / 등록자 */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">보관 위치 <span className="text-gray-400 text-xs">(선택)</span></label>
          <Input value={form.location} onChange={e => set("location", e.target.value)} placeholder="예: A구역 3번 선반" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">등록자 <span className="text-red-500">*</span></label>
          <Input value={form.registeredBy} onChange={e => set("registeredBy", e.target.value)} placeholder="이름" />
        </div>
      </div>

      {/* ⑧ 메모사항 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">메모사항 <span className="text-gray-400 text-xs">(선택)</span></label>
        <textarea
          value={form.memo}
          onChange={e => set("memo", e.target.value)}
          rows={2}
          placeholder="특이사항, 사용 이력 등 자유롭게 입력"
          className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        />
      </div>

      <div className="flex justify-end pt-2">
        <Button type="submit" disabled={saving} className="bg-blue-600 hover:bg-blue-700 font-bold px-8">
          <Save size={15} className="mr-2" />
          {saving ? "등록 중..." : "잔재 등록"}
        </Button>
      </div>
    </form>
  );
}

// ─── 엑셀식 일괄 등록 폼 ───────────────────────────────────────────────────

type RemnantBulkRow = {
  remnantNo: string;
  material: string;
  thickness: string;
  width1: string;
  length1: string;
  width2: string;
  length2: string;
  weight: string;
  location: string;
  memo: string;
};

const emptyRemnantBulkRow = (): RemnantBulkRow => ({
  remnantNo: "", material: "", thickness: "",
  width1: "", length1: "", width2: "", length2: "",
  weight: "", location: "", memo: "",
});

type BulkResult = { ok: boolean; remnantNo?: string; error?: string };

function RemnantBulkForm({ projects }: { projects: ProjectOption[] }) {
  // ── 상단 공통 선택 영역 ─────────────────────────────────────────────────
  const [type,    setType]    = useState("REMNANT");
  const [shape,   setShape]   = useState("RECTANGLE");
  const [sourceMode, setSourceMode] = useState<"project" | "direct" | "none">("project");
  const [sourceProjectId, setSourceProjectId] = useState("");
  const [sourceDirect,    setSourceDirect]    = useState("");
  const [registeredBy,    setRegisteredBy]    = useState("");

  // ── 그리드 행 ─────────────────────────────────────────────────────────────
  const [rows, setRows] = useState<RemnantBulkRow[]>([emptyRemnantBulkRow()]);
  const [submitting, setSubmitting] = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [results, setResults] = useState<BulkResult[] | null>(null);

  const isLShape    = shape === "L_SHAPE";
  const isIrregular = shape === "IRREGULAR";

  // 형태에 따른 컬럼 순서 (키보드 네비게이션용)
  const cols: (keyof RemnantBulkRow)[] = useMemo(() => {
    const base: (keyof RemnantBulkRow)[] = ["remnantNo", "material", "thickness", "width1", "length1"];
    if (isLShape) base.push("width2", "length2");
    base.push("weight", "location", "memo");
    return base;
  }, [isLShape]);

  // 행별 자동 중량
  const autoWeightFor = (r: RemnantBulkRow): number | null => {
    return calcWeight(shape, Number(r.thickness), r.material,
      Number(r.width1), Number(r.length1),
      Number(r.width2), Number(r.length2));
  };

  // 형태 변경 시 W2/L2 초기화
  const handleShapeChange = (v: string) => {
    setShape(v);
    if (v !== "L_SHAPE") {
      setRows(prev => prev.map(r => ({ ...r, width2: "", length2: "" })));
    }
  };

  const setCell = (idx: number, key: keyof RemnantBulkRow, val: string) =>
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, [key]: val } : r));

  const addRow    = () => setRows(prev => [...prev, emptyRemnantBulkRow()]);
  const deleteRow = (idx: number) => setRows(prev => prev.length === 1 ? [emptyRemnantBulkRow()] : prev.filter((_, i) => i !== idx));

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, idx: number, colIdx: number) => {
    const focusCell = (r: number, c: number) => document.getElementById(`rem-${r}-${c}`)?.focus();
    const appendRowFocus = (c: number) => {
      setRows(prev => [...prev, emptyRemnantBulkRow()]);
      setTimeout(() => focusCell(idx + 1, c), 50);
    };
    if (e.key === "ArrowUp")   { e.preventDefault(); if (idx > 0) focusCell(idx - 1, colIdx); return; }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (idx === rows.length - 1) appendRowFocus(colIdx);
      else focusCell(idx + 1, colIdx);
      return;
    }
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      const t = e.currentTarget;
      const isNum = t.type === "number";
      const atStart = isNum ? true : (t.selectionStart === 0 && t.selectionEnd === 0);
      const atEnd   = isNum ? true : (t.selectionStart === t.value.length && t.selectionEnd === t.value.length);
      if (e.key === "ArrowLeft" && atStart) {
        e.preventDefault();
        if (colIdx > 0) focusCell(idx, colIdx - 1);
        else if (idx > 0) focusCell(idx - 1, cols.length - 1);
        return;
      }
      if (e.key === "ArrowRight" && atEnd) {
        e.preventDefault();
        if (colIdx < cols.length - 1) focusCell(idx, colIdx + 1);
        else if (idx === rows.length - 1) appendRowFocus(0);
        else focusCell(idx + 1, 0);
        return;
      }
      return;
    }
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (e.shiftKey) {
      if (idx === rows.length - 1) appendRowFocus(colIdx);
      else focusCell(idx + 1, colIdx);
      return;
    }
    if (colIdx < cols.length - 1) focusCell(idx, colIdx + 1);
    else if (idx === rows.length - 1) appendRowFocus(0);
    else focusCell(idx + 1, 0);
  };

  const handleSubmit = async () => {
    setError(null);
    setResults(null);
    if (!registeredBy.trim()) { setError("등록자를 입력해주세요."); return; }
    if (sourceMode === "project" && !sourceProjectId) {
      setError("기존 호선/블록을 선택하거나 발생출처를 '직접 입력' 또는 '없음'으로 바꿔주세요.");
      return;
    }

    const valid = rows.filter(r => r.material.trim() && r.thickness && r.width1 && r.length1);
    if (valid.length === 0) {
      setError("최소 1개 행에 재질·두께·W1·L1을 입력해주세요.");
      return;
    }

    const selectedProject = projects.find(p => p.id === sourceProjectId);

    setSubmitting(true);
    const out: BulkResult[] = [];

    for (const r of rows) {
      // 빈 행 skip
      if (!r.material.trim() && !r.thickness && !r.width1 && !r.length1 && !r.weight) {
        out.push({ ok: false, error: "빈 행 (skip)" });
        continue;
      }
      if (!r.material.trim() || !r.thickness) {
        out.push({ ok: false, error: "재질/두께 누락" });
        continue;
      }
      const auto = autoWeightFor(r);
      const weight = r.weight ? Number(r.weight) : auto;
      if (!weight || weight <= 0) {
        out.push({ ok: false, error: isIrregular ? "중량 직접 입력 필요" : "중량 계산 실패" });
        continue;
      }
      try {
        const res = await fetch("/api/remnants", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            remnantNo: r.remnantNo.trim() || null,
            type, shape,
            material: r.material, thickness: r.thickness, weight,
            width1:  r.width1  || null,
            length1: r.length1 || null,
            width2:  r.width2  || null,
            length2: r.length2 || null,
            sourceProjectId:  sourceMode === "project" ? sourceProjectId : null,
            sourceVesselName: sourceMode === "direct"  ? (sourceDirect || null) : null,
            sourceBlock:      sourceMode === "project" ? (selectedProject?.projectName ?? null) : null,
            location: r.location || null,
            registeredBy,
            memo: r.memo || null,
          }),
        });
        const data = await res.json();
        if (data.success) out.push({ ok: true, remnantNo: data.data.remnantNo });
        else              out.push({ ok: false, error: data.error || "저장 실패" });
      } catch { out.push({ ok: false, error: "서버 오류" }); }
    }
    setSubmitting(false);
    setResults(out);

    const successCount = out.filter(o => o.ok).length;
    if (successCount > 0) {
      setRows([emptyRemnantBulkRow()]);
    }
  };

  const typeLabel  = (v: string) => TYPE_LABEL[v]  ?? v;
  const shapeLabel = (v: string) => SHAPE_LABEL[v] ?? v;

  return (
    <div className="space-y-4">
      {/* ─ 결과 메시지 ─────────────────────────────────── */}
      {results && (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-4 py-2 bg-green-50 border-b border-green-100 text-sm">
            <strong className="text-green-700">{results.filter(r => r.ok).length}건 등록 완료</strong>
            <span className="text-gray-500 ml-2">/ 전체 {results.length}건</span>
            <button onClick={() => setResults(null)} className="float-right text-gray-400 hover:text-gray-600"><X size={14} /></button>
          </div>
          <ul className="divide-y text-xs max-h-40 overflow-y-auto">
            {results.map((r, i) => (
              <li key={i} className={`px-4 py-1.5 ${r.ok ? "text-green-700" : "text-red-600"}`}>
                #{i + 1}: {r.ok ? `✅ ${r.remnantNo}` : `❌ ${r.error}`}
              </li>
            ))}
          </ul>
        </div>
      )}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm flex items-center gap-2">
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      {/* ─ 상단 공통 선택 영역 ──────────────────────────── */}
      <div className="bg-gradient-to-b from-blue-50/50 to-white border border-blue-200 rounded-xl p-4 space-y-4">
        <p className="text-xs text-blue-600 font-semibold uppercase tracking-wide">공통 선택 · 전체 행에 적용됩니다</p>

        {/* 종류 */}
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1.5">종류 <span className="text-red-500">*</span></label>
          <div className="flex gap-2 flex-wrap">
            {Object.entries(TYPE_LABEL).map(([v, l]) => (
              <label key={v} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md border cursor-pointer text-xs font-medium transition-all ${
                type === v ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-600 hover:border-gray-300"
              }`}>
                <input type="radio" name="bulk-type" value={v} checked={type === v} onChange={() => setType(v)} className="hidden" />
                {l}
              </label>
            ))}
          </div>
        </div>

        {/* 형태 */}
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1.5">형태 <span className="text-red-500">*</span></label>
          <div className="flex gap-2 flex-wrap">
            {Object.entries(SHAPE_LABEL).map(([v, l]) => (
              <label key={v} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md border cursor-pointer text-xs font-medium transition-all ${
                shape === v ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-gray-200 text-gray-600 hover:border-gray-300"
              }`}>
                <input type="radio" name="bulk-shape" value={v} checked={shape === v} onChange={() => handleShapeChange(v)} className="hidden" />
                {l}
              </label>
            ))}
          </div>
          {isIrregular && <p className="text-[11px] text-orange-500 mt-1">* 불규칙형은 각 행마다 중량을 직접 입력해주세요.</p>}
        </div>

        {/* 발생 출처 */}
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1.5">발생 출처</label>
          <div className="flex gap-2 mb-2">
            {([
              ["project", "기존 호선/블록"],
              ["direct",  "직접 입력"],
              ["none",    "없음"],
            ] as const).map(([v, l]) => (
              <label key={v} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md border cursor-pointer text-xs font-medium transition-all ${
                sourceMode === v ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-gray-200 text-gray-600 hover:border-gray-300"
              }`}>
                <input type="radio" name="bulk-source-mode" value={v} checked={sourceMode === v} onChange={() => setSourceMode(v)} className="hidden" />
                {l}
              </label>
            ))}
          </div>
          {sourceMode === "project" && (
            <select value={sourceProjectId} onChange={e => setSourceProjectId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">-- 기존 호선/블록 선택 --</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>[{p.projectCode}] {p.projectName}</option>
              ))}
            </select>
          )}
          {sourceMode === "direct" && (
            <Input value={sourceDirect} onChange={e => setSourceDirect(e.target.value)} placeholder="예: 4560호 / 101-1" />
          )}
        </div>

        {/* 등록자 */}
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1.5">등록자 <span className="text-red-500">*</span></label>
          <Input value={registeredBy} onChange={e => setRegisteredBy(e.target.value)} placeholder="이름" className="max-w-xs" />
        </div>
      </div>

      {/* ─ 그리드 ──────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-gray-500">행별 입력 · <span className="font-mono">Enter</span> 다음칸 · <span className="font-mono">Shift+Enter</span> 다음행 · <span className="font-mono">↑↓←→</span> 셀 이동</p>
          <span className="text-xs text-gray-400">공통 설정: <strong className="text-blue-600">{typeLabel(type)}</strong> · <strong className="text-indigo-600">{shapeLabel(shape)}</strong></span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm table-fixed">
            <colgroup>
              <col style={{ width: "2rem" }} />
              <col style={{ width: "10rem" }} />  {/* 잔재번호 */}
              <col style={{ width: "7rem"  }} />  {/* 재질 */}
              <col style={{ width: "5.5rem" }} /> {/* 두께 */}
              <col style={{ width: "6rem" }} />   {/* W1 */}
              <col style={{ width: "6rem" }} />   {/* L1 */}
              {isLShape && <col style={{ width: "6rem" }} />}
              {isLShape && <col style={{ width: "6rem" }} />}
              <col style={{ width: "7rem" }} />   {/* 중량 */}
              <col style={{ width: "8rem" }} />   {/* 위치 */}
              <col />                              {/* 메모 (flex) */}
              <col style={{ width: "2rem" }} />
            </colgroup>
            <thead>
              <tr className="border-b text-[11px] text-gray-500 uppercase tracking-wide">
                <th className="text-center pb-2">#</th>
                <th className="text-left pb-2 pr-2">잔재번호<span className="text-gray-300 font-normal"> (자동)</span></th>
                <th className="text-left pb-2 pr-2">재질 *</th>
                <th className="text-left pb-2 pr-2">두께 *</th>
                <th className="text-left pb-2 pr-2">W1 *</th>
                <th className="text-left pb-2 pr-2">L1 *</th>
                {isLShape && <th className="text-left pb-2 pr-2">W2</th>}
                {isLShape && <th className="text-left pb-2 pr-2">L2</th>}
                <th className="text-left pb-2 pr-2">중량(kg){!isIrregular && <span className="text-blue-400 font-normal"> · 자동</span>}</th>
                <th className="text-left pb-2 pr-2">위치</th>
                <th className="text-left pb-2 pr-2">메모</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((row, idx) => {
                const auto = autoWeightFor(row);
                return (
                  <tr key={idx} className="hover:bg-gray-50">
                    <td className="py-1.5 text-xs text-gray-400 text-center">{idx + 1}</td>
                    {cols.map((col, colIdx) => {
                      const isNum   = ["thickness","width1","length1","width2","length2","weight"].includes(col);
                      const val     = row[col];
                      const placeholder =
                        col === "remnantNo"  ? "자동" :
                        col === "material"   ? "AH36" :
                        col === "weight"     ? (auto != null && !isIrregular ? String(auto) : isIrregular ? "직접 입력" : "") :
                        "";
                      return (
                        <td key={col} className="py-1.5 pr-2">
                          <input
                            id={`rem-${idx}-${colIdx}`}
                            type={isNum ? "number" : "text"}
                            value={val}
                            onChange={e => {
                              const v = col === "material"
                                ? e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "")
                                : e.target.value;
                              setCell(idx, col, v);
                            }}
                            onKeyDown={e => handleKeyDown(e, idx, colIdx)}
                            onFocus={e => {
                              // 이전 행 자동복사 (재질·두께·위치)
                              if (!row[col] && idx > 0 && (col === "material" || col === "thickness" || col === "location")) {
                                setCell(idx, col, rows[idx - 1][col]);
                                setTimeout(() => (e.target as HTMLInputElement).select(), 0);
                              }
                            }}
                            placeholder={placeholder}
                            style={col === "material" ? { textTransform: "uppercase" } : undefined}
                            className="w-full px-2 py-1 border border-gray-200 rounded text-sm focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-300"
                          />
                        </td>
                      );
                    })}
                    <td className="py-1.5 text-center">
                      {rows.length > 1 && (
                        <button onClick={() => deleteRow(idx)} className="p-1 text-gray-300 hover:text-red-400 rounded">
                          <X size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-300 bg-blue-50/60">
                <td colSpan={cols.length + 1} className="py-2 px-3 text-xs font-semibold text-gray-600">
                  총 <strong className="text-blue-700">{rows.length}</strong>행
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>

        <button
          onClick={addRow}
          className="mt-3 flex items-center gap-1.5 text-sm text-blue-500 hover:text-blue-700"
        >
          <Plus size={14} /> 행 추가
        </button>
      </div>

      {/* ─ 등록 버튼 ──────────────────────────────────── */}
      <div className="flex justify-end">
        <Button
          onClick={handleSubmit}
          disabled={submitting}
          className="bg-blue-600 hover:bg-blue-700 font-bold px-8"
        >
          <Save size={15} className="mr-2" />
          {submitting ? "등록 중..." : `전체 등록 (${rows.length}건)`}
        </Button>
      </div>
    </div>
  );
}

// ─── 잔재등록 탭 (모드 전환: 엑셀식 / 자세히) ──────────────────────────────

export function RemnantRegisterTab({ projects }: { projects: ProjectOption[] }) {
  const [mode, setMode] = useState<"bulk" | "detail">("bulk");
  const btnCls = (active: boolean) =>
    `px-4 py-2 text-sm font-semibold rounded-lg border-2 transition-all ${
      active ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-600 hover:border-gray-300"
    }`;
  return (
    <div className="space-y-5">
      <div className="flex gap-2">
        <button onClick={() => setMode("bulk")}   className={btnCls(mode === "bulk")}>엑셀식 일괄 등록</button>
        <button onClick={() => setMode("detail")} className={btnCls(mode === "detail")}>자세히 등록 (단건)</button>
      </div>
      {mode === "bulk"   && <RemnantBulkForm   projects={projects} />}
      {mode === "detail" && <RemnantDetailForm projects={projects} />}
    </div>
  );
}

// ─── 수정 모달 ─────────────────────────────────────────────────────────────

function EditModal({ remnant, onClose, onSaved, onPermanentDeleted }: { remnant: Remnant; onClose: () => void; onSaved: () => void; onPermanentDeleted?: () => void }) {
  const [form, setForm] = useState({
    status:    remnant.status,
    location:  remnant.location ?? "",
    material:  remnant.material,
    thickness: String(remnant.thickness),
    weight:    String(remnant.weight),
    memo:      remnant.memo ?? "",
  });
  const [saving,   setSaving]   = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  const handlePermanentDelete = async () => {
    if (!confirm(`"${remnant.remnantNo}" 잔재를 완전히 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/remnants/${remnant.id}?force=true`, { method: "DELETE" });
      const data = await res.json();
      if (!data.success) { setError(data.error || "삭제 실패"); return; }
      onPermanentDeleted?.();
    } catch { setError("서버 오류"); }
    finally { setDeleting(false); }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/remnants/${remnant.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status:    form.status,
          location:  form.location  || null,
          material:  form.material,
          thickness: form.thickness,
          weight:    form.weight,
          memo:      form.memo || null,
        }),
      });
      const data = await res.json();
      if (!data.success) { setError(data.error); return; }
      onSaved();
    } catch { setError("서버 오류"); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="px-6 py-4 border-b flex items-center justify-between bg-gray-50 rounded-t-xl">
          <h3 className="font-bold text-base">{remnant.remnantNo} 수정</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded-full"><X size={16} /></button>
        </div>
        {error && <div className="mx-5 mt-4 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">{error}</div>}
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">상태</label>
              <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="IN_STOCK">재고있음</option>
                <option value="EXHAUSTED">소진</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">보관 위치</label>
              <Input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="위치" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">재질</label>
              <Input value={form.material} onChange={e => setForm(f => ({ ...f, material: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">두께 (mm)</label>
              <Input type="number" value={form.thickness} onChange={e => setForm(f => ({ ...f, thickness: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">중량 (kg)</label>
              <Input type="number" step="0.01" value={form.weight} onChange={e => setForm(f => ({ ...f, weight: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">메모사항</label>
            <textarea value={form.memo} onChange={e => setForm(f => ({ ...f, memo: e.target.value }))}
              rows={2} placeholder="메모 입력"
              className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-gray-100">
            <div>
              <Button
                variant="outline"
                onClick={handlePermanentDelete}
                disabled={deleting}
                className="border-red-300 text-red-600 hover:bg-red-50 font-bold"
              >
                {deleting ? "삭제 중..." : "완전 삭제"}
              </Button>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={onClose}>취소</Button>
              <Button onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700 font-bold">
                {saving ? "저장 중..." : "저장"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── 잔여분 재등록 모달 ────────────────────────────────────────────────────

function ReregisterModal({ remnant, onClose, onSaved }: { remnant: Remnant; onClose: () => void; onSaved: () => void }) {
  const [weight,   setWeight]   = useState("");
  const [location, setLocation] = useState(remnant.location ?? "");
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!weight || Number(weight) <= 0) { setError("남은 중량을 입력해주세요."); return; }
    setSaving(true);
    try {
      await fetch(`/api/remnants/${remnant.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "EXHAUSTED" }),
      });
      const res = await fetch("/api/remnants", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: remnant.type, shape: remnant.shape, material: remnant.material,
          thickness: remnant.thickness, weight: Number(weight),
          width1: remnant.width1, length1: remnant.length1,
          width2: remnant.width2, length2: remnant.length2,
          sourceProjectId: remnant.sourceProjectId,
          sourceVesselName: remnant.sourceVesselName,
          sourceBlock: remnant.sourceBlock,
          location: location || null,
          registeredBy: remnant.registeredBy,
          memo: remnant.memo,
        }),
      });
      const data = await res.json();
      if (!data.success) { setError(data.error); return; }
      onSaved();
    } catch { setError("서버 오류"); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm">
        <div className="px-5 py-4 border-b flex items-center justify-between bg-gray-50 rounded-t-xl">
          <h3 className="font-bold text-sm">잔여분 재등록</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded-full"><X size={15} /></button>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-xs text-gray-500">
            기존 <strong>{remnant.remnantNo}</strong>은 소진 처리되고, 남은 부분이 새 번호로 재등록됩니다.
          </p>
          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">남은 중량 (kg) <span className="text-red-500">*</span></label>
            <Input type="number" step="0.01" min="0" value={weight} onChange={e => setWeight(e.target.value)} placeholder="예: 85.5" autoFocus />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">보관 위치</label>
            <Input value={location} onChange={e => setLocation(e.target.value)} placeholder="보관 위치" />
          </div>
          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
            <Button variant="outline" size="sm" onClick={onClose}>취소</Button>
            <Button size="sm" onClick={handleSubmit} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 font-bold">
              {saving ? "처리 중..." : "재등록"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── 상세 모달 ─────────────────────────────────────────────────────────────

function DetailRow({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <p className="text-[11px] text-gray-400 mb-0.5">{label}</p>
      <p className="text-sm text-gray-800 font-medium">{value}</p>
      {sub && <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function DetailModal({
  remnant, onClose, onEdit, onReregister, onExhaust,
}: { remnant: Remnant; onClose: () => void; onEdit: () => void; onReregister: () => void; onExhaust: () => void }) {
  const src = sourceInfo(remnant);
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">
        {/* 헤더 */}
        <div className="px-6 py-4 border-b flex items-center justify-between bg-gray-50 rounded-t-xl">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono font-bold text-gray-800 text-base">{remnant.remnantNo}</span>
            <span className={`text-[11px] px-2.5 py-0.5 rounded-full font-semibold ${TYPE_COLOR[remnant.type]}`}>{TYPE_LABEL[remnant.type]}</span>
            <span className={`text-[11px] px-2.5 py-0.5 rounded-full font-semibold ${STATUS_COLOR[remnant.status]}`}>{STATUS_LABEL[remnant.status]}</span>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded-full ml-2"><X size={16} /></button>
        </div>

        {/* 본문 */}
        <div className="p-6 space-y-5">
          <div className="grid grid-cols-2 gap-x-8 gap-y-4">
            <DetailRow label="형태" value={SHAPE_LABEL[remnant.shape] ?? remnant.shape} />
            <DetailRow label="재질" value={remnant.material} />
            <DetailRow label="두께" value={`${remnant.thickness} mm`} />
            <DetailRow label="사이즈 (mm)" value={sizeText(remnant)} />
            <DetailRow label="중량" value={`${remnant.weight.toLocaleString()} kg`} />
            <DetailRow label="발생 출처" value={src.vessel} sub={src.block ? `블록: ${src.block}` : undefined} />
            <DetailRow label="보관 위치" value={remnant.location || "-"} />
            <DetailRow label="등록자" value={remnant.registeredBy} />
            <DetailRow label="등록일" value={new Date(remnant.createdAt).toLocaleDateString("ko-KR")} />
          </div>

          {/* 메모 */}
          <div className="border-t pt-4">
            <p className="text-xs font-semibold text-gray-500 mb-2">메모사항</p>
            {remnant.memo
              ? <p className="text-sm text-gray-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 leading-relaxed whitespace-pre-wrap">{remnant.memo}</p>
              : <p className="text-xs text-gray-400 italic">메모 없음</p>
            }
          </div>
        </div>

        {/* 액션 버튼 */}
        <div className="px-6 pb-5 pt-2 flex gap-2 justify-end border-t border-gray-100">
          <Button onClick={onEdit}
            className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 gap-1.5">
            <Edit2 size={13} /> 수정
          </Button>
          {remnant.status !== "EXHAUSTED" && (
            <Button onClick={onReregister}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 gap-1.5">
              <RotateCcw size={13} /> 잔여등록
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── 잔재 관리 탭 (목록) ───────────────────────────────────────────────────

export function RemnantManageTab({ projects: _projects }: { projects: ProjectOption[] }) {
  const [remnants,    setRemnants]    = useState<Remnant[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [search,      setSearch]      = useState("");
  const [detailItem,  setDetailItem]  = useState<Remnant | null>(null);
  const [editItem,    setEditItem]    = useState<Remnant | null>(null);
  const [reregItem,   setReregItem]   = useState<Remnant | null>(null);

  // 엑셀 스타일 컬럼 필터 (기본값: 재고있음만 노출)
  const [colFilters,     setColFilters]     = useState<Record<string, string[]>>({ status: ["IN_STOCK"] });
  const [openFilter,     setOpenFilter]     = useState<string | null>(null);
  const [filterAnchorEl, setFilterAnchorEl] = useState<HTMLElement | null>(null);

  const fetchRemnants = useCallback(async () => {
    setLoading(true);
    try {
      // 전체 로드 (필터링은 클라이언트에서 처리 - 컬럼 필터 distinct 계산 일관성)
      const res  = await fetch(`/api/remnants`);
      const data = await res.json();
      if (data.success) setRemnants(data.data);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchRemnants(); }, [fetchRemnants]);

  // ─── 컬럼별 고유값 (필터 드롭다운 소스) ──────────────────────────────────
  // 현재 필터 결과에 관계없이 전체 잔재 기준 distinct 값을 항상 노출
  const distinctValues = useMemo((): Record<string, FilterValue[]> => {
    const uniq = <T extends string | number>(xs: (T | null | undefined)[]) =>
      Array.from(new Set(xs.filter((v): v is T => v != null && v !== "")));

    const numLabel = (v: number | null) => (v == null ? "" : String(v));

    const toFV = (xs: (string | number)[], labelMap?: Record<string, string>): FilterValue[] =>
      xs
        .map(v => ({ value: String(v), label: labelMap?.[String(v)] ?? String(v) }))
        .sort((a, b) => a.label.localeCompare(b.label, "ko", { numeric: true }));

    return {
      type:      toFV(uniq(remnants.map(r => r.type)),     TYPE_LABEL),
      shape:     toFV(uniq(remnants.map(r => r.shape)),    SHAPE_LABEL),
      material:  toFV(uniq(remnants.map(r => r.material))),
      thickness: toFV(uniq(remnants.map(r => r.thickness))),
      width1:    toFV(uniq(remnants.map(r => numLabel(r.width1)).filter(Boolean))),
      length1:   toFV(uniq(remnants.map(r => numLabel(r.length1)).filter(Boolean))),
      width2:    toFV(uniq(remnants.map(r => numLabel(r.width2)).filter(Boolean))),
      length2:   toFV(uniq(remnants.map(r => numLabel(r.length2)).filter(Boolean))),
      location:  toFV(uniq(remnants.map(r => r.location ?? ""))),
      status:    toFV(uniq(remnants.map(r => r.status)),   STATUS_LABEL),
    };
  }, [remnants]);

  // ─── 필터링: 컬럼 필터 + 텍스트 검색 ─────────────────────────────────────
  const filtered = useMemo(() => {
    const cf = colFilters;
    const passCol = (key: string, val: string | number | null | undefined) => {
      const sel = cf[key];
      if (!sel || sel.length === 0) return true;
      return sel.includes(val == null ? "" : String(val));
    };
    const q = search.trim().toLowerCase();
    return remnants.filter(r => {
      if (!passCol("type",      r.type))      return false;
      if (!passCol("shape",     r.shape))     return false;
      if (!passCol("material",  r.material))  return false;
      if (!passCol("thickness", r.thickness)) return false;
      if (!passCol("width1",    r.width1))    return false;
      if (!passCol("length1",   r.length1))   return false;
      if (!passCol("width2",    r.width2))    return false;
      if (!passCol("length2",   r.length2))   return false;
      if (!passCol("location",  r.location))  return false;
      if (!passCol("status",    r.status))    return false;
      if (!q) return true;
      return (
        r.remnantNo.toLowerCase().includes(q) ||
        r.material.toLowerCase().includes(q) ||
        (r.sourceVesselName  ?? "").toLowerCase().includes(q) ||
        (r.sourceProject?.projectName ?? "").toLowerCase().includes(q) ||
        (r.sourceBlock ?? "").toLowerCase().includes(q) ||
        (r.location    ?? "").toLowerCase().includes(q) ||
        (r.registeredBy ?? "").toLowerCase().includes(q) ||
        (r.memo ?? "").toLowerCase().includes(q)
      );
    });
  }, [remnants, colFilters, search]);

  const hasAnyColFilter = Object.values(colFilters).some(v => v && v.length > 0);

  const handleExhaust = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!confirm("이 잔재를 소진(삭제) 처리하시겠습니까?")) return;
    await fetch(`/api/remnants/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "EXHAUSTED" }),
    });
    setDetailItem(null);
    fetchRemnants();
  };

  // ─── 컬럼 헤더 (필터 버튼 포함) ──────────────────────────────────────────
  const ColHeader = ({ col, label, align = "left" }: { col: string; label: string; align?: "left" | "right" | "center" }) => {
    const active = (colFilters[col]?.length ?? 0) > 0;
    const justify = align === "right" ? "justify-end" : align === "center" ? "justify-center" : "justify-start";
    return (
      <th className={`px-3 py-2 font-medium text-gray-600 text-[11px] ${align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left"}`}>
        <div className={`flex items-center gap-0.5 ${justify}`}>
          <span>{label}</span>
          <button
            onClick={(e) => { setOpenFilter(col); setFilterAnchorEl(e.currentTarget); }}
            className={`rounded hover:bg-gray-200 p-0.5 ${active ? "text-blue-500" : "text-gray-400"}`}
          >
            <Filter size={10} fill={active ? "currentColor" : "none"} />
          </button>
        </div>
      </th>
    );
  };

  return (
    <div className="space-y-4">
      {/* 목록 카드 */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {/* 헤더: 검색 + 필터초기화 + 새로고침 */}
        <div className="px-4 py-3 border-b bg-gray-50 flex items-center gap-3 flex-wrap">
          <Package size={14} className="text-blue-500 shrink-0" />
          <span className="text-sm font-semibold text-gray-700 shrink-0">
            잔재 목록 ({filtered.length}/{remnants.length}건)
          </span>
          <div className="relative flex-1 max-w-xs">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="잔재번호·재질·호선·위치 검색"
              className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
          {hasAnyColFilter && (
            <button
              onClick={() => setColFilters({})}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs border border-blue-300 text-blue-600 rounded-lg hover:bg-blue-50"
            >
              <X size={12} /> 필터 전체 초기화
            </button>
          )}
          <Button variant="outline" size="sm" onClick={fetchRemnants} className="text-xs shrink-0 ml-auto">
            <RefreshCw size={12} className="mr-1" /> 새로고침
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12 text-gray-400 gap-2">
            <RefreshCw className="animate-spin" size={18} /> 불러오는 중...
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <Package size={32} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">{search || hasAnyColFilter ? "검색 결과가 없습니다." : "해당하는 잔재가 없습니다."}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left whitespace-nowrap">
              <thead className="bg-gray-50 border-b text-[11px] text-gray-500 uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-2.5">잔재번호</th>
                  <ColHeader col="type"      label="종류"  />
                  <ColHeader col="shape"     label="형태"  />
                  <ColHeader col="material"  label="재질"  />
                  <ColHeader col="thickness" label="두께"  align="right" />
                  <ColHeader col="width1"    label="W1"    align="right" />
                  <ColHeader col="length1"   label="L1"    align="right" />
                  <ColHeader col="width2"    label="W2"    align="right" />
                  <ColHeader col="length2"   label="L2"    align="right" />
                  <th className="px-3 py-2.5 text-right">중량</th>
                  <th className="px-3 py-2.5">출처</th>
                  <ColHeader col="location"  label="위치"  />
                  <ColHeader col="status"    label="상태"  />
                  <th className="px-3 py-2.5 text-center">메모</th>
                  <th className="px-4 py-2.5 text-center">설정</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(r => {
                  const src = sourceInfo(r);
                  return (
                    <tr key={r.id}
                      onClick={() => setDetailItem(r)}
                      className="hover:bg-blue-50/40 cursor-pointer transition-colors">

                      {/* 잔재번호 */}
                      <td className="px-4 py-3">
                        <p className="font-mono text-xs font-bold text-gray-800">{r.remnantNo}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">
                          {new Date(r.createdAt).toLocaleDateString("ko-KR")} · {r.registeredBy}
                        </p>
                      </td>

                      {/* 종류 */}
                      <td className="px-3 py-3">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${TYPE_COLOR[r.type]}`}>
                          {TYPE_LABEL[r.type]}
                        </span>
                      </td>

                      {/* 형태 */}
                      <td className="px-3 py-3 text-xs text-gray-600">{SHAPE_LABEL[r.shape] ?? r.shape}</td>

                      {/* 재질 */}
                      <td className="px-3 py-3 text-xs font-semibold text-gray-800">{r.material}</td>

                      {/* 두께 (t 제거, 숫자만) */}
                      <td className="px-3 py-3 text-xs text-gray-600 text-right font-mono">{r.thickness}</td>

                      {/* W1 / L1 / W2 / L2 개별 컬럼 */}
                      <td className="px-3 py-3 text-xs text-gray-600 text-right font-mono">{r.width1  ?? <span className="text-gray-300">-</span>}</td>
                      <td className="px-3 py-3 text-xs text-gray-600 text-right font-mono">{r.length1 ?? <span className="text-gray-300">-</span>}</td>
                      <td className="px-3 py-3 text-xs text-gray-600 text-right font-mono">{r.width2  ?? <span className="text-gray-300">-</span>}</td>
                      <td className="px-3 py-3 text-xs text-gray-600 text-right font-mono">{r.length2 ?? <span className="text-gray-300">-</span>}</td>

                      {/* 중량 */}
                      <td className="px-3 py-3 text-xs font-bold text-gray-800 text-right">{r.weight.toLocaleString()} kg</td>

                      {/* 출처 */}
                      <td className="px-3 py-3 text-xs text-gray-500">
                        <p>{src.vessel}</p>
                        {src.block && <p className="text-[10px] text-gray-400">블록 {src.block}</p>}
                      </td>

                      {/* 위치 */}
                      <td className="px-3 py-3 text-xs text-gray-500">{r.location || "-"}</td>

                      {/* 상태 */}
                      <td className="px-3 py-3">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${STATUS_COLOR[r.status]}`}>
                          {STATUS_LABEL[r.status]}
                        </span>
                      </td>

                      {/* 메모 */}
                      <td className="px-3 py-3 text-center">
                        {r.memo
                          ? (
                            <span title={r.memo}
                              className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-amber-100 text-amber-600 hover:bg-amber-200 transition-colors cursor-help">
                              <StickyNote size={13} />
                            </span>
                          )
                          : <span className="text-[10px] text-gray-300">없음</span>
                        }
                      </td>

                      {/* 설정 버튼 */}
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={e => { e.stopPropagation(); setEditItem(r); }}
                            className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-bold rounded-md bg-blue-600 text-white hover:bg-blue-700 transition-colors">
                            <Edit2 size={11} /> 수정
                          </button>
                          {r.status !== "EXHAUSTED" && (
                            <button
                              onClick={e => { e.stopPropagation(); setReregItem(r); }}
                              className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-bold rounded-md bg-emerald-600 text-white hover:bg-emerald-700 transition-colors">
                              <RotateCcw size={11} /> 잔여
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 컬럼 필터 드롭다운 */}
      {openFilter && filterAnchorEl && (
        <ColumnFilterDropdown
          anchorEl={filterAnchorEl}
          values={distinctValues[openFilter] ?? []}
          selected={colFilters[openFilter] ?? []}
          onApply={(vals) => {
            setColFilters((prev) => ({ ...prev, [openFilter]: vals }));
            setOpenFilter(null);
            setFilterAnchorEl(null);
          }}
          onClose={() => { setOpenFilter(null); setFilterAnchorEl(null); }}
        />
      )}

      {/* 상세 모달 */}
      {detailItem && !editItem && !reregItem && (
        <DetailModal
          remnant={detailItem}
          onClose={() => setDetailItem(null)}
          onEdit={() => { setEditItem(detailItem); setDetailItem(null); }}
          onReregister={() => { setReregItem(detailItem); setDetailItem(null); }}
          onExhaust={() => handleExhaust(detailItem.id)}
        />
      )}

      {/* 수정 모달 */}
      {editItem && (
        <EditModal
          remnant={editItem}
          onClose={() => setEditItem(null)}
          onSaved={() => { setEditItem(null); fetchRemnants(); }}
          onPermanentDeleted={() => { setEditItem(null); fetchRemnants(); }}
        />
      )}

      {/* 잔여 재등록 모달 */}
      {reregItem && (
        <ReregisterModal
          remnant={reregItem}
          onClose={() => setReregItem(null)}
          onSaved={() => { setReregItem(null); fetchRemnants(); }}
        />
      )}
    </div>
  );
}

"use client";

import { useState, useEffect, useCallback } from "react";
import {
  RefreshCw, X, Save, AlertTriangle, Edit2,
  Package, Archive, Filter, StickyNote, Trash2, Search, RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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

export function RemnantRegisterTab({ projects }: { projects: ProjectOption[] }) {
  const [form,   setForm]   = useState({ ...INIT_FORM });
  const [saving,        setSaving]        = useState(false);
  const [error,         setError]         = useState<string | null>(null);
  const [ok,            setOk]            = useState(false);
  const [projectBlocks, setProjectBlocks] = useState<string[]>([]);

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  // 프로젝트 선택 시 블록 목록 조회
  const handleProjectChange = async (projectId: string) => {
    setForm(f => ({ ...f, sourceProjectId: projectId, sourceBlock: "" }));
    if (!projectId) { setProjectBlocks([]); return; }
    try {
      const res  = await fetch(`/api/projects/blocks?projectId=${projectId}`);
      const data = await res.json();
      setProjectBlocks(data.success ? data.data : []);
    } catch { setProjectBlocks([]); }
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

  const tabBtnCls = (active: boolean) =>
    `px-4 py-2 text-sm font-semibold rounded-lg border-2 transition-all ${
      active ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-600 hover:border-gray-300"
    }`;

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
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">기존 호선 연결</label>
            <select value={form.sourceProjectId} onChange={e => handleProjectChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">-- 없음 --</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>[{p.projectCode}] {p.projectName}</option>
              ))}
            </select>
          </div>

          {/* 호선 선택 시 블록이 있으면 블록 드롭다운, 없으면 숨김 */}
          {form.sourceProjectId && projectBlocks.length > 0 && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">블록 선택</label>
              <select value={form.sourceBlock} onChange={e => set("sourceBlock", e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">-- 전체 --</option>
                {projectBlocks.map(b => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>
          )}

          {/* 기존 호선 미선택 시 직접 입력 */}
          {!form.sourceProjectId && (
            <>
              <div>
                <label className="block text-xs text-gray-500 mb-1">호선명 직접 입력</label>
                <Input value={form.sourceVesselName} onChange={e => set("sourceVesselName", e.target.value)}
                  placeholder="예: 4560호" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">블록 번호 직접 입력</label>
                <Input value={form.sourceBlock} onChange={e => set("sourceBlock", e.target.value)}
                  placeholder="예: 101-1" />
              </div>
            </>
          )}
        </div>
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

// ─── 수정 모달 ─────────────────────────────────────────────────────────────

function EditModal({ remnant, onClose, onSaved }: { remnant: Remnant; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    status:    remnant.status,
    location:  remnant.location ?? "",
    material:  remnant.material,
    thickness: String(remnant.thickness),
    weight:    String(remnant.weight),
    memo:      remnant.memo ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);

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
                <option value="IN_USE">사용중</option>
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
          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
            <Button variant="outline" onClick={onClose}>취소</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700 font-bold">
              {saving ? "저장 중..." : "저장"}
            </Button>
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
          {remnant.status !== "EXHAUSTED" && (
            <Button onClick={onExhaust}
              className="bg-red-500 hover:bg-red-600 text-white text-xs font-bold px-4 gap-1.5">
              <Trash2 size={13} /> 삭제
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
  const [status,      setStatus]      = useState("IN_STOCK");
  const [typeF,       setTypeF]       = useState("");
  const [shapeF,      setShapeF]      = useState("");
  const [search,      setSearch]      = useState("");
  const [detailItem,  setDetailItem]  = useState<Remnant | null>(null);
  const [editItem,    setEditItem]    = useState<Remnant | null>(null);
  const [reregItem,   setReregItem]   = useState<Remnant | null>(null);

  const fetchRemnants = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      if (typeF)  params.set("type",   typeF);
      if (shapeF) params.set("shape",  shapeF);
      const res  = await fetch(`/api/remnants?${params}`);
      const data = await res.json();
      if (data.success) setRemnants(data.data);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [status, typeF, shapeF]);

  useEffect(() => { fetchRemnants(); }, [fetchRemnants]);

  // 검색 필터 (클라이언트)
  const filtered = remnants.filter(r => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
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

  const filterBtn = (val: string, cur: string, setter: (v: string) => void, label: string) => (
    <button key={val} onClick={() => setter(cur === val ? "" : val)}
      className={`px-3 py-1.5 text-xs font-semibold rounded-full border transition-colors ${
        cur === val ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
      }`}>
      {label}
    </button>
  );

  return (
    <div className="space-y-4">
      {/* 필터 */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-gray-500 flex items-center gap-1"><Filter size={11} /> 상태</span>
          {[["IN_STOCK","재고있음"],["IN_USE","사용중"],["EXHAUSTED","소진"]].map(([v,l]) => filterBtn(v, status, setStatus, l))}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-gray-500 flex items-center gap-1"><Filter size={11} /> 종류</span>
          {Object.entries(TYPE_LABEL).map(([v,l]) => filterBtn(v, typeF, setTypeF, l))}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-gray-500 flex items-center gap-1"><Filter size={11} /> 형태</span>
          {Object.entries(SHAPE_LABEL).map(([v,l]) => filterBtn(v, shapeF, setShapeF, l))}
        </div>
      </div>

      {/* 목록 카드 */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {/* 헤더: 검색 + 새로고침 */}
        <div className="px-4 py-3 border-b bg-gray-50 flex items-center gap-3">
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
            <p className="text-sm">{search ? "검색 결과가 없습니다." : "해당하는 잔재가 없습니다."}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left whitespace-nowrap">
              <thead className="bg-gray-50 border-b text-[11px] text-gray-500 uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-2.5">잔재번호</th>
                  <th className="px-3 py-2.5">종류</th>
                  <th className="px-3 py-2.5">형태</th>
                  <th className="px-3 py-2.5">재질</th>
                  <th className="px-3 py-2.5 text-right">두께</th>
                  <th className="px-3 py-2.5">사이즈(mm)</th>
                  <th className="px-3 py-2.5 text-right">중량</th>
                  <th className="px-3 py-2.5">출처</th>
                  <th className="px-3 py-2.5">위치</th>
                  <th className="px-3 py-2.5">상태</th>
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

                      {/* 두께 */}
                      <td className="px-3 py-3 text-xs text-gray-600 text-right">t{r.thickness}</td>

                      {/* 사이즈 */}
                      <td className="px-3 py-3 text-xs text-gray-600 font-mono">{sizeText(r)}</td>

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
                          {r.status !== "EXHAUSTED" && (
                            <button
                              onClick={e => handleExhaust(r.id, e)}
                              className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-bold rounded-md bg-red-500 text-white hover:bg-red-600 transition-colors">
                              <Trash2 size={11} /> 삭제
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

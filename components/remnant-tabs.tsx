"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Plus, RefreshCw, X, Save, AlertTriangle, Edit2,
  Package, Archive, Filter,
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
  location: string | null;
  status: string;
  registeredBy: string;
  needsConsult: boolean;
  originalVesselName: string | null;
  drawingNo: string | null;
  consultPerson: string | null;
  createdAt: string;
}

// ─── 상수 ──────────────────────────────────────────────────────────────────

const TYPE_LABEL: Record<string, string>  = { REMNANT: "잔재", SURPLUS: "여유재", REGISTERED: "등록잔재" };
const TYPE_COLOR: Record<string, string>  = {
  REMNANT:    "bg-blue-100 text-blue-700",
  SURPLUS:    "bg-green-100 text-green-700",
  REGISTERED: "bg-purple-100 text-purple-700",
};
const SHAPE_LABEL: Record<string, string> = { RECTANGLE: "사각형", L_SHAPE: "L자형", STRIP: "띠형", IRREGULAR: "불규칙형" };
const STATUS_LABEL: Record<string, string>= { IN_STOCK: "재고있음", IN_USE: "사용중", EXHAUSTED: "소진" };
const STATUS_COLOR: Record<string, string>= {
  IN_STOCK:  "bg-emerald-100 text-emerald-700",
  IN_USE:    "bg-yellow-100 text-yellow-700",
  EXHAUSTED: "bg-gray-100 text-gray-500",
};

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
  if (shape === "RECTANGLE" || shape === "STRIP") {
    if (!w1 || !l1) return null;
    area = w1 * l1;
  } else if (shape === "L_SHAPE") {
    if (!w1 || !l1) return null;
    area = w1 * l1 - (w2 || 0) * (l2 || 0);
    if (area <= 0) return null;
  } else {
    return null; // 불규칙형: 직접 입력
  }
  const weightG = area * thickness * d; // g
  return Math.round((weightG / 1000) * 100) / 100; // kg, 소수점 2자리
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
  type: "REMNANT", shape: "RECTANGLE",
  material: "", thickness: "",
  width1: "", length1: "", width2: "", length2: "",
  sourceProjectId: "", sourceVesselName: "",
  location: "", registeredBy: "",
  originalVesselName: "", drawingNo: "", consultPerson: "",
  manualWeight: "",
};

export function RemnantRegisterTab({ projects }: { projects: ProjectOption[] }) {
  const [form,   setForm]   = useState({ ...INIT_FORM });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);
  const [ok,     setOk]     = useState(false);

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

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
          type: form.type, shape: form.shape,
          material: form.material, thickness: form.thickness,
          weight,
          width1:  form.width1  || null,
          length1: form.length1 || null,
          width2:  form.width2  || null,
          length2: form.length2 || null,
          sourceProjectId: form.sourceProjectId || null,
          sourceVesselName: form.sourceVesselName || null,
          location: form.location || null,
          registeredBy: form.registeredBy,
          originalVesselName: form.originalVesselName || null,
          drawingNo: form.drawingNo || null,
          consultPerson: form.consultPerson || null,
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

      {/* ① 종류 */}
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
        {form.type === "REGISTERED" && (
          <p className="mt-2 text-xs text-purple-600 bg-purple-50 border border-purple-200 rounded-md px-3 py-2 flex items-center gap-1.5">
            <AlertTriangle size={12} /> 등록잔재는 사용 전 담당자 협의가 필요합니다.
          </p>
        )}
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

      {form.shape === "STRIP" && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">치수 (mm) <span className="text-xs text-gray-400">— 띠형: 폭 300mm 이하</span></label>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">폭 (W, ≤300mm)</label>
              <Input type="number" min="0" max="300" value={form.width1} onChange={e => set("width1", e.target.value)} placeholder="폭 mm" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">길이 (L)</label>
              <Input type="number" min="0" value={form.length1} onChange={e => set("length1", e.target.value)} placeholder="길이 mm" />
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
            <select value={form.sourceProjectId} onChange={e => set("sourceProjectId", e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">-- 없음 --</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>[{p.projectCode}] {p.projectName}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">호선명 직접 입력</label>
            <Input value={form.sourceVesselName} onChange={e => set("sourceVesselName", e.target.value)}
              placeholder="예: 4560호" disabled={!!form.sourceProjectId} />
          </div>
        </div>
      </div>

      {/* ⑦ 등록잔재 전용 */}
      {form.type === "REGISTERED" && (
        <div className="border border-purple-200 rounded-xl p-4 bg-purple-50/50 space-y-3">
          <p className="text-xs font-semibold text-purple-700">등록잔재 추가 정보</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">원래 호선명</label>
              <Input value={form.originalVesselName} onChange={e => set("originalVesselName", e.target.value)} placeholder="예: 4560호" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">도면번호</label>
              <Input value={form.drawingNo} onChange={e => set("drawingNo", e.target.value)} placeholder="예: D-101-A" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">협의 담당자</label>
              <Input value={form.consultPerson} onChange={e => set("consultPerson", e.target.value)} placeholder="담당자명" />
            </div>
          </div>
        </div>
      )}

      {/* ⑧ 보관 위치 / 등록자 */}
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

      <div className="flex justify-end pt-2">
        <Button type="submit" disabled={saving} className="bg-blue-600 hover:bg-blue-700 font-bold px-8">
          <Save size={15} className="mr-2" />
          {saving ? "등록 중..." : "잔재 등록"}
        </Button>
      </div>
    </form>
  );
}

// ─── 잔재 관리 탭 ──────────────────────────────────────────────────────────

interface EditModalProps {
  remnant: Remnant;
  projects: ProjectOption[];
  onClose: () => void;
  onSaved: () => void;
}

function EditModal({ remnant, projects, onClose, onSaved }: EditModalProps) {
  const [form, setForm] = useState({
    status:   remnant.status,
    location: remnant.location ?? "",
    material: remnant.material,
    thickness: String(remnant.thickness),
    weight:   String(remnant.weight),
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res  = await fetch(`/api/remnants/${remnant.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status:   form.status,
          location: form.location || null,
          material: form.material,
          thickness: form.thickness,
          weight:   form.weight,
        }),
      });
      const data = await res.json();
      if (!data.success) { setError(data.error); return; }
      onSaved();
    } catch { setError("서버 오류"); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm">
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

function ReregisterModal({
  remnant, onClose, onSaved,
}: { remnant: Remnant; onClose: () => void; onSaved: () => void }) {
  const [weight,   setWeight]   = useState("");
  const [location, setLocation] = useState(remnant.location ?? "");
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!weight || Number(weight) <= 0) { setError("남은 중량을 입력해주세요."); return; }
    setSaving(true);
    try {
      // 1. 기존 잔재 소진 처리
      await fetch(`/api/remnants/${remnant.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "EXHAUSTED" }),
      });
      // 2. 새 잔재 등록 (동일 속성, 새 중량·번호)
      const res  = await fetch("/api/remnants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type:     remnant.type,
          shape:    remnant.shape,
          material: remnant.material,
          thickness: remnant.thickness,
          weight:   Number(weight),
          width1:   remnant.width1, length1: remnant.length1,
          width2:   remnant.width2, length2: remnant.length2,
          sourceProjectId: remnant.sourceProjectId,
          sourceVesselName: remnant.sourceVesselName,
          location: location || null,
          registeredBy: remnant.registeredBy,
          originalVesselName: remnant.originalVesselName,
          drawingNo: remnant.drawingNo,
          consultPerson: remnant.consultPerson,
        }),
      });
      const data = await res.json();
      if (!data.success) { setError(data.error); return; }
      onSaved();
    } catch { setError("서버 오류"); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm">
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

// ─── 잔재 관리 탭 (목록) ───────────────────────────────────────────────────

export function RemnantManageTab({ projects }: { projects: ProjectOption[] }) {
  const [remnants,  setRemnants]  = useState<Remnant[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [status,    setStatus]    = useState("IN_STOCK");
  const [typeF,     setTypeF]     = useState("");
  const [shapeF,    setShapeF]    = useState("");
  const [editItem,  setEditItem]  = useState<Remnant | null>(null);
  const [reregItem, setReregItem] = useState<Remnant | null>(null);

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

  const handleExhaust = async (id: string) => {
    if (!confirm("이 잔재를 소진 처리하시겠습니까?")) return;
    await fetch(`/api/remnants/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "EXHAUSTED" }),
    });
    fetchRemnants();
  };

  const filterBtn = (val: string, cur: string, set: (v: string) => void, label: string) => (
    <button key={val} onClick={() => set(cur === val ? "" : val)}
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
          {[["IN_STOCK","재고있음"],["IN_USE","사용중"],["EXHAUSTED","소진"]].map(([v, l]) =>
            filterBtn(v, status, setStatus, l)
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-gray-500 flex items-center gap-1"><Filter size={11} /> 종류</span>
          {Object.entries(TYPE_LABEL).map(([v, l]) => filterBtn(v, typeF, setTypeF, l))}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-gray-500 flex items-center gap-1"><Filter size={11} /> 형태</span>
          {Object.entries(SHAPE_LABEL).map(([v, l]) => filterBtn(v, shapeF, setShapeF, l))}
        </div>
      </div>

      {/* 목록 */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <Package size={14} className="text-blue-500" />
            잔재 목록 ({remnants.length}건)
          </span>
          <Button variant="outline" size="sm" onClick={fetchRemnants} className="text-xs">
            <RefreshCw size={12} className="mr-1" /> 새로고침
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12 text-gray-400 gap-2">
            <RefreshCw className="animate-spin" size={18} /> 불러오는 중...
          </div>
        ) : remnants.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <Package size={32} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">해당하는 잔재가 없습니다.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left whitespace-nowrap">
              <thead className="bg-gray-50 border-b text-xs text-gray-500 uppercase">
                <tr>
                  <th className="px-4 py-2.5">잔재번호</th>
                  <th className="px-4 py-2.5">종류</th>
                  <th className="px-4 py-2.5">형태</th>
                  <th className="px-4 py-2.5">재질·두께</th>
                  <th className="px-4 py-2.5 text-right">중량</th>
                  <th className="px-4 py-2.5">출처</th>
                  <th className="px-4 py-2.5">위치</th>
                  <th className="px-4 py-2.5">상태</th>
                  <th className="px-4 py-2.5 text-center">액션</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {remnants.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs font-bold text-gray-700">{r.remnantNo}</span>
                        {r.needsConsult && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 font-semibold">협의필요</span>
                        )}
                      </div>
                      <p className="text-[11px] text-gray-400 mt-0.5">
                        {new Date(r.createdAt).toLocaleDateString("ko-KR")} · {r.registeredBy}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${TYPE_COLOR[r.type]}`}>
                        {TYPE_LABEL[r.type]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">{SHAPE_LABEL[r.shape]}</td>
                    <td className="px-4 py-3">
                      <p className="text-xs font-semibold text-gray-800">{r.material}</p>
                      <p className="text-[11px] text-gray-400">t{r.thickness}</p>
                    </td>
                    <td className="px-4 py-3 text-right text-xs font-bold text-gray-700">{r.weight.toLocaleString()} kg</td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {r.sourceProject
                        ? `[${r.sourceProject.projectCode}] ${r.sourceProject.projectName}`
                        : (r.sourceVesselName || "-")}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{r.location || "-"}</td>
                    <td className="px-4 py-3">
                      <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[r.status]}`}>
                        {STATUS_LABEL[r.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => setEditItem(r)}
                          className="p-1.5 text-blue-400 hover:bg-blue-50 rounded-md" title="수정">
                          <Edit2 size={12} />
                        </button>
                        {r.status !== "EXHAUSTED" && (
                          <>
                            <button onClick={() => setReregItem(r)}
                              className="p-1.5 text-emerald-500 hover:bg-emerald-50 rounded-md text-[10px] font-semibold px-2" title="잔여분 재등록">
                              잔여
                            </button>
                            <button onClick={() => handleExhaust(r.id)}
                              className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-md" title="소진처리">
                              <Archive size={12} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editItem  && <EditModal remnant={editItem}  projects={projects} onClose={() => setEditItem(null)}  onSaved={() => { setEditItem(null);  fetchRemnants(); }} />}
      {reregItem && <ReregisterModal remnant={reregItem} onClose={() => setReregItem(null)} onSaved={() => { setReregItem(null); fetchRemnants(); }} />}
    </div>
  );
}

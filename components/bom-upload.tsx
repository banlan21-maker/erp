"use client";

/**
 * BOM 등록 컴포넌트
 * - 좌측: 업체(BomVendor) 목록 + 추가/편집/삭제
 * - 우측: 블록 선택 → 엑셀 업로드 → 미리보기 → DB 저장
 *
 * Python app.py의 UI 흐름을 ERP 디자인으로 재구현
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Building2, Plus, Pencil, Trash2, Upload,
  Eye, Save, ChevronDown, X, CheckCircle2, AlertCircle,
} from "lucide-react";

// ── 타입 ──────────────────────────────────────────────────────

interface BomVendor {
  id: string;
  name: string;
  desc: string | null;
  preset: BomPreset;
}

interface FieldConfig {
  type: "direct" | "sum" | "join" | "dim_thickness" | "dim_size" | "dim_parse";
  col?: number;
  cols?: number[];
  sep?: string;
  dim_sep?: string;
  dim_pos?: "first" | "last";
  dim_extract?: "thickness" | "size";
}

interface BomPreset {
  header_row: number;
  project_cell?: { row: number; col: number };
  block_cell?:   { row: number; col: number };
  filter?: { col: number; not_empty?: boolean; startswith?: string; equals?: string; contains?: string };
  fields: Record<string, FieldConfig>;
  sum_cols?: string[];
  field_labels?: Record<string, string>;
}

interface ProjectOption {
  id: string;
  projectCode: string;
  projectName: string;
}

interface BomRow {
  [key: string]: string | number | null;
}

const OUTPUT_FIELDS = ["호선","블록","파트명","두께","사이즈","재질","가공","수량","중량(kg)","NEST NO"];
const FIELD_TYPES = {
  direct: "직접 (단일 열)",
  sum: "합산 (여러 열)",
  join: "조합 (이어붙이기)",
  dim_thickness: "DIMENSION → 두께",
  dim_size: "DIMENSION → 사이즈",
  dim_parse: "DIMENSION 파싱 (설정)",
};

const emptyPreset = (): BomPreset => ({
  header_row: 2,
  project_cell: { row: 1, col: 1 },
  block_cell:   { row: 1, col: 2 },
  fields: Object.fromEntries(
    ["파트명","두께","사이즈","재질","가공","수량","중량(kg)","NEST NO"].map((f, i) => [
      f, { type: "direct" as const, col: i + 1 },
    ])
  ),
  sum_cols: ["수량", "중량(kg)"],
});

// ── 메인 컴포넌트 ──────────────────────────────────────────────

export default function BomUpload({ projectOptions }: { projectOptions: ProjectOption[] }) {
  const [vendors,  setVendors]  = useState<BomVendor[]>([]);
  const [selected, setSelected] = useState<BomVendor | null>(null);

  // 업로드 / 미리보기
  const [file,        setFile]        = useState<File | null>(null);
  const [projectId,   setProjectId]   = useState<string>("");
  const [previewing,  setPreviewing]  = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [previewRows, setPreviewRows] = useState<BomRow[] | null>(null);
  const [previewMeta, setPreviewMeta] = useState<{ total: number; totalQty: number; totalWt: number } | null>(null);
  const [saveResult,  setSaveResult]  = useState<{ ok: boolean; count?: number; error?: string } | null>(null);

  // 업체 모달
  const [showModal, setShowModal]   = useState(false);
  const [editTarget,setEditTarget]  = useState<BomVendor | null>(null);
  const [form,      setForm]        = useState<{ name: string; desc: string; preset: BomPreset }>({
    name: "", desc: "", preset: emptyPreset(),
  });
  const [modalSaving, setModalSaving] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);

  const loadVendors = useCallback(async () => {
    const r = await fetch("/api/bom-vendors");
    setVendors(await r.json());
  }, []);

  useEffect(() => { loadVendors(); }, [loadVendors]);

  // ── 파일 업로드 ──
  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setPreviewRows(null);
    setSaveResult(null);
    e.target.value = "";
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f && /\.xlsx?$/i.test(f.name)) { setFile(f); setPreviewRows(null); setSaveResult(null); }
  };

  // ── 미리보기 ──
  const runPreview = async () => {
    if (!file || !selected) return;
    setPreviewing(true); setSaveResult(null);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("vendorId", selected.id);
    fd.append("action", "preview");
    const r = await fetch("/api/bom", { method: "POST", body: fd });
    const data = await r.json();
    if (data.error) { alert("파싱 오류: " + data.error); setPreviewing(false); return; }
    setPreviewRows(data.rows);
    setPreviewMeta({ total: data.total, totalQty: data.totalQty, totalWt: data.totalWt });
    setPreviewing(false);
  };

  // ── DB 저장 ──
  const runSave = async () => {
    if (!file || !selected || !projectId) return;
    setSaving(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("vendorId", selected.id);
    fd.append("action", "save");
    fd.append("projectId", projectId);
    const r = await fetch("/api/bom", { method: "POST", body: fd });
    const data = await r.json();
    setSaveResult(data.error ? { ok: false, error: data.error } : { ok: true, count: data.count });
    setSaving(false);
  };

  // ── 업체 모달 열기 ──
  const openAdd = () => {
    setEditTarget(null);
    setForm({ name: "", desc: "", preset: emptyPreset() });
    setShowModal(true);
  };
  const openEdit = (v: BomVendor) => {
    setEditTarget(v);
    setForm({ name: v.name, desc: v.desc ?? "", preset: v.preset });
    setShowModal(true);
  };

  // ── 업체 저장 ──
  const saveVendor = async () => {
    if (!form.name.trim()) { alert("업체명을 입력하세요."); return; }
    setModalSaving(true);
    const url = editTarget ? `/api/bom-vendors/${editTarget.id}` : "/api/bom-vendors";
    const method = editTarget ? "PATCH" : "POST";
    await fetch(url, {
      method, headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: form.name, desc: form.desc, preset: form.preset }),
    });
    await loadVendors();
    setShowModal(false);
    setModalSaving(false);
  };

  // ── 업체 삭제 ──
  const deleteVendor = async (v: BomVendor) => {
    if (!confirm(`'${v.name}' 업체를 삭제하시겠습니까?`)) return;
    await fetch(`/api/bom-vendors/${v.id}`, { method: "DELETE" });
    if (selected?.id === v.id) setSelected(null);
    await loadVendors();
  };

  // ── 프리셋 폼 헬퍼 ──
  const setPreset = (patch: Partial<BomPreset>) =>
    setForm(f => ({ ...f, preset: { ...f.preset, ...patch } }));
  const setFieldCfg = (field: string, patch: Partial<FieldConfig>) =>
    setPreset({ fields: { ...form.preset.fields, [field]: { ...form.preset.fields[field], ...patch } } });

  const EDITABLE_FIELDS = ["파트명","두께","사이즈","재질","가공","수량","중량(kg)","NEST NO"];

  return (
    <div className="flex gap-4">
      {/* ── 좌측: 업체 목록 ── */}
      <div className="w-64 flex-shrink-0">
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="bg-gray-800 text-white px-4 py-3 flex items-center gap-2 text-sm font-semibold">
            <Building2 size={14} /> 등록 업체
          </div>
          <div className="p-3 space-y-1">
            {vendors.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-4">등록된 업체 없음</p>
            )}
            {vendors.map((v) => (
              <div
                key={v.id}
                onClick={() => { setSelected(v); setPreviewRows(null); setSaveResult(null); }}
                className={`flex items-start gap-2 p-2.5 rounded-lg cursor-pointer border-2 transition-all ${
                  selected?.id === v.id
                    ? "border-blue-500 bg-blue-50"
                    : "border-transparent hover:bg-gray-50"
                }`}
              >
                <div className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 truncate">{v.name}</p>
                  {v.desc && <p className="text-xs text-gray-400 truncate">{v.desc}</p>}
                </div>
              </div>
            ))}
          </div>
          <div className="px-3 pb-3 flex gap-1.5">
            <button onClick={openAdd}
              className="flex-1 flex items-center justify-center gap-1 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              <Plus size={12} /> 추가
            </button>
            <button onClick={() => selected && openEdit(selected)} disabled={!selected}
              className="flex-1 flex items-center justify-center gap-1 py-1.5 text-xs font-semibold bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 disabled:opacity-40">
              <Pencil size={12} /> 편집
            </button>
            <button onClick={() => selected && deleteVendor(selected)} disabled={!selected}
              className="flex-1 flex items-center justify-center gap-1 py-1.5 text-xs font-semibold bg-red-50 text-red-600 rounded-lg hover:bg-red-100 disabled:opacity-40">
              <Trash2 size={12} /> 삭제
            </button>
          </div>
        </div>
      </div>

      {/* ── 우측: 업로드 / 미리보기 ── */}
      <div className="flex-1 space-y-4">
        {!selected ? (
          <div className="flex items-center justify-center h-48 bg-white rounded-xl border text-gray-400 text-sm">
            좌측에서 업체를 먼저 선택하세요.
          </div>
        ) : (
          <>
            {/* 블록 선택 + 파일 업로드 */}
            <div className="bg-white rounded-xl border overflow-hidden">
              <div className="bg-gray-800 text-white px-4 py-3 text-sm font-semibold">
                BOM 파일 업로드 — {selected.name}
              </div>
              <div className="p-4 space-y-4">
                {/* 블록 선택 */}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5">등록할 블록 선택</label>
                  <div className="relative">
                    <select
                      value={projectId}
                      onChange={e => { setProjectId(e.target.value); setSaveResult(null); }}
                      className="w-full appearance-none border rounded-lg px-3 py-2 text-sm pr-8 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">— 블록 선택 —</option>
                      {projectOptions.map(p => (
                        <option key={p.id} value={p.id}>
                          [{p.projectCode}] {p.projectName}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  </div>
                </div>

                {/* 파일 업로드 존 */}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5">BOM 엑셀 파일</label>
                  <div
                    onDragOver={e => e.preventDefault()}
                    onDrop={onDrop}
                    onClick={() => fileRef.current?.click()}
                    className={`border-2 border-dashed rounded-lg px-4 py-8 text-center cursor-pointer transition-colors ${
                      file ? "border-blue-400 bg-blue-50" : "border-gray-200 hover:border-blue-300 hover:bg-gray-50"
                    }`}
                  >
                    <Upload size={28} className={`mx-auto mb-2 ${file ? "text-blue-500" : "text-gray-300"}`} />
                    {file ? (
                      <p className="text-sm font-semibold text-blue-700">{file.name}</p>
                    ) : (
                      <>
                        <p className="text-sm text-gray-500"><strong>클릭</strong> 또는 파일 드래그</p>
                        <p className="text-xs text-gray-400 mt-1">.xlsx, .xls</p>
                      </>
                    )}
                  </div>
                  <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={onFileChange} />
                </div>

                {/* 버튼 */}
                <div className="flex gap-2">
                  <button
                    onClick={runPreview}
                    disabled={!file || previewing}
                    className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-40"
                  >
                    <Eye size={14} />
                    {previewing ? "파싱 중..." : "미리보기"}
                  </button>
                  <button
                    onClick={runSave}
                    disabled={!file || !projectId || saving || !previewRows}
                    className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40"
                  >
                    <Save size={14} />
                    {saving ? "저장 중..." : "DB 저장"}
                  </button>
                </div>

                {/* 저장 결과 */}
                {saveResult && (
                  <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${
                    saveResult.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
                  }`}>
                    {saveResult.ok
                      ? <><CheckCircle2 size={15} /> {saveResult.count}건 저장 완료</>
                      : <><AlertCircle size={15} /> 저장 실패: {saveResult.error}</>
                    }
                  </div>
                )}
              </div>
            </div>

            {/* 미리보기 테이블 */}
            {previewRows && previewMeta && (
              <div className="bg-white rounded-xl border overflow-hidden">
                <div className="bg-gray-800 text-white px-4 py-3 flex items-center gap-2 text-sm font-semibold">
                  <Eye size={14} /> 미리보기
                  <span className="ml-auto bg-white/20 px-2.5 py-0.5 rounded-full text-xs font-bold">
                    전체 {previewMeta.total}건
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-gray-100">
                        {OUTPUT_FIELDS.map(f => (
                          <th key={f} className="px-3 py-2 text-left font-semibold text-gray-600 border-b whitespace-nowrap">{f}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.map((row, i) => (
                        <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                          {OUTPUT_FIELDS.map(f => (
                            <td key={f} className="px-3 py-1.5 border-b text-gray-700 whitespace-nowrap">
                              {row[f] ?? ""}
                            </td>
                          ))}
                        </tr>
                      ))}
                      <tr className="bg-blue-50 font-semibold text-blue-800">
                        <td colSpan={7} className="px-3 py-2 text-right text-xs">합 계</td>
                        <td className="px-3 py-2 text-xs">{previewMeta.totalQty.toLocaleString()}</td>
                        <td className="px-3 py-2 text-xs">{previewMeta.totalWt.toFixed(3)}</td>
                        <td className="px-3 py-2" />
                      </tr>
                    </tbody>
                  </table>
                </div>
                {previewMeta.total > 50 && (
                  <p className="text-xs text-gray-400 px-4 py-2">상위 50행 미리보기 / 전체 {previewMeta.total}건은 저장 시 모두 반영됩니다.</p>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── 업체 추가/편집 모달 ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
            {/* 헤더 */}
            <div className="bg-gray-800 text-white px-6 py-4 rounded-t-2xl flex items-center justify-between">
              <h2 className="text-base font-bold">{editTarget ? `'${editTarget.name}' 편집` : "업체 추가"}</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-white"><X size={20} /></button>
            </div>

            <div className="p-6 space-y-5">
              {/* 기본 정보 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">업체명 *</label>
                  <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="예: 해사기술" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">설명</label>
                  <input value={form.desc} onChange={e => setForm(f => ({ ...f, desc: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="간단한 설명" />
                </div>
              </div>

              {/* 행 설정 */}
              <div>
                <p className="text-xs font-bold text-gray-700 mb-2">행 설정</p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">데이터 시작 행</label>
                    <input type="number" min={1} value={form.preset.header_row}
                      onChange={e => setPreset({ header_row: Number(e.target.value) })}
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">호선 셀 (행, 열)</label>
                    <div className="flex gap-1">
                      <input type="number" min={1} value={form.preset.project_cell?.row ?? 1}
                        onChange={e => setPreset({ project_cell: { ...form.preset.project_cell!, row: Number(e.target.value) } })}
                        className="w-full border rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="행" />
                      <input type="number" min={1} value={form.preset.project_cell?.col ?? 1}
                        onChange={e => setPreset({ project_cell: { ...form.preset.project_cell!, col: Number(e.target.value) } })}
                        className="w-full border rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="열" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">블록 셀 (행, 열)</label>
                    <div className="flex gap-1">
                      <input type="number" min={1} value={form.preset.block_cell?.row ?? 1}
                        onChange={e => setPreset({ block_cell: { ...form.preset.block_cell!, row: Number(e.target.value) } })}
                        className="w-full border rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="행" />
                      <input type="number" min={1} value={form.preset.block_cell?.col ?? 2}
                        onChange={e => setPreset({ block_cell: { ...form.preset.block_cell!, col: Number(e.target.value) } })}
                        className="w-full border rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="열" />
                    </div>
                  </div>
                </div>
              </div>

              {/* 필터 */}
              <div>
                <p className="text-xs font-bold text-gray-700 mb-2">행 필터</p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">기준 열 (0=없음)</label>
                    <input type="number" min={0}
                      value={(form.preset.filter as { col?: number })?.col ?? 0}
                      onChange={e => setPreset({ filter: { ...(form.preset.filter as object ?? {}), col: Number(e.target.value) } as BomPreset["filter"] })}
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">방식</label>
                    <select
                      value={
                        (form.preset.filter as Record<string,unknown>)?.startswith ? "startswith"
                        : (form.preset.filter as Record<string,unknown>)?.equals    ? "equals"
                        : (form.preset.filter as Record<string,unknown>)?.contains  ? "contains"
                        : "not_empty"
                      }
                      onChange={e => {
                        const mode = e.target.value;
                        const base = { col: (form.preset.filter as { col?: number })?.col ?? 0 };
                        if (mode === "not_empty") setPreset({ filter: { ...base, not_empty: true } as BomPreset["filter"] });
                        else setPreset({ filter: { ...base, [mode]: "" } as BomPreset["filter"] });
                      }}
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="not_empty">빈값 제외</option>
                      <option value="startswith">시작값 일치</option>
                      <option value="equals">정확히 일치</option>
                      <option value="contains">포함</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">조건값</label>
                    <input
                      value={
                        (form.preset.filter as Record<string,unknown>)?.startswith as string
                        ?? (form.preset.filter as Record<string,unknown>)?.equals as string
                        ?? (form.preset.filter as Record<string,unknown>)?.contains as string
                        ?? ""
                      }
                      onChange={e => {
                        const f = form.preset.filter as Record<string,unknown>;
                        const key = f?.startswith !== undefined ? "startswith" : f?.equals !== undefined ? "equals" : "contains";
                        setPreset({ filter: { ...f, [key]: e.target.value } as BomPreset["filter"] });
                      }}
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="예: CN, PL ..." />
                  </div>
                </div>
              </div>

              {/* 컬럼 매핑 */}
              <div>
                <p className="text-xs font-bold text-gray-700 mb-2">컬럼 매핑 <span className="font-normal text-gray-400">(A열=1, B열=2 …)</span></p>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 text-gray-500 font-semibold">
                        <th className="px-3 py-2 text-left">항목</th>
                        <th className="px-3 py-2 text-left">타입</th>
                        <th className="px-3 py-2 text-left">열 번호</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {EDITABLE_FIELDS.map((field) => {
                        const fc = form.preset.fields[field] ?? { type: "direct", col: 1 };
                        return (
                          <tr key={field} className="hover:bg-gray-50">
                            <td className="px-3 py-2 font-semibold text-gray-700">{field}</td>
                            <td className="px-3 py-2">
                              <select
                                value={fc.type}
                                onChange={e => setFieldCfg(field, { type: e.target.value as FieldConfig["type"] })}
                                className="border rounded px-2 py-1 text-xs w-full focus:outline-none focus:ring-1 focus:ring-blue-500"
                              >
                                {Object.entries(FIELD_TYPES).map(([k, v]) => (
                                  <option key={k} value={k}>{v}</option>
                                ))}
                              </select>
                            </td>
                            <td className="px-3 py-2">
                              <input
                                value={fc.cols ? fc.cols.join(", ") : (fc.col ?? 1)}
                                onChange={e => {
                                  const raw = e.target.value;
                                  if (raw.includes(",")) {
                                    setFieldCfg(field, { cols: raw.split(",").map(x => parseInt(x.trim())).filter(Boolean), col: undefined });
                                  } else {
                                    setFieldCfg(field, { col: parseInt(raw) || 1, cols: undefined });
                                  }
                                }}
                                className="border rounded px-2 py-1 text-xs w-24 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                placeholder="열 (쉼표=복수)" />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 저장 버튼 */}
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-sm font-semibold text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200">
                  취소
                </button>
                <button onClick={saveVendor} disabled={modalSaving}
                  className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
                  {modalSaving ? "저장 중..." : "저장"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

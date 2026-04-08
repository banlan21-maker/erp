"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Pencil, Trash2, Plus, X } from "lucide-react";

interface ExcelPreset {
  id: string;
  name: string;
  dataStartRow: number;
  colBlock: number | null;
  colDrawingNo: number | null;
  colHeatNo: number | null;
  colMaterial: number | null;
  colThickness: number | null;
  colWidth: number | null;
  colLength: number | null;
  colQty: number | null;
  colSteelWeight: number | null;
  colUseWeight: number | null;
}

interface FormState {
  name: string;
  dataStartRow: string;
  colBlock: string;
  colDrawingNo: string;
  colHeatNo: string;
  colMaterial: string;
  colThickness: string;
  colWidth: string;
  colLength: string;
  colQty: string;
  colSteelWeight: string;
  colUseWeight: string;
}

const emptyForm: FormState = {
  name: "",
  dataStartRow: "2",
  colBlock: "",
  colDrawingNo: "",
  colHeatNo: "",
  colMaterial: "",
  colThickness: "",
  colWidth: "",
  colLength: "",
  colQty: "",
  colSteelWeight: "",
  colUseWeight: "",
};

function presetToForm(p: ExcelPreset): FormState {
  return {
    name: p.name,
    dataStartRow: String(p.dataStartRow),
    colBlock: p.colBlock != null ? String(p.colBlock) : "",
    colDrawingNo: p.colDrawingNo != null ? String(p.colDrawingNo) : "",
    colHeatNo: p.colHeatNo != null ? String(p.colHeatNo) : "",
    colMaterial: p.colMaterial != null ? String(p.colMaterial) : "",
    colThickness: p.colThickness != null ? String(p.colThickness) : "",
    colWidth: p.colWidth != null ? String(p.colWidth) : "",
    colLength: p.colLength != null ? String(p.colLength) : "",
    colQty: p.colQty != null ? String(p.colQty) : "",
    colSteelWeight: p.colSteelWeight != null ? String(p.colSteelWeight) : "",
    colUseWeight: p.colUseWeight != null ? String(p.colUseWeight) : "",
  };
}

function colSummary(preset: ExcelPreset): string {
  const parts: string[] = [];
  if (preset.colMaterial != null) parts.push(`재질:${preset.colMaterial}`);
  if (preset.colThickness != null) parts.push(`두께:${preset.colThickness}`);
  if (preset.colWidth != null) parts.push(`폭:${preset.colWidth}`);
  if (preset.colLength != null) parts.push(`길이:${preset.colLength}`);
  if (preset.colQty != null) parts.push(`수량:${preset.colQty}`);
  if (preset.colBlock != null) parts.push(`블록:${preset.colBlock}`);
  if (preset.colDrawingNo != null) parts.push(`도면:${preset.colDrawingNo}`);
  if (preset.colHeatNo != null) parts.push(`POR:${preset.colHeatNo}`);
  if (preset.colSteelWeight != null) parts.push(`강재중량:${preset.colSteelWeight}`);
  if (preset.colUseWeight != null) parts.push(`사용중량:${preset.colUseWeight}`);
  return parts.length > 0 ? parts.join(", ") : "설정된 열 없음";
}

const COLUMN_FIELDS: { key: keyof FormState; label: string }[] = [
  { key: "colBlock", label: "블록" },
  { key: "colDrawingNo", label: "도면/NEST" },
  { key: "colHeatNo", label: "Heat NO" },
  { key: "colMaterial", label: "재질" },
  { key: "colThickness", label: "두께" },
  { key: "colWidth", label: "폭" },
  { key: "colLength", label: "길이" },
  { key: "colQty", label: "수량" },
  { key: "colSteelWeight", label: "강재중량" },
  { key: "colUseWeight", label: "사용중량" },
];

export default function PresetManager({ onClose }: { onClose: () => void }) {
  const [presets, setPresets] = useState<ExcelPreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPresets = async () => {
    try {
      const res = await fetch("/api/excel-presets");
      const data = await res.json();
      if (data.success) setPresets(data.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPresets();
  }, []);

  const handleNew = () => {
    setEditingId(null);
    setForm(emptyForm);
    setError(null);
    setShowForm(true);
  };

  const handleEdit = (preset: ExcelPreset) => {
    setEditingId(preset.id);
    setForm(presetToForm(preset));
    setError(null);
    setShowForm(true);
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
    setError(null);
  };

  const handleFieldChange = (key: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      setError("프리셋 이름을 입력하세요.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const body = {
        name: form.name.trim(),
        dataStartRow: form.dataStartRow ? Number(form.dataStartRow) : 2,
        colBlock: form.colBlock ? Number(form.colBlock) : null,
        colDrawingNo: form.colDrawingNo ? Number(form.colDrawingNo) : null,
        colHeatNo: form.colHeatNo ? Number(form.colHeatNo) : null,
        colMaterial: form.colMaterial ? Number(form.colMaterial) : null,
        colThickness: form.colThickness ? Number(form.colThickness) : null,
        colWidth: form.colWidth ? Number(form.colWidth) : null,
        colLength: form.colLength ? Number(form.colLength) : null,
        colQty: form.colQty ? Number(form.colQty) : null,
        colSteelWeight: form.colSteelWeight ? Number(form.colSteelWeight) : null,
        colUseWeight: form.colUseWeight ? Number(form.colUseWeight) : null,
      };

      const url = editingId ? `/api/excel-presets/${editingId}` : "/api/excel-presets";
      const method = editingId ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error ?? "저장 오류");
        return;
      }
      await fetchPresets();
      handleCancel();
    } catch {
      setError("서버 연결 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (preset: ExcelPreset) => {
    if (!confirm(`"${preset.name}" 프리셋을 삭제하시겠습니까?`)) return;
    try {
      const res = await fetch(`/api/excel-presets/${preset.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!data.success) {
        alert(data.error ?? "삭제 오류");
        return;
      }
      await fetchPresets();
      // If currently editing this preset, close the form
      if (editingId === preset.id) handleCancel();
    } catch {
      alert("서버 연결 오류가 발생했습니다.");
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">업로드 형식 프리셋 관리</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Preset list */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">등록된 프리셋 ({presets.length}개)</p>
              {!showForm && (
                <Button variant="outline" size="sm" onClick={handleNew} className="flex items-center gap-1.5 text-xs">
                  <Plus size={13} /> 새 프리셋
                </Button>
              )}
            </div>

            {loading ? (
              <p className="text-sm text-gray-400 py-4 text-center">불러오는 중...</p>
            ) : presets.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center border-2 border-dashed rounded-lg">
                등록된 프리셋이 없습니다.
              </p>
            ) : (
              <div className="space-y-1.5">
                {presets.map((preset) => (
                  <div
                    key={preset.id}
                    className={`flex items-start justify-between gap-2 px-3 py-2.5 rounded-lg border ${
                      editingId === preset.id ? "border-blue-300 bg-blue-50" : "border-gray-200 bg-gray-50"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-800">{preset.name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        시작행: {preset.dataStartRow}행 · {colSummary(preset)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => handleEdit(preset)}
                        title="수정"
                      >
                        <Pencil size={13} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                        onClick={() => handleDelete(preset)}
                        title="삭제"
                      >
                        <Trash2 size={13} />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Form panel */}
          {showForm && (
            <div className="border border-blue-200 rounded-xl p-4 bg-blue-50/40 space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-700">
                  {editingId ? "프리셋 수정" : "새 프리셋"}
                </p>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={handleCancel}>
                  <X size={13} />
                </Button>
              </div>

              {/* Name and data start row */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-medium">프리셋 이름 *</Label>
                  <Input
                    value={form.name}
                    onChange={(e) => handleFieldChange("name", e.target.value)}
                    placeholder="예: 현대중공업 형식"
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-medium">데이터 시작 행 *</Label>
                  <Input
                    type="number"
                    min={1}
                    value={form.dataStartRow}
                    onChange={(e) => handleFieldChange("dataStartRow", e.target.value)}
                    placeholder="2"
                    className="h-8 text-sm"
                  />
                  <p className="text-xs text-gray-400">1-indexed, 헤더 포함</p>
                </div>
              </div>

              {/* Column number inputs */}
              <div>
                <p className="text-xs font-medium text-gray-600 mb-2">열번호 설정 (1-indexed, 비워두면 무시)</p>
                <div className="grid grid-cols-5 gap-2">
                  {COLUMN_FIELDS.map(({ key, label }) => (
                    <div key={key} className="space-y-1">
                      <Label className="text-xs text-gray-600">{label}</Label>
                      <Input
                        type="number"
                        min={1}
                        value={form[key]}
                        onChange={(e) => handleFieldChange(key, e.target.value)}
                        placeholder="열번호"
                        className="h-8 text-sm"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {error && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              <div className="flex gap-2 justify-end">
                <Button variant="outline" size="sm" onClick={handleCancel} disabled={saving}>
                  취소
                </Button>
                <Button size="sm" onClick={handleSave} disabled={saving}>
                  {saving ? "저장 중..." : "저장"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

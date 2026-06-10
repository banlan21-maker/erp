"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X, Save, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * 도면(DrawingList) 수정 모달
 *  - 잔재 사용 행 / 원재 사용 행 공통으로 사용 가능
 *  - block, drawingNo, material, thickness, width, length, useWeight 편집
 */
export default function DrawingEditModal({
  drawing, onClose,
}: {
  drawing: {
    id: string;
    block: string | null;
    drawingNo: string | null;
    material: string;
    thickness: number;
    width: number;
    length: number;
    useWeight: number | null;
  };
  onClose: () => void;
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    block:      drawing.block      ?? "",
    drawingNo:  drawing.drawingNo  ?? "",
    material:   drawing.material,
    thickness:  String(drawing.thickness),
    width:      String(drawing.width),
    length:     String(drawing.length),
    useWeight:  drawing.useWeight != null ? String(drawing.useWeight) : "",
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);
  const f = (k: keyof typeof form, v: string) => setForm(p => ({ ...p, [k]: v }));

  const handleSave = async () => {
    setError(null);
    if (!form.material.trim()) { setError("재질을 입력하세요."); return; }
    if (!form.thickness || Number(form.thickness) <= 0) { setError("두께를 확인하세요."); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/drawings/${drawing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const d = await res.json();
      if (!d.success) { setError(d.error ?? "저장 실패"); return; }
      router.refresh();
      onClose();
    } catch { setError("서버 오류"); } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="px-5 py-4 border-b flex items-center justify-between bg-gray-50 rounded-t-xl">
          <h3 className="font-bold text-sm">
            도면 수정 <span className="text-gray-400 font-normal ml-1">{drawing.drawingNo ?? "(번호없음)"}</span>
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded-full"><X size={15} /></button>
        </div>
        <div className="p-5 space-y-3">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-xs flex items-start gap-2">
              <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">블록</label>
              <Input value={form.block} onChange={e => f("block", e.target.value)} placeholder="예: F52P" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">도면번호</label>
              <Input value={form.drawingNo} onChange={e => f("drawingNo", e.target.value)} placeholder="예: D-101" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">재질</label>
              <Input value={form.material} onChange={e => f("material", e.target.value)} placeholder="예: AH36" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">두께 (mm)</label>
              <Input type="number" step="0.1" value={form.thickness} onChange={e => f("thickness", e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">폭 (mm)</label>
              <Input type="number" value={form.width} onChange={e => f("width", e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">길이 (mm)</label>
              <Input type="number" value={form.length} onChange={e => f("length", e.target.value)} />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">사용중량 (kg) <span className="text-gray-400">(선택)</span></label>
              <Input type="number" step="0.01" value={form.useWeight} onChange={e => f("useWeight", e.target.value)} />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>취소</Button>
            <Button size="sm" onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700 font-bold gap-1.5">
              <Save size={13} /> {saving ? "저장 중..." : "저장"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from "@/components/ui/select";
import { Wrench, Plus, Pencil, Check, X } from "lucide-react";

interface Equipment {
  id: string;
  name: string;
  type: string;
  status: string;
  memo: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "가동중", MAINTENANCE: "점검중", INACTIVE: "비가동",
};
const STATUS_COLOR: Record<string, string> = {
  ACTIVE:      "bg-green-100 text-green-700",
  MAINTENANCE: "bg-yellow-100 text-yellow-700",
  INACTIVE:    "bg-gray-100 text-gray-500",
};

interface EditForm { name: string; type: string; status: string; memo: string }

export default function EquipmentManager({ initialEquipment }: { initialEquipment: Equipment[] }) {
  const router = useRouter();

  // 신규 등록
  const [showForm, setShowForm] = useState(false);
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError]     = useState<string | null>(null);
  const [addForm, setAddForm]       = useState({ name: "", type: "", memo: "" });

  // 인라인 수정
  const [editingId, setEditingId]   = useState<string | null>(null);
  const [editForm, setEditForm]     = useState<EditForm>({ name: "", type: "", status: "", memo: "" });
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError]   = useState<string | null>(null);

  const startEdit = (eq: Equipment) => {
    setEditingId(eq.id);
    setEditForm({ name: eq.name, type: eq.type, status: eq.status, memo: eq.memo ?? "" });
    setEditError(null);
  };
  const cancelEdit = () => { setEditingId(null); setEditError(null); };

  const saveEdit = async () => {
    if (!editingId || !editForm.name.trim()) { setEditError("장비명은 필수입니다."); return; }
    setEditLoading(true);
    try {
      const res  = await fetch(`/api/equipment/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      const data = await res.json();
      if (!data.success) { setEditError(data.error ?? "수정 실패"); return; }
      cancelEdit();
      router.refresh();
    } catch { setEditError("서버 오류"); } finally { setEditLoading(false); }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError(null);
    if (!addForm.name || !addForm.type) { setAddError("장비명과 유형을 입력하세요."); return; }
    setAddLoading(true);
    try {
      const res  = await fetch("/api/equipment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(addForm),
      });
      const data = await res.json();
      if (!data.success) { setAddError(data.error ?? "등록 실패"); return; }
      setAddForm({ name: "", type: "", memo: "" });
      setShowForm(false);
      router.refresh();
    } catch { setAddError("서버 오류"); } finally { setAddLoading(false); }
  };

  return (
    <div className="space-y-4">
      {/* 장비 목록 */}
      {initialEquipment.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-gray-400 bg-white rounded-xl border">
          <Wrench size={32} className="mb-2 opacity-40" />
          <p className="text-sm">등록된 장비가 없습니다.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">장비명</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">유형</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500">상태</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">메모</th>
                <th className="w-20 px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {initialEquipment.map((eq) => {
                const isEditing = editingId === eq.id;

                if (isEditing) {
                  return (
                    <tr key={eq.id} className="bg-blue-50">
                      <td className="px-3 py-2">
                        <Input
                          value={editForm.name}
                          onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                          className="h-7 text-xs w-36"
                          placeholder="장비명 *"
                          autoFocus
                        />
                        {editError && <p className="text-red-500 text-[11px] mt-0.5">{editError}</p>}
                      </td>
                      <td className="px-3 py-2">
                        <Select value={editForm.type} onValueChange={v => setEditForm(f => ({ ...f, type: v ?? f.type }))}>
                          <SelectTrigger className="h-7 text-xs w-24">
                            <span>{editForm.type === "PLASMA" ? "플라즈마" : editForm.type === "GAS" ? "가스" : "선택"}</span>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="PLASMA">플라즈마</SelectItem>
                            <SelectItem value="GAS">가스</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <Select value={editForm.status} onValueChange={v => setEditForm(f => ({ ...f, status: v ?? f.status }))}>
                          <SelectTrigger className="h-7 text-xs w-24">
                            <span>{STATUS_LABEL[editForm.status] ?? "상태"}</span>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ACTIVE">가동중</SelectItem>
                            <SelectItem value="MAINTENANCE">점검중</SelectItem>
                            <SelectItem value="INACTIVE">비가동</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          value={editForm.memo}
                          onChange={e => setEditForm(f => ({ ...f, memo: e.target.value }))}
                          className="h-7 text-xs"
                          placeholder="메모"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1 justify-end">
                          <button onClick={saveEdit} disabled={editLoading} className="p-1 text-green-600 hover:bg-green-100 rounded" title="저장">
                            <Check size={14} />
                          </button>
                          <button onClick={cancelEdit} disabled={editLoading} className="p-1 text-gray-400 hover:bg-gray-100 rounded" title="취소">
                            <X size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                }

                return (
                  <tr key={eq.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-800">{eq.name}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded ${eq.type === "PLASMA" ? "bg-blue-50 text-blue-700" : "bg-orange-50 text-orange-700"}`}>
                        {eq.type === "PLASMA" ? "플라즈마" : "가스"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLOR[eq.status]}`}>
                        {STATUS_LABEL[eq.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{eq.memo ?? "-"}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end">
                        <button
                          onClick={() => startEdit(eq)}
                          className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                          title="수정"
                        >
                          <Pencil size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 신규 등록 폼 */}
      {showForm ? (
        <form onSubmit={handleAdd} className="bg-white rounded-xl border p-4 space-y-3">
          <h3 className="text-sm font-semibold text-gray-700">장비 등록</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>장비명 *</Label>
              <Input
                placeholder="예: 플라즈마 1호기"
                value={addForm.name}
                onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))}
                autoFocus
              />
            </div>
            <div className="space-y-1">
              <Label>유형 *</Label>
              <Select value={addForm.type} onValueChange={v => setAddForm(f => ({ ...f, type: v ?? "" }))}>
                <SelectTrigger>
                  <span className={addForm.type ? "text-gray-900" : "text-gray-400"}>
                    {addForm.type === "PLASMA" ? "플라즈마" : addForm.type === "GAS" ? "가스" : "선택"}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PLASMA">플라즈마</SelectItem>
                  <SelectItem value="GAS">가스</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label>메모</Label>
            <Input
              placeholder="특이사항"
              value={addForm.memo}
              onChange={e => setAddForm(f => ({ ...f, memo: e.target.value }))}
            />
          </div>
          {addError && <p className="text-xs text-red-500">{addError}</p>}
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={addLoading}>
              {addLoading ? "등록 중..." : "등록"}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => { setShowForm(false); setAddError(null); }}>
              취소
            </Button>
          </div>
        </form>
      ) : (
        <Button onClick={() => setShowForm(true)} variant="outline" className="w-full flex items-center gap-2">
          <Plus size={14} /> 장비 등록
        </Button>
      )}
    </div>
  );
}

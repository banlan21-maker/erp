"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, Pencil, Trash2, Check, X, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Worker {
  id: string;
  name: string;
  nationality: string | null;
  birthDate: string | null;
  phone: string | null;
  createdAt: string;
}

interface FormState {
  name: string;
  nationality: string;
  birthDate: string;
  phone: string;
}

const emptyForm: FormState = { name: "", nationality: "", birthDate: "", phone: "" };

function formatBirth(dateStr: string | null): string {
  if (!dateStr) return "-";
  return dateStr.slice(0, 10); // YYYY-MM-DD
}

export default function WorkersMain({ workers }: { workers: Worker[] }) {
  const router = useRouter();

  // 등록 폼
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState<FormState>(emptyForm);
  const [adding, setAdding] = useState(false);

  // 수정
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);

  // 삭제
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const af = (field: keyof FormState, value: string) =>
    setAddForm(prev => ({ ...prev, [field]: value }));
  const ef = (field: keyof FormState, value: string) =>
    setEditForm(prev => ({ ...prev, [field]: value }));

  const startEdit = (w: Worker) => {
    setEditingId(w.id);
    setEditForm({
      name: w.name,
      nationality: w.nationality ?? "",
      birthDate: w.birthDate ?? "",
      phone: w.phone ?? "",
    });
  };

  const cancelEdit = () => { setEditingId(null); setEditForm(emptyForm); };

  const addWorker = async () => {
    if (!addForm.name.trim()) { alert("이름을 입력하세요."); return; }
    setAdding(true);
    try {
      const res = await fetch("/api/workers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(addForm),
      });
      const data = await res.json();
      if (!data.success) { alert(data.error ?? "등록 실패"); return; }
      setAddForm(emptyForm);
      setShowAdd(false);
      router.refresh();
    } catch { alert("서버 오류"); } finally { setAdding(false); }
  };

  const saveEdit = async () => {
    if (!editingId || !editForm.name.trim()) { alert("이름을 입력하세요."); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/workers/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      const data = await res.json();
      if (!data.success) { alert(data.error ?? "수정 실패"); return; }
      cancelEdit();
      router.refresh();
    } catch { alert("서버 오류"); } finally { setSaving(false); }
  };

  const deleteWorker = async (id: string) => {
    if (!confirm("해당 인원을 삭제할까요?")) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/workers/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!data.success) { alert(data.error ?? "삭제 실패"); return; }
      router.refresh();
    } catch { alert("서버 오류"); } finally { setDeletingId(null); }
  };

  return (
    <div className="space-y-4">
      {/* 상단 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Users size={15} />
          <span>총 {workers.length}명</span>
        </div>
        <Button
          size="sm"
          onClick={() => { setShowAdd(true); setEditingId(null); }}
          className="flex items-center gap-1.5 text-xs"
        >
          <UserPlus size={14} /> 인원 등록
        </Button>
      </div>

      {/* 등록 폼 */}
      {showAdd && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-blue-800 mb-3">신규 인원 등록</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600">이름 <span className="text-red-500">*</span></label>
              <Input
                placeholder="홍길동"
                value={addForm.name}
                onChange={e => af("name", e.target.value)}
                className="h-8 text-sm"
                autoFocus
                onKeyDown={e => e.key === "Enter" && addWorker()}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600">국적</label>
              <Input
                placeholder="대한민국"
                value={addForm.nationality}
                onChange={e => af("nationality", e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600">생년월일</label>
              <Input
                type="date"
                value={addForm.birthDate}
                onChange={e => af("birthDate", e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600">전화번호</label>
              <Input
                placeholder="010-0000-0000"
                value={addForm.phone}
                onChange={e => af("phone", e.target.value)}
                className="h-8 text-sm"
              />
            </div>
          </div>
          <div className="flex gap-2 mt-3 justify-end">
            <Button size="sm" variant="outline" onClick={() => { setShowAdd(false); setAddForm(emptyForm); }} className="text-xs h-8">
              취소
            </Button>
            <Button size="sm" onClick={addWorker} disabled={adding} className="text-xs h-8">
              {adding ? "등록 중..." : "등록"}
            </Button>
          </div>
        </div>
      )}

      {/* 목록 */}
      {workers.length === 0 && !showAdd ? (
        <div className="text-center py-16 text-gray-400 bg-white rounded-xl border text-sm">
          등록된 인원이 없습니다. 인원 등록 버튼을 눌러 추가하세요.
        </div>
      ) : (
        <>
          {/* 모바일: 카드 목록 */}
          <div className="flex flex-col gap-3 sm:hidden">
            {workers.map((w) => {
              const isEditing = editingId === w.id;
              const isDeleting = deletingId === w.id;
              if (isEditing) {
                return (
                  <div key={w.id} className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-gray-600">이름 *</label>
                        <Input value={editForm.name} onChange={e => ef("name", e.target.value)} className="h-8 text-sm" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-gray-600">국적</label>
                        <Input value={editForm.nationality} onChange={e => ef("nationality", e.target.value)} className="h-8 text-sm" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-gray-600">생년월일</label>
                        <Input type="date" value={editForm.birthDate} onChange={e => ef("birthDate", e.target.value)} className="h-8 text-sm" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-gray-600">전화번호</label>
                        <Input value={editForm.phone} onChange={e => ef("phone", e.target.value)} className="h-8 text-sm" />
                      </div>
                    </div>
                    <div className="flex gap-2 justify-end pt-1">
                      <button onClick={cancelEdit} disabled={saving} className="px-3 py-1.5 text-xs text-gray-500 bg-white border rounded-lg">취소</button>
                      <button onClick={saveEdit} disabled={saving} className="px-3 py-1.5 text-xs text-white bg-blue-600 rounded-lg">{saving ? "저장 중..." : "저장"}</button>
                    </div>
                  </div>
                );
              }
              return (
                <div key={w.id} className={`bg-white border rounded-xl p-4 ${isDeleting ? "opacity-40" : ""}`}>
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-gray-900">{w.name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{w.nationality ?? "-"}</p>
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => startEdit(w)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg">
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => deleteWorker(w.id)} disabled={isDeleting} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                    <span>📅 {formatBirth(w.birthDate)}</span>
                    <span>📞 {w.phone ?? "-"}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* 데스크탑: 테이블 */}
          <div className="hidden sm:block bg-white rounded-xl border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">이름</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">국적</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">생년월일</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">전화번호</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">등록일</th>
                  <th className="w-20 px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {workers.map((w) => {
                  const isEditing = editingId === w.id;
                  const isDeleting = deletingId === w.id;
                  if (isEditing) {
                    return (
                      <tr key={w.id} className="bg-blue-50">
                        <td className="px-3 py-2">
                          <Input value={editForm.name} onChange={e => ef("name", e.target.value)} className="h-7 text-xs w-28" placeholder="이름 *" />
                        </td>
                        <td className="px-3 py-2">
                          <Input value={editForm.nationality} onChange={e => ef("nationality", e.target.value)} className="h-7 text-xs w-24" placeholder="국적" />
                        </td>
                        <td className="px-3 py-2">
                          <Input type="date" value={editForm.birthDate} onChange={e => ef("birthDate", e.target.value)} className="h-7 text-xs w-32" />
                        </td>
                        <td className="px-3 py-2">
                          <Input value={editForm.phone} onChange={e => ef("phone", e.target.value)} className="h-7 text-xs w-32" placeholder="전화번호" />
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-400">{w.createdAt.slice(0, 10)}</td>
                        <td className="px-3 py-2">
                          <div className="flex gap-1 justify-end">
                            <button onClick={saveEdit} disabled={saving} className="p-1 text-green-600 hover:bg-green-100 rounded" title="저장">
                              <Check size={14} />
                            </button>
                            <button onClick={cancelEdit} disabled={saving} className="p-1 text-gray-400 hover:bg-gray-100 rounded" title="취소">
                              <X size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  }
                  return (
                    <tr key={w.id} className={`hover:bg-gray-50 transition-colors ${isDeleting ? "opacity-40" : ""}`}>
                      <td className="px-4 py-2.5 font-medium text-gray-900">{w.name}</td>
                      <td className="px-4 py-2.5 text-gray-600">{w.nationality ?? "-"}</td>
                      <td className="px-4 py-2.5 text-gray-600 font-mono text-xs">{formatBirth(w.birthDate)}</td>
                      <td className="px-4 py-2.5 text-gray-600 font-mono text-xs">{w.phone ?? "-"}</td>
                      <td className="px-4 py-2.5 text-gray-400 text-xs">{w.createdAt.slice(0, 10)}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex gap-1 justify-end">
                          <button onClick={() => startEdit(w)} className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded" title="수정">
                            <Pencil size={13} />
                          </button>
                          <button onClick={() => deleteWorker(w.id)} disabled={isDeleting} className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded" title="삭제">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

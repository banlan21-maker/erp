"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X, Save, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * 블록(Project) 수정 모달
 *  - 블록 이름 변경 (projectName)
 *  - 블록 삭제 (블록명 재입력 확인 필수)
 */
export default function BlockEditModal({
  projectId,
  projectCode,
  projectName,
  onClose,
}: {
  projectId: string;
  projectCode: string;
  projectName: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [mode,    setMode]    = useState<"edit" | "delete">("edit");
  const [newName, setNewName] = useState(projectName);
  const [confirmName, setConfirmName] = useState("");
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const handleSaveName = async () => {
    setError(null);
    if (!newName.trim()) { setError("블록 이름을 입력하세요."); return; }
    if (newName.trim() === projectName) { setError("이름이 변경되지 않았습니다."); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectName: newName.trim() }),
      });
      const d = await res.json();
      if (!d.success) { setError(d.error ?? "수정 실패"); return; }
      router.refresh();
      onClose();
    } catch { setError("서버 오류"); } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    setError(null);
    if (confirmName.trim() !== projectName) {
      setError(`블록명이 일치하지 않습니다. "${projectName}" 을(를) 정확히 입력하세요.`);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}`, { method: "DELETE" });
      const d = await res.json();
      if (!d.success) { setError(d.error ?? "삭제 실패"); return; }
      router.refresh();
      onClose();
    } catch { setError("서버 오류"); } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        {/* 헤더 */}
        <div className="px-5 py-4 border-b flex items-center justify-between bg-gray-50 rounded-t-xl">
          <h3 className="font-bold text-sm">
            블록 수정 <span className="text-gray-400 font-normal ml-1">[{projectCode}] {projectName}</span>
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded-full"><X size={15} /></button>
        </div>

        {/* 모드 탭 */}
        <div className="flex border-b">
          <button
            onClick={() => { setMode("edit"); setError(null); }}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
              mode === "edit" ? "border-b-2 border-blue-600 text-blue-600" : "text-gray-500 hover:text-gray-700"
            }`}
          >이름 변경</button>
          <button
            onClick={() => { setMode("delete"); setError(null); }}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
              mode === "delete" ? "border-b-2 border-red-600 text-red-600" : "text-gray-500 hover:text-gray-700"
            }`}
          >삭제</button>
        </div>

        {/* 본문 */}
        <div className="p-5 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-xs flex items-start gap-2">
              <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {mode === "edit" ? (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">블록 이름</label>
                <Input
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="예: F52P"
                  autoFocus
                />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
                <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>취소</Button>
                <Button size="sm" onClick={handleSaveName} disabled={saving} className="bg-blue-600 hover:bg-blue-700 font-bold gap-1.5">
                  <Save size={13} /> {saving ? "저장 중..." : "이름 저장"}
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 text-xs text-red-700">
                <p className="font-bold mb-1">⚠️ 이 블록을 완전히 삭제합니다.</p>
                <p>강재리스트·BOM·작업지시·작업로그가 함께 삭제됩니다. 되돌릴 수 없습니다.</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  확인을 위해 블록명 <strong className="text-red-600 font-mono">{projectName}</strong> 을(를) 다시 입력하세요.
                </label>
                <Input
                  value={confirmName}
                  onChange={e => setConfirmName(e.target.value)}
                  placeholder={projectName}
                  autoFocus
                />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
                <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>취소</Button>
                <Button size="sm" onClick={handleDelete} disabled={saving || confirmName.trim() !== projectName}
                  className="bg-red-600 hover:bg-red-700 font-bold disabled:opacity-40">
                  {saving ? "삭제 중..." : "완전 삭제"}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

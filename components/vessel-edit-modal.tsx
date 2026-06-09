"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X, Save, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * 호선 수정 모달
 *  - "호선" 은 같은 projectCode 를 가진 블록들의 그룹 (단일 엔티티 아님)
 *  - 호선코드 변경: 그룹 내 모든 블록(Project)의 projectCode 를 일괄 변경
 *  - 호선 삭제: 그룹 내 모든 블록을 일괄 삭제 (호선코드 재입력 확인 필수)
 */
export default function VesselEditModal({
  vesselCode,
  blockIds,
  onClose,
}: {
  vesselCode: string;
  blockIds: string[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [mode,    setMode]    = useState<"edit" | "delete">("edit");
  const [newCode, setNewCode] = useState(vesselCode);
  const [confirmCode, setConfirmCode] = useState("");
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const handleSaveCode = async () => {
    setError(null);
    const code = newCode.trim();
    if (!code) { setError("호선코드를 입력하세요."); return; }
    if (code === vesselCode) { setError("호선코드가 변경되지 않았습니다."); return; }
    setSaving(true);
    try {
      const results = await Promise.all(blockIds.map(id =>
        fetch(`/api/projects/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectCode: code }),
        }).then(r => r.json()).catch(() => ({ success: false, error: "서버 오류" }))
      ));
      const failed = results.filter(r => !r.success);
      if (failed.length > 0) {
        setError(`${blockIds.length - failed.length}/${blockIds.length}개 블록만 변경됨. 실패: ${failed[0].error ?? "알 수 없음"}`);
        return;
      }
      router.refresh();
      onClose();
    } catch { setError("서버 오류"); } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    setError(null);
    if (confirmCode.trim() !== vesselCode) {
      setError(`호선코드가 일치하지 않습니다. "${vesselCode}" 을(를) 정확히 입력하세요.`);
      return;
    }
    setSaving(true);
    try {
      const results = await Promise.all(blockIds.map(id =>
        fetch(`/api/projects/${id}`, { method: "DELETE" })
          .then(r => r.json()).catch(() => ({ success: false, error: "서버 오류" }))
      ));
      const failed = results.filter(r => !r.success);
      if (failed.length > 0) {
        setError(`${blockIds.length - failed.length}/${blockIds.length}개 블록만 삭제됨. 실패: ${failed[0].error ?? "알 수 없음"}`);
        return;
      }
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
            호선 수정 <span className="text-gray-400 font-normal ml-1">[{vesselCode}] · {blockIds.length}개 블록</span>
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
          >호선코드 변경</button>
          <button
            onClick={() => { setMode("delete"); setError(null); }}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
              mode === "delete" ? "border-b-2 border-red-600 text-red-600" : "text-gray-500 hover:text-gray-700"
            }`}
          >호선 전체 삭제</button>
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
              <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs text-blue-700">
                {blockIds.length}개 블록의 호선코드가 함께 변경됩니다.
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">새 호선코드</label>
                <Input
                  value={newCode}
                  onChange={e => setNewCode(e.target.value)}
                  placeholder="예: RS01"
                  autoFocus
                />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
                <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>취소</Button>
                <Button size="sm" onClick={handleSaveCode} disabled={saving} className="bg-blue-600 hover:bg-blue-700 font-bold gap-1.5">
                  <Save size={13} /> {saving ? "변경 중..." : "코드 저장"}
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 text-xs text-red-700">
                <p className="font-bold mb-1">⚠️ 호선 [{vesselCode}] 전체 삭제</p>
                <p>{blockIds.length}개 블록과 그에 속한 모든 강재리스트·BOM·작업지시·작업로그가 함께 삭제됩니다. 되돌릴 수 없습니다.</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  확인을 위해 호선코드 <strong className="text-red-600 font-mono">{vesselCode}</strong> 을(를) 다시 입력하세요.
                </label>
                <Input
                  value={confirmCode}
                  onChange={e => setConfirmCode(e.target.value)}
                  placeholder={vesselCode}
                  autoFocus
                />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
                <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>취소</Button>
                <Button size="sm" onClick={handleDelete} disabled={saving || confirmCode.trim() !== vesselCode}
                  className="bg-red-600 hover:bg-red-700 font-bold disabled:opacity-40">
                  {saving ? "삭제 중..." : "호선 전체 삭제"}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

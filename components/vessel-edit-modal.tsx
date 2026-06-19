"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X, AlertTriangle, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * 호선 수정/삭제 모달
 *  - "호선" 은 같은 projectCode 를 가진 블록(Project) 들의 그룹
 *  - 호선코드 변경: 그룹 내 모든 블록의 projectCode 를 일괄 변경 (복구용).
 *    ⚠️ 강재입출고/잔재/도면 매칭의 키이므로 코드만 바뀌고 강재 데이터는 안 바뀐다.
 *       강재와 동일한 코드로 맞춰야 매칭이 복구됨.
 *  - 호선 전체 삭제: 그룹 내 모든 블록을 일괄 삭제. 호선코드 재입력 확인 필수.
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
  const [mode, setMode] = useState<"rename" | "delete">("rename");
  const [newCode, setNewCode] = useState(vesselCode);
  const [confirmCode, setConfirmCode] = useState("");
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  const handleRename = async () => {
    setError(null);
    const code = newCode.trim().toUpperCase();
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
        setError(`${blockIds.length - failed.length}/${blockIds.length}개 블록만 변경됨. 실패: ${failed[0].error ?? "알 수 없음"} (같은 호선코드+블록명이 이미 있으면 충돌)`);
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
            onClick={() => { setMode("rename"); setError(null); }}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
              mode === "rename" ? "border-b-2 border-blue-600 text-blue-600" : "text-gray-500 hover:text-gray-700"
            }`}
          >호선코드 변경</button>
          <button
            onClick={() => { setMode("delete"); setError(null); }}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
              mode === "delete" ? "border-b-2 border-red-600 text-red-600" : "text-gray-500 hover:text-gray-700"
            }`}
          >전체 삭제</button>
        </div>

        {/* 본문 */}
        <div className="p-5 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-xs flex items-start gap-2">
              <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {mode === "rename" ? (
            <>
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 text-xs text-amber-800">
                <p className="font-bold mb-1">⚠️ 호선코드는 매칭의 키입니다 (복구용)</p>
                <p>이 호선의 <strong>{blockIds.length}개 블록</strong> 코드가 함께 바뀝니다. <strong>강재입출고의 강재 호선코드는 바뀌지 않으므로</strong>, 강재와 동일한 코드로 맞춰야 매칭이 복구됩니다.</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">새 호선코드</label>
                <Input
                  value={newCode}
                  onChange={e => setNewCode(e.target.value.toUpperCase())}
                  placeholder="예: RS01"
                  autoFocus
                />
                <p className="text-[11px] text-gray-400 mt-1">현재: <span className="font-mono">{vesselCode}</span></p>
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
                <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>취소</Button>
                <Button size="sm" onClick={handleRename} disabled={saving || !newCode.trim() || newCode.trim().toUpperCase() === vesselCode}
                  className="bg-blue-600 hover:bg-blue-700 font-bold gap-1.5 disabled:opacity-40">
                  <Save size={13} /> {saving ? "변경 중..." : "호선코드 변경"}
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

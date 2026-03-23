"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";

export default function ProjectDeleteButton({ projectId, projectCode }: { projectId: string; projectCode: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleDelete = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        router.push("/projects");
        router.refresh();
      } else {
        alert(data.error ?? "삭제 실패");
        setConfirming(false);
      }
    } catch {
      alert("서버 오류가 발생했습니다.");
      setConfirming(false);
    } finally {
      setLoading(false);
    }
  };

  if (confirming) {
    return (
      <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">
        <span className="text-xs text-red-700 font-medium">[{projectCode}] 삭제할까요? (강재리스트·작업지시 모두 삭제)</span>
        <Button size="sm" variant="destructive" onClick={handleDelete} disabled={loading} className="h-7 text-xs">
          {loading ? "삭제 중..." : "삭제"}
        </Button>
        <Button size="sm" variant="outline" onClick={() => setConfirming(false)} disabled={loading} className="h-7 text-xs">
          취소
        </Button>
      </div>
    );
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => setConfirming(true)}
      className="text-red-400 hover:text-red-600 hover:bg-red-50 flex items-center gap-1"
    >
      <Trash2 size={14} /> 삭제
    </Button>
  );
}

"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ChevronDown } from "lucide-react";

export default function ProjectForm({ defaultCode }: { defaultCode?: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    projectCode: defaultCode ?? "",
    projectName: "",
    client: "",
    memo: "",
  });

  // 강재 전체목록에서 등록된 호선 목록
  const [vesselList, setVesselList] = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/steel-plan/vessels")
      .then((r) => r.json())
      .then((d) => { if (d.success) setVesselList(d.data); });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!form.projectCode || !form.projectName || !form.client) {
      setError("필수 항목을 모두 입력하세요.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, type: "A" }), // type 필드 기본값 유지
      });
      const data = await res.json();

      if (!data.success) {
        setError(data.error ?? "등록 중 오류가 발생했습니다.");
        return;
      }

      router.push(`/cutpart/projects?tab=upload`);
    } catch {
      setError("서버 연결 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl border p-6 space-y-4">

      {/* 호선 선택 */}
      <div className="space-y-1.5">
        <Label htmlFor="projectCode">
          호선 <span className="text-red-500">*</span>
        </Label>
        <div className="relative">
          <select
            id="projectCode"
            value={form.projectCode}
            onChange={(e) => setForm({ ...form, projectCode: e.target.value })}
            className="w-full appearance-none border border-gray-200 rounded-md px-3 py-2 pr-8 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">-- 강재 전체목록에서 호선 선택 --</option>
            {vesselList.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
          <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        </div>
        <p className="text-xs text-gray-400">강재입고관리에 등록된 호선만 표시됩니다. 같은 호선으로 여러 블록 등록 가능</p>
      </div>

      {/* 블록명 */}
      <div className="space-y-1.5">
        <Label htmlFor="projectName">
          블록 <span className="text-red-500">*</span>
        </Label>
        <Input
          id="projectName"
          placeholder="예: 301, 302, F52P"
          value={form.projectName}
          onChange={(e) => setForm({ ...form, projectName: e.target.value })}
        />
      </div>

      {/* 원청사/발주처 */}
      <div className="space-y-1.5">
        <Label htmlFor="client">
          원청사 / 발주처 <span className="text-red-500">*</span>
        </Label>
        <Input
          id="client"
          placeholder="예: 현대중공업, 삼성중공업"
          value={form.client}
          onChange={(e) => setForm({ ...form, client: e.target.value })}
        />
      </div>

      {/* 메모 */}
      <div className="space-y-1.5">
        <Label htmlFor="memo">메모 (선택)</Label>
        <Textarea
          id="memo"
          placeholder="특이사항, 납기일 등 메모"
          rows={3}
          value={form.memo}
          onChange={(e) => setForm({ ...form, memo: e.target.value })}
        />
      </div>

      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
          {error}
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <Button type="submit" disabled={loading} className="flex-1">
          {loading ? "등록 중..." : "호선 등록"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()} disabled={loading}>
          취소
        </Button>
      </div>
    </form>
  );
}

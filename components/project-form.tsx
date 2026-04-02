"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function ProjectForm({ defaultCode }: { defaultCode?: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    projectCode: defaultCode ?? "",
    projectName: "",
    type: "",
    client: "",
    memo: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!form.projectCode || !form.projectName || !form.type || !form.client) {
      setError("필수 항목을 모두 입력하세요.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();

      if (!data.success) {
        setError(data.error ?? "등록 중 오류가 발생했습니다.");
        return;
      }

      router.push(`/cutpart/projects/${data.data.id}`);
      router.refresh();
    } catch {
      setError("서버 연결 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl border p-6 space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="projectCode">
            호선 코드 <span className="text-red-500">*</span>
          </Label>
          <Input
            id="projectCode"
            placeholder="예: LB, RS01, 1022"
            value={form.projectCode}
            onChange={(e) => setForm({ ...form, projectCode: e.target.value })}
          />
          <p className="text-xs text-gray-400">같은 호선코드로 여러 블록 등록 가능</p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="type">
            프로젝트 유형 <span className="text-red-500">*</span>
          </Label>
          <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v ?? "" })}>
            <SelectTrigger>
              <SelectValue placeholder="유형 선택" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="A">유형 A — 외부 도면 수신형</SelectItem>
              <SelectItem value="B">유형 B — 자사 네스팅형</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="projectName">
          블록 / 프로젝트명 <span className="text-red-500">*</span>
        </Label>
        <Input
          id="projectName"
          placeholder="예: 301, 302, F52P, 선체 절단"
          value={form.projectName}
          onChange={(e) => setForm({ ...form, projectName: e.target.value })}
        />
      </div>

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

      {/* 유형 설명 */}
      {form.type && (
        <div className={`text-xs p-3 rounded-lg ${form.type === "A" ? "bg-blue-50 text-blue-700" : "bg-green-50 text-green-700"}`}>
          {form.type === "A"
            ? "유형 A: 외부 설계사로부터 절단도면(DXF/PDF) 및 강재리스트(Excel)를 수신하여 CNC 코드 작업 후 절단"
            : "유형 B: 자회사 설계부로부터 기본도면을 수신하여 단품도 작성 → 네스팅 → 강재리스트 산출까지 직접 수행 후 절단"}
        </div>
      )}

      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
          {error}
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <Button type="submit" disabled={loading} className="flex-1">
          {loading ? "등록 중..." : "호선 등록"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={loading}
        >
          취소
        </Button>
      </div>
    </form>
  );
}

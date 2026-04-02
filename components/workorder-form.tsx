"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Project {
  id: string;
  projectCode: string;
  projectName: string;
  type: string;
}

interface Drawing {
  id: string;
  block: string | null;
  drawingNo: string | null;
  material: string;
  thickness: number;
}

interface Equipment {
  id: string;
  name: string;
  type: string;
}

interface Props {
  projects: Project[];
  initialDrawings: Drawing[];
  equipment: Equipment[];
  defaultProjectId?: string;
}

const PRIORITY_OPTIONS = [
  { value: "URGENT", label: "긴급" },
  { value: "HIGH", label: "높음" },
  { value: "NORMAL", label: "보통" },
  { value: "LOW", label: "낮음" },
];

export default function WorkOrderForm({
  projects,
  initialDrawings,
  equipment,
  defaultProjectId,
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drawings, setDrawings] = useState<Drawing[]>(initialDrawings);

  const [form, setForm] = useState({
    projectId: defaultProjectId ?? "",
    drawingListId: "",
    equipmentId: "",
    priority: "NORMAL",
    dueDate: "",
    memo: "",
  });

  // 프로젝트 변경 시 강재리스트 갱신
  useEffect(() => {
    if (!form.projectId) {
      setDrawings([]);
      return;
    }
    fetch(`/api/drawings?projectId=${form.projectId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success) setDrawings(data.data);
      })
      .catch(() => setDrawings([]));
  }, [form.projectId]);

  const selectedProject = projects.find((p) => p.id === form.projectId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!form.projectId) {
      setError("프로젝트(호선)를 선택하세요.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/workorders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: form.projectId,
          drawingListId: form.drawingListId || null,
          equipmentId: form.equipmentId || null,
          priority: form.priority,
          dueDate: form.dueDate || null,
          memo: form.memo || null,
        }),
      });
      const data = await res.json();

      if (!data.success) {
        setError(data.error ?? "생성 중 오류가 발생했습니다.");
        return;
      }

      router.push("/cutpart/workorders");
      router.refresh();
    } catch {
      setError("서버 연결 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl border p-6 space-y-4">
      {/* 프로젝트 선택 */}
      <div className="space-y-1.5">
        <Label>
          호선 / 프로젝트 <span className="text-red-500">*</span>
        </Label>
        <Select
          value={form.projectId}
          onValueChange={(v) => setForm({ ...form, projectId: v ?? "", drawingListId: "" })}
        >
          <SelectTrigger>
            <SelectValue placeholder="프로젝트 선택" />
          </SelectTrigger>
          <SelectContent>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                [{p.projectCode}] {p.projectName} (유형{p.type})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selectedProject && (
          <p className="text-xs text-gray-500">
            유형 {selectedProject.type} — {selectedProject.type === "A" ? "외부 도면 수신형" : "자사 네스팅형"}
          </p>
        )}
      </div>

      {/* 강재리스트 선택 (선택사항) */}
      <div className="space-y-1.5">
        <Label>강재리스트 연결 (선택)</Label>
        <Select
          value={form.drawingListId}
          onValueChange={(v) => setForm({ ...form, drawingListId: (v === "none" || !v) ? "" : v })}
          disabled={drawings.length === 0}
        >
          <SelectTrigger>
            <SelectValue placeholder={drawings.length === 0 ? "강재리스트 없음" : "강재리스트 선택 (선택사항)"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">연결 안함</SelectItem>
            {drawings.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.block ? `[${d.block}] ` : ""}{d.drawingNo ?? "-"} — {d.material} {d.thickness}t
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* 장비 배정 */}
      <div className="space-y-1.5">
        <Label>장비 배정 (선택)</Label>
        <Select
          value={form.equipmentId}
          onValueChange={(v) => setForm({ ...form, equipmentId: (v === "none" || !v) ? "" : v })}
        >
          <SelectTrigger>
            <SelectValue placeholder="장비 선택 (나중에 배정 가능)" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">미배정</SelectItem>
            {equipment.map((eq) => (
              <SelectItem key={eq.id} value={eq.id}>
                {eq.name} ({eq.type === "PLASMA" ? "플라즈마" : "가스"})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* 우선순위 */}
        <div className="space-y-1.5">
          <Label>우선순위</Label>
          <Select
            value={form.priority}
            onValueChange={(v) => setForm({ ...form, priority: v ?? "NORMAL" })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRIORITY_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* 납기일 */}
        <div className="space-y-1.5">
          <Label htmlFor="dueDate">납기일</Label>
          <Input
            id="dueDate"
            type="date"
            value={form.dueDate}
            onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
          />
        </div>
      </div>

      {/* 메모 */}
      <div className="space-y-1.5">
        <Label htmlFor="memo">메모</Label>
        <Textarea
          id="memo"
          rows={2}
          placeholder="작업 특이사항 등"
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
          {loading ? "생성 중..." : "작업지시 생성"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()} disabled={loading}>
          취소
        </Button>
      </div>
    </form>
  );
}

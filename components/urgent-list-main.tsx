"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Zap, Plus, Trash2, RefreshCw, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";

interface UrgentWork {
  id: string;
  urgentNo: string;
  title: string;
  urgency: string;
  requester: string | null;
  department: string | null;
  vesselName: string | null;
  dueDate: string | null;
  status: string;
  registeredBy: string | null;
  createdAt: string;
  project: { id: string; projectCode: string; projectName: string } | null;
}

const URGENCY_LABEL: Record<string, string> = {
  URGENT:   "⚡ 긴급",
  FLEXIBLE: "✅ 여유있음",
  PRECUT:   "📦 선행절단",
};
const URGENCY_COLOR: Record<string, string> = {
  URGENT:   "bg-red-100 text-red-700",
  FLEXIBLE: "bg-green-100 text-green-700",
  PRECUT:   "bg-blue-100 text-blue-700",
};
const STATUS_LABEL: Record<string, string> = {
  PENDING:     "대기",
  IN_PROGRESS: "진행중",
  DONE:        "완료",
  CANCELLED:   "취소",
};
const STATUS_COLOR: Record<string, string> = {
  PENDING:     "bg-yellow-100 text-yellow-700",
  IN_PROGRESS: "bg-blue-100 text-blue-700",
  DONE:        "bg-gray-100 text-gray-600",
  CANCELLED:   "bg-red-50 text-red-400 line-through",
};
const STATUS_OPTIONS = ["PENDING", "IN_PROGRESS", "DONE", "CANCELLED"];

export default function UrgentListMain() {
  const router = useRouter();
  const [works,   setWorks]   = useState<UrgentWork[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState<string>("");   // 상태 필터 (빈 문자열 = 전체)
  const [editingStatus, setEditingStatus] = useState<string | null>(null); // 드롭다운 열린 id

  const load = useCallback(async () => {
    setLoading(true);
    const p = new URLSearchParams();
    if (filter) p.set("status", filter);
    const res = await fetch(`/api/urgent-works?${p}`);
    if (res.ok) {
      const data = await res.json();
      if (data.success) setWorks(data.data);
    }
    setLoading(false);
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const handleStatusChange = async (id: string, status: string) => {
    setEditingStatus(null);
    // 낙관적 업데이트
    setWorks(ws => ws.map(w => w.id === id ? { ...w, status } : w));
    const res = await fetch(`/api/urgent-works/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) load();
  };

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`"${title}" 을(를) 삭제하시겠습니까?`)) return;
    const res = await fetch(`/api/urgent-works/${id}`, { method: "DELETE" });
    if (res.ok) setWorks(ws => ws.filter(w => w.id !== id));
    else alert("삭제 실패");
  };

  const fmt = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" }) : "-";

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Zap size={24} className="text-orange-500" />
            돌발리스트
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">등록된 돌발작업 전체 목록</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-500 hover:text-gray-700 transition-colors"
            title="새로고침"
          >
            <RefreshCw size={15} />
          </button>
          <Button
            onClick={() => router.push("/cutpart/urgent/register")}
            className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-bold"
          >
            <Plus size={15} /> 돌발 등록
          </Button>
        </div>
      </div>

      {/* 상태 필터 탭 */}
      <div className="flex border-b border-gray-200 gap-0">
        {[{ value: "", label: "전체" }, ...STATUS_OPTIONS.map(s => ({ value: s, label: STATUS_LABEL[s] }))].map(opt => (
          <button
            key={opt.value}
            onClick={() => setFilter(opt.value)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              filter === opt.value
                ? "border-orange-500 text-orange-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* 테이블 */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-gray-400 text-sm">불러오는 중…</div>
        ) : works.length === 0 ? (
          <div className="py-16 text-center text-gray-400 text-sm">
            {filter ? "해당 상태의 돌발작업이 없습니다." : "등록된 돌발작업이 없습니다."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {["돌발번호", "긴급도", "작업명", "요청자/부서", "연관 호선", "납기일", "상태", "등록일", ""].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {works.map(w => (
                  <tr key={w.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-3 py-2 font-mono text-xs text-gray-500 whitespace-nowrap">{w.urgentNo}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${URGENCY_COLOR[w.urgency] ?? "bg-gray-100 text-gray-600"}`}>
                        {URGENCY_LABEL[w.urgency] ?? w.urgency}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-medium text-gray-800 max-w-[200px] truncate" title={w.title}>
                      {w.title}
                    </td>
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                      {[w.requester, w.department].filter(Boolean).join(" / ") || "-"}
                    </td>
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                      {w.project
                        ? `[${w.project.projectCode}] ${w.project.projectName}`
                        : (w.vesselName || "-")}
                    </td>
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{fmt(w.dueDate)}</td>
                    <td className="px-3 py-2 whitespace-nowrap relative">
                      <button
                        onClick={() => setEditingStatus(editingStatus === w.id ? null : w.id)}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium cursor-pointer hover:opacity-80 transition-opacity ${STATUS_COLOR[w.status] ?? "bg-gray-100 text-gray-600"}`}
                      >
                        {STATUS_LABEL[w.status] ?? w.status}
                        <ChevronDown size={10} />
                      </button>
                      {editingStatus === w.id && (
                        <div className="absolute z-20 top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[100px]">
                          {STATUS_OPTIONS.map(s => (
                            <button
                              key={s}
                              onClick={() => handleStatusChange(w.id, s)}
                              className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 transition-colors ${w.status === s ? "font-semibold text-orange-600" : "text-gray-700"}`}
                            >
                              {STATUS_LABEL[s]}
                            </button>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-gray-400 text-xs whitespace-nowrap">{fmt(w.createdAt)}</td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => handleDelete(w.id, w.title)}
                        className="p-1 text-gray-300 hover:text-red-500 transition-colors rounded"
                        title="삭제"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

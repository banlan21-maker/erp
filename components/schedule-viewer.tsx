"use client";

import { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import { Eye, RefreshCw, CalendarDays, BarChart2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const FrappeGantt = dynamic(() => import("@/components/frappe-gantt-wrapper"), { ssr: false });

// ─── 타입 ──────────────────────────────────────────────────────────────────

interface GanttItem {
  id: string;
  vesselCode: string;
  blockName: string;
  projectId: string | null;
  plannedStart: string | null;
  plannedEnd: string | null;
  deliveryFactory: string | null;
  deliveryAssembly: string | null;
  workType: string;
  status: string;
  holdReason: string | null;
  priority: number;
  memo: string | null;
  actualStart: string | null;
  actualEnd: string | null;
  completionRate: number;
  totalWeight: number;
  cutWeight: number;
  delayDays: number | null;
  logCount: number;
}

// ─── 상수 ──────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  PLANNED: "예정", IN_PROGRESS: "진행중", COMPLETED: "완료",
  HOLD: "홀드", CANCELLED: "취소",
};
const STATUS_COLOR: Record<string, string> = {
  PLANNED:     "bg-blue-100 text-blue-700",
  IN_PROGRESS: "bg-green-100 text-green-700",
  COMPLETED:   "bg-gray-100 text-gray-600",
  HOLD:        "bg-yellow-100 text-yellow-700",
  CANCELLED:   "bg-red-100 text-red-600",
};

function fmtDate(iso: string | null) {
  if (!iso) return "-";
  return iso.slice(0, 10);
}
function dDayStr(iso: string | null) {
  if (!iso) return null;
  const diff = Math.floor((new Date(iso).getTime() - Date.now()) / 86400000);
  if (diff === 0) return "D-Day";
  if (diff > 0)  return `D-${diff}`;
  return `D+${Math.abs(diff)}`;
}

// ─── 요약 통계 ────────────────────────────────────────────────────────────

function SummaryBar({ data }: { data: GanttItem[] }) {
  const total      = data.length;
  const planned    = data.filter(d => d.status === "PLANNED").length;
  const inProgress = data.filter(d => d.status === "IN_PROGRESS").length;
  const completed  = data.filter(d => d.status === "COMPLETED").length;
  const hold       = data.filter(d => d.status === "HOLD").length;
  const overdue    = data.filter(d =>
    d.plannedEnd && d.completionRate < 100 && new Date(d.plannedEnd) < new Date()
  ).length;

  const items = [
    { label: "전체",   value: total,      color: "text-gray-700",  bg: "bg-gray-100" },
    { label: "예정",   value: planned,    color: "text-blue-700",  bg: "bg-blue-50" },
    { label: "진행중", value: inProgress, color: "text-green-700", bg: "bg-green-50" },
    { label: "완료",   value: completed,  color: "text-gray-500",  bg: "bg-gray-50" },
    { label: "홀드",   value: hold,       color: "text-yellow-700",bg: "bg-yellow-50" },
    { label: "지연",   value: overdue,    color: "text-red-700",   bg: "bg-red-50" },
  ];

  return (
    <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
      {items.map(i => (
        <div key={i.label} className={`${i.bg} rounded-xl px-4 py-3 text-center`}>
          <p className={`text-2xl font-bold ${i.color}`}>{i.value}</p>
          <p className="text-xs text-gray-500 mt-0.5">{i.label}</p>
        </div>
      ))}
    </div>
  );
}

// ─── 메인 ─────────────────────────────────────────────────────────────────

export default function ScheduleViewer() {
  const [ganttData, setGanttData] = useState<GanttItem[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [tab,       setTab]       = useState<"gantt" | "list">("gantt");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch("/api/schedules/gantt?includeArchive=false&includeCompleted=true");
      const json = await res.json();
      if (json.success) setGanttData(json.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const scheduled = ganttData.filter(d => !!d.plannedStart);
  const filtered  = statusFilter === "ALL"
    ? ganttData
    : ganttData.filter(d => d.status === statusFilter);

  const tabClass = (t: string) =>
    `px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
      tab === t ? "bg-blue-600 text-white shadow-sm" : "text-gray-600 hover:bg-gray-100"
    }`;

  return (
    <div className="space-y-5">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Eye size={24} className="text-blue-600" /> 스케줄 확인
          </h2>
          <p className="text-sm text-gray-500 mt-1">절단 진행 현황 및 일정 확인</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchAll} className="text-xs">
          <RefreshCw size={13} className="mr-1" /> 새로고침
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-20 text-gray-400 gap-3">
          <RefreshCw className="animate-spin text-blue-500" size={24} /> 데이터를 불러오는 중...
        </div>
      ) : (
        <>
          {/* 요약 통계 */}
          <SummaryBar data={ganttData} />

          {/* 탭 */}
          <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl w-fit">
            <button className={tabClass("gantt")} onClick={() => setTab("gantt")}>
              <CalendarDays size={14} className="inline mr-1" />간트차트
            </button>
            <button className={tabClass("list")} onClick={() => setTab("list")}>
              <BarChart2 size={14} className="inline mr-1" />목록
            </button>
          </div>

          {/* 간트차트 탭 */}
          {tab === "gantt" && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-700">
                  간트차트 ({scheduled.length}건 배치됨)
                </span>
                <span className="text-xs text-gray-400">읽기 전용</span>
              </div>
              <div className="p-4">
                <FrappeGantt items={scheduled} readOnly={true} />
              </div>
            </div>
          )}

          {/* 목록 탭 */}
          {tab === "list" && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              {/* 필터 */}
              <div className="px-4 py-3 border-b bg-gray-50 flex items-center gap-2 flex-wrap">
                {["ALL", "PLANNED", "IN_PROGRESS", "COMPLETED", "HOLD"].map(s => (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                      statusFilter === s
                        ? "bg-blue-600 text-white"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    {s === "ALL" ? "전체" : STATUS_LABEL[s]}
                    {s === "ALL" ? ` (${ganttData.length})` : ` (${ganttData.filter(d => d.status === s).length})`}
                  </button>
                ))}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left whitespace-nowrap">
                  <thead className="bg-gray-50 border-b text-xs text-gray-500 uppercase">
                    <tr>
                      <th className="px-4 py-2.5">호선</th>
                      <th className="px-4 py-2.5">블록</th>
                      <th className="px-4 py-2.5">상태</th>
                      <th className="px-4 py-2.5">계획 시작</th>
                      <th className="px-4 py-2.5">계획 완료</th>
                      <th className="px-4 py-2.5">가공장 납기</th>
                      <th className="px-4 py-2.5">조립장 납기</th>
                      <th className="px-4 py-2.5 text-right">완료율</th>
                      <th className="px-4 py-2.5 text-right">지연</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filtered.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-4 py-10 text-center text-gray-400">
                          해당하는 스케줄이 없습니다.
                        </td>
                      </tr>
                    ) : filtered.map(item => {
                      const isOverdue = item.plannedEnd && item.completionRate < 100
                        && new Date(item.plannedEnd) < new Date();
                      return (
                        <tr key={item.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-mono text-xs text-gray-600">{item.vesselCode}</td>
                          <td className="px-4 py-3 font-semibold text-gray-800">{item.blockName}</td>
                          <td className="px-4 py-3">
                            <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[item.status]}`}>
                              {STATUS_LABEL[item.status]}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-600">{fmtDate(item.plannedStart)}</td>
                          <td className={`px-4 py-3 text-xs ${isOverdue ? "text-red-600 font-bold" : "text-gray-600"}`}>
                            {fmtDate(item.plannedEnd)}
                          </td>
                          <td className="px-4 py-3 text-xs">
                            {item.deliveryFactory ? (
                              <span>
                                {fmtDate(item.deliveryFactory)}
                                <span className="ml-1 text-gray-400">({dDayStr(item.deliveryFactory)})</span>
                              </span>
                            ) : <span className="text-gray-300">-</span>}
                          </td>
                          <td className="px-4 py-3 text-xs">
                            {item.deliveryAssembly ? (
                              <span>
                                {fmtDate(item.deliveryAssembly)}
                                <span className="ml-1 text-gray-400">({dDayStr(item.deliveryAssembly)})</span>
                              </span>
                            ) : <span className="text-gray-300">-</span>}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${
                                    item.completionRate === 100 ? "bg-green-500"
                                    : isOverdue ? "bg-red-500" : "bg-blue-500"
                                  }`}
                                  style={{ width: `${item.completionRate}%` }}
                                />
                              </div>
                              <span className={`text-xs font-bold ${
                                item.completionRate === 100 ? "text-green-600"
                                : isOverdue ? "text-red-600" : "text-gray-700"
                              }`}>
                                {item.completionRate}%
                              </span>
                            </div>
                          </td>
                          <td className={`px-4 py-3 text-right text-xs font-bold ${
                            item.delayDays !== null && item.delayDays > 0 ? "text-red-600"
                            : item.delayDays !== null && item.delayDays < 0 ? "text-green-600"
                            : "text-gray-400"
                          }`}>
                            {item.delayDays !== null
                              ? item.delayDays > 0 ? `+${item.delayDays}일`
                              : item.delayDays < 0 ? `${item.delayDays}일` : "정시"
                              : "-"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </>
      )}
    </div>
  );
}

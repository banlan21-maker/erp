"use client";

/**
 * 절단 작업 보고서 컴포넌트
 *
 * 정규작업(isUrgent=false)과 돌발작업(isUrgent=true)을 구분하여 표시.
 * 탭별 상세 테이블 컬럼 구성이 다름:
 *  - 전체:   공통 컬럼 + 구분 + W1/L1/W2/L2
 *  - 정규:   기존 컬럼 (구분 제외) — Heat NO, 폭×길이, 수량, 작업시간, 특이사항 포함
 *  - 돌발:   W1/L1/W2/L2 + 요청자/부서
 *
 * Footer 합계: 수량 · 작업시간 · 강재중량 · 사용중량.
 */

import { useRouter, usePathname } from "next/navigation";
import { useState } from "react";
import { Printer, Search, FileDown, BarChart2, Zap, ClipboardList, ChevronRight, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input }  from "@/components/ui/input";
import * as XLSX  from "xlsx";

// ─── 타입 ──────────────────────────────────────────────────────────────────────
interface CuttingLog {
  id: string;
  equipment:   { id: string; name: string; type: string };
  project:     { projectCode: string; projectName: string } | null;
  heatNo:      string;
  material:    string | null;
  thickness:   number | null;
  width:       number | null;
  length:      number | null;
  qty:         number | null;
  drawingNo:   string | null;
  operator:    string;
  startAt:     string;
  endAt:       string | null;
  memo:        string | null;
  steelWeight: number | null;
  useWeight:   number | null;
  // 정규/돌발 구분
  isUrgent:    boolean;
  urgentNo:    string | null;
  urgentTitle: string | null;
  // 돌발작업 요청 정보
  requester:        string | null;
  department:       string | null;
  urgentRemnantNo:  string | null;
  // 블록
  block:       string | null;
  // 통합 치수 (정규: 강재의 폭/길이, 돌발: 잔재의 W1/L1/W2/L2)
  dimW1:       number | null;
  dimL1:       number | null;
  dimW2:       number | null;
  dimL2:       number | null;
  // 중단 시간
  pauseMs:     number;
}

type WorkTypeFilter = "all" | "normal" | "urgent";

// ─── 유틸 ──────────────────────────────────────────────────────────────────────
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" });
}
function formatTime(iso: string) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function durationMs(start: string, end: string | null, pauseMs = 0) {
  if (!end) return 0;
  return Math.max(0, new Date(end).getTime() - new Date(start).getTime() - pauseMs);
}
function formatDurationMs(ms: number) {
  if (ms <= 0) return "-";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
function formatDuration(log: CuttingLog) {
  return formatDurationMs(durationMs(log.startAt, log.endAt, log.pauseMs));
}
function formatPauseMin(ms: number) {
  if (ms <= 0) return "-";
  const m = Math.round(ms / 60000);
  return `${m}분`;
}
function locationLabel(log: CuttingLog) {
  if (log.project) return `[${log.project.projectCode}] ${log.project.projectName}`;
  if (log.urgentTitle) return log.urgentTitle;
  return "";
}

// ─── 메인 컴포넌트 ─────────────────────────────────────────────────────────────
export default function ReportsMain({
  logs,
  fromStr,
  toStr,
}: {
  logs:    CuttingLog[];
  fromStr: string;
  toStr:   string;
}) {
  const router   = useRouter();
  const pathname = usePathname();

  const [from,       setFrom]       = useState(fromStr);
  const [to,         setTo]         = useState(toStr);
  const [workType,      setWorkType]      = useState<WorkTypeFilter>("all");
  const [expandedVessel, setExpandedVessel] = useState<Set<string>>(new Set());

  // ── 필터링 ────────────────────────────────────────────────────────────────
  const filteredLogs = logs.filter(l =>
    workType === "all"    ? true :
    workType === "normal" ? !l.isUrgent :
    /* urgent */            l.isUrgent
  );

  const normalLogs = logs.filter(l => !l.isUrgent);
  const urgentLogs = logs.filter(l =>  l.isUrgent);

  // ── 집계 ─────────────────────────────────────────────────────────────────
  const sumNum = (arr: CuttingLog[], key: "qty" | "steelWeight" | "useWeight") =>
    arr.reduce((s, l) => s + (l[key] ?? 0), 0);
  const sumDurationMs = (arr: CuttingLog[]) =>
    arr.reduce((s, l) => s + durationMs(l.startAt, l.endAt, l.pauseMs), 0);

  const totalQty      = filteredLogs.length;  // 1작업=1매이므로 건수=수량
  const totalSteel    = sumNum(filteredLogs, "steelWeight");
  const totalUse      = sumNum(filteredLogs, "useWeight");
  const totalDuration = sumDurationMs(filteredLogs);

  // ── 장비별 집계 ──────────────────────────────────────────────────────────
  const PAUSE_REASON_LABEL: Record<string, string> = {
    EQUIPMENT_FAILURE: "장비고장",
    DRAWING_CHANGE:    "도면변경",
    CONSUMABLE:        "소모품교체",
    WORK_EXTENSION:    "작업연장",
    OTHER:             "기타",
  };
  const byEq = filteredLogs.reduce((acc, l) => {
    const k = l.equipment.name;
    if (!acc[k]) acc[k] = { qty: 0, steelWeight: 0, pauseByReason: {} };
    acc[k].qty++;
    acc[k].steelWeight += l.steelWeight ?? 0;
    if (l.pauses) {
      for (const p of l.pauses) {
        if (!p.resumedAt) continue;
        const ms = new Date(p.resumedAt).getTime() - new Date(p.pausedAt).getTime();
        acc[k].pauseByReason[p.reason] = (acc[k].pauseByReason[p.reason] ?? 0) + ms;
      }
    }
    return acc;
  }, {} as Record<string, { qty: number; steelWeight: number; pauseByReason: Record<string, number> }>);

  // 호선 > 블록 2단계 집계 (정규작업만 — 청구서 기반 데이터)
  type BlockStat = { qty: number; steelWeight: number; useWeight: number };
  type VesselStat = { name: string; qty: number; steelWeight: number; useWeight: number; blocks: Record<string, BlockStat> };
  const byProject = filteredLogs
    .filter(l => !l.isUrgent && l.project)
    .reduce((acc, l) => {
      const code  = l.project!.projectCode;
      const block = l.block ?? "(블록미상)";
      if (!acc[code]) acc[code] = { name: l.project!.projectName, qty: 0, steelWeight: 0, useWeight: 0, blocks: {} };
      if (!acc[code].blocks[block]) acc[code].blocks[block] = { qty: 0, steelWeight: 0, useWeight: 0 };
      acc[code].qty++;
      acc[code].steelWeight += l.steelWeight ?? 0;
      acc[code].useWeight   += l.useWeight   ?? 0;
      acc[code].blocks[block].qty++;
      acc[code].blocks[block].steelWeight += l.steelWeight ?? 0;
      acc[code].blocks[block].useWeight   += l.useWeight   ?? 0;
      return acc;
    }, {} as Record<string, VesselStat>);

  // ── 기간 조회 ─────────────────────────────────────────────────────────────
  const applyFilter = () => router.push(`${pathname}?from=${from}&to=${to}`);

  // ── Excel 다운로드 ────────────────────────────────────────────────────────
  const downloadExcel = () => {
    const rows = filteredLogs.map((l) => ({
      "구분":         l.isUrgent ? "돌발" : "정규",
      "날짜":         formatDate(l.startAt),
      "장비":         l.equipment.name,
      "작업자":       l.operator,
      "호선":         l.project ? `[${l.project.projectCode}] ${l.project.projectName}` : (l.urgentTitle ?? ""),
      "블록":         l.block ?? "",
      "돌발번호":     l.urgentNo ?? "",
      "도면번호":     l.drawingNo ?? "",
      "Heat NO":      l.heatNo ?? "",
      "재질":         l.material ?? "",
      "두께(mm)":     l.thickness ?? "",
      "W1(mm)":       l.dimW1 ?? "",
      "L1(mm)":       l.dimL1 ?? "",
      "W2(mm)":       l.dimW2 ?? "",
      "L2(mm)":       l.dimL2 ?? "",
      "수량(매)":     l.qty ?? "",
      "작업시간":     formatDuration(l),
      "미가동시간(분)": l.pauseMs > 0 ? Math.round(l.pauseMs / 60000) : "",
      "강재중량(kg)": l.steelWeight != null ? l.steelWeight : "",
      "사용중량(kg)": l.useWeight   != null ? l.useWeight   : "",
      "요청자":       l.requester  ?? "",
      "부서":         l.department ?? "",
      "특이사항":     l.memo ?? "",
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "절단보고서");
    XLSX.writeFile(wb, `절단보고서_${fromStr}_${toStr}.xlsx`);
  };

  // ── 렌더 ─────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          .print-table-wrap { overflow: visible !important; }
          body { font-size: 10px; }
          @page { margin: 15mm; size: A4 landscape; }
        }
        .print-only { display: none; }
      `}</style>

      <div className="space-y-5">

        {/* 인쇄 전용 헤더 */}
        <div className="print-only mb-4 pb-3 border-b text-center">
          <h1 className="text-xl font-bold">절단보고서</h1>
          <p className="text-sm text-gray-600 mt-1">
            조회기간: {fromStr} ~ {toStr} &nbsp;|&nbsp;
            {workType === "all" ? "전체" : workType === "normal" ? "정규" : "돌발"} &nbsp;|&nbsp;
            출력일: {new Date().toLocaleDateString("ko-KR")}
          </p>
        </div>

        {/* 헤더 */}
        <div className="flex items-center justify-between no-print">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <BarChart2 size={24} className="text-blue-600" />
              절단보고서
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">완료된 절단 작업 내역 조회 및 출력</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={downloadExcel} className="flex items-center gap-2">
              <FileDown size={15} /> 엑셀 다운로드
            </Button>
            <Button onClick={() => window.print()} className="flex items-center gap-2">
              <Printer size={15} /> 인쇄
            </Button>
          </div>
        </div>

        {/* 기간 필터 */}
        <div className="bg-white border rounded-xl p-4 no-print">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm font-medium text-gray-700">조회 기간</span>
            <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="h-8 text-sm w-36" />
            <span className="text-gray-400">~</span>
            <Input type="date" value={to}   onChange={e => setTo(e.target.value)}   className="h-8 text-sm w-36" />
            <Button size="sm" onClick={applyFilter} className="flex items-center gap-1.5 h-8">
              <Search size={13} /> 조회
            </Button>
          </div>
        </div>

        {/* 정규 / 돌발 구분 탭 */}
        <div className="flex gap-2 no-print">
          {([
            ["all",    "전체",   logs.length,        "bg-gray-800 text-white",   "border-gray-300 text-gray-700"],
            ["normal", "정규작업", normalLogs.length, "bg-blue-600 text-white",   "border-blue-200 text-blue-700"],
            ["urgent", "돌발작업", urgentLogs.length, "bg-orange-500 text-white", "border-orange-200 text-orange-700"],
          ] as const).map(([type, label, count, activeClass, inactiveClass]) => (
            <button
              key={type}
              onClick={() => setWorkType(type)}
              className={`px-4 py-1.5 rounded-full text-sm font-semibold border transition-all ${
                workType === type ? activeClass : `bg-white ${inactiveClass}`
              }`}
            >
              {label}
              <span className={`ml-1.5 text-xs ${workType === type ? "opacity-80" : "opacity-60"}`}>
                {count}건
              </span>
            </button>
          ))}
        </div>

        {/* 요약 카드 */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 no-print">
          {[
            { label: "총 가동시간", value: formatDurationMs(totalDuration), color: "text-blue-700 bg-blue-50" },
            { label: "총 수량",     value: `${totalQty.toLocaleString()}매`, color: "text-green-700 bg-green-50" },
            { label: "강재중량",    value: `${totalSteel.toLocaleString()}kg`, color: "text-orange-700 bg-orange-50" },
            { label: "사용중량",    value: `${totalUse.toLocaleString()}kg`,   color: "text-purple-700 bg-purple-50" },
          ].map(({ label, value, color }) => (
            <div key={label} className={`rounded-xl p-4 ${color}`}>
              <p className="text-xs font-medium opacity-70">{label}</p>
              <p className="text-2xl font-bold mt-1">{value}</p>
            </div>
          ))}
        </div>

        {/* 장비별 집계 */}
        <div className="bg-white border rounded-xl overflow-hidden no-print">
          <div className="px-4 py-3 border-b bg-gray-50">
            <h3 className="text-xs font-semibold text-gray-600">장비별 집계</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-400 border-b bg-gray-50">
                  <th className="text-left px-4 py-2">장비</th>
                  <th className="text-right px-4 py-2">수량(매)</th>
                  <th className="text-right px-4 py-2">중량(kg)</th>
                  <th className="text-left px-4 py-2 text-orange-400">미가동 사유별</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {Object.entries(byEq).map(([name, v]) => {
                  const totalPauseMs = Object.values(v.pauseByReason).reduce((s, ms) => s + ms, 0);
                  return (
                    <tr key={name} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 font-semibold text-gray-800">{name}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">{v.qty.toLocaleString()}매</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">
                        {v.steelWeight.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                      </td>
                      <td className="px-4 py-2.5">
                        {totalPauseMs === 0 ? (
                          <span className="text-gray-300">-</span>
                        ) : (
                          <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                            {Object.entries(v.pauseByReason).map(([reason, ms]) => (
                              <span key={reason} className="text-orange-600">
                                {PAUSE_REASON_LABEL[reason] ?? reason}
                                <span className="text-orange-400 ml-1">{Math.round(ms / 60000)}분</span>
                              </span>
                            ))}
                            <span className="text-gray-400 ml-1">
                              (합계 {Math.round(totalPauseMs / 60000)}분)
                            </span>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* 호선 > 블록 폴더식 집계 (정규작업 — 청구서 기반) */}
        {Object.keys(byProject).length > 0 && (
          <div className="bg-white border rounded-xl overflow-hidden no-print">
            {/* 헤더 */}
            <div className="px-4 py-3 border-b bg-gray-50 flex items-center gap-2">
              <ClipboardList size={13} className="text-blue-500" />
              <span className="text-xs font-semibold text-gray-600">호선별 집계</span>
              <span className="text-xs text-gray-400 font-normal">(정규작업 기준 · 청구서 데이터)</span>
            </div>
            {/* 컬럼 헤더 */}
            <div className="grid grid-cols-[1fr_60px_90px_90px] gap-2 px-4 py-1.5 bg-gray-50 border-b text-[11px] text-gray-400 font-semibold">
              <span>호선 / 블록</span>
              <span className="text-right">수량(매)</span>
              <span className="text-right">강재중량(kg)</span>
              <span className="text-right">사용중량(kg)</span>
            </div>
            {/* 호선 목록 */}
            <div className="divide-y">
              {Object.entries(byProject).map(([code, v]) => {
                const expanded = expandedVessel.has(code);
                const toggleVessel = () => setExpandedVessel(prev => {
                  const next = new Set(prev);
                  expanded ? next.delete(code) : next.add(code);
                  return next;
                });
                return (
                  <div key={code}>
                    {/* 호선 행 */}
                    <button
                      onClick={toggleVessel}
                      className="w-full grid grid-cols-[1fr_60px_90px_90px] gap-2 px-4 py-2.5 hover:bg-blue-50 transition-colors text-left"
                    >
                      <span className="flex items-center gap-1.5 font-semibold text-blue-700 text-xs">
                        {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                        <span className="font-mono">{code}</span>
                        <span className="text-gray-500 font-normal">{v.name}</span>
                      </span>
                      <span className="text-right text-xs text-gray-600">{v.qty.toLocaleString()}매</span>
                      <span className="text-right text-xs text-gray-700 font-medium">
                        {v.steelWeight.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                      </span>
                      <span className="text-right text-xs text-gray-800 font-bold">
                        {v.useWeight.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                      </span>
                    </button>
                    {/* 블록 행 (펼쳤을 때) */}
                    {expanded && (
                      <div className="bg-blue-50/50 divide-y divide-blue-100">
                        {Object.entries(v.blocks).map(([block, b]) => (
                          <div key={block} className="grid grid-cols-[1fr_60px_90px_90px] gap-2 px-4 py-2 text-xs">
                            <span className="flex items-center gap-1.5 pl-6 text-gray-600">
                              <span className="w-1.5 h-1.5 rounded-full bg-blue-300 shrink-0" />
                              <span className="font-medium text-gray-700">{block}</span>
                            </span>
                            <span className="text-right text-gray-500">{b.qty.toLocaleString()}매</span>
                            <span className="text-right text-gray-600">
                              {b.steelWeight.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                            </span>
                            <span className="text-right text-blue-700 font-semibold">
                              {b.useWeight.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {/* 전체 합계 */}
            <div className="grid grid-cols-[1fr_60px_90px_90px] gap-2 px-4 py-2.5 bg-blue-50 border-t text-xs font-bold">
              <span className="text-gray-600">합계</span>
              <span className="text-right text-gray-700">{Object.values(byProject).reduce((s,v) => s+v.qty, 0).toLocaleString()}매</span>
              <span className="text-right text-gray-700">
                {Object.values(byProject).reduce((s,v) => s+v.steelWeight, 0).toLocaleString(undefined, { maximumFractionDigits: 1 })}
              </span>
              <span className="text-right text-blue-800">
                {Object.values(byProject).reduce((s,v) => s+v.useWeight, 0).toLocaleString(undefined, { maximumFractionDigits: 1 })}
              </span>
            </div>
          </div>
        )}

        {/* 상세 내역 테이블 — 정규/돌발 탭에서만 표시 */}
        {workType !== "all" && (
          <div className="bg-white border rounded-xl print-table-wrap overflow-x-auto">
            <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between no-print">
              <h3 className="text-sm font-semibold text-gray-700">
                작업 상세 내역
                <span className="text-gray-400 font-normal ml-1">
                  ({filteredLogs.length}건 · {fromStr} ~ {toStr})
                </span>
              </h3>
            </div>

            {filteredLogs.length === 0 ? (
              <p className="text-center py-12 text-gray-400 text-sm">
                해당 기간에 완료된 작업이 없습니다.
              </p>
            ) : workType === "normal" ? (
              <NormalDetailTable
                logs={filteredLogs}
                totalQty={totalQty}
                totalSteel={totalSteel}
                totalUse={totalUse}
                totalDurationMs={totalDuration}
              />
            ) : (
              <UrgentDetailTable
                logs={filteredLogs}
                totalQty={totalQty}
                totalSteel={totalSteel}
                totalUse={totalUse}
                totalDurationMs={totalDuration}
              />
            )}
          </div>
        )}
      </div>
    </>
  );
}

// ─── 공통 셀 렌더러 ────────────────────────────────────────────────────────────
const numCell = (v: number | null) =>
  v != null ? v.toLocaleString() : "-";

const DashIfNull = ({ v }: { v: string | number | null }) =>
  v == null || v === "" ? <span className="text-gray-300">-</span> : <>{v}</>;

// ─── 전체 탭: 구분 + W1/L1/W2/L2 + 강재/사용중량 ───────────────────────────────
function AllDetailTable({
  logs, totalQty, totalSteel, totalUse, totalDurationMs: totalMs,
}: {
  logs: CuttingLog[];
  totalQty: number; totalSteel: number; totalUse: number; totalDurationMs: number;
}) {
  return (
    <table className="w-full text-xs min-w-[1100px]">
      <thead className="bg-gray-50 border-b">
        <tr>
          {[
            ["구분", "center"], ["날짜", "left"], ["장비", "left"], ["작업자", "left"],
            ["호선/블록", "left"], ["도면번호", "left"], ["재질", "left"], ["두께", "right"],
            ["W1", "right"], ["L1", "right"], ["W2", "right"], ["L2", "right"],
            ["강재중량(kg)", "right"], ["사용중량(kg)", "right"],
          ].map(([l, a]) => (
            <th key={l} className={`px-3 py-2 text-gray-500 font-semibold text-${a} whitespace-nowrap`}>{l}</th>
          ))}

        </tr>
      </thead>
      <tbody className="divide-y">
        {logs.map((log) => (
          <tr key={log.id} className={`hover:bg-gray-50 ${log.isUrgent ? "bg-orange-50/30" : ""}`}>
            <td className="px-3 py-2 text-center whitespace-nowrap">
              {log.isUrgent ? (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 text-[10px] font-bold">
                  <Zap size={9} />돌발
                </span>
              ) : (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold">
                  <ClipboardList size={9} />정규
                </span>
              )}
            </td>
            <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{formatDate(log.startAt)}</td>
            <td className="px-3 py-2 font-medium text-gray-800 whitespace-nowrap">{log.equipment.name}</td>
            <td className="px-3 py-2 text-gray-700">{log.operator}</td>
            <td className="px-3 py-2 text-gray-600 text-[11px] whitespace-nowrap">
              {log.project
                ? `[${log.project.projectCode}] ${log.project.projectName}`
                : log.urgentTitle ?? <span className="text-gray-400">-</span>}
            </td>
            <td className="px-3 py-2 font-mono text-gray-800">{log.drawingNo ?? "-"}</td>
            <td className="px-3 py-2">
              {log.material ? <span className="px-1.5 py-0.5 bg-slate-100 rounded font-medium">{log.material}</span> : <span className="text-gray-400">-</span>}
            </td>
            <td className="px-3 py-2 text-right text-gray-700">{log.thickness ?? "-"}</td>
            <td className="px-3 py-2 text-right text-gray-700 font-mono"><DashIfNull v={log.dimW1} /></td>
            <td className="px-3 py-2 text-right text-gray-700 font-mono"><DashIfNull v={log.dimL1} /></td>
            <td className="px-3 py-2 text-right text-gray-700 font-mono"><DashIfNull v={log.dimW2} /></td>
            <td className="px-3 py-2 text-right text-gray-700 font-mono"><DashIfNull v={log.dimL2} /></td>
            <td className="px-3 py-2 text-right text-gray-700">{numCell(log.steelWeight)}</td>
            <td className="px-3 py-2 text-right text-gray-700">{numCell(log.useWeight)}</td>
          </tr>
        ))}
      </tbody>
      <TotalFoot colspan={12} totalQty={totalQty} totalSteel={totalSteel} totalUse={totalUse} totalMs={totalMs} count={logs.length} />
    </table>
  );
}

// ─── 정규작업 탭: Heat NO + 폭×길이 + 수량 + 작업시간 + 특이사항 ──────────────
function NormalDetailTable({
  logs, totalQty, totalSteel, totalUse, totalDurationMs: totalMs,
}: {
  logs: CuttingLog[];
  totalQty: number; totalSteel: number; totalUse: number; totalDurationMs: number;
}) {
  return (
    <table className="w-full text-xs min-w-[1100px]">
      <thead className="bg-gray-50 border-b">
        <tr>
          {[
            ["호선", "left"], ["블록", "left"], ["도면번호", "left"], ["재질", "left"], ["두께", "right"],
            ["폭1", "right"], ["폭2", "right"], ["길이1", "right"], ["길이2", "right"],
            ["철판중량(kg)", "right"], ["사용중량(kg)", "right"],
            ["Heat NO", "left"],
            ["작업자", "left"], ["장비", "left"],
            ["작업일", "left"], ["총가동시간", "center"], ["중단시간", "center"], ["실가동시간", "center"],
            ["비고", "left"],
          ].map(([l, a]) => (
            <th key={l} className={`px-3 py-2 text-gray-500 font-semibold text-${a} whitespace-nowrap`}>{l}</th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y">
        {logs.map((log) => {
          const totalMs  = durationMs(log.startAt, log.endAt);
          const activeMs = durationMs(log.startAt, log.endAt, log.pauseMs);
          return (
          <tr key={log.id} className="hover:bg-gray-50">
            <td className="px-3 py-2 text-gray-600 text-[11px] whitespace-nowrap">
              {log.project ? `[${log.project.projectCode}]` : <span className="text-gray-400">-</span>}
            </td>
            <td className="px-3 py-2 text-gray-700 font-medium whitespace-nowrap">{log.block ?? <span className="text-gray-300">-</span>}</td>
            <td className="px-3 py-2 font-mono text-gray-800">{log.drawingNo ?? "-"}</td>
            <td className="px-3 py-2">
              {log.material ? <span className="px-1.5 py-0.5 bg-slate-100 rounded font-medium">{log.material}</span> : <span className="text-gray-400">-</span>}
            </td>
            <td className="px-3 py-2 text-right text-gray-700">{log.thickness ? `${log.thickness}t` : "-"}</td>
            <td className="px-3 py-2 text-right tabular-nums text-gray-700">{log.dimW1?.toLocaleString() ?? "-"}</td>
            <td className="px-3 py-2 text-right tabular-nums text-gray-400">{log.dimW2?.toLocaleString() ?? "-"}</td>
            <td className="px-3 py-2 text-right tabular-nums text-gray-700">{log.dimL1?.toLocaleString() ?? "-"}</td>
            <td className="px-3 py-2 text-right tabular-nums text-gray-400">{log.dimL2?.toLocaleString() ?? "-"}</td>
            <td className="px-3 py-2 text-right text-gray-700">{numCell(log.steelWeight)}</td>
            <td className="px-3 py-2 text-right text-gray-700">{numCell(log.useWeight)}</td>
            <td className="px-3 py-2 font-mono text-blue-700">{log.heatNo || "-"}</td>
            <td className="px-3 py-2 text-gray-700">{log.operator}</td>
            <td className="px-3 py-2 font-medium text-gray-800 whitespace-nowrap">{log.equipment.name}</td>
            <td className="px-3 py-2 text-gray-500 whitespace-nowrap font-mono text-[11px]">{formatDate(log.startAt)}</td>
            <td className="px-3 py-2 text-center text-gray-500 whitespace-nowrap">{formatDurationMs(totalMs)}</td>
            <td className="px-3 py-2 text-center text-orange-500 whitespace-nowrap">{formatPauseMin(log.pauseMs)}</td>
            <td className="px-3 py-2 text-center text-green-700 font-semibold whitespace-nowrap">{formatDurationMs(activeMs)}</td>
            <td className="px-3 py-2 text-gray-400 max-w-[120px] truncate">{log.memo ?? "-"}</td>
          </tr>
          );
        })}
      </tbody>
      <TotalFootNormal totalQty={totalQty} totalSteel={totalSteel} totalUse={totalUse} totalMs={totalMs} count={logs.length} />
    </table>
  );
}

// ─── 돌발작업 탭: 작업명/요청자/부서/호선블록/잔재번호/치수/중량/시간 ─────────────
function UrgentDetailTable({
  logs, totalQty, totalSteel, totalUse, totalDurationMs: totalMs,
}: {
  logs: CuttingLog[];
  totalQty: number; totalSteel: number; totalUse: number; totalDurationMs: number;
}) {
  return (
    <table className="w-full text-xs min-w-[1400px]">
      <thead className="bg-orange-50 border-b">
        <tr>
          {[
            ["작업명",       "left"],
            ["요청자",       "left"],
            ["요청부서",     "left"],
            ["연관호선/블록", "left"],
            ["사용잔재번호",  "left"],
            ["재질",         "left"],
            ["두께",         "right"],
            ["폭1",          "right"],
            ["폭2",          "right"],
            ["길이1",        "right"],
            ["길이2",        "right"],
            ["중량(kg)",     "right"],
            ["사용중량(kg)", "right"],
            ["작업일",       "left"],
            ["총가동시간",   "center"],
            ["중단시간",     "center"],
            ["실가동시간",   "center"],
          ].map(([l, a]) => (
            <th key={l} className={`px-3 py-2 text-gray-500 font-semibold text-${a} whitespace-nowrap`}>{l}</th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y">
        {logs.map((log) => {
          const totMs  = durationMs(log.startAt, log.endAt);
          const actMs  = durationMs(log.startAt, log.endAt, log.pauseMs);
          return (
            <tr key={log.id} className="hover:bg-orange-50/40">
              <td className="px-3 py-2 font-semibold text-gray-900 max-w-[180px] truncate">
                {log.urgentTitle ?? <span className="text-gray-400">-</span>}
              </td>
              <td className="px-3 py-2 text-gray-700">{log.requester ?? "-"}</td>
              <td className="px-3 py-2 text-gray-500">{log.department ?? "-"}</td>
              <td className="px-3 py-2 text-gray-600 text-[11px] whitespace-nowrap">
                {log.project
                  ? `[${log.project.projectCode}] ${log.project.projectName}`
                  : <span className="text-gray-400">-</span>}
              </td>
              <td className="px-3 py-2 font-mono text-orange-700">
                {log.urgentRemnantNo ?? <span className="text-gray-400">-</span>}
              </td>
              <td className="px-3 py-2">
                {log.material
                  ? <span className="px-1.5 py-0.5 bg-slate-100 rounded font-medium">{log.material}</span>
                  : <span className="text-gray-400">-</span>}
              </td>
              <td className="px-3 py-2 text-right text-gray-700">{log.thickness ? `${log.thickness}t` : "-"}</td>
              <td className="px-3 py-2 text-right tabular-nums text-gray-700">{log.dimW1?.toLocaleString() ?? "-"}</td>
              <td className="px-3 py-2 text-right tabular-nums text-gray-400">{log.dimW2?.toLocaleString() ?? "-"}</td>
              <td className="px-3 py-2 text-right tabular-nums text-gray-700">{log.dimL1?.toLocaleString() ?? "-"}</td>
              <td className="px-3 py-2 text-right tabular-nums text-gray-400">{log.dimL2?.toLocaleString() ?? "-"}</td>
              <td className="px-3 py-2 text-right text-gray-700">{numCell(log.steelWeight)}</td>
              <td className="px-3 py-2 text-right text-gray-700">{numCell(log.useWeight)}</td>
              <td className="px-3 py-2 text-gray-500 whitespace-nowrap font-mono text-[11px]">{formatDate(log.startAt)}</td>
              <td className="px-3 py-2 text-center text-gray-500 whitespace-nowrap">{formatDurationMs(totMs)}</td>
              <td className="px-3 py-2 text-center text-orange-500 whitespace-nowrap">{formatPauseMin(log.pauseMs)}</td>
              <td className="px-3 py-2 text-center text-green-700 font-semibold whitespace-nowrap">{formatDurationMs(actMs)}</td>
            </tr>
          );
        })}
      </tbody>
      <TotalFootUrgent totalQty={totalQty} totalSteel={totalSteel} totalUse={totalUse} totalMs={totalMs} count={logs.length} />
    </table>
  );
}

// ─── 합계 Foot: 탭별 컬럼 정렬 ────────────────────────────────────────────────
function TotalFoot({ colspan, totalQty, totalSteel, totalUse, totalMs, count }: {
  colspan: number; totalQty: number; totalSteel: number; totalUse: number; totalMs: number; count: number;
}) {
  return (
    <tfoot className="bg-gray-50 border-t font-semibold text-xs">
      <tr>
        <td colSpan={colspan} className="px-3 py-2 text-gray-500">
          합계 ({count}건)
          <span className="ml-4 text-gray-400 font-normal">
            수량 <strong className="text-gray-800">{totalQty.toLocaleString()}매</strong> ·
            작업시간 <strong className="text-green-700">{formatDurationMs(totalMs)}</strong>
          </span>
        </td>
        <td className="px-3 py-2 text-right text-gray-800">
          {totalSteel.toLocaleString()}
          <span className="text-gray-500 font-normal"> kg</span>
        </td>
        <td className="px-3 py-2 text-right text-gray-800">
          {totalUse.toLocaleString()}
          <span className="text-gray-500 font-normal"> kg</span>
        </td>
        <td />
      </tr>
    </tfoot>
  );
}

function TotalFootNormal({ totalQty, totalSteel, totalUse, totalMs, count }: {
  totalQty: number; totalSteel: number; totalUse: number; totalMs: number; count: number;
}) {
  return (
    <tfoot className="bg-gray-50 border-t font-semibold text-xs">
      <tr>
        {/* 호선·블록·도면·재질·두께·폭1·폭2·길이1·길이2 = 9칸 */}
        <td colSpan={9} className="px-3 py-2 text-gray-500">합계 ({count}건 · {totalQty.toLocaleString()}매)</td>
        {/* 작업시간 */}
        <td className="px-3 py-2 text-center text-green-700">{formatDurationMs(totalMs)}</td>
        {/* 강재중량 */}
        <td className="px-3 py-2 text-right text-gray-800">
          {totalSteel.toLocaleString()}<span className="text-gray-500 font-normal"> kg</span>
        </td>
        {/* 사용중량 */}
        <td className="px-3 py-2 text-right text-gray-800">
          {totalUse.toLocaleString()}<span className="text-gray-500 font-normal"> kg</span>
        </td>
        {/* 특이사항 */}
        <td />
      </tr>
    </tfoot>
  );
}

function TotalFootUrgent({ totalQty, totalSteel, totalUse, totalMs, count }: {
  totalQty: number; totalSteel: number; totalUse: number; totalMs: number; count: number;
}) {
  return (
    <tfoot className="bg-orange-50 border-t font-semibold text-xs">
      <tr>
        {/* 작업명·요청자·부서·호선블록·잔재번호·재질·두께·폭1·폭2·길이1·길이2 = 11칸 */}
        <td colSpan={11} className="px-3 py-2 text-gray-500">
          합계 ({count}건)
          <span className="ml-4 text-gray-400 font-normal">
            실가동 <strong className="text-green-700">{formatDurationMs(totalMs)}</strong>
          </span>
        </td>
        <td className="px-3 py-2 text-right text-gray-800">
          {totalSteel.toLocaleString()}<span className="text-gray-500 font-normal"> kg</span>
        </td>
        <td className="px-3 py-2 text-right text-gray-800">
          {totalUse.toLocaleString()}<span className="text-gray-500 font-normal"> kg</span>
        </td>
        {/* 작업일·총가동·중단·실가동 */}
        <td /><td /><td /><td />
      </tr>
    </tfoot>
  );
}

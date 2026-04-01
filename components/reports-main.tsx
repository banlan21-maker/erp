"use client";

import { useRouter, usePathname } from "next/navigation";
import { useState } from "react";
import { Printer, Search, FileDown, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import * as XLSX from "xlsx";

interface CuttingLog {
  id: string;
  equipment: { id: string; name: string; type: string };
  project: { projectCode: string; projectName: string } | null;
  heatNo: string;
  material: string | null;
  thickness: number | null;
  width: number | null;
  length: number | null;
  qty: number | null;
  drawingNo: string | null;
  operator: string;
  startAt: string;
  endAt: string | null;
  memo: string | null;
  steelWeight: number | null;
  useWeight: number | null;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" });
}
function formatTime(iso: string) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function formatDuration(start: string, end: string | null) {
  if (!end) return "-";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function ReportsMain({
  logs,
  fromStr,
  toStr,
}: {
  logs: CuttingLog[];
  fromStr: string;
  toStr: string;
}) {
  const router   = useRouter();
  const pathname = usePathname();
  const [from, setFrom] = useState(fromStr);
  const [to,   setTo]   = useState(toStr);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const deleteLog = async (id: string) => {
    if (!confirm("이 작업 기록을 삭제하시겠습니까?\n해당 강재의 상태가 '대기'로 되돌아갑니다.")) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/cutting-logs/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) router.refresh();
      else alert(data.error ?? "삭제 오류");
    } catch { alert("서버 연결 오류"); }
    finally { setDeletingId(null); }
  };

  const applyFilter = () => router.push(`${pathname}?from=${from}&to=${to}`);

  // 집계
  const totalQty        = logs.reduce((s, l) => s + (l.qty         ?? 0), 0);
  const totalSteel      = logs.reduce((s, l) => s + (l.steelWeight ?? 0), 0);
  const totalUse        = logs.reduce((s, l) => s + (l.useWeight   ?? 0), 0);

  // 장비별
  const byEq = logs.reduce((acc, l) => {
    const k = l.equipment.name;
    if (!acc[k]) acc[k] = { count: 0, qty: 0 };
    acc[k].count++;
    acc[k].qty += l.qty ?? 0;
    return acc;
  }, {} as Record<string, { count: number; qty: number }>);

  // 작업자별
  const byOp = logs.reduce((acc, l) => {
    if (!acc[l.operator]) acc[l.operator] = { count: 0, qty: 0 };
    acc[l.operator].count++;
    acc[l.operator].qty += l.qty ?? 0;
    return acc;
  }, {} as Record<string, { count: number; qty: number }>);

  // ── Excel 다운로드 ──────────────────────────────────────────────────────────
  const downloadExcel = () => {
    const rows = logs.map((l) => ({
      "날짜":       formatDate(l.startAt),
      "장비":       l.equipment.name,
      "작업자":     l.operator,
      "호선/블록":  l.project ? `[${l.project.projectCode}] ${l.project.projectName}` : "",
      "도면번호":   l.drawingNo ?? "",
      "Heat NO":    l.heatNo ?? "",
      "재질":       l.material ?? "",
      "두께(mm)":   l.thickness ?? "",
      "폭(mm)":     l.width ?? "",
      "길이(mm)":   l.length ?? "",
      "수량(매)":   l.qty ?? "",
      "작업시간":   formatDuration(l.startAt, l.endAt),
      "강재중량(kg)": l.steelWeight != null ? l.steelWeight : "",
      "사용중량(kg)": l.useWeight   != null ? l.useWeight   : "",
      "특이사항":   l.memo ?? "",
    }));

    const ws = XLSX.utils.json_to_sheet(rows);

    // 컬럼 폭 자동 설정
    const colWidths = [
      { wch: 8 }, { wch: 14 }, { wch: 8 }, { wch: 16 }, { wch: 14 },
      { wch: 14 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 },
      { wch: 8 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 20 },
    ];
    ws["!cols"] = colWidths;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "절단작업보고서");
    XLSX.writeFile(wb, `절단작업보고서_${fromStr}_${toStr}.xlsx`);
  };

  // ── 인쇄: 상세 내역만 표시 ──────────────────────────────────────────────────
  const handlePrint = () => window.print();

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

      <div className="space-y-4">

        {/* 인쇄 전용 헤더 */}
        <div className="print-only mb-4 pb-3 border-b text-center">
          <h1 className="text-xl font-bold">절단 작업 보고서</h1>
          <p className="text-sm text-gray-600 mt-1">조회기간: {fromStr} ~ {toStr} &nbsp;|&nbsp; 출력일: {new Date().toLocaleDateString("ko-KR")}</p>
        </div>

        {/* 헤더 */}
        <div className="flex items-center justify-between mb-5 no-print">
          <div>
            <h1 className="text-xl font-bold text-gray-900">절단 작업 보고서</h1>
            <p className="text-sm text-gray-500 mt-0.5">완료된 절단 작업 내역 조회 및 출력</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={downloadExcel} className="flex items-center gap-2">
              <FileDown size={15} /> 엑셀 다운로드
            </Button>
            <Button onClick={handlePrint} className="flex items-center gap-2">
              <Printer size={15} /> 인쇄
            </Button>
          </div>
        </div>

        {/* 기간 필터 */}
        <div className="bg-white border rounded-xl p-4 mb-4 no-print">
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

        {/* 요약 카드 */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4 no-print">
          {[
            { label: "총 절단 건수", value: `${logs.length}건`,                color: "text-blue-700 bg-blue-50" },
            { label: "총 수량",      value: `${totalQty.toLocaleString()}매`,   color: "text-green-700 bg-green-50" },
            { label: "강재중량 합계", value: `${totalSteel.toLocaleString()}kg (${(totalSteel/1000).toFixed(3)}t)`, color: "text-orange-700 bg-orange-50" },
            { label: "사용중량 합계", value: `${totalUse.toLocaleString()}kg (${(totalUse/1000).toFixed(3)}t)`,   color: "text-purple-700 bg-purple-50" },
          ].map(({ label, value, color }) => (
            <div key={label} className={`rounded-xl p-4 ${color}`}>
              <p className="text-xs font-medium opacity-70">{label}</p>
              <p className="text-2xl font-bold mt-1">{value}</p>
            </div>
          ))}
        </div>

        {/* 장비 / 작업자 소계 */}
        <div className="grid grid-cols-2 gap-3 mb-4 no-print">
          <div className="bg-white border rounded-xl p-4">
            <h3 className="text-xs font-semibold text-gray-500 mb-2">장비별 집계</h3>
            <table className="w-full text-xs">
              <thead><tr className="text-gray-400 border-b"><th className="text-left py-1">장비</th><th className="text-right py-1">건수</th><th className="text-right py-1">수량</th></tr></thead>
              <tbody className="divide-y">
                {Object.entries(byEq).map(([name, v]) => (
                  <tr key={name}><td className="py-1 font-medium">{name}</td><td className="py-1 text-right">{v.count}건</td><td className="py-1 text-right">{v.qty}매</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="bg-white border rounded-xl p-4">
            <h3 className="text-xs font-semibold text-gray-500 mb-2">작업자별 집계</h3>
            <table className="w-full text-xs">
              <thead><tr className="text-gray-400 border-b"><th className="text-left py-1">작업자</th><th className="text-right py-1">건수</th><th className="text-right py-1">수량</th></tr></thead>
              <tbody className="divide-y">
                {Object.entries(byOp).map(([name, v]) => (
                  <tr key={name}><td className="py-1 font-medium">{name}</td><td className="py-1 text-right">{v.count}건</td><td className="py-1 text-right">{v.qty}매</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── 상세 내역 (인쇄 시 이 부분만 출력) ── */}
        <div className="bg-white border rounded-xl print-table-wrap overflow-x-auto">
          <div className="px-4 py-3 border-b bg-gray-50 no-print">
            <h3 className="text-sm font-semibold text-gray-700">
              작업 상세 내역
              <span className="text-gray-400 font-normal ml-1">({logs.length}건 · {fromStr} ~ {toStr})</span>
            </h3>
          </div>

          {logs.length === 0 ? (
            <p className="text-center py-12 text-gray-400 text-sm">해당 기간에 완료된 작업이 없습니다.</p>
          ) : (
            <table className="w-full text-xs min-w-[1100px]">
              <thead className="bg-gray-50 border-b">
                <tr>
                  {[
                    ["날짜",       "left"],
                    ["장비",       "left"],
                    ["작업자",     "left"],
                    ["호선/블록",  "left"],
                    ["도면번호",   "left"],
                    ["Heat NO",    "left"],
                    ["재질",       "left"],
                    ["두께",       "right"],
                    ["폭×길이",    "right"],
                    ["수량",       "right"],
                    ["작업시간",   "center"],
                    ["강재중량(kg)","right"],
                    ["사용중량(kg)","right"],
                    ["특이사항",   "left"],
                  ].map(([label, align]) => (
                    <th key={label} className={`px-3 py-2 text-gray-500 font-semibold text-${align} whitespace-nowrap`}>
                      {label}
                    </th>
                  ))}
                  <th className="px-3 py-2 no-print"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{formatDate(log.startAt)}</td>
                    <td className="px-3 py-2 font-medium text-gray-800 whitespace-nowrap">{log.equipment.name}</td>
                    <td className="px-3 py-2 text-gray-700">{log.operator}</td>
                    <td className="px-3 py-2 text-gray-600 text-[11px] whitespace-nowrap">
                      {log.project ? `[${log.project.projectCode}] ${log.project.projectName}` : "-"}
                    </td>
                    <td className="px-3 py-2 font-mono text-gray-800">{log.drawingNo ?? "-"}</td>
                    <td className="px-3 py-2 font-mono text-blue-700">{log.heatNo || "-"}</td>
                    <td className="px-3 py-2">
                      {log.material
                        ? <span className="px-1.5 py-0.5 bg-slate-100 rounded font-medium">{log.material}</span>
                        : <span className="text-gray-400">-</span>}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-700">{log.thickness ? `${log.thickness}t` : "-"}</td>
                    <td className="px-3 py-2 text-right text-gray-700 whitespace-nowrap">
                      {log.width && log.length ? `${log.width.toLocaleString()} × ${log.length.toLocaleString()}` : "-"}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-gray-800">{log.qty ?? "-"}</td>
                    <td className="px-3 py-2 text-center text-gray-500 whitespace-nowrap">
                      <div>{formatTime(log.startAt)} ~ {log.endAt ? formatTime(log.endAt) : "-"}</div>
                      <div className="text-green-600 font-medium">{formatDuration(log.startAt, log.endAt)}</div>
                    </td>
                    <td className="px-3 py-2 text-right text-gray-700">
                      {log.steelWeight != null ? log.steelWeight.toLocaleString() : "-"}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-700">
                      {log.useWeight != null ? log.useWeight.toLocaleString() : "-"}
                    </td>
                    <td className="px-3 py-2 text-gray-400 max-w-[120px] truncate">{log.memo ?? "-"}</td>
                    <td className="px-3 py-2 no-print">
                      <button
                        onClick={() => deleteLog(log.id)}
                        disabled={deletingId === log.id}
                        className="p-1 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded disabled:opacity-40"
                        title="삭제 (강재 상태 대기로 복원)"
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 border-t font-semibold text-xs">
                <tr>
                  <td colSpan={9} className="px-3 py-2 text-gray-500">합계 ({logs.length}건)</td>
                  <td className="px-3 py-2 text-right text-gray-800">{totalQty.toLocaleString()}매</td>
                  <td className="px-3 py-2"></td>
                  <td className="px-3 py-2 text-right text-gray-800">{totalSteel.toLocaleString()}kg<br/><span className="text-xs text-gray-500">({(totalSteel/1000).toFixed(3)}t)</span></td>
                  <td className="px-3 py-2 text-right text-gray-800">{totalUse.toLocaleString()}kg<br/><span className="text-xs text-gray-500">({(totalUse/1000).toFixed(3)}t)</span></td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>
    </>
  );
}

"use client";

import { useEffect, useState } from "react";
import * as XLSX from "xlsx";
import { BarChart3, Calendar, RefreshCw, Printer, Download } from "lucide-react";

const DEPT_LABELS: Record<string, string> = { CUTTING: "절단", FACILITY: "공무" };
const DEPT_COLORS: Record<string, string> = {
  CUTTING:  "bg-blue-100 text-blue-700",
  FACILITY: "bg-purple-100 text-purple-700",
};

interface StatItem {
  id?: number;
  name: string;
  subCategory: string | null;
  department: string | null;
  unit: string | null;
}
interface StatRow {
  item: StatItem;
  inboundCurrent:  number;
  inboundDiff:     number;
  outboundCurrent: number;
  outboundDiff:    number;
}

function DiffBadge({ value }: { value: number }) {
  if (value === 0) return <span className="text-gray-400 px-2 py-0.5 bg-gray-50 rounded font-mono text-xs">동일</span>;
  if (value > 0)   return <span className="text-red-600 px-2 py-0.5 bg-red-50 border border-red-100 rounded text-xs">+{value}</span>;
  return                  <span className="text-emerald-600 px-2 py-0.5 bg-emerald-50 border border-emerald-100 rounded text-xs">{value}</span>;
}

export default function SupplyStatsPage() {
  const today = new Date();
  const [month, setMonth]     = useState(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`);
  const [data, setData]       = useState<StatRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/supply/stats?month=${month}`);
      const json = await res.json();
      if (json.success) setData(json.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchStats(); }, [month]);

  /* ── 엑셀 다운로드 ── */
  const downloadExcel = () => {
    if (data.length === 0) { alert("다운로드할 데이터가 없습니다."); return; }
    const rows = data.map(r => ({
      "관리주체":        DEPT_LABELS[r.item.department ?? ""] ?? r.item.department ?? "",
      "품명":            r.item.name,
      "분류":            r.item.subCategory ?? "",
      "선택월 입고":     r.inboundCurrent,
      "입고 전월대비증감": r.inboundDiff,
      "선택월 출고":     r.outboundCurrent,
      "출고 전월대비증감": r.outboundDiff,
      "단위":            r.item.unit ?? "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [{ wch: 8 }, { wch: 22 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 8 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `${month} 월별통계`);
    XLSX.writeFile(wb, `소모품_월별통계_${month}.xlsx`);
  };

  /* ── 인쇄 (A4) ── */
  const printReport = () => {
    if (data.length === 0) { alert("출력할 데이터가 없습니다."); return; }
    const rowsHtml = data.map((r, i) => {
      const dept = DEPT_LABELS[r.item.department ?? ""] ?? r.item.department ?? "";
      const fmtDiff = (v: number) => {
        if (v === 0) return `<span class="diff-zero">동일</span>`;
        if (v > 0)   return `<span class="diff-up">+${v}</span>`;
        return            `<span class="diff-down">${v}</span>`;
      };
      return `<tr class="${i % 2 === 0 ? "even" : ""}">
        <td class="ctr">${dept}</td>
        <td class="bold">${r.item.name}</td>
        <td>${r.item.subCategory ?? "-"}</td>
        <td class="num inb">${r.inboundCurrent}</td>
        <td class="ctr">${fmtDiff(r.inboundDiff)}</td>
        <td class="num out">${r.outboundCurrent}</td>
        <td class="ctr">${fmtDiff(r.outboundDiff)}</td>
        <td class="ctr unit">${r.item.unit ?? "-"}</td>
      </tr>`;
    }).join("");

    const totalIn  = data.reduce((s, r) => s + r.inboundCurrent,  0);
    const totalOut = data.reduce((s, r) => s + r.outboundCurrent, 0);

    const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8"/>
<title>소모품 월별 통계 - ${month}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: "Malgun Gothic", "맑은 고딕", sans-serif; font-size: 10.5px; color: #111; padding: 14px; }
  .header { text-align: center; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 2px solid #1e3a5f; }
  h1 { font-size: 18px; font-weight: bold; color: #1e3a5f; }
  .meta { font-size: 10px; color: #666; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #1e3a5f; color: #fff; padding: 6px 4px; font-size: 10px; text-align: center; border: 1px solid #1e3a5f; font-weight: bold; }
  td { padding: 5px 4px; border: 1px solid #ccc; vertical-align: middle; font-size: 10.5px; }
  td.ctr  { text-align: center; }
  td.num  { text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; }
  td.bold { font-weight: 600; color: #111; }
  td.inb  { color: #047857; }
  td.out  { color: #b45309; }
  td.unit { color: #888; font-size: 9.5px; }
  tr.even { background: #f7fafc; }
  .diff-zero { color: #888; }
  .diff-up   { color: #b91c1c; font-weight: 600; }
  .diff-down { color: #047857; font-weight: 600; }
  tfoot td { background: #e2e8f0; font-weight: bold; padding: 6px 4px; }
  .summary { text-align: right; margin-top: 8px; font-size: 9.5px; color: #555; }
  @page { margin: 12mm; size: A4 portrait; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
  <div class="header">
    <h1>소모품 월별 통계 보고서</h1>
    <p class="meta">대상 월: ${month}  |  출력일시: ${new Date().toLocaleString("ko-KR")}  |  총 ${data.length}품목</p>
  </div>
  <table>
    <thead>
      <tr>
        <th style="width:8%">관리주체</th>
        <th style="width:22%">품명</th>
        <th style="width:14%">분류</th>
        <th style="width:11%">선택월 입고</th>
        <th style="width:13%">입고 전월대비증감</th>
        <th style="width:11%">선택월 출고</th>
        <th style="width:13%">출고 전월대비증감</th>
        <th style="width:8%">단위</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
    <tfoot>
      <tr>
        <td colspan="3" class="ctr">합계 (${data.length}품목)</td>
        <td class="num inb">${totalIn}</td>
        <td></td>
        <td class="num out">${totalOut}</td>
        <td colspan="2"></td>
      </tr>
    </tfoot>
  </table>
  <p class="summary">CNC 절단 파트 ERP — 구매/자재 월별 통계</p>
  <script>window.onload = () => { window.print(); }<\/script>
</body>
</html>`;

    const win = window.open("", "_blank", "width=1100,height=850");
    if (win) { win.document.write(html); win.document.close(); }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
          <BarChart3 size={24} className="text-blue-600" />
          월별 통계
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          소모품 전용 통합 통계 — 선택월의 입고·출고와 전월 대비 증감을 한 시트에서 확인합니다.
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-3 bg-gray-50/50">
          {/* 월 선택 */}
          <div className="flex items-center gap-2 relative bg-white shadow-sm rounded-lg border border-gray-200">
            <Calendar size={14} className="absolute left-3 text-gray-400" />
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="pl-9 pr-3 py-1.5 h-9 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 bg-transparent"
            />
          </div>

          {/* 액션 버튼 */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 mr-2">총 {data.length}품목</span>
            <button
              onClick={downloadExcel}
              disabled={loading || data.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
            >
              <Download size={14} /> 엑셀 다운로드
            </button>
            <button
              onClick={printReport}
              disabled={loading || data.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gray-800 text-white rounded-lg hover:bg-gray-900 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
            >
              <Printer size={14} /> A4 인쇄
            </button>
          </div>
        </div>

        <div className="overflow-x-auto min-h-[400px]">
          <table className="w-full text-sm text-left">
            <thead className="bg-[#f8fafc] border-b border-gray-200 text-gray-600">
              <tr>
                <th className="px-3 py-3 font-semibold text-xs tracking-wider">관리주체</th>
                <th className="px-3 py-3 font-semibold text-xs tracking-wider">품명</th>
                <th className="px-3 py-3 font-semibold text-xs tracking-wider">분류</th>
                <th className="px-3 py-3 font-semibold text-xs tracking-wider text-right text-emerald-700">선택월 입고</th>
                <th className="px-3 py-3 font-semibold text-xs tracking-wider text-center">입고 전월대비증감</th>
                <th className="px-3 py-3 font-semibold text-xs tracking-wider text-right text-orange-700">선택월 출고</th>
                <th className="px-3 py-3 font-semibold text-xs tracking-wider text-center">출고 전월대비증감</th>
                <th className="px-3 py-3 font-semibold text-xs tracking-wider text-center">단위</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-5 py-32 text-center text-gray-400">
                    <RefreshCw className="animate-spin text-blue-500 mx-auto mb-3" size={28} />
                    데이터 갱신 중...
                  </td>
                </tr>
              ) : data.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-32 text-center text-gray-400 bg-gray-50/20">
                    <p className="font-medium text-gray-500">선택하신 기준 월({month})에 해당하는 데이터가 없습니다.</p>
                  </td>
                </tr>
              ) : (
                data.map((stat, i) => (
                  <tr key={i} className="hover:bg-blue-50/20 transition-colors">
                    <td className="px-3 py-3">
                      {stat.item?.department && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${DEPT_COLORS[stat.item.department] || "bg-gray-100 text-gray-600"}`}>
                          {DEPT_LABELS[stat.item.department] || stat.item.department}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 font-bold text-gray-900">{stat.item?.name}</td>
                    <td className="px-3 py-3 text-gray-500">{stat.item?.subCategory || "-"}</td>
                    <td className="px-3 py-3 text-right font-black text-emerald-700">{stat.inboundCurrent}</td>
                    <td className="px-3 py-3 text-center"><DiffBadge value={stat.inboundDiff} /></td>
                    <td className="px-3 py-3 text-right font-black text-orange-700">{stat.outboundCurrent}</td>
                    <td className="px-3 py-3 text-center"><DiffBadge value={stat.outboundDiff} /></td>
                    <td className="px-3 py-3 text-center text-gray-400 text-xs font-medium">{stat.item?.unit}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

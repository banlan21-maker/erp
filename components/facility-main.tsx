"use client";

import { useState, useEffect, useCallback } from "react";
import * as XLSX from "xlsx";
import { Wrench, Calendar, RefreshCw, Download, Printer, Flame, Wind, Trash2 } from "lucide-react";

const DAYS = ["일", "월", "화", "수", "목", "금", "토"];
function getNowKST() { return new Date(Date.now() + 9 * 3600000); }
function getDayStr(dateStr: string) { return DAYS[new Date(dateStr + "T12:00:00").getDay()]; }
function isWeekend(dateStr: string) { const d = new Date(dateStr + "T12:00:00").getDay(); return d === 0 || d === 6; }

interface GasRow {
  id: string; date: string; time: string;
  o2Pressure: number | null; o2Charge: number | null;
  lpgPressure: number | null; lpgCharge: number | null;
  co2Pressure: number | null; co2Charge: number | null;
  memo: string | null; recordedBy: string | null;
}
interface CompRow {
  id: string; date: string; time: string;
  runtime1: number | null; runtime2: number | null; runtime3: number | null;
  pressure1: number | null; pressure2: number | null; pressure3: number | null;
  temp1: number | null; temp2: number | null; temp3: number | null;
  visual1: string | null; visual2: string | null; visual3: string | null;
  memo: string | null; recordedBy: string | null;
}

const n = (v: number | null) => (v == null ? "-" : String(v));
const s = (v: string | null) => v || "-";

export default function FacilityMain() {
  const now = getNowKST();
  const [tab, setTab] = useState<"gas" | "compressor">("gas");
  const [year, setYear]   = useState(String(now.getUTCFullYear()));
  const [month, setMonth] = useState(String(now.getUTCMonth() + 1));
  const [gasRows, setGasRows]   = useState<GasRow[]>([]);
  const [compRows, setCompRows] = useState<CompRow[]>([]);
  const [loading, setLoading]   = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const url = tab === "gas" ? "/api/facility/gas" : "/api/facility/compressor";
      const r = await fetch(`${url}?year=${year}&month=${month}`);
      const d = await r.json();
      if (d.success) {
        if (tab === "gas") setGasRows(d.data); else setCompRows(d.data);
      }
    } finally { setLoading(false); }
  }, [tab, year, month]);

  useEffect(() => { load(); }, [load]);

  const ym = `${year}-${String(month).padStart(2, "0")}`;

  const deleteRow = async (id: string) => {
    if (!confirm("이 점검 기록을 삭제하시겠습니까?")) return;
    const url = tab === "gas" ? `/api/facility/gas/${id}` : `/api/facility/compressor/${id}`;
    const r = await fetch(url, { method: "DELETE" });
    const d = await r.json();
    if (d.success) load(); else alert(d.error ?? "삭제 실패");
  };

  /* ── 엑셀 다운로드 ── */
  const downloadExcel = () => {
    const wb = XLSX.utils.book_new();
    if (tab === "gas") {
      if (gasRows.length === 0) { alert("다운로드할 데이터가 없습니다."); return; }
      const data = [
        [`가스설비 점검일지 ${ym}`],
        ["날짜", "요일", "시간", "액화산소 압력", "액화산소 충전량", "LPG 압력", "LPG 충전량", "CO2 압력", "CO2 충전량", "비고", "점검자"],
        ...gasRows.map(r => [
          r.date.slice(5), getDayStr(r.date), r.time,
          n(r.o2Pressure), n(r.o2Charge), n(r.lpgPressure), n(r.lpgCharge), n(r.co2Pressure), n(r.co2Charge),
          r.memo ?? "", r.recordedBy ?? "",
        ]),
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(data), "가스설비");
      XLSX.writeFile(wb, `가스설비_점검일지_${ym}.xlsx`);
    } else {
      if (compRows.length === 0) { alert("다운로드할 데이터가 없습니다."); return; }
      const data = [
        [`컴프레셔 점검일지 ${ym}`],
        ["날짜", "요일", "시간",
         "운전시간 1호", "운전시간 2호", "운전시간 3호",
         "토출압력 1호", "토출압력 2호", "토출압력 3호",
         "온도 1호", "온도 2호", "온도 3호",
         "외관검사 1호", "외관검사 2호", "외관검사 3호", "비고", "점검자"],
        ...compRows.map(r => [
          r.date.slice(5), getDayStr(r.date), r.time,
          n(r.runtime1), n(r.runtime2), n(r.runtime3),
          n(r.pressure1), n(r.pressure2), n(r.pressure3),
          n(r.temp1), n(r.temp2), n(r.temp3),
          s(r.visual1), s(r.visual2), s(r.visual3),
          r.memo ?? "", r.recordedBy ?? "",
        ]),
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(data), "컴프레셔");
      XLSX.writeFile(wb, `컴프레셔_점검일지_${ym}.xlsx`);
    }
  };

  /* ── 인쇄 (A4 가로) ── */
  const printReport = () => {
    const isGas = tab === "gas";
    if (isGas && gasRows.length === 0) { alert("출력할 데이터가 없습니다."); return; }
    if (!isGas && compRows.length === 0) { alert("출력할 데이터가 없습니다."); return; }

    let head = "";
    let body = "";
    if (isGas) {
      head = `
        <tr>
          <th rowspan="2">날짜</th><th rowspan="2">요일</th><th rowspan="2">시간</th>
          <th colspan="2">액화산소</th><th colspan="2">LPG</th><th colspan="2">CO2</th>
          <th rowspan="2">비고</th><th rowspan="2">점검자</th>
        </tr>
        <tr><th>압력</th><th>충전량</th><th>압력</th><th>충전량</th><th>압력</th><th>충전량</th></tr>`;
      body = gasRows.map((r, i) => `
        <tr class="${i % 2 ? "even" : ""} ${isWeekend(r.date) ? "we" : ""}">
          <td>${r.date.slice(5)}</td><td>${getDayStr(r.date)}</td><td>${r.time}</td>
          <td class="num">${n(r.o2Pressure)}</td><td class="num">${n(r.o2Charge)}</td>
          <td class="num">${n(r.lpgPressure)}</td><td class="num">${n(r.lpgCharge)}</td>
          <td class="num">${n(r.co2Pressure)}</td><td class="num">${n(r.co2Charge)}</td>
          <td class="memo">${r.memo ?? ""}</td><td>${r.recordedBy ?? ""}</td>
        </tr>`).join("");
    } else {
      head = `
        <tr>
          <th rowspan="2">날짜</th><th rowspan="2">요일</th><th rowspan="2">시간</th>
          <th colspan="3">운전시간</th><th colspan="3">토출압력</th><th colspan="3">온도</th><th colspan="3">외관검사</th>
          <th rowspan="2">비고</th>
        </tr>
        <tr>
          <th>1호</th><th>2호</th><th>3호</th>
          <th>1호</th><th>2호</th><th>3호</th>
          <th>1호</th><th>2호</th><th>3호</th>
          <th>1호</th><th>2호</th><th>3호</th>
        </tr>`;
      body = compRows.map((r, i) => `
        <tr class="${i % 2 ? "even" : ""} ${isWeekend(r.date) ? "we" : ""}">
          <td>${r.date.slice(5)}</td><td>${getDayStr(r.date)}</td><td>${r.time}</td>
          <td class="num">${n(r.runtime1)}</td><td class="num">${n(r.runtime2)}</td><td class="num">${n(r.runtime3)}</td>
          <td class="num">${n(r.pressure1)}</td><td class="num">${n(r.pressure2)}</td><td class="num">${n(r.pressure3)}</td>
          <td class="num">${n(r.temp1)}</td><td class="num">${n(r.temp2)}</td><td class="num">${n(r.temp3)}</td>
          <td>${s(r.visual1)}</td><td>${s(r.visual2)}</td><td>${s(r.visual3)}</td>
          <td class="memo">${r.memo ?? ""}</td>
        </tr>`).join("");
    }

    const html = `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"/>
<title>${isGas ? "가스설비" : "컴프레셔"} 점검일지 ${ym}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:"Malgun Gothic",sans-serif;font-size:10px;color:#111;padding:14px}
  .header{text-align:center;margin-bottom:10px;padding-bottom:6px;border-bottom:2px solid #1e3a5f}
  h1{font-size:17px;color:#1e3a5f}
  .meta{font-size:10px;color:#666;margin-top:3px}
  table{width:100%;border-collapse:collapse}
  th{background:#1e3a5f;color:#fff;padding:4px 3px;font-size:9px;text-align:center;border:1px solid #1e3a5f}
  td{padding:3px;border:1px solid #ccc;text-align:center;font-size:9.5px}
  td.num{text-align:right;font-variant-numeric:tabular-nums}
  td.memo{text-align:left}
  tr.even{background:#f7fafc}
  tr.we td{color:#b91c1c}
  @page{margin:10mm;size:A4 landscape}
</style></head><body>
  <div class="header">
    <h1>${isGas ? "가스설비" : "컴프레셔"} 일일점검일지</h1>
    <p class="meta">대상 월: ${ym} | 출력일시: ${new Date().toLocaleString("ko-KR")} | 총 ${isGas ? gasRows.length : compRows.length}건</p>
  </div>
  <table><thead>${head}</thead><tbody>${body}</tbody></table>
  <script>window.onload=()=>window.print()<\/script>
</body></html>`;
    const win = window.open("", "_blank", "width=1200,height=800");
    if (win) { win.document.write(html); win.document.close(); }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
          <Wrench size={24} className="text-blue-600" /> 시설관리
        </h2>
        <p className="text-sm text-gray-500 mt-1">가스설비·컴프레셔 일일점검 기록을 월별로 확인하고 출력합니다.</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {/* 탭 */}
        <div className="flex border-b border-gray-100 bg-gray-50/50">
          <button onClick={() => setTab("gas")}
            className={`flex items-center gap-1.5 px-5 py-3 text-sm font-bold transition-colors ${tab === "gas" ? "text-orange-700 border-b-2 border-orange-500 bg-white" : "text-gray-500 hover:bg-gray-50"}`}>
            <Flame size={15} /> 가스설비
          </button>
          <button onClick={() => setTab("compressor")}
            className={`flex items-center gap-1.5 px-5 py-3 text-sm font-bold transition-colors ${tab === "compressor" ? "text-blue-700 border-b-2 border-blue-500 bg-white" : "text-gray-500 hover:bg-gray-50"}`}>
            <Wind size={15} /> 컴프레셔
          </button>
        </div>

        {/* 컨트롤 */}
        <div className="p-4 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 relative bg-white shadow-sm rounded-lg border border-gray-200">
              <Calendar size={14} className="absolute left-3 text-gray-400" />
              <input type="number" value={year} onChange={e => setYear(e.target.value)} className="w-20 pl-8 pr-2 py-1.5 h-9 text-sm bg-transparent focus:outline-none" />
            </div>
            <span className="text-gray-500 text-sm">년</span>
            <select value={month} onChange={e => setMonth(e.target.value)} className="h-9 px-3 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500">
              {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}월</option>)}
            </select>
            <button onClick={load} className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-500"><RefreshCw size={14} /></button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 mr-1">총 {tab === "gas" ? gasRows.length : compRows.length}건</span>
            <button onClick={downloadExcel} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">
              <Download size={14} /> 엑셀
            </button>
            <button onClick={printReport} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gray-800 text-white rounded-lg hover:bg-gray-900">
              <Printer size={14} /> A4 인쇄
            </button>
          </div>
        </div>

        {/* 테이블 */}
        <div className="overflow-x-auto">
          {tab === "gas" ? (
            <table className="w-full text-sm text-center whitespace-nowrap">
              <thead className="bg-[#f8fafc] border-b border-gray-200 text-gray-600">
                <tr>
                  <th rowSpan={2} className="px-3 py-2 text-xs font-semibold border-r border-gray-100">날짜</th>
                  <th rowSpan={2} className="px-2 py-2 text-xs font-semibold border-r border-gray-100">요일</th>
                  <th rowSpan={2} className="px-3 py-2 text-xs font-semibold border-r border-gray-100">시간</th>
                  <th colSpan={2} className="px-3 py-1.5 text-xs font-semibold text-cyan-700 border-r border-gray-100">액화산소</th>
                  <th colSpan={2} className="px-3 py-1.5 text-xs font-semibold text-orange-700 border-r border-gray-100">LPG</th>
                  <th colSpan={2} className="px-3 py-1.5 text-xs font-semibold text-purple-700 border-r border-gray-100">CO2</th>
                  <th rowSpan={2} className="px-3 py-2 text-xs font-semibold border-r border-gray-100">비고</th>
                  <th rowSpan={2} className="px-3 py-2 text-xs font-semibold">점검자</th>
                  <th rowSpan={2} className="px-2 py-2 text-xs font-semibold"></th>
                </tr>
                <tr className="text-[11px] text-gray-500">
                  <th className="px-2 py-1 font-medium">압력</th><th className="px-2 py-1 font-medium border-r border-gray-100">충전량</th>
                  <th className="px-2 py-1 font-medium">압력</th><th className="px-2 py-1 font-medium border-r border-gray-100">충전량</th>
                  <th className="px-2 py-1 font-medium">압력</th><th className="px-2 py-1 font-medium border-r border-gray-100">충전량</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr><td colSpan={12} className="py-12 text-gray-400"><RefreshCw className="animate-spin mx-auto mb-2 text-blue-500" size={24} />불러오는 중...</td></tr>
                ) : gasRows.length === 0 ? (
                  <tr><td colSpan={12} className="py-16 text-gray-400">{ym} 점검 기록이 없습니다.</td></tr>
                ) : gasRows.map(r => (
                  <tr key={r.id} className={isWeekend(r.date) ? "bg-red-50/40 text-red-700" : "hover:bg-blue-50/30"}>
                    <td className="px-3 py-2.5 font-mono">{r.date.slice(5)}</td>
                    <td className="px-2 py-2.5 font-semibold">{getDayStr(r.date)}</td>
                    <td className="px-3 py-2.5 font-mono">{r.time}</td>
                    <td className="px-2 py-2.5 text-right">{n(r.o2Pressure)}</td><td className="px-2 py-2.5 text-right">{n(r.o2Charge)}</td>
                    <td className="px-2 py-2.5 text-right">{n(r.lpgPressure)}</td><td className="px-2 py-2.5 text-right">{n(r.lpgCharge)}</td>
                    <td className="px-2 py-2.5 text-right">{n(r.co2Pressure)}</td><td className="px-2 py-2.5 text-right">{n(r.co2Charge)}</td>
                    <td className="px-3 py-2.5 text-left text-xs text-gray-500">{r.memo ?? ""}</td>
                    <td className="px-3 py-2.5 text-xs text-gray-500">{r.recordedBy ?? ""}</td>
                    <td className="px-2 py-2.5"><button onClick={() => deleteRow(r.id)} className="text-gray-300 hover:text-red-500"><Trash2 size={14} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-sm text-center whitespace-nowrap">
              <thead className="bg-[#f8fafc] border-b border-gray-200 text-gray-600">
                <tr>
                  <th rowSpan={2} className="px-3 py-2 text-xs font-semibold border-r border-gray-100">날짜</th>
                  <th rowSpan={2} className="px-2 py-2 text-xs font-semibold border-r border-gray-100">요일</th>
                  <th rowSpan={2} className="px-3 py-2 text-xs font-semibold border-r border-gray-100">시간</th>
                  <th colSpan={3} className="px-3 py-1.5 text-xs font-semibold text-blue-700 border-r border-gray-100">운전시간</th>
                  <th colSpan={3} className="px-3 py-1.5 text-xs font-semibold text-orange-700 border-r border-gray-100">토출압력</th>
                  <th colSpan={3} className="px-3 py-1.5 text-xs font-semibold text-red-700 border-r border-gray-100">온도</th>
                  <th colSpan={3} className="px-3 py-1.5 text-xs font-semibold text-emerald-700 border-r border-gray-100">외관검사</th>
                  <th rowSpan={2} className="px-3 py-2 text-xs font-semibold">비고</th>
                  <th rowSpan={2} className="px-2 py-2 text-xs font-semibold"></th>
                </tr>
                <tr className="text-[11px] text-gray-500">
                  {["1호","2호","3호","1호","2호","3호","1호","2호","3호","1호","2호","3호"].map((h, i) => (
                    <th key={i} className={`px-2 py-1 font-medium ${i % 3 === 2 ? "border-r border-gray-100" : ""}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr><td colSpan={18} className="py-12 text-gray-400"><RefreshCw className="animate-spin mx-auto mb-2 text-blue-500" size={24} />불러오는 중...</td></tr>
                ) : compRows.length === 0 ? (
                  <tr><td colSpan={18} className="py-16 text-gray-400">{ym} 점검 기록이 없습니다.</td></tr>
                ) : compRows.map(r => (
                  <tr key={r.id} className={isWeekend(r.date) ? "bg-red-50/40 text-red-700" : "hover:bg-blue-50/30"}>
                    <td className="px-3 py-2.5 font-mono">{r.date.slice(5)}</td>
                    <td className="px-2 py-2.5 font-semibold">{getDayStr(r.date)}</td>
                    <td className="px-3 py-2.5 font-mono">{r.time}</td>
                    <td className="px-2 py-2.5 text-right">{n(r.runtime1)}</td><td className="px-2 py-2.5 text-right">{n(r.runtime2)}</td><td className="px-2 py-2.5 text-right">{n(r.runtime3)}</td>
                    <td className="px-2 py-2.5 text-right">{n(r.pressure1)}</td><td className="px-2 py-2.5 text-right">{n(r.pressure2)}</td><td className="px-2 py-2.5 text-right">{n(r.pressure3)}</td>
                    <td className="px-2 py-2.5 text-right">{n(r.temp1)}</td><td className="px-2 py-2.5 text-right">{n(r.temp2)}</td><td className="px-2 py-2.5 text-right">{n(r.temp3)}</td>
                    <td className="px-2 py-2.5">{s(r.visual1)}</td><td className="px-2 py-2.5">{s(r.visual2)}</td><td className="px-2 py-2.5">{s(r.visual3)}</td>
                    <td className="px-3 py-2.5 text-left text-xs text-gray-500">{r.memo ?? ""}</td>
                    <td className="px-2 py-2.5"><button onClick={() => deleteRow(r.id)} className="text-gray-300 hover:text-red-500"><Trash2 size={14} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

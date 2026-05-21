"use client";

import { useState, useEffect, useCallback } from "react";
import * as XLSX from "xlsx";
import { Wrench, Calendar, RefreshCw, Download, Printer, Flame, Wind, Trash2, Pencil, X, Save } from "lucide-react";

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

  /* ── 수정 모달 ── */
  const [editGas, setEditGas]   = useState<GasRow | null>(null);
  const [editComp, setEditComp] = useState<CompRow | null>(null);
  const [saving, setSaving]     = useState(false);

  const toStr = (v: number | null) => (v == null ? "" : String(v));

  const saveGas = async () => {
    if (!editGas) return;
    setSaving(true);
    try {
      const r = await fetch(`/api/facility/gas/${editGas.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editGas),
      });
      const d = await r.json();
      if (!d.success) { alert(d.error ?? "수정 실패"); return; }
      setEditGas(null); load();
    } finally { setSaving(false); }
  };

  const saveComp = async () => {
    if (!editComp) return;
    setSaving(true);
    try {
      const r = await fetch(`/api/facility/compressor/${editComp.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editComp),
      });
      const d = await r.json();
      if (!d.success) { alert(d.error ?? "수정 실패"); return; }
      setEditComp(null); load();
    } finally { setSaving(false); }
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
              <thead className="bg-[#f1f5f9] border-b-2 border-gray-300 text-gray-600">
                <tr>
                  <th rowSpan={2} className="px-3 py-2 text-xs font-semibold text-center border-r border-gray-300">날짜</th>
                  <th rowSpan={2} className="px-2 py-2 text-xs font-semibold text-center border-r border-gray-300">요일</th>
                  <th rowSpan={2} className="px-3 py-2 text-xs font-semibold text-center border-r border-gray-300">시간</th>
                  <th colSpan={2} className="px-3 py-1.5 text-xs font-semibold text-center text-cyan-700 border-r border-gray-300">액화산소</th>
                  <th colSpan={2} className="px-3 py-1.5 text-xs font-semibold text-center text-orange-700 border-r border-gray-300">LPG</th>
                  <th colSpan={2} className="px-3 py-1.5 text-xs font-semibold text-center text-purple-700 border-r border-gray-300">CO2</th>
                  <th rowSpan={2} className="px-3 py-2 text-xs font-semibold text-center border-r border-gray-300">비고</th>
                  <th rowSpan={2} className="px-3 py-2 text-xs font-semibold text-center border-r border-gray-300">점검자</th>
                  <th rowSpan={2} className="px-2 py-2 text-xs font-semibold text-center">관리</th>
                </tr>
                <tr className="text-[11px] text-gray-500">
                  <th className="px-2 py-1 font-medium text-center border-r border-gray-200">압력</th><th className="px-2 py-1 font-medium text-center border-r border-gray-300">충전량</th>
                  <th className="px-2 py-1 font-medium text-center border-r border-gray-200">압력</th><th className="px-2 py-1 font-medium text-center border-r border-gray-300">충전량</th>
                  <th className="px-2 py-1 font-medium text-center border-r border-gray-200">압력</th><th className="px-2 py-1 font-medium text-center border-r border-gray-300">충전량</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {loading ? (
                  <tr><td colSpan={12} className="py-12 text-gray-400"><RefreshCw className="animate-spin mx-auto mb-2 text-blue-500" size={24} />불러오는 중...</td></tr>
                ) : gasRows.length === 0 ? (
                  <tr><td colSpan={12} className="py-16 text-gray-400">{ym} 점검 기록이 없습니다.</td></tr>
                ) : gasRows.map(r => (
                  <tr key={r.id} className={isWeekend(r.date) ? "bg-red-50/40 text-red-700" : "hover:bg-blue-50/30"}>
                    <td className="px-3 py-2.5 font-mono text-center border-r border-gray-200">{r.date.slice(5)}</td>
                    <td className="px-2 py-2.5 font-semibold text-center border-r border-gray-200">{getDayStr(r.date)}</td>
                    <td className="px-3 py-2.5 font-mono text-center border-r border-gray-300">{r.time}</td>
                    <td className="px-2 py-2.5 text-center border-r border-gray-200">{n(r.o2Pressure)}</td><td className="px-2 py-2.5 text-center border-r border-gray-300">{n(r.o2Charge)}</td>
                    <td className="px-2 py-2.5 text-center border-r border-gray-200">{n(r.lpgPressure)}</td><td className="px-2 py-2.5 text-center border-r border-gray-300">{n(r.lpgCharge)}</td>
                    <td className="px-2 py-2.5 text-center border-r border-gray-200">{n(r.co2Pressure)}</td><td className="px-2 py-2.5 text-center border-r border-gray-300">{n(r.co2Charge)}</td>
                    <td className="px-3 py-2.5 text-center text-xs text-gray-500 border-r border-gray-200">{r.memo ?? ""}</td>
                    <td className="px-3 py-2.5 text-center text-xs text-gray-500 border-r border-gray-300">{r.recordedBy ?? ""}</td>
                    <td className="px-2 py-2.5">
                      <div className="flex items-center justify-center gap-1.5">
                        <button onClick={() => setEditGas(r)} className="text-gray-400 hover:text-blue-600" title="수정"><Pencil size={14} /></button>
                        <button onClick={() => deleteRow(r.id)} className="text-gray-300 hover:text-red-500" title="삭제"><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-sm text-center whitespace-nowrap">
              <thead className="bg-[#f1f5f9] border-b-2 border-gray-300 text-gray-600">
                <tr>
                  <th rowSpan={2} className="px-3 py-2 text-xs font-semibold text-center border-r border-gray-300">날짜</th>
                  <th rowSpan={2} className="px-2 py-2 text-xs font-semibold text-center border-r border-gray-300">요일</th>
                  <th rowSpan={2} className="px-3 py-2 text-xs font-semibold text-center border-r border-gray-300">시간</th>
                  <th colSpan={3} className="px-3 py-1.5 text-xs font-semibold text-center text-blue-700 border-r border-gray-300">운전시간</th>
                  <th colSpan={3} className="px-3 py-1.5 text-xs font-semibold text-center text-orange-700 border-r border-gray-300">토출압력</th>
                  <th colSpan={3} className="px-3 py-1.5 text-xs font-semibold text-center text-red-700 border-r border-gray-300">온도</th>
                  <th colSpan={3} className="px-3 py-1.5 text-xs font-semibold text-center text-emerald-700 border-r border-gray-300">외관검사</th>
                  <th rowSpan={2} className="px-3 py-2 text-xs font-semibold text-center border-r border-gray-300">비고</th>
                  <th rowSpan={2} className="px-2 py-2 text-xs font-semibold text-center">관리</th>
                </tr>
                <tr className="text-[11px] text-gray-500">
                  {["1호","2호","3호","1호","2호","3호","1호","2호","3호","1호","2호","3호"].map((h, i) => (
                    <th key={i} className={`px-2 py-1 font-medium text-center ${i % 3 === 2 ? "border-r border-gray-300" : "border-r border-gray-200"}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {loading ? (
                  <tr><td colSpan={18} className="py-12 text-gray-400"><RefreshCw className="animate-spin mx-auto mb-2 text-blue-500" size={24} />불러오는 중...</td></tr>
                ) : compRows.length === 0 ? (
                  <tr><td colSpan={18} className="py-16 text-gray-400">{ym} 점검 기록이 없습니다.</td></tr>
                ) : compRows.map(r => (
                  <tr key={r.id} className={isWeekend(r.date) ? "bg-red-50/40 text-red-700" : "hover:bg-blue-50/30"}>
                    <td className="px-3 py-2.5 font-mono text-center border-r border-gray-200">{r.date.slice(5)}</td>
                    <td className="px-2 py-2.5 font-semibold text-center border-r border-gray-200">{getDayStr(r.date)}</td>
                    <td className="px-3 py-2.5 font-mono text-center border-r border-gray-300">{r.time}</td>
                    <td className="px-2 py-2.5 text-center border-r border-gray-200">{n(r.runtime1)}</td><td className="px-2 py-2.5 text-center border-r border-gray-200">{n(r.runtime2)}</td><td className="px-2 py-2.5 text-center border-r border-gray-300">{n(r.runtime3)}</td>
                    <td className="px-2 py-2.5 text-center border-r border-gray-200">{n(r.pressure1)}</td><td className="px-2 py-2.5 text-center border-r border-gray-200">{n(r.pressure2)}</td><td className="px-2 py-2.5 text-center border-r border-gray-300">{n(r.pressure3)}</td>
                    <td className="px-2 py-2.5 text-center border-r border-gray-200">{n(r.temp1)}</td><td className="px-2 py-2.5 text-center border-r border-gray-200">{n(r.temp2)}</td><td className="px-2 py-2.5 text-center border-r border-gray-300">{n(r.temp3)}</td>
                    <td className="px-2 py-2.5 text-center border-r border-gray-200">{s(r.visual1)}</td><td className="px-2 py-2.5 text-center border-r border-gray-200">{s(r.visual2)}</td><td className="px-2 py-2.5 text-center border-r border-gray-300">{s(r.visual3)}</td>
                    <td className="px-3 py-2.5 text-center text-xs text-gray-500 border-r border-gray-300">{r.memo ?? ""}</td>
                    <td className="px-2 py-2.5">
                      <div className="flex items-center justify-center gap-1.5">
                        <button onClick={() => setEditComp(r)} className="text-gray-400 hover:text-blue-600" title="수정"><Pencil size={14} /></button>
                        <button onClick={() => deleteRow(r.id)} className="text-gray-300 hover:text-red-500" title="삭제"><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* 가스설비 수정 모달 */}
      {editGas && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => !saving && setEditGas(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="font-bold text-gray-900 flex items-center gap-2"><Flame size={16} className="text-orange-500" /> 가스설비 점검 수정</h3>
              <button onClick={() => setEditGas(null)} disabled={saving} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs font-semibold text-gray-600 mb-1 block">점검일</label>
                  <input type="date" value={editGas.date} onChange={e => setEditGas({ ...editGas, date: e.target.value })} className="w-full h-9 px-3 border border-gray-300 rounded-lg text-sm" /></div>
                <div><label className="text-xs font-semibold text-gray-600 mb-1 block">시간</label>
                  <input type="time" value={editGas.time} onChange={e => setEditGas({ ...editGas, time: e.target.value })} className="w-full h-9 px-3 border border-gray-300 rounded-lg text-sm" /></div>
              </div>
              {([
                ["액화산소 압력", "o2Pressure"], ["액화산소 충전량", "o2Charge"],
                ["LPG 압력", "lpgPressure"], ["LPG 충전량", "lpgCharge"],
                ["CO2 압력", "co2Pressure"], ["CO2 충전량", "co2Charge"],
              ] as [string, keyof GasRow][]).reduce<[string, keyof GasRow][][]>((acc, cur, i) => {
                if (i % 2 === 0) acc.push([cur]); else acc[acc.length - 1].push(cur);
                return acc;
              }, []).map((pair, pi) => (
                <div key={pi} className="grid grid-cols-2 gap-3">
                  {pair.map(([label, key]) => (
                    <div key={key}>
                      <label className="text-xs font-semibold text-gray-600 mb-1 block">{label}</label>
                      <input type="number" value={toStr(editGas[key] as number | null)}
                        onChange={e => setEditGas({ ...editGas, [key]: e.target.value === "" ? null : Number(e.target.value) })}
                        className="w-full h-9 px-3 border border-gray-300 rounded-lg text-sm text-right" />
                    </div>
                  ))}
                </div>
              ))}
              <div><label className="text-xs font-semibold text-gray-600 mb-1 block">비고</label>
                <input value={editGas.memo ?? ""} onChange={e => setEditGas({ ...editGas, memo: e.target.value })} className="w-full h-9 px-3 border border-gray-300 rounded-lg text-sm" /></div>
              <div><label className="text-xs font-semibold text-gray-600 mb-1 block">점검자</label>
                <input value={editGas.recordedBy ?? ""} onChange={e => setEditGas({ ...editGas, recordedBy: e.target.value })} className="w-full h-9 px-3 border border-gray-300 rounded-lg text-sm" /></div>
            </div>
            <div className="px-5 py-3 border-t border-gray-200 flex justify-end gap-2">
              <button onClick={() => setEditGas(null)} disabled={saving} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">취소</button>
              <button onClick={saveGas} disabled={saving} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                <Save size={13} /> {saving ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 컴프레셔 수정 모달 */}
      {editComp && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => !saving && setEditComp(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white">
              <h3 className="font-bold text-gray-900 flex items-center gap-2"><Wind size={16} className="text-blue-500" /> 컴프레셔 점검 수정</h3>
              <button onClick={() => setEditComp(null)} disabled={saving} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs font-semibold text-gray-600 mb-1 block">점검일</label>
                  <input type="date" value={editComp.date} onChange={e => setEditComp({ ...editComp, date: e.target.value })} className="w-full h-9 px-3 border border-gray-300 rounded-lg text-sm" /></div>
                <div><label className="text-xs font-semibold text-gray-600 mb-1 block">시간</label>
                  <input type="time" value={editComp.time} onChange={e => setEditComp({ ...editComp, time: e.target.value })} className="w-full h-9 px-3 border border-gray-300 rounded-lg text-sm" /></div>
              </div>
              {([
                ["운전시간", ["runtime1", "runtime2", "runtime3"]],
                ["토출압력", ["pressure1", "pressure2", "pressure3"]],
                ["온도", ["temp1", "temp2", "temp3"]],
              ] as [string, (keyof CompRow)[]][]).map(([label, keys]) => (
                <div key={label}>
                  <label className="text-xs font-semibold text-gray-600 mb-1 block">{label} (1·2·3호)</label>
                  <div className="grid grid-cols-3 gap-2">
                    {keys.map((key, i) => (
                      <input key={key} type="number" placeholder={`${i + 1}호`} value={toStr(editComp[key] as number | null)}
                        onChange={e => setEditComp({ ...editComp, [key]: e.target.value === "" ? null : Number(e.target.value) })}
                        className="w-full h-9 px-3 border border-gray-300 rounded-lg text-sm text-right" />
                    ))}
                  </div>
                </div>
              ))}
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">외관검사 (1·2·3호)</label>
                <div className="grid grid-cols-3 gap-2">
                  {(["visual1", "visual2", "visual3"] as (keyof CompRow)[]).map((key, i) => (
                    <select key={key} value={(editComp[key] as string) ?? "양호"}
                      onChange={e => setEditComp({ ...editComp, [key]: e.target.value })}
                      className="w-full h-9 px-2 border border-gray-300 rounded-lg text-sm bg-white">
                      {["양호", "점검요망", "불량"].map(o => <option key={o} value={o}>{i + 1}호 {o}</option>)}
                    </select>
                  ))}
                </div>
              </div>
              <div><label className="text-xs font-semibold text-gray-600 mb-1 block">비고</label>
                <input value={editComp.memo ?? ""} onChange={e => setEditComp({ ...editComp, memo: e.target.value })} className="w-full h-9 px-3 border border-gray-300 rounded-lg text-sm" /></div>
              <div><label className="text-xs font-semibold text-gray-600 mb-1 block">점검자</label>
                <input value={editComp.recordedBy ?? ""} onChange={e => setEditComp({ ...editComp, recordedBy: e.target.value })} className="w-full h-9 px-3 border border-gray-300 rounded-lg text-sm" /></div>
            </div>
            <div className="px-5 py-3 border-t border-gray-200 flex justify-end gap-2 sticky bottom-0 bg-white">
              <button onClick={() => setEditComp(null)} disabled={saving} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">취소</button>
              <button onClick={saveComp} disabled={saving} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                <Save size={13} /> {saving ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import * as XLSX from "xlsx";
import { CreditCard, Calendar, RefreshCw, Download, Printer, Plus, Pencil, Trash2, X, Save, Check, Filter } from "lucide-react";
import ColumnFilterDropdown, { type FilterValue } from "@/components/column-filter-dropdown";

const DAYS = ["일", "월", "화", "수", "목", "금", "토"];
function getNowKST() { return new Date(Date.now() + 9 * 3600000); }
function todayStr() { return getNowKST().toISOString().slice(0, 10); }
function getDayStr(d: string) { return DAYS[new Date(d + "T12:00:00").getDay()]; }

interface Card { id: string; cardNo: string; label: string | null; }
interface Usage {
  id: string; usedDate: string; cardNo: string; category: string | null; detail: string;
  amount: number; userName: string | null; confirmed: boolean; memo: string | null;
}
type UsageForm = {
  usedDate: string; cardNo: string; category: string; detail: string;
  amount: string; userName: string; confirmed: boolean; memo: string;
};

const CATEGORIES = ["사무실", "현장"] as const;

const emptyForm = (): UsageForm => ({
  usedDate: todayStr(), cardNo: "", category: "", detail: "", amount: "", userName: "", confirmed: false, memo: "",
});

export default function PaymentMain() {
  const now = getNowKST();
  const [year, setYear]   = useState(String(now.getUTCFullYear()));
  const [month, setMonth] = useState(String(now.getUTCMonth() + 1));
  const [cards, setCards] = useState<Card[]>([]);
  const [rows, setRows]   = useState<Usage[]>([]);
  const [loading, setLoading] = useState(false);

  const loadCards = useCallback(async () => {
    const r = await fetch("/api/card");
    const d = await r.json();
    if (d.success) setCards(d.data);
  }, []);

  const loadRows = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/card-usage?year=${year}&month=${month}`);
      const d = await r.json();
      if (d.success) setRows(d.data);
    } finally { setLoading(false); }
  }, [year, month]);

  useEffect(() => { loadCards(); }, [loadCards]);
  useEffect(() => { loadRows(); }, [loadRows]);

  const ym = `${year}-${String(month).padStart(2, "0")}`;

  /* ── 컬럼 필터 ── */
  const COLUMNS = useMemo(() => [
    { key: "usedDate", label: "사용일자" },
    { key: "cardNo",   label: "카드번호" },
    { key: "category", label: "구분" },
    { key: "detail",   label: "사용내역" },
    { key: "amount",   label: "금액" },
    { key: "userName", label: "사용자" },
    { key: "confirmed",label: "확인" },
    { key: "memo",     label: "비고" },
  ] as const, []);

  const colValue = useCallback((r: Usage, col: string): string => {
    switch (col) {
      case "usedDate":  return r.usedDate;
      case "cardNo":    return r.cardNo;
      case "category":  return r.category ?? "";
      case "detail":    return r.detail ?? "";
      case "amount":    return String(r.amount);
      case "userName":  return r.userName ?? "";
      case "confirmed": return r.confirmed ? "확인" : "미확인";
      case "memo":      return r.memo ?? "";
      default: return "";
    }
  }, []);

  const [colFilters, setColFilters] = useState<Record<string, string[]>>({});
  const [openFilter, setOpenFilter] = useState<string | null>(null);
  const [filterAnchorEl, setFilterAnchorEl] = useState<HTMLElement | null>(null);

  // 월 바뀌면 필터 초기화
  useEffect(() => { setColFilters({}); }, [year, month]);

  const distinctValues = useMemo(() => {
    const result: Record<string, FilterValue[]> = {};
    for (const c of COLUMNS) {
      const set = new Set<string>();
      let hasEmpty = false;
      for (const r of rows) {
        const v = colValue(r, c.key);
        if (v) set.add(v);
        else hasEmpty = true;
      }
      const arr: FilterValue[] = Array.from(set).sort((a, b) => a.localeCompare(b, "ko")).map(v => ({ value: v, label: v }));
      if (hasEmpty) arr.push({ value: "__EMPTY__", label: "(값 없음)" });
      result[c.key] = arr;
    }
    return result;
  }, [COLUMNS, rows, colValue]);

  const filteredRows = useMemo(() => {
    return rows.filter(r =>
      Object.entries(colFilters).every(([col, values]) => {
        if (values.length === 0) return true;
        const v = colValue(r, col);
        if (values.includes("__EMPTY__") && !v) return true;
        return values.includes(v);
      })
    );
  }, [rows, colFilters, colValue]);

  const activeFilterCount = Object.values(colFilters).filter(v => v.length > 0).length;
  const totalAmount = filteredRows.reduce((s, r) => s + r.amount, 0);

  /* ── 입력/수정 모달 ── */
  const [modal, setModal] = useState<{ mode: "add" | "edit"; id?: string } | null>(null);
  const [form, setForm] = useState<UsageForm>(emptyForm());
  const [saving, setSaving] = useState(false);

  const openAdd = () => { setForm({ ...emptyForm(), cardNo: cards[0]?.cardNo ?? "" }); setModal({ mode: "add" }); };
  const openEdit = (r: Usage) => {
    setForm({ usedDate: r.usedDate, cardNo: r.cardNo, category: r.category ?? "", detail: r.detail, amount: String(r.amount), userName: r.userName ?? "", confirmed: r.confirmed, memo: r.memo ?? "" });
    setModal({ mode: "edit", id: r.id });
  };

  const save = async () => {
    if (!form.cardNo) { alert("카드번호를 선택하세요."); return; }
    if (!form.usedDate) { alert("사용일자를 입력하세요."); return; }
    setSaving(true);
    try {
      const url = modal?.mode === "edit" ? `/api/card-usage/${modal.id}` : "/api/card-usage";
      const method = modal?.mode === "edit" ? "PATCH" : "POST";
      const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const d = await r.json();
      if (!d.success) { alert(d.error ?? "저장 실패"); return; }
      setModal(null); loadRows();
    } finally { setSaving(false); }
  };

  const deleteRow = async (id: string) => {
    if (!confirm("이 사용내역을 삭제하시겠습니까?")) return;
    const r = await fetch(`/api/card-usage/${id}`, { method: "DELETE" });
    const d = await r.json();
    if (d.success) loadRows(); else alert(d.error ?? "삭제 실패");
  };

  const toggleConfirm = async (r: Usage) => {
    await fetch(`/api/card-usage/${r.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmed: !r.confirmed }) });
    loadRows();
  };

  /* ── 카드 관리 모달 ── */
  const [cardModal, setCardModal] = useState(false);
  const [newCardNo, setNewCardNo] = useState("");
  const [cardSaving, setCardSaving] = useState(false);

  const addCard = async () => {
    if (!/^\d{4}$/.test(newCardNo)) { alert("카드번호 4자리를 입력하세요."); return; }
    setCardSaving(true);
    try {
      const r = await fetch("/api/card", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cardNo: newCardNo }) });
      const d = await r.json();
      if (!d.success) { alert(d.error ?? "추가 실패"); return; }
      setNewCardNo(""); loadCards();
    } finally { setCardSaving(false); }
  };

  const deleteCard = async (cardNo: string) => {
    if (!confirm(`카드 '${cardNo}'를 삭제하시겠습니까?\n(기존 사용내역은 유지됩니다)`)) return;
    const r = await fetch(`/api/card?cardNo=${cardNo}`, { method: "DELETE" });
    const d = await r.json();
    if (d.success) loadCards(); else alert(d.error ?? "삭제 실패");
  };

  /* ── 엑셀 ── */
  const downloadExcel = () => {
    if (filteredRows.length === 0) { alert("다운로드할 데이터가 없습니다."); return; }
    const filterTag = activeFilterCount > 0 ? " (필터)" : "";
    const data = [
      [`법인카드 사용대장 ${ym}${filterTag}`],
      ["NO", "사용일자", "요일", "카드번호", "구분", "사용내역", "금액", "사용자", "확인", "비고"],
      ...filteredRows.map((r, i) => [i + 1, r.usedDate, getDayStr(r.usedDate), r.cardNo, r.category ?? "", r.detail, r.amount, r.userName ?? "", r.confirmed ? "확인" : "", r.memo ?? ""]),
      ["", "", "", "", "", "합계", totalAmount, "", "", ""],
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);
    ws["!cols"] = [{ wch: 5 }, { wch: 12 }, { wch: 5 }, { wch: 10 }, { wch: 8 }, { wch: 28 }, { wch: 12 }, { wch: 10 }, { wch: 6 }, { wch: 20 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "법인카드사용대장");
    XLSX.writeFile(wb, `법인카드사용대장_${activeFilterCount > 0 ? "필터" : "전체"}_${ym}.xlsx`);
  };

  /* ── 인쇄 ── */
  const printReport = () => {
    if (filteredRows.length === 0) { alert("출력할 데이터가 없습니다."); return; }
    const body = filteredRows.map((r, i) => `
      <tr class="${i % 2 ? "even" : ""}">
        <td>${i + 1}</td><td>${r.usedDate}</td><td>${getDayStr(r.usedDate)}</td>
        <td>${r.cardNo}</td><td>${r.category ?? ""}</td><td class="left">${r.detail}</td>
        <td class="num">${r.amount.toLocaleString()}</td>
        <td>${r.userName ?? ""}</td><td>${r.confirmed ? "✔" : ""}</td>
        <td class="left">${r.memo ?? ""}</td>
      </tr>`).join("");
    const html = `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"/>
<title>법인카드 사용대장 ${ym}</title><style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:"Malgun Gothic",sans-serif;font-size:11px;color:#111;padding:16px}
.header{text-align:center;margin-bottom:12px;padding-bottom:8px;border-bottom:2px solid #1e3a5f}
h1{font-size:18px;color:#1e3a5f}.meta{font-size:10px;color:#666;margin-top:4px}
table{width:100%;border-collapse:collapse}
th{background:#1e3a5f;color:#fff;padding:6px 4px;font-size:10px;text-align:center;border:1px solid #1e3a5f}
td{padding:5px 4px;border:1px solid #ccc;text-align:center}
td.num{text-align:right;font-variant-numeric:tabular-nums}
td.left{text-align:left}
tr.even{background:#f7fafc}
tfoot td{background:#e2e8f0;font-weight:bold}
@page{margin:12mm;size:A4 landscape}
</style></head><body>
<div class="header"><h1>법인카드 사용대장</h1>
<p class="meta">대상 월: ${ym}${activeFilterCount > 0 ? " (필터 적용)" : ""} | 출력일시: ${new Date().toLocaleString("ko-KR")} | 총 ${filteredRows.length}건</p></div>
<table><thead><tr>
<th style="width:4%">NO</th><th style="width:10%">사용일자</th><th style="width:4%">요일</th>
<th style="width:8%">카드번호</th><th style="width:7%">구분</th><th style="width:26%">사용내역</th><th style="width:11%">금액</th>
<th style="width:8%">사용자</th><th style="width:5%">확인</th><th>비고</th>
</tr></thead><tbody>${body}</tbody>
<tfoot><tr><td colspan="6">합계</td><td class="num">${totalAmount.toLocaleString()}원</td><td colspan="3"></td></tr></tfoot>
</table>
<script>window.onload=()=>window.print()<\/script></body></html>`;
    const win = window.open("", "_blank", "width=1200,height=800");
    if (win) { win.document.write(html); win.document.close(); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
            <CreditCard size={24} className="text-blue-600" /> 결제관리
          </h2>
          <p className="text-sm text-gray-500 mt-1">법인카드 사용대장 — 카드별 사용내역을 월별로 관리합니다.</p>
        </div>
        <button onClick={() => setCardModal(true)} className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700">
          <CreditCard size={14} /> 카드 관리 ({cards.length})
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {/* 컨트롤 */}
        <div className="p-4 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 relative bg-white shadow-sm rounded-lg border border-gray-200 pr-3">
              <Calendar size={14} className="absolute left-3 text-gray-400" />
              <input type="number" value={year} onChange={e => setYear(e.target.value)} className="w-24 pl-9 pr-1 py-1.5 h-9 text-sm bg-transparent focus:outline-none" />
              <span className="text-gray-500 text-sm">년</span>
            </div>
            <select value={month} onChange={e => setMonth(e.target.value)} className="h-9 px-3 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500">
              {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}월</option>)}
            </select>
            <button onClick={loadRows} className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-500"><RefreshCw size={14} /></button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600 mr-1">합계 <strong className="text-blue-700">{totalAmount.toLocaleString()}원</strong> ({filteredRows.length}{activeFilterCount > 0 ? `/${rows.length}` : ""}건)</span>
            <button onClick={openAdd} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              <Plus size={14} /> 사용 등록
            </button>
            <button onClick={downloadExcel} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">
              <Download size={14} /> 엑셀
            </button>
            <button onClick={printReport} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gray-800 text-white rounded-lg hover:bg-gray-900">
              <Printer size={14} /> A4 인쇄
            </button>
          </div>
        </div>

        {/* 필터 적용 표시줄 */}
        {activeFilterCount > 0 && (
          <div className="mx-4 -mt-2 mb-3 flex items-center gap-2 text-xs text-blue-700 bg-blue-50 border border-blue-200 px-3 py-2 rounded-lg">
            <Filter size={12} fill="currentColor" />
            <span>필터 {activeFilterCount}개 적용 — {filteredRows.length} / {rows.length}건</span>
            <button onClick={() => setColFilters({})} className="ml-auto text-blue-600 hover:underline">필터 초기화</button>
          </div>
        )}

        {/* 테이블 */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-center whitespace-nowrap">
            <thead className="bg-[#f1f5f9] border-b-2 border-gray-300 text-gray-600">
              <tr>
                <th className="px-3 py-2.5 text-xs font-semibold border-r border-gray-300">NO</th>
                {COLUMNS.map(c => {
                  const active = (colFilters[c.key]?.length ?? 0) > 0;
                  return (
                    <th key={c.key} className="px-3 py-2.5 text-xs font-semibold border-r border-gray-300">
                      <div className="flex items-center justify-center gap-1">
                        <span>{c.label}</span>
                        <button
                          onClick={(e) => { setOpenFilter(c.key); setFilterAnchorEl(e.currentTarget); }}
                          className={`rounded p-0.5 hover:bg-gray-200 ${active ? "text-blue-600" : "text-gray-400"}`}
                          title={active ? `필터 적용 (${colFilters[c.key].length}개)` : "필터"}
                        >
                          <Filter size={11} fill={active ? "currentColor" : "none"} />
                        </button>
                      </div>
                    </th>
                  );
                })}
                <th className="px-3 py-2.5 text-xs font-semibold">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr><td colSpan={10} className="py-12 text-gray-400"><RefreshCw className="animate-spin mx-auto mb-2 text-blue-500" size={24} />불러오는 중...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={10} className="py-16 text-gray-400">{ym} 사용내역이 없습니다.</td></tr>
              ) : filteredRows.length === 0 ? (
                <tr><td colSpan={10} className="py-16 text-gray-400">필터 조건에 맞는 내역이 없습니다.</td></tr>
              ) : filteredRows.map((r, i) => (
                <tr key={r.id} className="hover:bg-blue-50/30">
                  <td className="px-3 py-2.5 text-center border-r border-gray-200 text-gray-500">{i + 1}</td>
                  <td className="px-3 py-2.5 text-center border-r border-gray-200 font-mono">{r.usedDate.slice(5)} ({getDayStr(r.usedDate)})</td>
                  <td className="px-3 py-2.5 text-center border-r border-gray-200"><span className="px-2 py-0.5 bg-slate-100 rounded font-mono font-semibold">{r.cardNo}</span></td>
                  <td className="px-3 py-2.5 text-center border-r border-gray-200">
                    {r.category ? (
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold ${r.category === "사무실" ? "bg-indigo-100 text-indigo-700" : "bg-amber-100 text-amber-700"}`}>{r.category}</span>
                    ) : <span className="text-gray-300">-</span>}
                  </td>
                  <td className="px-3 py-2.5 text-center border-r border-gray-200">{r.detail || "-"}</td>
                  <td className="px-3 py-2.5 text-center border-r border-gray-200 font-semibold text-blue-700">{r.amount.toLocaleString()}원</td>
                  <td className="px-3 py-2.5 text-center border-r border-gray-200">{r.userName ?? "-"}</td>
                  <td className="px-3 py-2.5 text-center border-r border-gray-200">
                    <button onClick={() => toggleConfirm(r)} title="확인 토글"
                      className={`inline-flex items-center justify-center w-6 h-6 rounded-full ${r.confirmed ? "bg-green-100 text-green-600" : "bg-gray-100 text-gray-300 hover:text-gray-400"}`}>
                      <Check size={14} />
                    </button>
                  </td>
                  <td className="px-3 py-2.5 text-center border-r border-gray-200 text-xs text-gray-500">{r.memo ?? ""}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center justify-center gap-1.5">
                      <button onClick={() => openEdit(r)} className="text-gray-400 hover:text-blue-600" title="수정"><Pencil size={14} /></button>
                      <button onClick={() => deleteRow(r.id)} className="text-gray-300 hover:text-red-500" title="삭제"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 컬럼 필터 드롭다운 */}
        {openFilter && filterAnchorEl && (
          <ColumnFilterDropdown
            anchorEl={filterAnchorEl}
            values={distinctValues[openFilter] ?? []}
            selected={colFilters[openFilter] ?? []}
            onApply={(vals) => {
              setColFilters(prev => ({ ...prev, [openFilter]: vals }));
              setOpenFilter(null);
              setFilterAnchorEl(null);
            }}
            onClose={() => { setOpenFilter(null); setFilterAnchorEl(null); }}
          />
        )}
      </div>

      {/* 입력/수정 모달 */}
      {modal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => !saving && setModal(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="font-bold text-gray-900 flex items-center gap-2">
                <CreditCard size={16} className="text-blue-500" /> {modal.mode === "add" ? "법인카드 사용 등록" : "사용내역 수정"}
              </h3>
              <button onClick={() => setModal(null)} disabled={saving} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs font-semibold text-gray-600 mb-1 block">사용일자</label>
                  <input type="date" value={form.usedDate} onChange={e => setForm({ ...form, usedDate: e.target.value })} className="w-full h-9 px-3 border border-gray-300 rounded-lg text-sm" /></div>
                <div><label className="text-xs font-semibold text-gray-600 mb-1 block">카드번호</label>
                  <select value={form.cardNo} onChange={e => setForm({ ...form, cardNo: e.target.value })} className="w-full h-9 px-3 border border-gray-300 rounded-lg text-sm bg-white">
                    <option value="">선택...</option>
                    {cards.map(c => <option key={c.id} value={c.cardNo}>{c.cardNo}{c.label ? ` (${c.label})` : ""}</option>)}
                  </select></div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">구분</label>
                <div className="flex gap-2">
                  {CATEGORIES.map(cat => (
                    <button key={cat} type="button" onClick={() => setForm({ ...form, category: form.category === cat ? "" : cat })}
                      className={`flex-1 h-9 rounded-lg text-sm font-semibold border transition-colors ${
                        form.category === cat
                          ? (cat === "사무실" ? "bg-indigo-600 text-white border-indigo-600" : "bg-amber-500 text-white border-amber-500")
                          : "bg-white text-gray-500 border-gray-300 hover:bg-gray-50"
                      }`}>
                      {cat}
                    </button>
                  ))}
                </div>
              </div>
              <div><label className="text-xs font-semibold text-gray-600 mb-1 block">사용내역</label>
                <input value={form.detail} onChange={e => setForm({ ...form, detail: e.target.value })} placeholder="예: 사무용품 구매" className="w-full h-9 px-3 border border-gray-300 rounded-lg text-sm" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs font-semibold text-gray-600 mb-1 block">금액</label>
                  <input type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} placeholder="원" className="w-full h-9 px-3 border border-gray-300 rounded-lg text-sm text-right" /></div>
                <div><label className="text-xs font-semibold text-gray-600 mb-1 block">사용자</label>
                  <input value={form.userName} onChange={e => setForm({ ...form, userName: e.target.value })} placeholder="이름" className="w-full h-9 px-3 border border-gray-300 rounded-lg text-sm" /></div>
              </div>
              <div><label className="text-xs font-semibold text-gray-600 mb-1 block">비고</label>
                <input value={form.memo} onChange={e => setForm({ ...form, memo: e.target.value })} className="w-full h-9 px-3 border border-gray-300 rounded-lg text-sm" /></div>
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input type="checkbox" checked={form.confirmed} onChange={e => setForm({ ...form, confirmed: e.target.checked })} className="w-4 h-4" />
                확인 완료
              </label>
            </div>
            <div className="px-5 py-3 border-t border-gray-200 flex justify-end gap-2">
              <button onClick={() => setModal(null)} disabled={saving} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">취소</button>
              <button onClick={save} disabled={saving} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                <Save size={13} /> {saving ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 카드 관리 모달 */}
      {cardModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setCardModal(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="font-bold text-gray-900 flex items-center gap-2"><CreditCard size={16} className="text-blue-500" /> 법인카드 관리</h3>
              <button onClick={() => setCardModal(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-3">
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {cards.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-4">등록된 카드가 없습니다.</p>
                ) : cards.map(c => (
                  <div key={c.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                    <span className="font-mono font-bold text-gray-800">{c.cardNo}</span>
                    <button onClick={() => deleteCard(c.cardNo)} className="text-gray-300 hover:text-red-500"><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
                <input value={newCardNo} onChange={e => setNewCardNo(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  placeholder="끝 4자리" maxLength={4} className="flex-1 h-9 px-3 border border-gray-300 rounded-lg text-sm font-mono" />
                <button onClick={addCard} disabled={cardSaving} className="flex items-center gap-1 px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                  <Plus size={14} /> 추가
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  UtensilsCrossed, Plus, Pencil, Trash2, Copy, RefreshCw, X, Save,
  Check, Link2, Building2, Download, Printer, Image as ImageIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import * as XLSX from "xlsx";

const FACTORIES = ["진교", "진동"] as const;
type Factory = typeof FACTORIES[number];
const MEAL_TYPES = ["점심", "저녁", "기타"] as const;

function getTodayKST(): string {
  return new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
}
function getNowKST() {
  return new Date(Date.now() + 9 * 3600000);
}
function formatTime(isoStr: string): string {
  const d = new Date(new Date(isoStr).getTime() + 9 * 3600000);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}
const DAYS = ["일", "월", "화", "수", "목", "금", "토"];
function getDayStr(dateStr: string) { return DAYS[new Date(dateStr + "T12:00:00").getDay()]; }
function isWeekend(dateStr: string) { const d = new Date(dateStr + "T12:00:00").getDay(); return d === 0 || d === 6; }
function getDaysInMonth(year: number, month: number) { return new Date(year, month, 0).getDate(); }

const MEAL_COLOR: Record<string, string> = {
  점심: "bg-blue-100 text-blue-700",
  저녁: "bg-indigo-100 text-indigo-700",
  기타: "bg-gray-100 text-gray-600",
};

interface MealVendor {
  id: string; name: string; factory: string; phone: string | null;
  pricePerMeal: number | null; token: string;
  deadlineHour: number; deadlineMin: number;
  defaultCount: number; defaultMealType: string; isActive: boolean;
}
interface MealRecord {
  id: string; date: string; factory: string; mealType: string;
  count: number; memo: string | null; registrar: string | null;
  createdAt: string; updatedAt: string;
}

const emptyVendorForm = {
  name: "", factory: "진교", phone: "", pricePerMeal: "",
  deadlineHour: "10", deadlineMin: "0",
  defaultCount: "0", defaultMealType: "점심", isActive: true,
};

export default function MealMain() {
  const [activeTab, setActiveTab] = useState<"today" | "monthly" | "vendors">("today");

  /* ── 업체 ── */
  const [vendors, setVendors] = useState<MealVendor[]>([]);
  const [loadingVendors, setLoadingVendors] = useState(true);
  const loadVendors = useCallback(async () => {
    setLoadingVendors(true);
    try {
      const r = await fetch("/api/meal-vendor");
      const d = await r.json();
      if (d.success) setVendors(d.data);
    } finally { setLoadingVendors(false); }
  }, []);
  useEffect(() => { loadVendors(); }, [loadVendors]);
  useEffect(() => { setOrigin(window.location.origin); }, []);

  /* ── 등록자 (localStorage) ── */
  const [registrars, setRegistrars] = useState<Record<Factory, string>>({ 진교: "", 진동: "" });
  const [isDefault, setIsDefault] = useState<Record<Factory, boolean>>({ 진교: false, 진동: false });
  useEffect(() => {
    const next: Record<Factory, string> = { 진교: "", 진동: "" };
    const def: Record<Factory, boolean> = { 진교: false, 진동: false };
    for (const f of FACTORIES) {
      const saved = localStorage.getItem(`mealRegistrar_${f}`);
      if (saved) { next[f] = saved; def[f] = true; }
    }
    setRegistrars(next); setIsDefault(def);
  }, []);
  const updateRegistrar = (f: Factory, val: string) => {
    setRegistrars(prev => ({ ...prev, [f]: val }));
    if (isDefault[f]) localStorage.setItem(`mealRegistrar_${f}`, val);
  };
  const toggleDefault = (f: Factory, checked: boolean) => {
    setIsDefault(prev => ({ ...prev, [f]: checked }));
    if (checked) localStorage.setItem(`mealRegistrar_${f}`, registrars[f]);
    else localStorage.removeItem(`mealRegistrar_${f}`);
  };

  const [origin, setOrigin] = useState("");

  /* ── 오늘 주문 ── */
  const today = getTodayKST();
  const [todayRecords, setTodayRecords] = useState<MealRecord[]>([]);
  const [addForm, setAddForm] = useState<{ factory: Factory; mealType: string; count: string; memo: string }>({
    factory: "진교", mealType: "점심", count: "0", memo: "",
  });
  const [addLoading, setAddLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ count: "", memo: "" });
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadTodayRecords = useCallback(async () => {
    const r = await fetch(`/api/meal-record?date=${today}`);
    const d = await r.json();
    if (d.success) setTodayRecords(d.data);
  }, [today]);
  useEffect(() => { loadTodayRecords(); }, [loadTodayRecords]);

  // vendors 로드 후 기본값 동기
  useEffect(() => {
    const v = vendors.find(vv => vv.factory === addForm.factory && vv.isActive);
    if (v) setAddForm(prev => ({ ...prev, mealType: v.defaultMealType, count: String(v.defaultCount) }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendors]);

  const submitRecord = async () => {
    const v = vendors.find(vv => vv.factory === addForm.factory && vv.isActive);
    setAddLoading(true);
    try {
      const r = await fetch("/api/meal-record", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: today, factory: addForm.factory, mealType: addForm.mealType,
          count: parseInt(addForm.count) || 0, memo: addForm.memo,
          registrar: registrars[addForm.factory], vendorId: v?.id || null,
        }),
      });
      const d = await r.json();
      if (d.success) {
        setTodayRecords(prev => {
          const idx = prev.findIndex(x => x.factory === addForm.factory && x.mealType === addForm.mealType);
          return idx >= 0 ? prev.map((x, i) => i === idx ? d.data : x) : [...prev, d.data];
        });
        setAddForm(prev => ({ ...prev, count: "0", memo: "" }));
      } else alert(d.error ?? "저장 실패");
    } finally { setAddLoading(false); }
  };

  const startEdit = (rec: MealRecord) => {
    setEditingId(rec.id);
    setEditForm({ count: String(rec.count), memo: rec.memo || "" });
  };
  const saveEdit = async (id: string) => {
    const r = await fetch(`/api/meal-record/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ count: parseInt(editForm.count) || 0, memo: editForm.memo }),
    });
    const d = await r.json();
    if (d.success) { setTodayRecords(prev => prev.map(x => x.id === id ? d.data : x)); setEditingId(null); }
    else alert(d.error ?? "수정 실패");
  };
  const deleteRecord = async (id: string) => {
    if (!confirm("이 주문을 삭제하시겠습니까?")) return;
    setDeletingId(id);
    try {
      const r = await fetch(`/api/meal-record/${id}`, { method: "DELETE" });
      const d = await r.json();
      if (d.success) setTodayRecords(prev => prev.filter(x => x.id !== id));
      else alert(d.error ?? "삭제 실패");
    } finally { setDeletingId(null); }
  };

  /* ── 월별 ── */
  const now = getNowKST();
  const [monthYear, setMonthYear] = useState(String(now.getUTCFullYear()));
  const [monthMonth, setMonthMonth] = useState(String(now.getUTCMonth() + 1));
  const [monthRecords, setMonthRecords] = useState<MealRecord[]>([]);
  const [loadingMonth, setLoadingMonth] = useState(false);
  const [monthlySubTab, setMonthlySubTab] = useState<"전체" | "진교" | "진동">("전체");

  const loadMonth = useCallback(async () => {
    setLoadingMonth(true);
    try {
      const r = await fetch(`/api/meal-record?year=${monthYear}&month=${monthMonth}`);
      const d = await r.json();
      if (d.success) setMonthRecords(d.data);
    } finally { setLoadingMonth(false); }
  }, [monthYear, monthMonth]);
  useEffect(() => { if (activeTab === "monthly") loadMonth(); }, [activeTab, loadMonth]);

  const daysCount = getDaysInMonth(parseInt(monthYear), parseInt(monthMonth));
  const dailyRows = Array.from({ length: daysCount }, (_, i) => {
    const day = String(i + 1).padStart(2, "0");
    const dateStr = `${monthYear}-${monthMonth.padStart(2, "0")}-${day}`;
    const jingyo = monthRecords.find(r => r.date === dateStr && r.factory === "진교" && r.mealType === "점심");
    const jindong = monthRecords.find(r => r.date === dateStr && r.factory === "진동" && r.mealType === "점심");
    return { dateStr, jingyo, jindong };
  });
  const jingyoTotal = dailyRows.reduce((s, r) => s + (r.jingyo?.count ?? 0), 0);
  const jindongTotal = dailyRows.reduce((s, r) => s + (r.jindong?.count ?? 0), 0);

  const getFactoryRows = (factory: Factory) =>
    Array.from({ length: daysCount }, (_, i) => {
      const day = String(i + 1).padStart(2, "0");
      const dateStr = `${monthYear}-${monthMonth.padStart(2, "0")}-${day}`;
      const recs = monthRecords.filter(r => r.date === dateStr && r.factory === factory);
      const lunch = recs.find(r => r.mealType === "점심");
      const dinner = recs.find(r => r.mealType === "저녁");
      const other = recs.find(r => r.mealType === "기타");
      const memo = recs.map(r => r.memo).filter(Boolean).join(" / ");
      return { dateStr, lunch, dinner, other, memo };
    });

  /* ── 엑셀 다운로드 ── */
  const downloadExcel = (tab: "전체" | Factory) => {
    const jVendor = vendors.find(v => v.factory === "진교" && v.isActive);
    const dVendor = vendors.find(v => v.factory === "진동" && v.isActive);
    const title = `${tab === "전체" ? "전체" : `${tab} 공장`} ${monthYear}년 ${monthMonth}월 식수 현황`;
    const wb = XLSX.utils.book_new();

    if (tab === "전체") {
      const jPrice = jVendor?.pricePerMeal ?? 0;
      const dPrice = dVendor?.pricePerMeal ?? 0;
      const data: (string | number)[][] = [
        [title],
        ["날짜", "요일", "진교 점심(명)", "진교 금액", "진동 점심(명)", "진동 금액", "합계(명)", "합계 금액"],
        ...dailyRows.map(r => {
          const jg = r.jingyo?.count ?? 0; const jd = r.jindong?.count ?? 0;
          return [r.dateStr.slice(5), getDayStr(r.dateStr),
            jg || "-", jg && jPrice ? jg * jPrice : "-",
            jd || "-", jd && dPrice ? jd * dPrice : "-",
            (jg + jd) || "-", (jg + jd) && (jPrice || dPrice) ? jg * jPrice + jd * dPrice : "-"];
        }),
        ["합계", "", jingyoTotal, jPrice ? jingyoTotal * jPrice : "-",
          jindongTotal, dPrice ? jindongTotal * dPrice : "-",
          jingyoTotal + jindongTotal,
          (jPrice || dPrice) ? jingyoTotal * jPrice + jindongTotal * dPrice : "-"],
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(data), "전체");
    } else {
      const vendor = vendors.find(v => v.factory === tab && v.isActive);
      const price = vendor?.pricePerMeal ?? 0;
      const rows = getFactoryRows(tab);
      const lt = rows.reduce((s, r) => s + (r.lunch?.count ?? 0), 0);
      const dt = rows.reduce((s, r) => s + (r.dinner?.count ?? 0), 0);
      const ot = rows.reduce((s, r) => s + (r.other?.count ?? 0), 0);
      const data: (string | number)[][] = [
        [title],
        price ? [`단가: ${price.toLocaleString()}원/식`] : [],
        ["날짜", "요일", "점심", "저녁", "기타", "합계", "금액", "메모"],
        ...rows.map(r => {
          const l = r.lunch?.count ?? 0; const d = r.dinner?.count ?? 0; const o = r.other?.count ?? 0;
          const total = l + d + o;
          return [r.dateStr.slice(5), getDayStr(r.dateStr),
            l || "-", d || "-", o || "-", total || "-",
            total && price ? total * price : "-", r.memo || ""];
        }),
        ["합계", "", lt, dt, ot, lt + dt + ot,
          price ? (lt + dt + ot) * price : "-", ""],
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(data), tab);
    }
    XLSX.writeFile(wb, `식수현황_${tab}_${monthYear}년${monthMonth}월.xlsx`);
  };

  /* ── 보고서 출력 ── */
  const printReport = (tab: "전체" | Factory) => {
    const title = `${tab === "전체" ? "전체" : `${tab} 공장`} ${monthYear}년 ${monthMonth}월 식수 현황`;
    const vendor = tab !== "전체" ? vendors.find(v => v.factory === tab && v.isActive) : null;
    const price = vendor?.pricePerMeal ?? 0;

    let tableHtml = "";
    if (tab === "전체") {
      const jPrice = vendors.find(v => v.factory === "진교" && v.isActive)?.pricePerMeal ?? 0;
      const dPrice = vendors.find(v => v.factory === "진동" && v.isActive)?.pricePerMeal ?? 0;
      const jTotalAmt = jingyoTotal * jPrice; const dTotalAmt = jindongTotal * dPrice;
      tableHtml = `<tr><th>날짜</th><th>요일</th><th>진교 점심</th><th>진교 금액</th><th>진동 점심</th><th>진동 금액</th><th>합계</th><th>합계 금액</th></tr>
        ${dailyRows.map(r => {
          const jg = r.jingyo?.count ?? 0; const jd = r.jindong?.count ?? 0;
          const we = isWeekend(r.dateStr) ? " class=\"weekend\"" : "";
          return `<tr${we}><td>${r.dateStr.slice(5)}</td><td>${getDayStr(r.dateStr)}</td>
            <td>${jg || "-"}</td><td>${jg && jPrice ? (jg * jPrice).toLocaleString() + "원" : "-"}</td>
            <td>${jd || "-"}</td><td>${jd && dPrice ? (jd * dPrice).toLocaleString() + "원" : "-"}</td>
            <td>${(jg + jd) || "-"}</td>
            <td>${(jg + jd) && (jPrice || dPrice) ? (jg * jPrice + jd * dPrice).toLocaleString() + "원" : "-"}</td></tr>`;
        }).join("")}
        <tr class="total"><td colspan="2">합계</td>
          <td>${jingyoTotal}명</td><td>${jTotalAmt ? jTotalAmt.toLocaleString() + "원" : "-"}</td>
          <td>${jindongTotal}명</td><td>${dTotalAmt ? dTotalAmt.toLocaleString() + "원" : "-"}</td>
          <td>${jingyoTotal + jindongTotal}명</td>
          <td>${(jTotalAmt || dTotalAmt) ? (jTotalAmt + dTotalAmt).toLocaleString() + "원" : "-"}</td></tr>`;
    } else {
      const rows = getFactoryRows(tab);
      const lt = rows.reduce((s, r) => s + (r.lunch?.count ?? 0), 0);
      const dt = rows.reduce((s, r) => s + (r.dinner?.count ?? 0), 0);
      const ot = rows.reduce((s, r) => s + (r.other?.count ?? 0), 0);
      const grandTotal = lt + dt + ot;
      tableHtml = `<tr><th>날짜</th><th>요일</th><th>점심</th><th>저녁</th><th>기타</th><th>합계</th><th>금액</th><th>메모</th></tr>
        ${rows.map(r => {
          const l = r.lunch?.count ?? 0; const d = r.dinner?.count ?? 0; const o = r.other?.count ?? 0;
          const total = l + d + o;
          const we = isWeekend(r.dateStr) ? " class=\"weekend\"" : "";
          return `<tr${we}><td>${r.dateStr.slice(5)}</td><td>${getDayStr(r.dateStr)}</td>
            <td>${l || "-"}</td><td>${d || "-"}</td><td>${o || "-"}</td><td>${total || "-"}</td>
            <td>${total && price ? (total * price).toLocaleString() + "원" : "-"}</td>
            <td>${r.memo || ""}</td></tr>`;
        }).join("")}
        <tr class="total"><td colspan="2">합계</td><td>${lt}명</td><td>${dt}명</td><td>${ot}명</td>
          <td>${grandTotal}명</td><td>${grandTotal && price ? (grandTotal * price).toLocaleString() + "원" : "-"}</td><td></td></tr>`;
    }

    const vendorInfo = vendor ? `<p style="text-align:center;color:#555;margin-bottom:12px">업체: ${vendor.name}${price ? ` | 단가: ${price.toLocaleString()}원/식` : ""}</p>` : "";
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
      <style>body{font-family:'Malgun Gothic',sans-serif;font-size:12px;padding:20px}h1{text-align:center;font-size:16px;margin-bottom:8px}
      table{width:100%;border-collapse:collapse}th,td{border:1px solid #999;padding:5px 8px;text-align:center}
      th{background:#e8e8e8;font-weight:bold}.weekend{color:red}.total{font-weight:bold;background:#dbeafe}
      @media print{@page{margin:1.5cm}}</style></head>
      <body><h1>${title}</h1>${vendorInfo}<table>${tableHtml}</table>
      <script>window.onload=()=>{window.print();}<\/script></body></html>`;
    const w = window.open("", "_blank", "width=1000,height=750");
    if (w) { w.document.write(html); w.document.close(); }
  };

  /* ── 업체 이미지 보고서 ── */
  const [vendorReportModal, setVendorReportModal] = useState<{ vendor: MealVendor; year: string; month: string } | null>(null);
  const [vendorReportLoading, setVendorReportLoading] = useState(false);

  const downloadVendorImage = async () => {
    if (!vendorReportModal) return;
    const { vendor, year, month } = vendorReportModal;
    setVendorReportLoading(true);
    try {
      const r = await fetch(`/api/meal-record?year=${year}&month=${month}&factory=${vendor.factory}`);
      const d = await r.json();
      if (!d.success) return;
      const records: MealRecord[] = d.data;
      const price = vendor.pricePerMeal ?? 0;
      const dc = getDaysInMonth(parseInt(year), parseInt(month));
      const rows = Array.from({ length: dc }, (_, i) => {
        const day = String(i + 1).padStart(2, "0");
        const dateStr = `${year}-${month.padStart(2, "0")}-${day}`;
        const recs = records.filter(r => r.date === dateStr);
        const lunch = recs.find(r => r.mealType === "점심");
        const dinner = recs.find(r => r.mealType === "저녁");
        const other = recs.find(r => r.mealType === "기타");
        const memo = recs.map(r => r.memo).filter(Boolean).join(" / ");
        return { dateStr, lunch, dinner, other, memo };
      });
      const lt = rows.reduce((s, r) => s + (r.lunch?.count ?? 0), 0);
      const dt = rows.reduce((s, r) => s + (r.dinner?.count ?? 0), 0);
      const ot = rows.reduce((s, r) => s + (r.other?.count ?? 0), 0);
      const grand = lt + dt + ot;

      const rowsHtml = rows.map(r => {
        const l = r.lunch?.count ?? 0; const d2 = r.dinner?.count ?? 0; const o = r.other?.count ?? 0;
        const total = l + d2 + o;
        const we = isWeekend(r.dateStr) ? "color:red;" : "";
        return `<tr style="${we}">
          <td>${r.dateStr.slice(5)}</td><td>${getDayStr(r.dateStr)}</td>
          <td>${l || "-"}</td><td>${d2 || "-"}</td><td>${o || "-"}</td><td style="font-weight:bold">${total || "-"}</td>
          <td>${total && price ? (total * price).toLocaleString() + "원" : "-"}</td>
          <td style="text-align:left;font-size:11px">${r.memo || ""}</td></tr>`;
      }).join("");

      const tableStyle = "width:100%;border-collapse:collapse;font-size:12px";
      const thStyle = "border:1px solid #aaa;padding:6px 8px;background:#e8e8e8;text-align:center;font-weight:bold";
      const tdStyle = "border:1px solid #ccc;padding:5px 8px;text-align:center";

      const innerHtml = `
        <div style="padding:32px;background:white;font-family:'Malgun Gothic',sans-serif;width:880px">
          <h2 style="text-align:center;font-size:17px;margin:0 0 6px">${vendor.factory} 공장 ${year}년 ${month}월 식수 현황</h2>
          <p style="text-align:center;color:#555;margin:0 0 16px;font-size:12px">
            업체: ${vendor.name}${price ? ` &nbsp;|&nbsp; 단가: ${price.toLocaleString()}원/식` : ""}
          </p>
          <table style="${tableStyle}">
            <thead><tr>
              <th style="${thStyle}">날짜</th><th style="${thStyle}">요일</th>
              <th style="${thStyle}">점심</th><th style="${thStyle}">저녁</th>
              <th style="${thStyle}">기타</th><th style="${thStyle}">합계</th>
              <th style="${thStyle}">금액</th><th style="${thStyle}">메모</th>
            </tr></thead>
            <tbody>${rows.map(r => {
              const l = r.lunch?.count ?? 0; const d2 = r.dinner?.count ?? 0; const o = r.other?.count ?? 0;
              const total = l + d2 + o;
              const we = isWeekend(r.dateStr) ? "color:red;" : "";
              return `<tr style="${we}">
                <td style="${tdStyle}">${r.dateStr.slice(5)}</td><td style="${tdStyle}">${getDayStr(r.dateStr)}</td>
                <td style="${tdStyle}">${l || "-"}</td><td style="${tdStyle}">${d2 || "-"}</td>
                <td style="${tdStyle}">${o || "-"}</td><td style="${tdStyle};font-weight:bold">${total || "-"}</td>
                <td style="${tdStyle}">${total && price ? (total * price).toLocaleString() + "원" : "-"}</td>
                <td style="${tdStyle};text-align:left;font-size:11px">${r.memo || ""}</td></tr>`;
            }).join("")}</tbody>
            <tfoot><tr style="font-weight:bold;background:#dbeafe">
              <td style="${thStyle}" colspan="2">합계</td>
              <td style="${thStyle}">${lt}명</td><td style="${thStyle}">${dt}명</td>
              <td style="${thStyle}">${ot}명</td><td style="${thStyle}">${grand}명</td>
              <td style="${thStyle}">${grand && price ? (grand * price).toLocaleString() + "원" : "-"}</td>
              <td style="${thStyle}"></td>
            </tr></tfoot>
          </table>
        </div>`;

      const div = document.createElement("div");
      div.style.cssText = "position:fixed;left:-9999px;top:0;background:white";
      div.innerHTML = innerHtml;
      document.body.appendChild(div);

      const { default: html2canvas } = await import("html2canvas");
      const canvas = await html2canvas(div.firstElementChild as HTMLElement, { scale: 2, useCORS: true });
      document.body.removeChild(div);

      const link = document.createElement("a");
      link.download = `식수보고서_${vendor.factory}_${year}년${month}월.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
      setVendorReportModal(null);
    } catch (e) {
      console.error(e);
      alert("이미지 생성 중 오류가 발생했습니다.");
    } finally { setVendorReportLoading(false); }
  };

  /* ── 업체 모달 ── */
  const [showVendorModal, setShowVendorModal] = useState(false);
  const [editingVendor, setEditingVendor] = useState<MealVendor | null>(null);
  const [vendorForm, setVendorForm] = useState({ ...emptyVendorForm });
  const [savingVendor, setSavingVendor] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const openNewVendor = () => { setEditingVendor(null); setVendorForm({ ...emptyVendorForm }); setShowVendorModal(true); };
  const openEditVendor = (v: MealVendor) => {
    setEditingVendor(v);
    setVendorForm({ name: v.name, factory: v.factory, phone: v.phone || "",
      pricePerMeal: v.pricePerMeal ? String(v.pricePerMeal) : "",
      deadlineHour: String(v.deadlineHour), deadlineMin: String(v.deadlineMin),
      defaultCount: String(v.defaultCount), defaultMealType: v.defaultMealType, isActive: v.isActive });
    setShowVendorModal(true);
  };
  const saveVendor = async () => {
    setSavingVendor(true);
    try {
      const body = { name: vendorForm.name, factory: vendorForm.factory, phone: vendorForm.phone,
        pricePerMeal: vendorForm.pricePerMeal || null,
        deadlineHour: parseInt(vendorForm.deadlineHour), deadlineMin: parseInt(vendorForm.deadlineMin),
        defaultCount: parseInt(vendorForm.defaultCount), defaultMealType: vendorForm.defaultMealType, isActive: vendorForm.isActive };
      const url = editingVendor ? `/api/meal-vendor/${editingVendor.id}` : "/api/meal-vendor";
      const method = editingVendor ? "PATCH" : "POST";
      const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json();
      if (d.success) { setShowVendorModal(false); loadVendors(); }
      else alert(d.error ?? "저장 실패");
    } finally { setSavingVendor(false); }
  };
  const deleteVendor = async (v: MealVendor) => {
    if (!confirm(`"${v.name}" 업체를 삭제하시겠습니까?`)) return;
    const r = await fetch(`/api/meal-vendor/${v.id}`, { method: "DELETE" });
    const d = await r.json();
    if (d.success) loadVendors(); else alert(d.error ?? "삭제 실패");
  };
  const resetToken = async (v: MealVendor) => {
    if (!confirm("조회 링크가 변경됩니다. 기존 링크는 더 이상 작동하지 않습니다. 계속하시겠습니까?")) return;
    const r = await fetch(`/api/meal-vendor/${v.id}/reset-token`, { method: "POST" });
    const d = await r.json();
    if (d.success) loadVendors(); else alert(d.error ?? "오류");
  };
  const copyLink = (token: string) => {
    const url = `${origin}/field/meal/${token}`;
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(url).then(() => { setCopiedToken(token); setTimeout(() => setCopiedToken(null), 2000); });
    } else {
      const el = document.createElement("textarea");
      el.value = url; el.style.cssText = "position:fixed;top:-999px;left:-999px;opacity:0";
      document.body.appendChild(el); el.select(); document.execCommand("copy"); document.body.removeChild(el);
      setCopiedToken(token); setTimeout(() => setCopiedToken(null), 2000);
    }
  };

  const tabCls = (t: string) => `px-5 py-3 text-sm font-semibold flex items-center gap-2 relative transition-colors ${
    activeTab === t ? "text-blue-600" : "text-gray-500 hover:text-gray-800 hover:bg-gray-50"}`;

  /* ── RENDER ── */
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
          <UtensilsCrossed size={24} className="text-blue-600" />식수 관리
        </h2>
        <p className="text-sm text-gray-500 mt-1">공장별 식수 인원을 매일 등록하고 월별 현황을 확인합니다.</p>
      </div>

      {/* 탭 */}
      <div className="flex border-b border-gray-200">
        <button onClick={() => setActiveTab("today")} className={tabCls("today")}>
          오늘 식수 입력{activeTab === "today" && <span className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600 rounded-t-md" />}
        </button>
        <button onClick={() => setActiveTab("monthly")} className={tabCls("monthly")}>
          월별 현황{activeTab === "monthly" && <span className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600 rounded-t-md" />}
        </button>
        <button onClick={() => setActiveTab("vendors")} className={tabCls("vendors")}>
          업체 관리{activeTab === "vendors" && <span className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600 rounded-t-md" />}
        </button>
      </div>

      {/* ========== 오늘 식수 입력 ========== */}
      {activeTab === "today" && (
        <div className="space-y-6">
          <div className="text-lg font-bold text-gray-800">
            {today} ({getDayStr(today)}) 식수 주문
          </div>

          {/* 주문 입력 폼 */}
          <div className="bg-white rounded-xl border-2 border-blue-100 shadow-sm p-5 space-y-4">
            <h3 className="font-semibold text-gray-800 text-sm">새 주문 등록</h3>

            {/* 공장 선택 */}
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1.5 block">공장</label>
              <div className="flex gap-2">
                {FACTORIES.map(f => (
                  <button key={f} onClick={() => setAddForm(p => ({ ...p, factory: f }))}
                    className={`px-4 py-1.5 text-sm rounded-lg border font-semibold transition-colors ${addForm.factory === f ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-200 hover:border-blue-300"}`}>
                    {f}
                  </button>
                ))}
              </div>
            </div>

            {/* 식사 구분 */}
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1.5 block">식사 구분</label>
              <div className="flex gap-2">
                {MEAL_TYPES.map(mt => (
                  <button key={mt} onClick={() => setAddForm(p => ({ ...p, mealType: mt }))}
                    className={`px-3 py-1.5 text-sm rounded-lg border font-medium transition-colors ${addForm.mealType === mt ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-200 hover:border-blue-300"}`}>
                    {mt}
                  </button>
                ))}
              </div>
            </div>

            {/* 인원 */}
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1.5 block">식사 인원</label>
              <div className="flex items-center gap-2">
                <button onClick={() => setAddForm(p => ({ ...p, count: String(Math.max(0, parseInt(p.count || "0") - 1)) }))}
                  className="w-9 h-9 rounded-lg border border-gray-200 text-lg font-bold text-gray-600 hover:bg-gray-50">−</button>
                <Input type="number" min={0} value={addForm.count}
                  onChange={e => setAddForm(p => ({ ...p, count: e.target.value }))}
                  className="w-20 h-9 text-center text-lg font-bold" />
                <button onClick={() => setAddForm(p => ({ ...p, count: String(parseInt(p.count || "0") + 1) }))}
                  className="w-9 h-9 rounded-lg border border-gray-200 text-lg font-bold text-gray-600 hover:bg-gray-50">+</button>
                <span className="text-sm text-gray-500">명</span>
              </div>
            </div>

            {/* 전달사항 */}
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1.5 block">업체 전달사항 (선택)</label>
              <textarea value={addForm.memo} onChange={e => setAddForm(p => ({ ...p, memo: e.target.value }))}
                placeholder="예: 오늘 김치찌개 빼주세요"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none h-16" />
            </div>

            {/* 등록자 */}
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1.5 block">등록자</label>
              <div className="flex items-center gap-2">
                <Input value={registrars[addForm.factory]} onChange={e => updateRegistrar(addForm.factory, e.target.value)}
                  placeholder="이름 입력" className="flex-1 h-8 text-sm" />
                <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer whitespace-nowrap select-none">
                  <input type="checkbox" checked={isDefault[addForm.factory]}
                    onChange={e => toggleDefault(addForm.factory, e.target.checked)} className="w-3.5 h-3.5 accent-blue-600" />
                  기본값 설정
                </label>
              </div>
            </div>

            <Button onClick={submitRecord} disabled={addLoading} className="w-full bg-blue-600 hover:bg-blue-700 font-bold">
              {addLoading ? "저장 중..." : "주문 등록"}
            </Button>
          </div>

          {/* 오늘 주문 목록 */}
          <div className="space-y-2">
            <h3 className="font-semibold text-gray-800 text-sm">오늘 주문 목록
              <span className="ml-2 text-xs font-normal text-gray-400">({todayRecords.length}건)</span>
            </h3>
            {todayRecords.length === 0 ? (
              <div className="py-8 text-center text-gray-400 bg-white rounded-xl border border-gray-200">
                아직 오늘 주문이 없습니다
              </div>
            ) : (
              <div className="space-y-2">
                {FACTORIES.map(f => {
                  const recs = todayRecords.filter(r => r.factory === f);
                  if (recs.length === 0) return null;
                  return (
                    <div key={f} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                      <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
                        <span className="font-bold text-gray-700 text-sm">{f} 공장</span>
                        <span className="text-xs text-gray-400">
                          합계: {recs.reduce((s, r) => s + r.count, 0)}명
                        </span>
                      </div>
                      <div className="divide-y divide-gray-100">
                        {recs.map(rec => (
                          <div key={rec.id} className="px-4 py-3">
                            {editingId === rec.id ? (
                              <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${MEAL_COLOR[rec.mealType] ?? "bg-gray-100 text-gray-600"}`}>{rec.mealType}</span>
                                  <div className="flex items-center gap-1">
                                    <button onClick={() => setEditForm(p => ({ ...p, count: String(Math.max(0, parseInt(p.count || "0") - 1)) }))}
                                      className="w-7 h-7 rounded border border-gray-200 text-base font-bold text-gray-500 hover:bg-gray-50">−</button>
                                    <Input type="number" min={0} value={editForm.count}
                                      onChange={e => setEditForm(p => ({ ...p, count: e.target.value }))}
                                      className="w-16 h-7 text-center text-sm font-bold" />
                                    <button onClick={() => setEditForm(p => ({ ...p, count: String(parseInt(p.count || "0") + 1) }))}
                                      className="w-7 h-7 rounded border border-gray-200 text-base font-bold text-gray-500 hover:bg-gray-50">+</button>
                                    <span className="text-xs text-gray-500">명</span>
                                  </div>
                                </div>
                                <Input value={editForm.memo} onChange={e => setEditForm(p => ({ ...p, memo: e.target.value }))}
                                  placeholder="전달사항" className="h-7 text-sm" />
                                <div className="flex gap-2">
                                  <Button size="sm" onClick={() => saveEdit(rec.id)} className="h-7 text-xs bg-blue-600 hover:bg-blue-700">저장</Button>
                                  <Button size="sm" variant="outline" onClick={() => setEditingId(null)} className="h-7 text-xs">취소</Button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${MEAL_COLOR[rec.mealType] ?? "bg-gray-100 text-gray-600"}`}>{rec.mealType}</span>
                                  <span className="font-bold text-gray-900 text-sm">{rec.count}명</span>
                                  {rec.memo && <span className="text-xs text-gray-400">{rec.memo}</span>}
                                  <span className="text-xs text-gray-300">{formatTime(rec.updatedAt)} 등록</span>
                                </div>
                                <div className="flex gap-1">
                                  <button onClick={() => startEdit(rec)} className="p-1.5 text-gray-400 hover:text-blue-600 rounded transition-colors"><Pencil size={13} /></button>
                                  <button onClick={() => deleteRecord(rec.id)} disabled={deletingId === rec.id}
                                    className="p-1.5 text-gray-400 hover:text-red-500 rounded transition-colors"><Trash2 size={13} /></button>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========== 월별 현황 ========== */}
      {activeTab === "monthly" && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <Input type="number" value={monthYear} onChange={e => setMonthYear(e.target.value)} className="w-24 h-9" placeholder="연도" />
            <span className="text-gray-600">년</span>
            <select value={monthMonth} onChange={e => setMonthMonth(e.target.value)} className="h-9 px-3 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}월</option>)}
            </select>
            <Button size="sm" onClick={loadMonth} disabled={loadingMonth} variant="outline">조회</Button>
          </div>

          {/* 서브탭 */}
          <div className="flex border-b border-gray-200">
            {(["전체", "진교", "진동"] as const).map(t => (
              <button key={t} onClick={() => setMonthlySubTab(t)}
                className={`px-5 py-2.5 text-sm font-semibold relative transition-colors ${monthlySubTab === t ? "text-blue-600" : "text-gray-500 hover:text-gray-800 hover:bg-gray-50"}`}>
                {t}
                {monthlySubTab === t && <span className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600 rounded-t-md" />}
              </button>
            ))}
          </div>

          {/* 전체 */}
          {monthlySubTab === "전체" && (() => {
            const jPrice = vendors.find(v => v.factory === "진교" && v.isActive)?.pricePerMeal ?? 0;
            const dPrice = vendors.find(v => v.factory === "진동" && v.isActive)?.pricePerMeal ?? 0;
            return (
              <div className="space-y-3">
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="outline" onClick={() => downloadExcel("전체")} className="gap-1.5 text-green-700 border-green-300 hover:bg-green-50">
                    <Download size={14} /> 엑셀 다운로드
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => printReport("전체")} className="gap-1.5 text-gray-700">
                    <Printer size={14} /> 월별보고서 출력
                  </Button>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-center whitespace-nowrap">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="px-3 py-3 font-semibold text-xs text-gray-500">날짜</th>
                          <th className="px-3 py-3 font-semibold text-xs text-gray-500">요일</th>
                          <th className="px-3 py-3 font-semibold text-xs text-blue-600">진교 점심</th>
                          {jPrice > 0 && <th className="px-3 py-3 font-semibold text-xs text-blue-500">진교 금액</th>}
                          <th className="px-3 py-3 font-semibold text-xs text-indigo-600">진동 점심</th>
                          {dPrice > 0 && <th className="px-3 py-3 font-semibold text-xs text-indigo-500">진동 금액</th>}
                          <th className="px-3 py-3 font-semibold text-xs text-gray-700">합계</th>
                          {(jPrice > 0 || dPrice > 0) && <th className="px-3 py-3 font-semibold text-xs text-gray-600">합계 금액</th>}
                          <th className="px-3 py-3 font-semibold text-xs text-gray-500">비고</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {loadingMonth ? (
                          <tr><td colSpan={9} className="py-8 text-gray-400">불러오는 중...</td></tr>
                        ) : dailyRows.map(({ dateStr, jingyo, jindong }) => {
                          const weekend = isWeekend(dateStr);
                          const jg = jingyo?.count ?? 0; const jd = jindong?.count ?? 0;
                          const memo = [jingyo?.memo, jindong?.memo].filter(Boolean).join(" / ");
                          return (
                            <tr key={dateStr} className={weekend ? "bg-red-50/40 text-red-700" : "hover:bg-gray-50"}>
                              <td className="px-3 py-2.5 font-mono">{dateStr.slice(5)}</td>
                              <td className="px-3 py-2.5 font-semibold">{getDayStr(dateStr)}</td>
                              <td className={`px-3 py-2.5 font-semibold ${jg ? "text-blue-700" : "text-gray-300"}`}>{jg || "-"}</td>
                              {jPrice > 0 && <td className="px-3 py-2.5 text-blue-600">{jg ? (jg * jPrice).toLocaleString() + "원" : "-"}</td>}
                              <td className={`px-3 py-2.5 font-semibold ${jd ? "text-indigo-700" : "text-gray-300"}`}>{jd || "-"}</td>
                              {dPrice > 0 && <td className="px-3 py-2.5 text-indigo-600">{jd ? (jd * dPrice).toLocaleString() + "원" : "-"}</td>}
                              <td className={`px-3 py-2.5 font-bold ${(jg + jd) ? "text-gray-900" : "text-gray-300"}`}>{(jg + jd) || "-"}</td>
                              {(jPrice > 0 || dPrice > 0) && <td className="px-3 py-2.5 font-semibold text-gray-700">{(jg + jd) ? (jg * jPrice + jd * dPrice).toLocaleString() + "원" : "-"}</td>}
                              <td className="px-3 py-2.5 text-xs text-gray-500 text-left">{memo || ""}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot className="bg-blue-50 border-t-2 border-blue-200">
                        <tr>
                          <td colSpan={2} className="px-3 py-3 font-bold text-blue-800 text-left">합계</td>
                          <td className="px-3 py-3 font-bold text-blue-800">{jingyoTotal}명</td>
                          {jPrice > 0 && <td className="px-3 py-3 font-bold text-blue-800">{(jingyoTotal * jPrice).toLocaleString()}원</td>}
                          <td className="px-3 py-3 font-bold text-blue-800">{jindongTotal}명</td>
                          {dPrice > 0 && <td className="px-3 py-3 font-bold text-blue-800">{(jindongTotal * dPrice).toLocaleString()}원</td>}
                          <td className="px-3 py-3 font-bold text-blue-800">{jingyoTotal + jindongTotal}명</td>
                          {(jPrice > 0 || dPrice > 0) && <td className="px-3 py-3 font-bold text-blue-800">{(jingyoTotal * jPrice + jindongTotal * dPrice).toLocaleString()}원</td>}
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* 진교 / 진동 */}
          {(monthlySubTab === "진교" || monthlySubTab === "진동") && (() => {
            const factory = monthlySubTab;
            const vendor = vendors.find(v => v.factory === factory && v.isActive);
            const price = vendor?.pricePerMeal ?? 0;
            const rows = getFactoryRows(factory);
            const lt = rows.reduce((s, r) => s + (r.lunch?.count ?? 0), 0);
            const dt = rows.reduce((s, r) => s + (r.dinner?.count ?? 0), 0);
            const ot = rows.reduce((s, r) => s + (r.other?.count ?? 0), 0);
            const grand = lt + dt + ot;
            return (
              <div className="space-y-3">
                {vendor && price > 0 && (
                  <div className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2 inline-block">
                    업체: <strong>{vendor.name}</strong> | 단가: <strong className="text-blue-700">{price.toLocaleString()}원/식</strong>
                    &nbsp;| 예상 합계: <strong className="text-green-700">{(grand * price).toLocaleString()}원</strong>
                  </div>
                )}
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="outline" onClick={() => downloadExcel(factory)} className="gap-1.5 text-green-700 border-green-300 hover:bg-green-50">
                    <Download size={14} /> 엑셀 다운로드
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => printReport(factory)} className="gap-1.5 text-gray-700">
                    <Printer size={14} /> 월별보고서 출력
                  </Button>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-center whitespace-nowrap">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="px-3 py-3 font-semibold text-xs text-gray-500">날짜</th>
                          <th className="px-3 py-3 font-semibold text-xs text-gray-500">요일</th>
                          <th className="px-3 py-3 font-semibold text-xs text-blue-600">점심</th>
                          <th className="px-3 py-3 font-semibold text-xs text-indigo-600">저녁</th>
                          <th className="px-3 py-3 font-semibold text-xs text-gray-500">기타</th>
                          <th className="px-3 py-3 font-semibold text-xs text-gray-700">합계</th>
                          {price > 0 && <th className="px-3 py-3 font-semibold text-xs text-green-700">금액</th>}
                          <th className="px-3 py-3 font-semibold text-xs text-gray-500">메모</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {loadingMonth ? (
                          <tr><td colSpan={8} className="py-8 text-gray-400">불러오는 중...</td></tr>
                        ) : rows.map(({ dateStr, lunch, dinner, other, memo }) => {
                          const weekend = isWeekend(dateStr);
                          const l = lunch?.count ?? 0; const d = dinner?.count ?? 0; const o = other?.count ?? 0;
                          const total = l + d + o;
                          return (
                            <tr key={dateStr} className={weekend ? "bg-red-50/40 text-red-700" : "hover:bg-gray-50"}>
                              <td className="px-3 py-2.5 font-mono">{dateStr.slice(5)}</td>
                              <td className="px-3 py-2.5 font-semibold">{getDayStr(dateStr)}</td>
                              <td className={`px-3 py-2.5 font-semibold ${l ? "text-blue-700" : "text-gray-300"}`}>{l || "-"}</td>
                              <td className={`px-3 py-2.5 font-semibold ${d ? "text-indigo-700" : "text-gray-300"}`}>{d || "-"}</td>
                              <td className={`px-3 py-2.5 font-semibold ${o ? "text-gray-700" : "text-gray-300"}`}>{o || "-"}</td>
                              <td className={`px-3 py-2.5 font-bold ${total ? "text-gray-900" : "text-gray-300"}`}>{total || "-"}</td>
                              {price > 0 && <td className="px-3 py-2.5 text-green-700 font-semibold">{total ? (total * price).toLocaleString() + "원" : "-"}</td>}
                              <td className="px-3 py-2.5 text-xs text-gray-500 text-left">{memo || ""}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot className="bg-blue-50 border-t-2 border-blue-200">
                        <tr>
                          <td colSpan={2} className="px-3 py-3 font-bold text-blue-800 text-left">합계</td>
                          <td className="px-3 py-3 font-bold text-blue-800">{lt}명</td>
                          <td className="px-3 py-3 font-bold text-blue-800">{dt}명</td>
                          <td className="px-3 py-3 font-bold text-blue-800">{ot}명</td>
                          <td className="px-3 py-3 font-bold text-blue-800">{grand}명</td>
                          {price > 0 && <td className="px-3 py-3 font-bold text-green-800">{(grand * price).toLocaleString()}원</td>}
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* ========== 업체 관리 ========== */}
      {activeTab === "vendors" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={openNewVendor} className="bg-blue-600 hover:bg-blue-700 gap-2">
              <Plus size={16} /> 업체 추가
            </Button>
          </div>

          {loadingVendors ? (
            <div className="text-center py-8 text-gray-400">불러오는 중...</div>
          ) : vendors.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <Building2 size={40} className="mx-auto mb-2 opacity-30" /><p>등록된 업체가 없습니다.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {vendors.map(v => {
                const link = `${origin}/field/meal/${v.token}`;
                const isCopied = copiedToken === v.token;
                const todayRecs = todayRecords.filter(r => r.factory === v.factory);
                return (
                  <div key={v.id} className={`bg-white rounded-xl border shadow-sm overflow-hidden ${v.isActive ? "border-gray-200" : "border-gray-100 opacity-60"}`}>
                    <div className="px-5 py-3 bg-gray-50 flex items-center justify-between">
                      <div>
                        <span className="font-bold text-gray-900">{v.name}</span>
                        <span className="ml-2 text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full font-semibold">{v.factory}</span>
                        {!v.isActive && <span className="ml-2 text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full">비활성</span>}
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => openEditVendor(v)} className="p-1.5 text-gray-400 hover:text-blue-600 rounded transition-colors"><Pencil size={14} /></button>
                        <button onClick={() => deleteVendor(v)} className="p-1.5 text-gray-400 hover:text-red-500 rounded transition-colors"><Trash2 size={14} /></button>
                      </div>
                    </div>
                    <div className="px-5 py-4 space-y-3 text-sm text-gray-600">
                      {v.phone && <div>연락처: {v.phone}</div>}
                      {v.pricePerMeal && <div>단가: <strong className="text-blue-700">{v.pricePerMeal.toLocaleString()}원/식</strong></div>}
                      <div>마감: {v.deadlineHour}:{String(v.deadlineMin).padStart(2, "0")} / 기본 {v.defaultCount}명 ({v.defaultMealType})</div>

                      {/* 오늘 주문 현황 */}
                      <div className="pt-2 border-t border-gray-100">
                        <div className="text-xs font-semibold text-gray-500 mb-1.5">오늘 주문 현황</div>
                        {todayRecs.length === 0 ? (
                          <div className="text-xs text-gray-300">주문 없음</div>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {todayRecs.map(rec => (
                              <span key={rec.id} className={`px-2 py-1 rounded-lg text-xs font-semibold ${MEAL_COLOR[rec.mealType] ?? "bg-gray-100 text-gray-600"}`}>
                                {rec.mealType} {rec.count}명
                                {v.pricePerMeal && <span className="ml-1 opacity-75">({(rec.count * v.pricePerMeal).toLocaleString()}원)</span>}
                              </span>
                            ))}
                            {v.pricePerMeal && todayRecs.length > 1 && (
                              <span className="px-2 py-1 rounded-lg text-xs font-bold bg-green-100 text-green-700">
                                합계 {(todayRecs.reduce((s, r) => s + r.count, 0) * v.pricePerMeal).toLocaleString()}원
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* 링크 + 이미지 저장 */}
                      <div className="pt-2 border-t border-gray-100 space-y-2">
                        <div className="flex items-center gap-2">
                          <Link2 size={13} className="text-gray-400 flex-shrink-0" />
                          <span className="text-xs text-gray-400 font-mono truncate flex-1">/field/meal/{v.token.slice(0, 12)}...</span>
                          <button onClick={() => copyLink(v.token)}
                            className={`flex items-center gap-1 text-xs px-2 py-1 rounded border transition-colors ${isCopied ? "border-green-400 text-green-600 bg-green-50" : "border-gray-200 text-gray-500 hover:border-blue-300 hover:text-blue-600"}`}>
                            {isCopied ? <><Check size={12} />복사됨</> : <><Copy size={12} />링크 복사</>}
                          </button>
                          <button onClick={() => resetToken(v)} title="링크 재생성" className="p-1 text-gray-300 hover:text-orange-500 rounded transition-colors">
                            <RefreshCw size={13} />
                          </button>
                        </div>
                        <button onClick={() => setVendorReportModal({ vendor: v, year: String(now.getUTCFullYear()), month: String(now.getUTCMonth() + 1) })}
                          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-purple-200 text-purple-600 hover:bg-purple-50 transition-colors w-full justify-center font-semibold">
                          <ImageIcon size={13} /> 월별 보고서 이미지 저장
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========== 업체 이미지 보고서 모달 ========== */}
      {vendorReportModal && (
        <div className="fixed inset-0 z-50 bg-gray-900/60 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h3 className="font-bold text-lg text-gray-900">월별 보고서 이미지</h3>
              <button onClick={() => setVendorReportModal(null)} className="text-gray-400 hover:text-gray-600 p-1 rounded"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="text-sm text-gray-600">
                <strong>{vendorReportModal.vendor.factory} 공장</strong> — {vendorReportModal.vendor.name}
              </div>
              <div className="flex items-center gap-2">
                <Input type="number" value={vendorReportModal.year}
                  onChange={e => setVendorReportModal(p => p ? { ...p, year: e.target.value } : null)}
                  className="w-24 h-9" placeholder="연도" />
                <span className="text-gray-600">년</span>
                <select value={vendorReportModal.month}
                  onChange={e => setVendorReportModal(p => p ? { ...p, month: e.target.value } : null)}
                  className="h-9 px-3 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-purple-500">
                  {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}월</option>)}
                </select>
              </div>
              <Button onClick={downloadVendorImage} disabled={vendorReportLoading}
                className="w-full bg-purple-600 hover:bg-purple-700 gap-2">
                <ImageIcon size={15} />
                {vendorReportLoading ? "이미지 생성 중..." : "PNG 이미지 다운로드"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ========== 업체 등록/수정 모달 ========== */}
      {showVendorModal && (
        <div className="fixed inset-0 z-50 bg-gray-900/60 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h3 className="font-bold text-lg text-gray-900">{editingVendor ? "업체 정보 수정" : "신규 업체 추가"}</h3>
              <button onClick={() => setShowVendorModal(false)} className="text-gray-400 hover:text-gray-600 p-1 rounded"><X size={20} /></button>
            </div>
            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 space-y-1.5">
                  <label className="text-xs font-semibold text-gray-700">업체명 *</label>
                  <Input value={vendorForm.name} onChange={e => setVendorForm(p => ({ ...p, name: e.target.value }))} placeholder="업체명 입력" className="h-9" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-700">담당 공장 *</label>
                  <select value={vendorForm.factory} onChange={e => setVendorForm(p => ({ ...p, factory: e.target.value }))} className="w-full h-9 px-3 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {FACTORIES.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-700">연락처</label>
                  <Input value={vendorForm.phone} onChange={e => setVendorForm(p => ({ ...p, phone: e.target.value }))} placeholder="010-0000-0000" className="h-9" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-700">단가 (원/식)</label>
                  <Input type="number" value={vendorForm.pricePerMeal} onChange={e => setVendorForm(p => ({ ...p, pricePerMeal: e.target.value }))} placeholder="5000" className="h-9" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-700">마감 시각</label>
                  <div className="flex items-center gap-1">
                    <Input type="number" min={0} max={23} value={vendorForm.deadlineHour} onChange={e => setVendorForm(p => ({ ...p, deadlineHour: e.target.value }))} className="h-9 w-16 text-center" />
                    <span className="text-gray-500">:</span>
                    <Input type="number" min={0} max={59} value={vendorForm.deadlineMin} onChange={e => setVendorForm(p => ({ ...p, deadlineMin: e.target.value }))} className="h-9 w-16 text-center" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-700">기본 인원 수</label>
                  <Input type="number" min={0} value={vendorForm.defaultCount} onChange={e => setVendorForm(p => ({ ...p, defaultCount: e.target.value }))} className="h-9" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-700">기본 식사 구분</label>
                  <select value={vendorForm.defaultMealType} onChange={e => setVendorForm(p => ({ ...p, defaultMealType: e.target.value }))} className="w-full h-9 px-3 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {MEAL_TYPES.map(mt => <option key={mt} value={mt}>{mt}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5 flex items-end">
                  <button onClick={() => setVendorForm(p => ({ ...p, isActive: !p.isActive }))}
                    className={`h-9 w-full px-3 rounded-md text-sm font-bold border flex items-center gap-2 justify-center transition-colors ${vendorForm.isActive ? "bg-green-600 text-white border-green-600" : "bg-white text-gray-400 border-gray-200"}`}>
                    <span className={`w-3 h-3 rounded-full border-2 ${vendorForm.isActive ? "bg-white border-white" : "border-gray-300"}`} />
                    {vendorForm.isActive ? "사용중" : "비활성"}
                  </button>
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
              <Button variant="outline" onClick={() => setShowVendorModal(false)}>취소</Button>
              <Button onClick={saveVendor} disabled={savingVendor} className="bg-blue-600 hover:bg-blue-700">
                <Save size={15} className="mr-1.5" /> {savingVendor ? "저장 중..." : "저장"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useEffect, useCallback } from "react";
import { use } from "react";

const DAYS = ["일","월","화","수","목","금","토"];
function getTodayKST() { return new Date(Date.now()+9*3600000).toISOString().slice(0,10); }
function getDayStr(d: string) { return DAYS[new Date(d+"T12:00:00").getDay()]; }
function isWeekend(d: string) { const day = new Date(d+"T12:00:00").getDay(); return day===0||day===6; }
function getDaysInMonth(year: number, month: number) { return new Date(year, month, 0).getDate(); }

interface Vendor {
  id: string; name: string; factory: string;
  deadlineHour: number; deadlineMin: number;
  isActive: boolean; pricePerMeal: number | null;
}
interface MealRecord { id: string; date: string; factory: string; mealType: string; count: number; memo: string|null; }

function getNowKST() { return new Date(Date.now()+9*3600000); }
function isPastDeadline(h: number, m: number) {
  const now = getNowKST();
  return now.getUTCHours() > h || (now.getUTCHours() === h && now.getUTCMinutes() >= m);
}

export default function MealFieldPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [activeTab, setActiveTab] = useState<"today"|"monthly">("today");
  const [vendor, setVendor] = useState<Vendor|null>(null);
  const [todayRecords, setTodayRecords] = useState<MealRecord[]>([]);
  const [monthRecords, setMonthRecords] = useState<MealRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [imgLoading, setImgLoading] = useState(false);

  const now = getNowKST();
  const [monthYear, setMonthYear] = useState(String(now.getUTCFullYear()));
  const [monthMonth, setMonthMonth] = useState(String(now.getUTCMonth()+1));

  useEffect(() => {
    async function init() {
      setLoading(true);
      try {
        const vr = await fetch(`/api/meal-vendor/by-token/${token}`);
        const vd = await vr.json();
        if (!vd.success) { setError("유효하지 않은 링크입니다."); return; }
        setVendor(vd.data);
        const today = getTodayKST();
        const rr = await fetch(`/api/meal-record/by-token/${token}?date=${today}`);
        const rd = await rr.json();
        if (rd.success) setTodayRecords(rd.data);
      } catch { setError("서버 연결 오류"); } finally { setLoading(false); }
    }
    init();
  }, [token]);

  const loadMonth = useCallback(async () => {
    const r = await fetch(`/api/meal-record/by-token/${token}?year=${monthYear}&month=${monthMonth}`);
    const d = await r.json();
    if (d.success) setMonthRecords(d.data);
  }, [token, monthYear, monthMonth]);

  useEffect(() => { if (activeTab === "monthly") loadMonth(); }, [activeTab, loadMonth]);

  const today = getTodayKST();

  // 이미지 다운로드
  const downloadImage = async () => {
    if (!vendor) return;
    setImgLoading(true);
    try {
      const price = vendor.pricePerMeal ?? 0;
      const dc = getDaysInMonth(parseInt(monthYear), parseInt(monthMonth));
      const rows = Array.from({ length: dc }, (_, i) => {
        const day = String(i+1).padStart(2,"0");
        const dateStr = `${monthYear}-${monthMonth.padStart(2,"0")}-${day}`;
        const recs = monthRecords.filter(r => r.date === dateStr);
        const totalCount = recs.reduce((s, r) => s + r.count, 0);
        const mealSummary = recs.map(r => `${r.mealType} ${r.count}명`).join(" / ");
        const memo = recs.map(r => r.memo).filter(Boolean).join(" / ");
        return { dateStr, recs, totalCount, mealSummary, memo };
      });
      const grandTotal = rows.reduce((s, r) => s + r.totalCount, 0);
      const byType: Record<string, number> = {};
      monthRecords.forEach(r => { byType[r.mealType] = (byType[r.mealType]||0) + r.count; });

      const thStyle = "border:1px solid #aaa;padding:7px 10px;background:#e8e8e8;text-align:center;font-weight:bold;font-size:13px";
      const tdStyle = "border:1px solid #ccc;padding:6px 10px;text-align:center;font-size:13px";

      const rowsHtml = rows.map(r => {
        const we = isWeekend(r.dateStr) ? "color:#cc0000;" : "";
        if (r.recs.length === 0) {
          return `<tr style="${we}">
            <td style="${tdStyle}">${r.dateStr.slice(5)}</td>
            <td style="${tdStyle}">${getDayStr(r.dateStr)}</td>
            <td style="${tdStyle};color:#ccc" colspan="3">-</td>
          </tr>`;
        }
        return r.recs.map((rec, i) => `<tr style="${we}">
          ${i===0 ? `<td style="${tdStyle}" rowspan="${r.recs.length}">${r.dateStr.slice(5)}</td>
            <td style="${tdStyle}" rowspan="${r.recs.length}">${getDayStr(r.dateStr)}</td>` : ""}
          <td style="${tdStyle}">${rec.mealType}</td>
          <td style="${tdStyle};font-weight:bold;color:#1d4ed8;font-size:15px">${rec.count}명${price ? `<br/><span style="font-size:11px;color:#555;font-weight:normal">${(rec.count*price).toLocaleString()}원</span>` : ""}</td>
          <td style="${tdStyle};text-align:left;color:#666">${rec.memo||""}</td>
        </tr>`).join("");
      }).join("");

      const totalSummary = Object.entries(byType).map(([k,v])=>`${k} ${v}명`).join(" &nbsp;/&nbsp; ");
      const totalAmt = grandTotal && price ? `&nbsp;|&nbsp; 합계금액: <strong style="color:#15803d">${(grandTotal*price).toLocaleString()}원</strong>` : "";

      const innerHtml = `
        <div style="padding:32px;background:white;font-family:'Malgun Gothic',sans-serif;width:700px;box-sizing:border-box">
          <h2 style="text-align:center;font-size:18px;margin:0 0 6px;color:#111">${vendor.factory} 공장 ${monthYear}년 ${monthMonth}월 식수 현황</h2>
          <p style="text-align:center;color:#555;margin:0 0 4px;font-size:13px">업체: <strong>${vendor.name}</strong>${price ? ` &nbsp;|&nbsp; 단가: <strong>${price.toLocaleString()}원/식</strong>` : ""}</p>
          <table style="width:100%;border-collapse:collapse;margin-top:16px">
            <thead><tr>
              <th style="${thStyle}">날짜</th>
              <th style="${thStyle}">요일</th>
              <th style="${thStyle}">식사</th>
              <th style="${thStyle}">인원${price ? " / 금액" : ""}</th>
              <th style="${thStyle}">전달사항</th>
            </tr></thead>
            <tbody>${rowsHtml}</tbody>
            <tfoot><tr style="background:#dbeafe;font-weight:bold">
              <td style="${thStyle}" colspan="3">합계</td>
              <td style="${thStyle};text-align:left" colspan="2">
                ${totalSummary} &nbsp;/&nbsp; 전체 ${grandTotal}명${totalAmt}
              </td>
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
      link.download = `식수현황_${vendor.factory}_${monthYear}년${monthMonth}월.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (e) {
      console.error(e);
      alert("이미지 생성 중 오류가 발생했습니다.");
    } finally { setImgLoading(false); }
  };

  if (loading) return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <p className="text-2xl text-gray-400 font-bold">불러오는 중...</p>
    </div>
  );
  if (error || !vendor) return (
    <div className="min-h-screen bg-white flex items-center justify-center p-6">
      <div className="text-center">
        <p className="text-2xl font-bold text-red-500 mb-2">접근 불가</p>
        <p className="text-gray-500">{error || "업체를 찾을 수 없습니다."}</p>
      </div>
    </div>
  );

  const isLocked = isPastDeadline(vendor.deadlineHour, vendor.deadlineMin);
  const mealOrder = ["점심","저녁","기타"];
  const sortedToday = [...todayRecords].sort((a,b) => mealOrder.indexOf(a.mealType) - mealOrder.indexOf(b.mealType));

  const daysInMonth = getDaysInMonth(parseInt(monthYear), parseInt(monthMonth));
  const monthRows = Array.from({length: daysInMonth}, (_, i) => {
    const day = String(i+1).padStart(2,"0");
    const dateStr = `${monthYear}-${monthMonth.padStart(2,"0")}-${day}`;
    const recs = monthRecords.filter(r => r.date === dateStr);
    return { dateStr, recs };
  });
  const totalByType: Record<string, number> = {};
  monthRecords.forEach(r => { totalByType[r.mealType] = (totalByType[r.mealType]||0) + r.count; });
  const grandTotal = Object.values(totalByType).reduce((s,v)=>s+v,0);
  const price = vendor.pricePerMeal ?? 0;

  return (
    <div className="min-h-screen bg-white text-gray-900 max-w-lg mx-auto">
      {/* 헤더 */}
      <div className="bg-blue-600 text-white px-6 py-5">
        <div className="text-base font-semibold opacity-80">{vendor.factory} 공장 식당</div>
        <div className="text-2xl font-bold mt-0.5">{vendor.name}</div>
        {price > 0 && <div className="text-sm opacity-75 mt-0.5">단가: {price.toLocaleString()}원/식</div>}
        {isLocked && (
          <div className="mt-2 text-sm bg-red-500 text-white px-3 py-1 rounded-full inline-block font-semibold">
            마감 ({vendor.deadlineHour}:{String(vendor.deadlineMin).padStart(2,"0")})
          </div>
        )}
      </div>

      {/* 탭 */}
      <div className="flex border-b-2 border-gray-100">
        {(["today","monthly"] as const).map(t => (
          <button key={t} onClick={() => setActiveTab(t)}
            className={`flex-1 py-4 text-lg font-bold transition-colors ${activeTab===t ? "text-blue-600 border-b-3 border-blue-600 bg-blue-50" : "text-gray-400"}`}>
            {t === "today" ? "오늘 수량" : "월별 수량"}
          </button>
        ))}
      </div>

      {/* 오늘 수량 */}
      {activeTab === "today" && (
        <div className="px-6 py-8">
          <div className="text-center mb-8">
            <div className="text-4xl font-black text-gray-900">{today.slice(5).replace("-","월 ")}일</div>
            <div className="text-2xl font-bold text-blue-600 mt-1">({getDayStr(today)}요일)</div>
          </div>

          {sortedToday.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-2xl text-gray-300 font-bold">미등록</p>
              <p className="text-gray-400 mt-2">아직 식수 요청이 없습니다.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {sortedToday.map(rec => (
                <div key={rec.id} className="bg-gray-50 rounded-2xl px-6 py-5">
                  <div className="flex items-center justify-between">
                    <span className="text-2xl font-bold text-gray-700">{rec.mealType}</span>
                    <span className="text-5xl font-black text-blue-600">{rec.count}<span className="text-2xl font-bold ml-1">명</span></span>
                  </div>
                  {price > 0 && (
                    <div className="text-right text-base font-semibold text-green-600 mt-1">
                      {(rec.count * price).toLocaleString()}원
                    </div>
                  )}
                </div>
              ))}
              {price > 0 && sortedToday.length > 1 && (
                <div className="bg-green-50 rounded-2xl px-6 py-4 flex items-center justify-between">
                  <span className="text-lg font-bold text-green-800">오늘 합계 금액</span>
                  <span className="text-2xl font-black text-green-700">
                    {(sortedToday.reduce((s,r)=>s+r.count,0) * price).toLocaleString()}원
                  </span>
                </div>
              )}
              {sortedToday.some(r=>r.memo) && (
                <div className="mt-2 bg-yellow-50 border border-yellow-200 rounded-2xl px-6 py-4">
                  <div className="text-base font-bold text-yellow-800 mb-2">전달사항</div>
                  {sortedToday.filter(r=>r.memo).map(r=>(
                    <p key={r.id} className="text-lg text-yellow-900">{r.memo}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 월별 수량 */}
      {activeTab === "monthly" && (
        <div className="px-4 py-6 space-y-4">
          <div className="flex items-center gap-2 px-2">
            <input type="number" value={monthYear} onChange={e=>setMonthYear(e.target.value)}
              className="w-20 h-11 border border-gray-200 rounded-xl px-3 text-lg font-bold text-center focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <span className="text-lg font-bold text-gray-600">년</span>
            <select value={monthMonth} onChange={e=>setMonthMonth(e.target.value)}
              className="h-11 px-3 border border-gray-200 rounded-xl text-lg font-bold focus:outline-none focus:ring-2 focus:ring-blue-500">
              {Array.from({length:12},(_,i)=><option key={i+1} value={i+1}>{i+1}월</option>)}
            </select>
            <button onClick={loadMonth} className="flex-1 h-11 bg-blue-600 text-white rounded-xl text-base font-bold">조회</button>
          </div>

          {/* 이미지 저장 버튼 */}
          <button onClick={downloadImage} disabled={imgLoading}
            className="mx-2 flex items-center justify-center gap-2 w-[calc(100%-16px)] py-3 rounded-xl bg-purple-600 text-white font-bold text-base active:bg-purple-700 disabled:opacity-60">
            {imgLoading ? "이미지 생성 중..." : "📷 이달 보고서 이미지 저장"}
          </button>

          {/* 합계 금액 카드 */}
          {grandTotal > 0 && price > 0 && (
            <div className="mx-2 bg-green-50 border border-green-200 rounded-xl px-5 py-3 flex items-center justify-between">
              <div>
                <div className="text-sm text-green-700 font-semibold">이달 합계</div>
                <div className="text-xs text-green-600">{grandTotal}명 × {price.toLocaleString()}원</div>
              </div>
              <div className="text-2xl font-black text-green-700">{(grandTotal * price).toLocaleString()}원</div>
            </div>
          )}

          <div className="overflow-x-auto rounded-xl border border-gray-100 mx-2">
            <table className="w-full text-base text-center">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="py-3 px-3 font-bold text-gray-600">날짜</th>
                  <th className="py-3 px-2 font-bold text-gray-600">요일</th>
                  <th className="py-3 px-3 font-bold text-gray-600">식사</th>
                  <th className="py-3 px-3 font-bold text-gray-600">인원</th>
                  {price > 0 && <th className="py-3 px-3 font-bold text-green-700">금액</th>}
                  <th className="py-3 px-3 font-bold text-gray-600 text-left">전달사항</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {monthRows.map(({ dateStr, recs }) => {
                  const dow = new Date(dateStr+"T12:00:00").getDay();
                  const we = dow===0||dow===6;
                  if (recs.length === 0) return (
                    <tr key={dateStr} className={we?"bg-red-50/30":""}>
                      <td className={`py-2.5 px-3 font-mono text-sm ${we?"text-red-400":""}`}>{dateStr.slice(5)}</td>
                      <td className={`py-2.5 px-2 font-bold text-sm ${we?"text-red-400":""}`}>{DAYS[dow]}</td>
                      <td colSpan={price>0?4:3} className="py-2.5 px-3 text-gray-200">-</td>
                    </tr>
                  );
                  return recs.map((r,i)=>(
                    <tr key={r.id} className={we?"bg-red-50/30":""}>
                      {i===0 && <td rowSpan={recs.length} className={`py-2.5 px-3 font-mono text-sm ${we?"text-red-400":""}`}>{dateStr.slice(5)}</td>}
                      {i===0 && <td rowSpan={recs.length} className={`py-2.5 px-2 font-bold text-sm ${we?"text-red-400":""}`}>{DAYS[dow]}</td>}
                      <td className="py-2.5 px-3 text-sm text-gray-600">{r.mealType}</td>
                      <td className="py-2.5 px-3 font-bold text-blue-700 text-lg">{r.count}명</td>
                      {price > 0 && <td className="py-2.5 px-3 font-semibold text-green-700 text-sm">{(r.count*price).toLocaleString()}원</td>}
                      <td className="py-2.5 px-3 text-sm text-gray-500 text-left">{r.memo||""}</td>
                    </tr>
                  ));
                })}
              </tbody>
              <tfoot className="bg-blue-50 border-t-2 border-blue-200">
                <tr>
                  <td colSpan={3} className="py-3 px-3 font-bold text-blue-800 text-left">합계</td>
                  <td className="py-3 px-3 font-bold text-blue-800">{grandTotal}명</td>
                  {price > 0 && <td className="py-3 px-3 font-bold text-green-800">{(grandTotal*price).toLocaleString()}원</td>}
                  <td className="py-3 px-3 font-bold text-blue-800 text-left">
                    {Object.entries(totalByType).map(([k,v])=>`${k} ${v}명`).join(" / ")}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

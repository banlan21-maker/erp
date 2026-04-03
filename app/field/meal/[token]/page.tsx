"use client";

import { useState, useEffect, useCallback } from "react";
import { use } from "react";

const DAYS = ["일","월","화","수","목","금","토"];
function getTodayKST() { return new Date(Date.now()+9*3600000).toISOString().slice(0,10); }
function getDayStr(d: string) { return DAYS[new Date(d+"T12:00:00").getDay()]; }

interface Vendor { id: string; name: string; factory: string; deadlineHour: number; deadlineMin: number; isActive: boolean; }
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

  // Sort by mealType order
  const mealOrder = ["점심","저녁","기타"];
  const sortedToday = [...todayRecords].sort((a,b) => mealOrder.indexOf(a.mealType) - mealOrder.indexOf(b.mealType));

  // Monthly table
  const daysInMonth = new Date(parseInt(monthYear), parseInt(monthMonth), 0).getDate();
  const monthRows = Array.from({length: daysInMonth}, (_, i) => {
    const day = String(i+1).padStart(2,"0");
    const dateStr = `${monthYear}-${monthMonth.padStart(2,"0")}-${day}`;
    const recs = monthRecords.filter(r => r.date === dateStr);
    return { dateStr, recs };
  });
  const totalByType: Record<string, number> = {};
  monthRecords.forEach(r => { totalByType[r.mealType] = (totalByType[r.mealType]||0) + r.count; });
  const grandTotal = Object.values(totalByType).reduce((s,v)=>s+v,0);

  return (
    <div className="min-h-screen bg-white text-gray-900 max-w-lg mx-auto">
      {/* 헤더 */}
      <div className="bg-blue-600 text-white px-6 py-5">
        <div className="text-base font-semibold opacity-80">{vendor.factory} 공장 식당</div>
        <div className="text-2xl font-bold mt-0.5">{vendor.name}</div>
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

      {/* 오늘 수량 탭 */}
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
                <div key={rec.id} className="bg-gray-50 rounded-2xl px-6 py-5 flex items-center justify-between">
                  <span className="text-2xl font-bold text-gray-700">{rec.mealType}</span>
                  <span className="text-5xl font-black text-blue-600">{rec.count}<span className="text-2xl font-bold ml-1">명</span></span>
                </div>
              ))}
              {sortedToday.some(r=>r.memo) && (
                <div className="mt-6 bg-yellow-50 border border-yellow-200 rounded-2xl px-6 py-4">
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

      {/* 월별 수량 탭 */}
      {activeTab === "monthly" && (
        <div className="px-4 py-6">
          <div className="flex items-center gap-2 mb-5 px-2">
            <input type="number" value={monthYear} onChange={e=>setMonthYear(e.target.value)}
              className="w-20 h-11 border border-gray-200 rounded-xl px-3 text-lg font-bold text-center focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <span className="text-lg font-bold text-gray-600">년</span>
            <select value={monthMonth} onChange={e=>setMonthMonth(e.target.value)}
              className="h-11 px-3 border border-gray-200 rounded-xl text-lg font-bold focus:outline-none focus:ring-2 focus:ring-blue-500">
              {Array.from({length:12},(_,i)=><option key={i+1} value={i+1}>{i+1}월</option>)}
            </select>
            <button onClick={loadMonth} className="flex-1 h-11 bg-blue-600 text-white rounded-xl text-base font-bold">조회</button>
          </div>

          <div className="overflow-x-auto rounded-xl border border-gray-100">
            <table className="w-full text-base text-center">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="py-3 px-3 font-bold text-gray-600">날짜</th>
                  <th className="py-3 px-2 font-bold text-gray-600">요일</th>
                  <th className="py-3 px-3 font-bold text-gray-600">식사</th>
                  <th className="py-3 px-3 font-bold text-gray-600">인원</th>
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
                      <td colSpan={3} className="py-2.5 px-3 text-gray-200">-</td>
                    </tr>
                  );
                  return recs.map((r,i)=>(
                    <tr key={r.id} className={we?"bg-red-50/30":""}>
                      {i===0 && <td rowSpan={recs.length} className={`py-2.5 px-3 font-mono text-sm ${we?"text-red-400":""}`}>{dateStr.slice(5)}</td>}
                      {i===0 && <td rowSpan={recs.length} className={`py-2.5 px-2 font-bold text-sm ${we?"text-red-400":""}`}>{DAYS[dow]}</td>}
                      <td className="py-2.5 px-3 text-sm text-gray-600">{r.mealType}</td>
                      <td className="py-2.5 px-3 font-bold text-blue-700 text-lg">{r.count}명</td>
                      <td className="py-2.5 px-3 text-sm text-gray-500 text-left">{r.memo||""}</td>
                    </tr>
                  ));
                })}
              </tbody>
              <tfoot className="bg-blue-50 border-t-2 border-blue-200">
                <tr>
                  <td colSpan={3} className="py-3 px-3 font-bold text-blue-800 text-left">합계</td>
                  <td colSpan={2} className="py-3 px-3 font-bold text-blue-800 text-left">
                    {Object.entries(totalByType).map(([k,v])=>`${k} ${v}식`).join(" / ")}
                    {grandTotal > 0 && ` / 전체 ${grandTotal}식`}
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

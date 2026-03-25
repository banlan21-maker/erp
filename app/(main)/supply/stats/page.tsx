"use client";

import { useEffect, useState } from "react";
import { BarChart3, Calendar, RefreshCw, Package } from "lucide-react";

export default function SupplyStatsPage() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // 현재 날짜 기준
  const today = new Date();
  const [month, setMonth] = useState(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/supply/stats?month=${month}`);
      const json = await res.json();
      if (json.success) setData(json.data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
          <BarChart3 size={24} className="text-blue-600" />
          월별 소모품 사용량 집계
        </h2>
        <p className="text-sm text-gray-500 mt-1">소모품 전용 통계 리포트로, 품목별 상세 소비량과 전월 대비 추이를 추적합니다.</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-5 border-b border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-4 bg-gray-50/50">
          <h3 className="font-bold text-gray-800 text-lg flex items-center gap-2 tracking-tight">
             <Package size={18} className="text-gray-500"/> 출고(소비)량 세부 집계
          </h3>
          <div className="flex items-center gap-2 relative bg-white shadow-sm rounded-lg border border-gray-200">
            <Calendar size={14} className="absolute left-3 text-gray-400" />
            <input 
              type="month" 
              value={month} 
              onChange={(e) => setMonth(e.target.value)}
              className="pl-9 pr-3 py-1.5 h-9 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 bg-transparent"
            />
          </div>
        </div>

        <div className="overflow-x-auto min-h-[400px]">
          <table className="w-full text-sm text-left">
            <thead className="bg-[#f8fafc] border-b border-gray-200 text-gray-600">
              <tr>
                <th className="px-5 py-3.5 font-semibold text-xs uppercase tracking-wider">품명</th>
                <th className="px-5 py-3.5 font-semibold text-xs uppercase tracking-wider">분류</th>
                <th className="px-5 py-3.5 font-semibold text-xs uppercase tracking-wider text-right">선택월 출고량</th>
                <th className="px-5 py-3.5 font-semibold text-xs uppercase tracking-wider text-center">단위</th>
                <th className="px-5 py-3.5 font-semibold text-xs uppercase tracking-wider text-right">전월 대비 증감</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-5 py-32 text-center text-gray-400">
                    <RefreshCw className="animate-spin text-blue-500 mx-auto mb-3" size={28} />
                    데이터 갱신 중...
                  </td>
                </tr>
              ) : data.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-32 text-center text-gray-400 bg-gray-50/20">
                    <p className="font-medium text-gray-500">선택하신 기준 월({month})에 해당하는 데이터가 존재하지 않습니다.</p>
                  </td>
                </tr>
              ) : (
                data.map((stat, i) => (
                  <tr key={i} className="hover:bg-blue-50/20 transition-colors">
                    <td className="px-5 py-4 font-bold text-gray-900 border-l-[3px] border-transparent hover:border-blue-500 pl-4">{stat.item?.name}</td>
                    <td className="px-5 py-4 text-gray-500">{stat.item?.subCategory || "-"}</td>
                    <td className="px-5 py-4 text-right font-black text-[15px] text-gray-800">{stat.currentQty}</td>
                    <td className="px-5 py-4 text-center text-gray-400 text-xs font-medium">{stat.item?.unit}</td>
                    <td className="px-5 py-4 text-right font-medium text-[13px]">
                      {stat.diff === 0 ? (
                        <span className="text-gray-400 px-2.5 py-1 bg-gray-50 rounded-full font-mono">동일 —</span>
                      ) : stat.diff > 0 ? (
                        <span className="text-red-600 px-2.5 py-1 bg-red-50 border border-red-100 rounded-full">증가 +{stat.diff}</span>
                      ) : (
                        <span className="text-emerald-600 px-2.5 py-1 bg-emerald-50 border border-emerald-100 rounded-full">감소 {stat.diff}</span>
                      )}
                    </td>
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

"use client";

import { useEffect, useState } from "react";
import { 
  LayoutDashboard, AlertCircle, Package, ClipboardList, 
  Activity, ArrowDownRight, ArrowUpRight, RefreshCw, CheckCircle2 
} from "lucide-react";

export default function SupplyDashboardPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchDashboard() {
      try {
        const res = await fetch("/api/supply/dashboard");
        const json = await res.json();
        if (json.success) {
          setData(json.data);
        }
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    }
    fetchDashboard();
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-gray-400 gap-3">
        <RefreshCw className="animate-spin text-blue-500" size={32} />
        <p className="text-sm font-medium">대시보드 데이터를 불러오는 중입니다...</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-8 text-center text-red-500 bg-red-50 rounded-xl border border-red-100 shadow-sm">
        데이터를 불러오지 못했습니다. 서버 상태를 확인해주세요.
      </div>
    );
  }

  const { needReorderCount, consumableCount, fixtureCount, monthlyOutboundCount, reorderItems, recentInbounds, recentOutbounds } = data;

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  };

  return (
    <div className="space-y-6">
      {/* 1. 타이틀 영역 */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
          <LayoutDashboard size={24} className="text-blue-600" />
          자재 대시보드
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          소모품 및 비품의 통합 재고 현황과 최근 입출고 내역을 요약하여 파악합니다.
        </p>
      </div>

      {/* 2. 상단 요약 카드 4개 */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* 발주 필요 품목 수 (stockQty <= reorderPoint 인 소모품 수) */}
        <div className={`p-5 rounded-xl border ${needReorderCount > 0 ? "bg-red-50 border-red-200" : "bg-white border-gray-100"} shadow-sm flex flex-col`}>
          <div className="flex justify-between items-start mb-2">
            <p className={`text-sm font-semibold ${needReorderCount > 0 ? "text-red-700" : "text-gray-500"}`}>발주 필요 품목 (경보)</p>
            {needReorderCount > 0 ? <AlertCircle size={18} className="text-red-500" /> : <CheckCircle2 size={18} className="text-green-500" />}
          </div>
          <p className={`text-3xl font-bold truncate ${needReorderCount > 0 ? "text-red-700" : "text-gray-900"}`}>{needReorderCount}건</p>
        </div>
        
        {/* 소모품 총 품목 수 */}
        <div className="p-5 rounded-xl border border-gray-100 bg-white shadow-sm flex flex-col">
          <div className="flex justify-between items-start mb-2">
            <p className="text-sm font-semibold text-gray-500">등록된 소모품 수</p>
            <Package size={18} className="text-blue-500" />
          </div>
          <p className="text-3xl font-bold text-gray-900">{consumableCount}품목</p>
        </div>
        
        {/* 비품 총 품목 수 */}
        <div className="p-5 rounded-xl border border-gray-100 bg-white shadow-sm flex flex-col">
          <div className="flex justify-between items-start mb-2">
            <p className="text-sm font-semibold text-gray-500">등록된 비품 수</p>
            <ClipboardList size={18} className="text-blue-500" />
          </div>
          <p className="text-3xl font-bold text-gray-900">{fixtureCount}품목</p>
        </div>
        
        {/* 이번달 출고 건수 */}
        <div className="p-5 rounded-xl border border-gray-100 bg-white shadow-sm flex flex-col">
          <div className="flex justify-between items-start mb-2">
            <p className="text-sm font-semibold text-gray-500">이번 달 총 출고 건수</p>
            <Activity size={18} className="text-emerald-500" />
          </div>
          <p className="text-3xl font-bold text-gray-900">{monthlyOutboundCount}건</p>
        </div>
      </div>

      {/* 3. 발주 필요 소모품 목록 테이블 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-100 bg-red-50/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h3 className="font-bold text-gray-900 flex items-center gap-2">
            <AlertCircle size={18} className="text-red-500" /> 
            발주 필요 소모품 목록
          </h3>
          {needReorderCount > 0 && <span className="text-xs bg-red-100 text-red-700 py-1 px-3 rounded-md font-semibold self-start sm:self-auto shadow-sm border border-red-200">입고를 서둘러주세요</span>}
        </div>
        
        <div className="overflow-x-auto min-h-[150px]">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead className="bg-gray-50 border-b border-gray-200 text-gray-600">
              <tr>
                <th className="px-5 py-3 font-semibold text-xs text-gray-500">품명</th>
                <th className="px-5 py-3 font-semibold text-xs text-gray-500">세부분류</th>
                <th className="px-5 py-3 font-semibold text-xs text-gray-500 text-right">현재재고</th>
                <th className="px-5 py-3 font-semibold text-xs text-gray-500 text-right">발주기준점</th>
                <th className="px-5 py-3 font-semibold text-xs text-gray-500 text-center">단위</th>
                <th className="px-5 py-3 font-semibold text-xs text-gray-500">보관위치</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {reorderItems.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center bg-gray-50/50">
                    <CheckCircle2 size={32} className="mx-auto text-green-400 mb-3 opacity-80" />
                    <span className="text-gray-500 font-medium text-sm">발주 준비가 필요한 재고 부족 품목이 없습니다 ✅</span>
                  </td>
                </tr>
              ) : (
                reorderItems.map((item: any) => (
                  <tr key={item.id} className="hover:bg-red-50/30 transition-colors group">
                    <td className="px-5 py-3.5 font-bold text-gray-900">{item.name}</td>
                    <td className="px-5 py-3.5 text-gray-500">{item.subCategory || "-"}</td>
                    <td className="px-5 py-3.5 text-right font-bold text-red-600">{item.stockQty}</td>
                    <td className="px-5 py-3.5 text-right text-gray-400 line-through">{item.reorderPoint}</td>
                    <td className="px-5 py-3.5 text-center text-gray-500 font-medium">{item.unit}</td>
                    <td className="px-5 py-3.5 text-gray-500 text-sm font-mono">{item.location || "-"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. 최근 입출고 이력 (5건씩 병렬) */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        
        {/* 최근 입고 5건 */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
          <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
            <h3 className="font-bold text-gray-900 flex items-center gap-2">
              <ArrowDownRight size={18} className="text-blue-500" /> 
              최근 입고 내역
            </h3>
            <span className="text-xs text-gray-400">최대 5건</span>
          </div>
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-sm text-left whitespace-nowrap">
              <thead className="bg-gray-50 text-gray-500 border-b border-gray-100 text-xs font-semibold">
                <tr>
                  <th className="px-4 py-3">입고일시</th>
                  <th className="px-4 py-3">품명</th>
                  <th className="px-4 py-3 text-right">수량</th>
                  <th className="px-4 py-3">거래처</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {recentInbounds.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">최근 입고 내역이 없습니다.</td></tr>
                ) : (
                  recentInbounds.map((inbound: any) => (
                    <tr key={inbound.id} className="hover:bg-blue-50/30 transition-colors">
                      <td className="px-4 py-3 text-gray-500 font-mono text-xs">{formatDate(inbound.receivedAt)}</td>
                      <td className="px-4 py-3 font-semibold text-gray-800">{inbound.item?.name || "-"}</td>
                      <td className="px-4 py-3 text-right font-bold text-blue-600">+{inbound.qty} <span className="text-xs font-normal text-gray-400">{inbound.item?.unit}</span></td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{inbound.vendor?.name || "-"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* 최근 출고 5건 */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
          <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
            <h3 className="font-bold text-gray-900 flex items-center gap-2">
              <ArrowUpRight size={18} className="text-orange-500" /> 
              최근 출고 내역
            </h3>
            <span className="text-xs text-gray-400">최대 5건</span>
          </div>
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-sm text-left whitespace-nowrap">
              <thead className="bg-gray-50 text-gray-500 border-b border-gray-100 text-xs font-semibold">
                <tr>
                  <th className="px-4 py-3">출고일시</th>
                  <th className="px-4 py-3">품명</th>
                  <th className="px-4 py-3 text-right">수량</th>
                  <th className="px-4 py-3">사용자</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {recentOutbounds.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">최근 출고 내역이 없습니다.</td></tr>
                ) : (
                  recentOutbounds.map((outbound: any) => (
                    <tr key={outbound.id} className="hover:bg-orange-50/30 transition-colors">
                      <td className="px-4 py-3 text-gray-500 font-mono text-xs">{formatDate(outbound.usedAt)}</td>
                      <td className="px-4 py-3 font-semibold text-gray-800">{outbound.item?.name || "-"}</td>
                      <td className="px-4 py-3 text-right font-bold text-orange-600">-{outbound.qty} <span className="text-xs font-normal text-gray-400">{outbound.item?.unit}</span></td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{outbound.usedBy}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}

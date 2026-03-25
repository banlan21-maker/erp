"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Calendar, Search, Filter, History, PackageCheck, PackageMinus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function HistoryPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-400">로딩 중...</div>}>
      <HistoryContent />
    </Suspense>
  );
}

function HistoryContent() {
  const searchParams = useSearchParams();
  const initTab = searchParams.get("tab") === "outbound" ? "outbound" : "inbound";
  
  const [activeTab, setActiveTab] = useState<"inbound" | "outbound">(initTab);
  
  // 오늘 날짜로 월 기본값
  const d = new Date();
  const [month, setMonth] = useState(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  const [searchTerm, setSearchTerm] = useState("");
  const [vendorId, setVendorId] = useState("all");
  const [subCategory, setSubCategory] = useState("all");
  
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  
  const [vendors, setVendors] = useState<any[]>([]);
  const [uniqueSubCategories, setUniqueSubCategories] = useState<string[]>([]); // API나 항목에서 가져오지만 여기선 일단 하드코딩된 리스트나 fetch 데이터 기반으로 추출

  useEffect(() => {
    // 벤더와 서브카테고리(단순화를 위해 품목 리스트를 받아 취합) 리스트
    async function fetchFilters() {
      try {
         const [vRes, iRes] = await Promise.all([
           fetch("/api/supply/vendors"),
           fetch("/api/supply/items")
         ]);
         const vJson = await vRes.json();
         const iJson = await iRes.json();
         if (vJson.success) setVendors(vJson.data);
         if (iJson.success) {
           const subs = Array.from(new Set(iJson.data.map((i:any) => i.subCategory).filter(Boolean))) as string[];
           setUniqueSubCategories(subs);
         }
      } catch (e) { console.error(e) }
    }
    fetchFilters();
  }, []);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      let url = `/api/supply/${activeTab}?month=${month}`;
      if (searchTerm) url += `&search=${encodeURIComponent(searchTerm)}`;
      if (subCategory !== "all") url += `&subCategory=${encodeURIComponent(subCategory)}`;
      if (activeTab === "inbound" && vendorId !== "all") url += `&vendorId=${vendorId}`;

      const res = await fetch(url);
      const json = await res.json();
      if (json.success) setData(json.data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, month, searchTerm, subCategory, vendorId]);

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
          <History size={24} className="text-blue-600" />
          입출고 이력
        </h2>
        <p className="text-sm text-gray-500 mt-1">월별 입고(매입) 내역 및 현장 출고(사용) 이력을 상세히 조회합니다.</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {/* 탭 헤더 */}
        <div className="flex border-b border-gray-100 items-end px-6 pt-4 bg-gray-50/50 gap-4">
          <button 
            onClick={() => { setActiveTab("inbound"); setVendorId("all"); }}
            className={`pb-3 px-2 flex items-center gap-2 font-bold text-sm transition-colors border-b-2 ${activeTab === "inbound" ? "text-emerald-700 border-emerald-600" : "text-gray-500 border-transparent hover:text-gray-800"}`}
          >
            <PackageCheck size={18} /> 입고(매입) 이력
          </button>
          <button 
            onClick={() => setActiveTab("outbound")}
            className={`pb-3 px-2 flex items-center gap-2 font-bold text-sm transition-colors border-b-2 ${activeTab === "outbound" ? "text-orange-700 border-orange-600" : "text-gray-500 border-transparent hover:text-gray-800"}`}
          >
            <PackageMinus size={18} /> 현장 출고 이력
          </button>
        </div>

        {/* 필터 바 */}
        <div className="p-5 border-b border-gray-100 flex flex-wrap items-center gap-4 bg-white">
          <div className="flex items-center gap-2 relative">
            <Calendar size={14} className="absolute left-3 text-gray-400" />
            <input 
              type="month" 
              value={month} 
              onChange={e => setMonth(e.target.value)}
              className="pl-9 pr-3 py-1.5 h-9 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-gray-50"
            />
          </div>

          <div className="flex items-center gap-2 relative">
            <Filter size={14} className="absolute left-3 text-gray-400" />
            <select 
              value={subCategory} 
              onChange={e => setSubCategory(e.target.value)}
              className="pl-9 pr-3 py-1.5 h-9 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-gray-50"
            >
              <option value="all">분류 전체</option>
              {uniqueSubCategories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {activeTab === "inbound" && (
            <div className="flex items-center gap-2 relative min-w-[200px]">
              <Filter size={14} className="absolute left-3 text-gray-400" />
              <select 
                value={vendorId} 
                onChange={e => setVendorId(e.target.value)}
                className="pl-9 pr-3 py-1.5 h-9 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-gray-50 w-full"
              >
                <option value="all">거래처 전체</option>
                {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
          )}

          <div className="flex items-center gap-2 relative flex-1 min-w-[200px] lg:flex-none lg:w-[300px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <Input 
              value={searchTerm} 
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="품명 검색"
              className="pl-9 h-9 text-sm w-full"
            />
          </div>
        </div>

        <div className="overflow-x-auto min-h-[400px]">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead className={`border-b text-gray-600 ${activeTab === 'inbound' ? 'bg-emerald-50/30 border-emerald-100' : 'bg-orange-50/30 border-orange-100'}`}>
              <tr>
                {activeTab === "inbound" ? (
                  <>
                    <th className="px-5 py-3 font-semibold w-40">입고일시</th>
                    <th className="px-5 py-3 font-semibold">품명</th>
                    <th className="px-5 py-3 font-semibold">거래처</th>
                    <th className="px-5 py-3 font-semibold text-right">수량</th>
                    <th className="px-5 py-3 font-semibold text-center">단위</th>
                    <th className="px-5 py-3 font-semibold">당당자</th>
                  </>
                ) : (
                  <>
                    <th className="px-5 py-3 font-semibold w-40">출고일시</th>
                    <th className="px-5 py-3 font-semibold">품명</th>
                    <th className="px-5 py-3 font-semibold text-right">수량</th>
                    <th className="px-5 py-3 font-semibold text-center">단위</th>
                    <th className="px-5 py-3 font-semibold">수령인 (사용자)</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-5 py-24 text-center text-gray-400">
                    <RefreshCw className="animate-spin text-blue-500 mx-auto mb-2" size={24} />
                    데이터 갱신 중...
                  </td>
                </tr>
              ) : data.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-24 text-center text-gray-400">해당 조건의 입출고 이력이 없습니다.</td>
                </tr>
              ) : (
                data.map((row) => (
                  <tr key={row.id} className={`transition-colors ${activeTab === 'inbound' ? 'hover:bg-emerald-50/40' : 'hover:bg-orange-50/40'}`}>
                    {activeTab === "inbound" ? (
                      <>
                        <td className="px-5 py-4 text-xs font-mono text-gray-500">{formatDate(row.receivedAt)}</td>
                        <td className="px-5 py-4 font-bold text-gray-900 flex flex-col justify-center">
                          {row.item?.name} <span className="text-[10px] text-gray-400 font-normal mt-0.5">{row.item?.subCategory || "-"}</span>
                        </td>
                        <td className="px-5 py-4 text-gray-600 text-sm truncate max-w-[150px]">{row.vendor?.name || "-"}</td>
                        <td className="px-5 py-4 text-right font-bold text-emerald-600">+{row.qty}</td>
                        <td className="px-5 py-4 text-center text-gray-500 text-xs">{row.item?.unit}</td>
                        <td className="px-5 py-4 text-gray-600">{row.receivedBy}</td>
                      </>
                    ) : (
                      <>
                        <td className="px-5 py-4 text-xs font-mono text-gray-500">{formatDate(row.usedAt)}</td>
                        <td className="px-5 py-4 font-bold text-gray-900 flex flex-col justify-center">
                          {row.item?.name} <span className="text-[10px] text-gray-400 font-normal mt-0.5">{row.item?.subCategory || "-"}</span>
                        </td>
                        <td className="px-5 py-4 text-right font-bold text-orange-600">-{row.qty}</td>
                        <td className="px-5 py-4 text-center text-gray-500 text-xs">{row.item?.unit}</td>
                        <td className="px-5 py-4 text-gray-800 font-medium">{row.usedBy}</td>
                      </>
                    )}
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


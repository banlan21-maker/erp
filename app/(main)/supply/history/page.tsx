"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Calendar, Search, Filter, History, PackageCheck, PackageMinus, RefreshCw } from "lucide-react";
import { Input } from "@/components/ui/input";

const DEPT_LABELS: Record<string, string> = { CUTTING: "절단", FACILITY: "공무" };
const DEPT_COLORS: Record<string, string> = {
  CUTTING: "bg-blue-100 text-blue-700",
  FACILITY: "bg-purple-100 text-purple-700",
};

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

  const d = new Date();
  const [month, setMonth] = useState(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  const [searchTerm, setSearchTerm] = useState("");
  const [vendorId, setVendorId] = useState("all");
  const [subCategory, setSubCategory] = useState("all");

  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const [vendors, setVendors] = useState<any[]>([]);
  const [uniqueSubCategories, setUniqueSubCategories] = useState<string[]>([]);

  useEffect(() => {
    async function fetchFilters() {
      try {
        const [vRes, iRes] = await Promise.all([
          fetch("/api/supply/vendors"),
          fetch("/api/supply/items"),
        ]);
        const vJson = await vRes.json();
        const iJson = await iRes.json();
        if (vJson.success) setVendors(vJson.data);
        if (iJson.success) {
          const subs = Array.from(new Set(iJson.data.map((i: any) => i.subCategory).filter(Boolean))) as string[];
          setUniqueSubCategories(subs);
        }
      } catch (e) { console.error(e); }
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
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  const inboundCols = 12;
  const outboundCols = 10;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
          <History size={24} className="text-blue-600" />
          입출고 전체 이력
        </h2>
        <p className="text-sm text-gray-500 mt-1">월별 입고(매입) 내역 및 현장 출고(사용) 이력을 상세히 조회합니다.</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {/* 탭 */}
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

        {/* 필터 */}
        <div className="p-5 border-b border-gray-100 flex flex-wrap items-center gap-4 bg-white">
          <div className="relative">
            <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="month"
              value={month}
              onChange={e => setMonth(e.target.value)}
              className="pl-9 pr-3 py-1.5 h-9 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-gray-50"
            />
          </div>
          <div className="relative">
            <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
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
            <div className="relative min-w-[200px]">
              <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
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
          <div className="relative flex-1 min-w-[200px] lg:flex-none lg:w-[300px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <Input
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="품명 검색"
              className="pl-9 h-9 text-sm w-full"
            />
          </div>
        </div>

        {/* 테이블 */}
        <div className="overflow-x-auto min-h-[400px]">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead className={`border-b text-xs text-gray-600 uppercase ${activeTab === "inbound" ? "bg-emerald-50/30 border-emerald-100" : "bg-orange-50/30 border-orange-100"}`}>
              <tr>
                {activeTab === "inbound" ? (
                  <>
                    <th className="px-4 py-3 font-semibold">입고일시</th>
                    <th className="px-4 py-3 font-semibold">관리주체</th>
                    <th className="px-4 py-3 font-semibold">세부분류</th>
                    <th className="px-4 py-3 font-semibold">품명</th>
                    <th className="px-4 py-3 font-semibold">거래처</th>
                    <th className="px-4 py-3 font-semibold text-right">현재재고</th>
                    <th className="px-4 py-3 font-semibold text-right">입고수량</th>
                    <th className="px-4 py-3 font-semibold text-right">입고후재고</th>
                    <th className="px-4 py-3 font-semibold text-center">단위</th>
                    <th className="px-4 py-3 font-semibold">보관위치</th>
                    <th className="px-4 py-3 font-semibold">담당자</th>
                    <th className="px-4 py-3 font-semibold">메모</th>
                  </>
                ) : (
                  <>
                    <th className="px-4 py-3 font-semibold">출고일시</th>
                    <th className="px-4 py-3 font-semibold">관리주체</th>
                    <th className="px-4 py-3 font-semibold">세부분류</th>
                    <th className="px-4 py-3 font-semibold">품명</th>
                    <th className="px-4 py-3 font-semibold">수령인</th>
                    <th className="px-4 py-3 font-semibold text-right">현재재고</th>
                    <th className="px-4 py-3 font-semibold text-right">출고수량</th>
                    <th className="px-4 py-3 font-semibold text-right">출고후재고</th>
                    <th className="px-4 py-3 font-semibold text-center">단위</th>
                    <th className="px-4 py-3 font-semibold">메모</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={activeTab === "inbound" ? inboundCols : outboundCols} className="px-5 py-24 text-center text-gray-400">
                    <RefreshCw className="animate-spin text-blue-500 mx-auto mb-2" size={24} />
                    데이터 갱신 중...
                  </td>
                </tr>
              ) : data.length === 0 ? (
                <tr>
                  <td colSpan={activeTab === "inbound" ? inboundCols : outboundCols} className="px-5 py-24 text-center text-gray-400">
                    해당 조건의 입출고 이력이 없습니다.
                  </td>
                </tr>
              ) : (
                data.map((row) => {
                  const beforeQty = row.stockQtyAfter != null
                    ? (activeTab === "inbound" ? row.stockQtyAfter - row.qty : row.stockQtyAfter + row.qty)
                    : null;
                  return (
                    <tr key={row.id} className={`transition-colors ${activeTab === "inbound" ? "hover:bg-emerald-50/40" : "hover:bg-orange-50/40"}`}>
                      {activeTab === "inbound" ? (
                        <>
                          <td className="px-4 py-3 text-xs font-mono text-gray-500">{formatDate(row.receivedAt)}</td>
                          <td className="px-4 py-3">
                            {row.item?.department ? (
                              <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${DEPT_COLORS[row.item.department] || "bg-gray-100 text-gray-600"}`}>
                                {DEPT_LABELS[row.item.department] || row.item.department}
                              </span>
                            ) : <span className="text-gray-300 text-xs">-</span>}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-500">{row.item?.subCategory || "-"}</td>
                          <td className="px-4 py-3 font-semibold text-gray-900">{row.item?.name}</td>
                          <td className="px-4 py-3 text-xs text-gray-600">
                            {row.receivedBy === "재고조정"
                              ? <span className="px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-700 font-semibold">수동조정</span>
                              : row.vendor?.name || <span className="text-gray-300">-</span>}
                          </td>
                          <td className="px-4 py-3 text-right text-xs text-gray-500">
                            {beforeQty != null ? beforeQty : <span className="text-gray-300">-</span>}
                          </td>
                          <td className="px-4 py-3 text-right font-bold text-emerald-600">+{row.qty}</td>
                          <td className="px-4 py-3 text-right font-bold text-gray-800">
                            {row.stockQtyAfter != null ? row.stockQtyAfter : <span className="text-gray-300 font-normal">-</span>}
                          </td>
                          <td className="px-4 py-3 text-center text-xs text-gray-500">{row.item?.unit}</td>
                          <td className="px-4 py-3 text-xs text-gray-500">{row.item?.location || "-"}</td>
                          <td className="px-4 py-3 text-xs text-gray-600">{row.receivedBy}</td>
                          <td className="px-4 py-3 text-xs text-gray-400">{row.memo || "-"}</td>
                        </>
                      ) : (
                        <>
                          <td className="px-4 py-3 text-xs font-mono text-gray-500">{formatDate(row.usedAt)}</td>
                          <td className="px-4 py-3">
                            {row.item?.department ? (
                              <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${DEPT_COLORS[row.item.department] || "bg-gray-100 text-gray-600"}`}>
                                {DEPT_LABELS[row.item.department] || row.item.department}
                              </span>
                            ) : <span className="text-gray-300 text-xs">-</span>}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-500">{row.item?.subCategory || "-"}</td>
                          <td className="px-4 py-3 font-semibold text-gray-900">{row.item?.name}</td>
                          <td className="px-4 py-3 text-xs text-gray-600">{row.usedBy}</td>
                          <td className="px-4 py-3 text-right text-xs text-gray-500">
                            {beforeQty != null ? beforeQty : <span className="text-gray-300">-</span>}
                          </td>
                          <td className="px-4 py-3 text-right font-bold text-orange-600">-{row.qty}</td>
                          <td className="px-4 py-3 text-right font-bold text-gray-800">
                            {row.stockQtyAfter != null ? row.stockQtyAfter : <span className="text-gray-300 font-normal">-</span>}
                          </td>
                          <td className="px-4 py-3 text-center text-xs text-gray-500">{row.item?.unit}</td>
                          <td className="px-4 py-3 text-xs text-gray-400">{row.memo || "-"}</td>
                        </>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

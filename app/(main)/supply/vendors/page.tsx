"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Truck, Search, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function VendorsPage() {
  const router = useRouter();
  const [vendors, setVendors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  const fetchVendors = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/supply/vendors");
      const json = await res.json();
      if (json.success) setVendors(json.data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVendors();
  }, []);

  const filteredVendors = useMemo(() => {
    return vendors.filter(v => 
      v.name.includes(searchTerm) || 
      (v.contact && v.contact.includes(searchTerm))
    );
  }, [vendors, searchTerm]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Truck size={24} className="text-blue-600" /> 자재 거래처 관리
          </h2>
          <p className="text-sm text-gray-500 mt-1">소모품 및 비품을 공급하는 협력업체를 관리합니다.</p>
        </div>
        <Button 
          onClick={() => router.push("/supply/vendors/new")}
          className="bg-blue-600 hover:bg-blue-700 font-bold shadow-sm"
        >
          <Plus size={16} className="mr-2" /> 신규 거래처 등록
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-20 text-gray-400 gap-3">
          <RefreshCw className="animate-spin text-blue-500" size={28} /> 데이터를 불러오는 중입니다...
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="text-sm font-medium text-gray-700">
              총 <strong>{filteredVendors.length}</strong>곳의 파트너사
            </div>
            <div className="relative w-full sm:w-auto">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <Input
                placeholder="업체명 또는 담당자 검색"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 h-9 text-sm lg:w-[280px]"
              />
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            <div className="overflow-x-auto min-h-[400px]">
              <table className="w-full text-sm text-left whitespace-nowrap">
                <thead className="bg-gray-50 border-b border-gray-200 text-gray-600">
                  <tr>
                    <th className="px-5 py-3 font-semibold">거래처명</th>
                    <th className="px-5 py-3 font-semibold">담당자</th>
                    <th className="px-5 py-3 font-semibold">연락처</th>
                    <th className="px-5 py-3 font-semibold">취급품목 카테고리</th>
                    <th className="px-5 py-3 font-semibold">비고</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredVendors.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-5 py-12 text-center text-gray-400">등록된 거래처가 없습니다.</td>
                    </tr>
                  ) : (
                    filteredVendors.map((vendor) => (
                      <tr 
                        key={vendor.id} 
                        onClick={() => router.push(`/supply/vendors/${vendor.id}`)}
                        className="cursor-pointer transition-colors hover:bg-blue-50/50 group"
                      >
                        <td className="px-5 py-4 font-bold text-gray-900 group-hover:text-blue-700 transition-colors">{vendor.name}</td>
                        <td className="px-5 py-4 text-gray-700">{vendor.contact || "-"}</td>
                        <td className="px-5 py-4 text-gray-600 font-mono text-xs">{vendor.phone || "-"}</td>
                        <td className="px-5 py-4 text-gray-600">{vendor.category || "-"}</td>
                        <td className="px-5 py-4 text-gray-500 truncate max-w-[200px]">{vendor.memo || "-"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

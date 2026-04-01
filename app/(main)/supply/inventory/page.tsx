"use client";

import { useState } from "react";
import { Package, ClipboardList, PackagePlus, Archive } from "lucide-react";

// 기존 페이지 컴포넌트들을 직접 가져옵니다. (내용과 API 연결 그대로 사용)
import ConsumablesPage from "../consumables/page";
import FixturesPage from "../fixtures/page";
import NewSupplyItemPage from "../new/page";

export default function InventoryPage() {
  const [activeTab, setActiveTab] = useState<"consumables" | "fixtures" | "new">("consumables");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
          <Archive size={24} className="text-blue-600" />
          재고관리
        </h2>
        <p className="text-sm text-gray-500 mt-1">소모품 및 비품의 현재 재고 현황을 조회하고 신규 품목을 등록합니다.</p>
      </div>

      <div className="flex border-b border-gray-200 bg-white rounded-t-xl px-2 pt-2">
        <button 
          onClick={() => setActiveTab("consumables")} 
          className={`px-5 py-3.5 font-bold text-sm flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'consumables' ? 'border-blue-600 text-blue-700 bg-blue-50/50' : 'border-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-50'
          }`}
        >
          <Package size={18}/> 소모품 목록
        </button>
        <button 
          onClick={() => setActiveTab("fixtures")} 
          className={`px-5 py-3.5 font-bold text-sm flex items-center gap-2 border-b-2 transition-colors ${
             activeTab === 'fixtures' ? 'border-blue-600 text-blue-700 bg-blue-50/50' : 'border-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-50'
          }`}
        >
          <ClipboardList size={18}/> 비품 목록
        </button>
        <button 
          onClick={() => setActiveTab("new")} 
          className={`px-5 py-3.5 font-bold text-sm flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'new' ? 'border-blue-600 text-blue-700 bg-blue-50/50' : 'border-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-50'
          }`}
        >
          <PackagePlus size={18}/> 품목 등록
        </button>
      </div>

      <div className="bg-white rounded-b-xl rounded-tr-xl p-6 border border-t-0 border-gray-200 mt-0 shadow-sm min-h-[600px]">
        <div className={activeTab === "consumables" ? "block" : "hidden"}>
          <ConsumablesPage />
        </div>
        <div className={activeTab === "fixtures" ? "block" : "hidden"}>
          <FixturesPage />
        </div>
        <div className={activeTab === "new" ? "block" : "hidden"}>
          <NewSupplyItemPage />
        </div>
      </div>
    </div>
  );
}

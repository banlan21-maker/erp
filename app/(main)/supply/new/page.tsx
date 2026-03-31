"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PackagePlus, Save, AlertCircle, Package, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function NewSupplyItemPage() {
  const router = useRouter();
  
  const [category, setCategory] = useState<"CONSUMABLE" | "FIXTURE">("CONSUMABLE");
  const [department, setDepartment] = useState<"CUTTING" | "FACILITY">("CUTTING");
  const [formData, setFormData] = useState({
    name: "",
    subCategory: "",
    unit: "",
    stockQty: "",
    reorderPoint: "",
    location: "",
    memo: ""
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.name.trim() || !formData.unit.trim()) {
      setError("품명과 단위를 반드시 입력해주세요.");
      return;
    }

    setLoading(true);
    try {
      const payload = {
        category,
        department,
        name: formData.name,
        subCategory: formData.subCategory,
        unit: formData.unit,
        stockQty: formData.stockQty || "0",
        location: formData.location || null,
        memo: formData.memo || null,
        ...(category === "CONSUMABLE" && { reorderPoint: formData.reorderPoint || null })
      };

      const res = await fetch("/api/supply/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (!data.success) {
        setError(data.error || "등록에 실패했습니다.");
        return;
      }

      alert("성공적으로 등록되었습니다.");
      
      // 분기에 따라 이동
      if (category === "CONSUMABLE") {
        router.push("/supply/consumables");
      } else {
        router.push("/supply/fixtures");
      }
      router.refresh(); // 최신 목록을 위해 새로고침 트리거
      
    } catch (err: any) {
      setError("서버 오류가 발생했습니다. 다시 시도해주세요.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
          <PackagePlus size={24} className="text-blue-600" />
          신규 물품 등록
        </h2>
        <p className="text-sm text-gray-500 mt-1">소모품 또는 비품을 시스템에 새로 추가합니다.</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl shadow-sm flex items-center gap-2 text-sm">
          <AlertCircle size={16} /> <strong>등록 실패:</strong> {error}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {/* 품목 카테고리 탭 선택 (라디오 버튼 시각화 형태) */}
        <div className="p-6 border-b border-gray-100 bg-gray-50/50">
          <label className="block text-sm font-bold text-gray-800 mb-3">구분 선택 (소모품/비품) <span className="text-red-500">*</span></label>
          <div className="grid grid-cols-2 gap-4 max-w-sm">
            <button
              type="button"
              onClick={() => setCategory("CONSUMABLE")}
              className={`flex items-center justify-center gap-2 py-3 px-4 rounded-xl border-2 font-semibold transition-all ${
                category === "CONSUMABLE" 
                ? "border-blue-600 bg-blue-50 text-blue-700" 
                : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
              }`}
            >
              <Package size={18} />
              소모품 등록
            </button>
            <button
              type="button"
              onClick={() => setCategory("FIXTURE")}
              className={`flex items-center justify-center gap-2 py-3 px-4 rounded-xl border-2 font-semibold transition-all ${
                category === "FIXTURE" 
                ? "border-blue-600 bg-blue-50 text-blue-700" 
                : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
              }`}
            >
              <ClipboardList size={18} />
              비품 등록
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-3">
            {category === "CONSUMABLE"
              ? "※ 주기적으로 소모되어 재고 보충(발주)이 정기적으로 필요한 품목입니다. (예: 팁, 전극, 가스, 장갑)"
              : "※ 장기간 형태를 유지하며 보관하는 비품 및 공구류입니다. (전동공구 등 발주기준점 불필요)"}
          </p>

          {/* 관리주체 선택 */}
          <div className="mt-5 pt-5 border-t border-gray-200">
            <label className="block text-sm font-bold text-gray-800 mb-3">관리주체 선택 <span className="text-red-500">*</span></label>
            <div className="flex gap-4">
              <button
                type="button"
                onClick={() => setDepartment("CUTTING")}
                className={`flex items-center justify-center gap-2 py-3 px-8 rounded-xl border-2 font-semibold transition-all ${
                  department === "CUTTING"
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
                }`}
              >
                절단
              </button>
              <button
                type="button"
                onClick={() => setDepartment("FACILITY")}
                className={`flex items-center justify-center gap-2 py-3 px-8 rounded-xl border-2 font-semibold transition-all ${
                  department === "FACILITY"
                    ? "border-purple-500 bg-purple-50 text-purple-700"
                    : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
                }`}
              >
                공무
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              {department === "CUTTING" ? "※ 절단 파트에서 관리하는 품목입니다." : "※ 공무팀에서 관리하는 품목입니다."}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 md:p-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-6">
            
            {/* 공통 입력란 */}
            <div className="sm:col-span-2">
              <label className="block text-sm font-semibold text-gray-800 mb-1.5">품명 <span className="text-red-500">*</span></label>
              <Input required name="name" value={formData.name} onChange={handleChange} placeholder="예: 플라즈마 팁 (10A)" className="w-full" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">세부분류 (옵션)</label>
              <Input name="subCategory" value={formData.subCategory} onChange={handleChange} placeholder="예: 팁/노즐/가스/연마 등 직접 입력" className="w-full" />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-800 mb-1.5">단위 <span className="text-red-500">*</span></label>
              <Input required name="unit" value={formData.unit} onChange={handleChange} placeholder="예: 개, 통, 세트, 켤레 등" className="w-full" />
            </div>

            {/* 재고 관련: 소모품은 초기수량/발주점, 비품은 보유수량만 */}
            {category === "CONSUMABLE" ? (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">초기 재고수량</label>
                  <Input type="number" name="stockQty" value={formData.stockQty} onChange={handleChange} placeholder="0" className="w-full" />
                  <span className="text-xs text-gray-400 mt-1">입력하지 않으면 기본재고 0으로 등록됩니다.</span>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">발주 기준점 (경보 수량)</label>
                  <Input type="number" name="reorderPoint" value={formData.reorderPoint} onChange={handleChange} placeholder="예: 10" className="w-full" />
                  <span className="text-xs text-gray-400 mt-1">이 수량 이하로 떨어지면 경고가 표시됩니다.</span>
                </div>
              </>
            ) : (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">초기 보유수량</label>
                <Input type="number" name="stockQty" value={formData.stockQty} onChange={handleChange} placeholder="0" className="w-full" />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">보관 위치 (옵션)</label>
              <Input name="location" value={formData.location} onChange={handleChange} placeholder="예: A열 3선반, 캐비닛 B" className="w-full" />
            </div>

            {/* 줄맞춤 빈칸 처리용 (비품의 경우 홀수라서) */}
            {category === "FIXTURE" && <div className="hidden sm:block"></div>}

            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">비고 / 기타 (옵션)</label>
              <textarea 
                name="memo" 
                value={formData.memo} 
                onChange={handleChange} 
                rows={3} 
                className="w-full px-3 py-2 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm resize-none" 
                placeholder="해당 품목에 대한 주의사항 등을 입력하세요."
              />
            </div>
          </div>

          <div className="mt-8 pt-6 border-t border-gray-100 flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => router.back()} className="px-6 text-sm font-medium">취소</Button>
            <Button type="submit" disabled={loading} className="px-8 text-sm font-bold bg-blue-600 hover:bg-blue-700 shadow-sm shadow-blue-200">
              <Save size={16} className="mr-2" />
              {loading ? "등록 중..." : "품목 신규 등록 완료"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

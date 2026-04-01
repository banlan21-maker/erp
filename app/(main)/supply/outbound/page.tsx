"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PackageMinus, Save, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function OutboundPage() {
  const router = useRouter();
  
  // 출고는 소모품만 가능! (비품은 출고 개념보다는 반납/폐기나 대여 관리로 빼야 하지만 지침상 출고는 소모품만으로 지정)
  const [items, setItems] = useState<any[]>([]);
  const [loadingConfig, setLoadingConfig] = useState(true);

  const [formData, setFormData] = useState({
    itemId: "",
    qty: "",
    usedBy: "",
    memo: ""
  });
  
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadConfig() {
      try {
        const res = await fetch("/api/supply/items?category=CONSUMABLE");
        const json = await res.json();
        
        if (json.success) setItems(json.data);
      } catch (e) {
        console.error("데이터 로드 중 오류 발생", e);
      } finally {
        setLoadingConfig(false);
      }
    }
    loadConfig();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.itemId || !formData.qty || !formData.usedBy) {
      setError("입력되지 않은 필수 값이 있습니다.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/supply/outbound", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData)
      });
      const data = await res.json();
      
      if (!data.success) {
        setError(data.error);
        return;
      }

      // 발주 기준점 경고 처리
       if (data.data?.isWarning) {
         // 실제로는 토스트 라이브러리를 쓰면 좋지만, 요구사항을 맞추기 위해 alert 활용 (UI 방해 최소화를 위해 약간의 딜레이 보장)
         window.alert("⚠️ [경보] 현재 품목의 재고가 발주 기준점 이하로 떨어졌습니다!\n목록에서 발주 필요 항목을 확인하세요.");
       } else {
         alert("출고 처리 및 재고 삭감이 완료되었습니다.");
       }

      router.push("/supply/history?tab=outbound"); 
      router.refresh();
      
    } catch (err: any) {
      setError("서버 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  const selectedItemData = items.find(i => i.id === Number(formData.itemId));

  if (loadingConfig) {
    return <div className="p-8 text-center text-gray-500">품목 정보를 불러오는 중입니다...</div>;
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
          <PackageMinus size={24} className="text-orange-600" />
          소모품 출고 등록
        </h2>
        <p className="text-sm text-gray-500 mt-1">현장 작업자의 소모품 수령 내용을 등록하여 재고를 삭감시킵니다.</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl shadow-sm flex items-center gap-2 text-sm">
          <AlertCircle size={16} /> <strong>출고 실패:</strong> {error}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="bg-orange-50/50 p-4 border-b border-orange-100 flex items-center justify-between">
           <span className="text-sm font-semibold text-orange-800">재고가 출고하는 수량만큼 실시간으로 '-' 차감됩니다.</span>
           {selectedItemData && (
             <span className="text-sm font-bold bg-white px-3 py-1 rounded-full border border-orange-200 text-orange-700 shadow-sm">
               현재 등록 전 재고 : {selectedItemData.stockQty} {selectedItemData.unit}
             </span>
           )}
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 md:p-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-6">
            
            <div className="sm:col-span-2">
              <label className="block text-sm font-semibold text-gray-800 mb-1.5">출고 소모품 선택 <span className="text-red-500">*</span></label>
              <select 
                required 
                name="itemId" 
                value={formData.itemId} 
                onChange={handleChange} 
                className="w-full px-3 py-2 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-gray-50 hover:bg-white transition-colors"
               >
                <option value="">-- 소모품을 선택하세요 --</option>
                {items.map(item => {
                  const isInsufficient = item.stockQty === 0;
                  const label = [
                    item.department === 'CUTTING' ? '절단' : item.department === 'FACILITY' ? '공무' : item.department,
                    '소모품',
                    item.subCategory ? `[${item.subCategory}]` : null,
                    item.name,
                    item.location ? `📍${item.location}` : null,
                    `(${item.unit}) 재고: ${item.stockQty}`,
                    isInsufficient ? '[품절/불가]' : null,
                  ].filter(Boolean).join(' | ');
                  return (
                    <option key={item.id} value={item.id} disabled={isInsufficient}>
                      {label}
                    </option>
                  );
                })}
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-800 mb-1.5">지급/출고 수량 <span className="text-red-500">*</span></label>
              <Input 
                required 
                type="number" 
                min="1" 
                max={selectedItemData ? selectedItemData.stockQty : undefined}
                name="qty" 
                value={formData.qty} 
                onChange={handleChange} 
                placeholder="0" 
                className="w-full font-bold text-orange-600" 
              />
              <span className="text-xs text-gray-400 mt-1 block">현재고({selectedItemData?.stockQty || 0})를 넘을 수 없습니다.</span>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-800 mb-1.5">사용자(수령인)명 <span className="text-red-500">*</span></label>
              <Input required name="usedBy" value={formData.usedBy} onChange={handleChange} placeholder="예: 박경현" className="w-full" />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">출고 비고 (사유 등)</label>
              <textarea 
                name="memo" 
                value={formData.memo} 
                onChange={handleChange} 
                rows={3} 
                className="w-full px-3 py-2 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm resize-none" 
                placeholder="지급 사유나 라인 정보를 자유롭게 남기세요."
              />
            </div>
          </div>

          <div className="mt-8 pt-6 border-t border-gray-100 flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => router.back()} className="px-6 text-sm font-medium">취소</Button>
            <Button type="submit" disabled={submitting} className="px-8 text-sm font-bold bg-orange-600 hover:bg-orange-700 text-white shadow-sm">
              <Save size={16} className="mr-2" />
              {submitting ? "처리 중..." : "출고 및 재고차감 완료"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PackageCheck, Save, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function InboundPage() {
  const router = useRouter();
  
  const [items, setItems] = useState<any[]>([]);
  const [vendors, setVendors] = useState<any[]>([]);
  const [loadingConfig, setLoadingConfig] = useState(true);

  const [formData, setFormData] = useState({
    itemId: "",
    vendorId: "",
    qty: "",
    receivedBy: "",
    memo: ""
  });
  
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadConfig() {
      try {
        const [itemsRes, vendorsRes] = await Promise.all([
          fetch("/api/supply/items"),       // 전체 품목 (소모품+비품)
          fetch("/api/supply/vendors")      // 전체 거래처
        ]);
        const itemsJson = await itemsRes.json();
        const vendorsJson = await vendorsRes.json();
        
        if (itemsJson.success) setItems(itemsJson.data);
        if (vendorsJson.success) setVendors(vendorsJson.data);
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

    if (!formData.itemId || !formData.vendorId || !formData.qty || !formData.receivedBy) {
      setError("입력되지 않은 필수 값이 있습니다.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/supply/inbound", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData)
      });
      const data = await res.json();
      
      if (!data.success) {
        setError(data.error);
        return;
      }

      alert("정상적으로 입고(매입) 및 재고 증가 처리가 완료되었습니다.");
      router.push("/supply/history?tab=inbound"); // 입출고 내역으로 이동
      router.refresh();
      
    } catch (err: any) {
      setError("서버 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingConfig) {
    return <div className="p-8 text-center text-gray-500">기본 정보를 불러오는 중입니다...</div>;
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
          <PackageCheck size={24} className="text-emerald-600" />
          입고 등록
        </h2>
        <p className="text-sm text-gray-500 mt-1">소모품 및 비품을 구매/매입하여 재고를 증가시킵니다.</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl shadow-sm flex items-center gap-2 text-sm">
          <AlertCircle size={16} /> <strong>등록 실패:</strong> {error}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="bg-emerald-50/50 p-4 border-b border-gray-100 flex items-center justify-between">
           <span className="text-sm font-semibold text-emerald-800">재고가 등록하는 수량만큼 '+' 늘어납니다.</span>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 md:p-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-6">
            
            <div className="sm:col-span-2">
              <label className="block text-sm font-semibold text-gray-800 mb-1.5">입고 품목 선택 <span className="text-red-500">*</span></label>
              <select 
                required 
                name="itemId" 
                value={formData.itemId} 
                onChange={handleChange} 
                className="w-full px-3 py-2 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-gray-50 hover:bg-white transition-colors"
               >
                <option value="">-- 품목을 선택하세요 --</option>
                {/* 카테고리별로 분리해서 보여줌 */}
                <optgroup label="■ 소모품">
                  {items.filter(i => i.category === 'CONSUMABLE').map(item => (
                    <option key={item.id} value={item.id}>
                      {[
                        item.department === 'CUTTING' ? '절단' : item.department === 'FACILITY' ? '공무' : item.department,
                        '소모품',
                        item.subCategory ? `[${item.subCategory}]` : null,
                        item.name,
                        item.location ? `📍${item.location}` : null,
                        `(${item.unit}) 현재 ${item.stockQty}`,
                      ].filter(Boolean).join(' | ')}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="■ 비품">
                  {items.filter(i => i.category === 'FIXTURE').map(item => (
                    <option key={item.id} value={item.id}>
                      {[
                        item.department === 'CUTTING' ? '절단' : item.department === 'FACILITY' ? '공무' : item.department,
                        '비품',
                        item.subCategory ? `[${item.subCategory}]` : null,
                        item.name,
                        item.location ? `📍${item.location}` : null,
                        `(${item.unit}) 보유 ${item.stockQty}`,
                      ].filter(Boolean).join(' | ')}
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-sm font-semibold text-gray-800 mb-1.5">거래처 (구입처) 선택 <span className="text-red-500">*</span></label>
              <select 
                required 
                name="vendorId" 
                value={formData.vendorId} 
                onChange={handleChange} 
                className="w-full px-3 py-2 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-gray-50 hover:bg-white transition-colors"
               >
                <option value="">-- 거래처를 선택하세요 --</option>
                {vendors.map(v => (
                  <option key={v.id} value={v.id}>{v.name} {v.contact ? `(${v.contact})` : ""}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-800 mb-1.5">입고(매입) 수량 <span className="text-red-500">*</span></label>
              <Input required type="number" min="1" name="qty" value={formData.qty} onChange={handleChange} placeholder="0" className="w-full font-bold text-emerald-600" />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-800 mb-1.5">확인자 (입고담당자) <span className="text-red-500">*</span></label>
              <Input required name="receivedBy" value={formData.receivedBy} onChange={handleChange} placeholder="예: 김남훈" className="w-full" />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">입고 비고/메모 (옵션)</label>
              <textarea 
                name="memo" 
                value={formData.memo} 
                onChange={handleChange} 
                rows={3} 
                className="w-full px-3 py-2 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm resize-none" 
                placeholder="특이사항을 입력하세요."
              />
            </div>
          </div>

          <div className="mt-8 pt-6 border-t border-gray-100 flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => router.back()} className="px-6 text-sm font-medium">취소</Button>
            <Button type="submit" disabled={submitting} className="px-8 text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm">
              <Save size={16} className="mr-2" />
              {submitting ? "처리 중..." : "입고 및 재고반영 완료"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

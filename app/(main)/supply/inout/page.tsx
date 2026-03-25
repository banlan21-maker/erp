"use client";

import { useEffect, useState } from "react";
import { PackageCheck, PackageMinus, Save, AlertCircle, RefreshCw, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function InOutPage() {
  const [topMode, setTopMode] = useState<"in" | "out">("in");
  const [historyTab, setHistoryTab] = useState<"inbound" | "outbound">("inbound");

  const [items, setItems] = useState<any[]>([]);
  const [vendors, setVendors] = useState<any[]>([]);
  const [loadingConfig, setLoadingConfig] = useState(true);

  const [historyData, setHistoryData] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // 등록 폼 통합 관리
  const [formData, setFormData] = useState({
    itemId: "",
    vendorId: "",
    qty: "",
    person: "", // 입고는 담당자, 출고는 사용자
    memo: ""
  });
  
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 1. 초기 마스터 데이터 로드 (select box용)
  useEffect(() => {
    async function loadConfig() {
      try {
        const [itemsRes, vendorsRes] = await Promise.all([
          fetch("/api/supply/items"),
          fetch("/api/supply/vendors")
        ]);
        const itemsJson = await itemsRes.json();
        const vendorsJson = await vendorsRes.json();
        if (itemsJson.success) setItems(itemsJson.data);
        if (vendorsJson.success) setVendors(vendorsJson.data);
      } catch (e) { console.error(e) } finally { setLoadingConfig(false); }
    }
    loadConfig();
    fetchHistoryData("inbound");
  }, []);

  // 2. 이력 로드 함수
  const fetchHistoryData = async (type: "inbound" | "outbound") => {
    setLoadingHistory(true);
    try {
      const d = new Date();
      const currentMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      // 서버에서 이력이 너무 많을 것을 대비, 현재 달 내역만 가져온 후 앞에서 20건 자름
      const res = await fetch(`/api/supply/${type}?month=${currentMonth}`);
      const json = await res.json();
      if (json.success) {
        setHistoryData(json.data.slice(0, 20)); // 최근 20건만 표시
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    fetchHistoryData(historyTab);
  }, [historyTab]);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.itemId || !formData.qty || !formData.person) {
      setError("입력되지 않은 필수 값이 있습니다.");
      return;
    }
    if (topMode === "in" && !formData.vendorId) {
      setError("입고 거래처를 선택해주세요.");
      return;
    }

    setSubmitting(true);
    try {
      const url = topMode === "in" ? "/api/supply/inbound" : "/api/supply/outbound";
      const payload = topMode === "in" 
        ? { itemId: formData.itemId, vendorId: formData.vendorId, qty: formData.qty, receivedBy: formData.person, memo: formData.memo }
        : { itemId: formData.itemId, qty: formData.qty, usedBy: formData.person, memo: formData.memo };

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      
      if (!data.success) {
        setError(data.error);
        return;
      }

      if (topMode === "out" && data.data?.isWarning) {
        window.alert("⚠️ [경보] 해당 품목 재고가 발주 기준점 이하로 떨어졌습니다!");
      } else {
        alert(`${topMode === "in" ? "입고" : "출고"} 처리가 완료되었습니다.`);
      }

      // 폼 초기화
      setFormData({ itemId: "", vendorId: "", qty: "", person: "", memo: "" });
      
      // 방금 입력한 내역이 보이게 최신 데이터 갱신 및 탭 전환
      const targetTab = topMode === "in" ? "inbound" : "outbound";
      setHistoryTab(targetTab);
      fetchHistoryData(targetTab);
      
      // 목록 마스터 데이터(재고수량 표시용)도 갱신
      fetch("/api/supply/items").then(r => r.json()).then(j => { if (j.success) setItems(j.data); });

    } catch (err: any) {
      setError("서버 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  };

  const selectedItemData = items.find(i => i.id === Number(formData.itemId));

  if (loadingConfig) return <div className="p-10 text-center text-gray-500">초기 정보를 불러오는 중입니다...</div>;

  return (
    <div className="space-y-6">
      
      {/* 1. 상단 라디오 버튼 스타일 선택기 */}
      <div className="flex justify-center mb-8">
        <div className="bg-gray-100 p-1.5 rounded-full inline-flex border border-gray-200 shadow-inner">
          <button 
            type="button"
            onClick={() => setTopMode("in")} 
            className={`flex items-center gap-2 px-8 py-2.5 rounded-full font-bold text-sm transition-all ${topMode === "in" ? "bg-white text-emerald-700 shadow-sm border border-emerald-100" : "text-gray-500 hover:text-gray-700"}`}
          >
            <PackageCheck size={18} /> 품목 입고 (등록)
          </button>
          <button 
            type="button"
            onClick={() => setTopMode("out")} 
            className={`flex items-center gap-2 px-8 py-2.5 rounded-full font-bold text-sm transition-all ${topMode === "out" ? "bg-white text-orange-700 shadow-sm border border-orange-100" : "text-gray-500 hover:text-gray-700"}`}
          >
            <PackageMinus size={18} /> 현장 출고 (사용)
          </button>
        </div>
      </div>

      {/* 2. 중단 등록 폼 */}
      <div className={`rounded-xl shadow-sm border overflow-hidden transition-all ${topMode === "in" ? "border-emerald-200 bg-white" : "border-orange-200 bg-white"}`}>
        <div className={`p-4 border-b flex items-center justify-between ${topMode === "in" ? "bg-emerald-50/80 border-emerald-100 text-emerald-900" : "bg-orange-50/80 border-orange-100 text-orange-900"}`}>
          <h3 className="font-bold flex items-center gap-2">
            {topMode === "in" ? <PackageCheck size={20} /> : <PackageMinus size={20} />}
            {topMode === "in" ? "입고 매입 전표 작성" : "현장 출고 수불부 작성"}
          </h3>
          {topMode === "out" && selectedItemData && (
             <span className="text-sm font-bold bg-white px-3 py-1 rounded-full border border-orange-200 shadow-sm text-orange-700">
               현재 등록 전 재고 : {selectedItemData.stockQty} {selectedItemData.unit}
             </span>
          )}
        </div>

        {error && (
          <div className="bg-red-50 border-b border-red-100 text-red-700 px-6 py-3 text-sm flex items-center gap-2">
            <AlertCircle size={16} /> <strong>오류:</strong> {error}
          </div>
        )}
        
        <form onSubmit={handleFormSubmit} className="p-6 md:p-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-6">
            <div className="sm:col-span-2">
               <label className="block text-sm font-semibold text-gray-800 mb-1.5">대상 품목 선택 <span className="text-red-500">*</span></label>
               <select required name="itemId" value={formData.itemId} onChange={handleChange} className="w-full px-3 py-2 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 text-sm">
                 <option value="">-- 품목을 선택하세요 --</option>
                 {topMode === "in" ? (
                   <>
                     <optgroup label="■ 소모품">
                       {items.filter(i => i.category === 'CONSUMABLE').map(item => (
                         <option key={item.id} value={String(item.id)}>소모품 | {item.name} ({item.unit}) - 현재재고: {item.stockQty}</option>
                       ))}
                     </optgroup>
                     <optgroup label="■ 비품">
                        {items.filter(i => i.category === 'FIXTURE').map(item => (
                         <option key={item.id} value={String(item.id)}>비품 | {item.name} ({item.unit}) - 현재보유: {item.stockQty}</option>
                       ))}
                     </optgroup>
                   </>
                 ) : (
                   items.filter(i => i.category === 'CONSUMABLE').map(item => (
                     <option key={item.id} value={String(item.id)} disabled={item.stockQty === 0}>
                       소모품 | {item.name} ({item.unit}) - 현재재고: {item.stockQty} {item.stockQty === 0 ? " [불가]" : ""}
                     </option>
                   ))
                 )}
               </select>
            </div>

            {topMode === "in" && (
              <div className="sm:col-span-2">
                <label className="block text-sm font-semibold text-gray-800 mb-1.5">매입 거래처 <span className="text-red-500">*</span></label>
                <select required name="vendorId" value={formData.vendorId} onChange={handleChange} className="w-full px-3 py-2 border border-gray-200 rounded-md focus:outline-none focus:ring-2 bg-gray-50 text-sm">
                  <option value="">-- 거래처 선택 --</option>
                  {vendors.map(v => <option key={v.id} value={String(v.id)}>{v.name}</option>)}
                </select>
              </div>
            )}

            <div>
              <label className="block text-sm font-semibold text-gray-800 mb-1.5">{topMode === "in" ? "입고(매입) 수량" : "지급(출고) 수량"} <span className="text-red-500">*</span></label>
              <Input required type="number" min="1" max={topMode === "out" && selectedItemData ? selectedItemData.stockQty : undefined} name="qty" value={formData.qty} onChange={handleChange} placeholder="0" className={`w-full font-bold ${topMode === 'in' ? 'text-emerald-600' : 'text-orange-600'}`} />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-800 mb-1.5">{topMode === "in" ? "확인자 (입고담당)" : "사용자 (수령인)"} <span className="text-red-500">*</span></label>
              <Input required name="person" value={formData.person} onChange={handleChange} placeholder={topMode === "in" ? "예: 물류팀 박대리" : "예: 1라인 김현수"} className="w-full" />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">비고 / 메모 (옵션)</label>
              <textarea name="memo" value={formData.memo} onChange={handleChange} rows={2} className="w-full px-3 py-2 border border-gray-200 rounded-md focus:outline-none focus:ring-2 text-sm resize-none" placeholder="특이사항이나 사유를 적어주세요." />
            </div>
          </div>

          <div className="mt-6 pt-5 border-t border-gray-100 flex justify-end">
            <Button type="submit" disabled={submitting} className={`px-10 text-sm font-bold shadow-sm ${topMode === "in" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-orange-600 hover:bg-orange-700"}`}>
              <Save size={16} className="mr-2" />
              {submitting ? "처리 중..." : topMode === "in" ? "입고 및 재고반영" : "출고 및 재고차감"}
            </Button>
          </div>
        </form>
      </div>

      {/* 3. 하단 입출고 내역 테이블 (최근 20건) */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mt-8">
        <div className="bg-gray-50/80 px-4 py-3 border-b flex items-center justify-between">
          <div className="flex bg-white rounded-md border shadow-sm p-1">
            <button onClick={() => setHistoryTab("inbound")} className={`px-4 py-1.5 text-xs font-bold rounded-sm transition ${historyTab === 'inbound' ? 'bg-emerald-100 text-emerald-800' : 'text-gray-500 hover:bg-gray-50'}`}>최근 입고 (20건)</button>
            <button onClick={() => setHistoryTab("outbound")} className={`px-4 py-1.5 text-xs font-bold rounded-sm transition ${historyTab === 'outbound' ? 'bg-orange-100 text-orange-800' : 'text-gray-500 hover:bg-gray-50'}`}>최근 출고 (20건)</button>
          </div>
          <span className="text-xs text-gray-400 flex items-center gap-1"><History size={14}/> 전체 이력은 메뉴에서 확인</span>
        </div>

        <div className="overflow-x-auto min-h-[200px]">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead className={`border-b text-gray-600 text-xs uppercase ${historyTab === 'inbound' ? 'bg-emerald-50/20' : 'bg-orange-50/20'}`}>
              <tr>
                <th className="px-5 py-2.5">{historyTab === "inbound" ? "입고일시" : "출고일시"}</th>
                <th className="px-5 py-2.5">품명</th>
                <th className="px-5 py-2.5 text-right">수량</th>
                <th className="px-5 py-2.5 font-normal text-center">단위</th>
                <th className="px-5 py-2.5">{historyTab === "inbound" ? "담당자" : "사용자"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loadingHistory ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-gray-400"><RefreshCw className="animate-spin inline-block mr-2" size={16} />갱신 중...</td>
                </tr>
              ) : historyData.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-gray-400">이번 달 등록된 내역이 없습니다. (최근 20건 표시란)</td>
                </tr>
              ) : (
                historyData.map((row) => (
                  <tr key={row.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 text-xs text-gray-500 font-mono">{formatDate(historyTab === "inbound" ? row.receivedAt : row.usedAt)}</td>
                    <td className="px-5 py-3 font-semibold text-gray-800">{row.item?.name}</td>
                    <td className={`px-5 py-3 text-right font-bold ${historyTab === 'inbound' ? 'text-emerald-600' : 'text-orange-600'}`}>
                      {historyTab === 'inbound' ? '+' : '-'}{row.qty}
                    </td>
                    <td className="px-5 py-3 text-center text-gray-500 text-xs">{row.item?.unit}</td>
                    <td className="px-5 py-3 text-gray-600 text-xs">{historyTab === "inbound" ? row.receivedBy : row.usedBy}</td>
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

"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Building2, Edit, Calendar, PackageCheck, RefreshCw, Mail, Phone, Hash, Tag, FileText, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function VendorDetailPage() {
  const params = useParams();
  const router = useRouter();
  const vendorId = params.id as string;

  const [vendor, setVendor] = useState<any>(null);
  const [inbounds, setInbounds] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // 현재 달을 YYYY-MM 형태로 기본 설정
  const today = new Date();
  const defaultMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const [selectedMonth, setSelectedMonth] = useState(defaultMonth);

  // 모달 제어
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingData, setEditingData] = useState<any>({});
  const [isSaving, setIsSaving] = useState(false);

  const fetchVendorDetail = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/supply/vendors/${vendorId}?month=${selectedMonth}`);
      const json = await res.json();
      if (json.success) {
        setVendor(json.data);
        setInbounds(json.data.inbounds || []);
        
        // Modal용 초기 데이터 세팅
        if (Object.keys(editingData).length === 0) {
          setEditingData(json.data);
        }
      } else {
        alert(json.error || "데이터를 불러오지 못했습니다.");
        router.push("/supply/vendors");
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVendorDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMonth]); // month 변경 시 자동 재조회

  // 수정 핸들러
  const handleEditChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setEditingData((prev: any) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingData.name) {
      alert("업체명은 필수입니다.");
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch(`/api/supply/vendors/${vendorId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingData)
      });
      const data = await res.json();
      if (data.success) {
        setIsEditModalOpen(false);
        fetchVendorDetail();
      } else {
        alert(data.error);
      }
    } catch (error) {
      alert("서버 연결 실패");
    } finally {
      setIsSaving(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  };

  if (loading && !vendor) {
    return (
      <div className="flex justify-center items-center py-32 text-gray-400 gap-3">
        <RefreshCw className="animate-spin text-blue-500" size={32} /> 거래처 정보를 불러오는 중입니다...
      </div>
    );
  }

  if (!vendor) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={() => router.push("/supply/vendors")} className="p-2 bg-white rounded-full border border-gray-200 shadow-sm hover:bg-gray-50 text-gray-500 transition-colors">
          <ArrowLeft size={18} />
        </button>
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Building2 size={24} className="text-blue-600" /> {vendor.name}
          </h2>
          <p className="text-sm text-gray-500 mt-1">거래처 정보 및 월별 입고(매입) 이력 상세표</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* 거래처 기본 정보 요약 카드 */}
        <div className="lg:col-span-1 bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex flex-col h-full">
          <div className="flex items-center justify-between border-b border-gray-100 pb-4 mb-4">
            <h3 className="font-bold text-lg text-gray-900 tracking-tight">업체 정보</h3>
            <Button variant="outline" size="sm" onClick={() => setIsEditModalOpen(true)} className="h-8 text-xs font-semibold hover:bg-gray-50 text-blue-700 border-blue-200">
              <Edit size={14} className="mr-1.5" /> 정보 수정
            </Button>
          </div>
          
          <div className="space-y-5 flex-1 p-1">
            <div className="flex gap-3">
              <span className="mt-0.5 text-gray-400"><Tag size={16} /></span>
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-0.5">취급품목 카테고리</p>
                <p className="text-sm text-gray-900 font-medium">{vendor.category || "-"}</p>
              </div>
            </div>
            <div className="flex gap-3">
              <span className="mt-0.5 text-gray-400"><Hash size={16} /></span>
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-0.5">사업자등록번호</p>
                <p className="text-sm text-gray-900 font-mono tracking-wide">{vendor.businessNumber || "-"}</p>
              </div>
            </div>
            <div className="flex gap-3">
              <span className="mt-0.5 text-gray-400"><Phone size={16} /></span>
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-0.5">담당자 / 연락처</p>
                <p className="text-sm text-gray-900 font-medium">{vendor.contact || "-"} <span className="text-gray-400 font-normal">|</span> <span className="font-mono text-blue-700">{vendor.phone || "-"}</span></p>
              </div>
            </div>
            <div className="flex gap-3">
              <span className="mt-0.5 text-gray-400"><Mail size={16} /></span>
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-0.5">이메일</p>
                <p className="text-sm text-gray-900">{vendor.email || "-"}</p>
              </div>
            </div>
            <div className="flex gap-3">
              <span className="mt-0.5 text-gray-400"><FileText size={16} /></span>
              <div className="w-full">
                <p className="text-xs font-semibold text-gray-500 mb-0.5">비고 및 기타</p>
                <div className="text-sm text-gray-600 bg-gray-50 p-2.5 rounded-md border border-gray-100 min-h-[60px] whitespace-pre-wrap leading-relaxed">
                  {vendor.memo || "기재된 내용이 없습니다."}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 입고 이력 테이블 */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col overflow-hidden h-full">
          <div className="p-4 sm:p-5 border-b border-gray-100 bg-gray-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <h3 className="font-bold text-gray-900 flex items-center gap-2">
              <PackageCheck size={18} className="text-emerald-600" />
              월별 입고(매입) 이력
            </h3>
            
            <div className="flex items-center gap-2 relative">
              <Calendar size={16} className="absolute left-3 text-gray-500" />
              <input 
                type="month" 
                value={selectedMonth} 
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="pl-9 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              />
            </div>
          </div>
          
          <div className="overflow-x-auto min-h-[300px] flex-1">
            <table className="w-full text-sm text-left whitespace-nowrap">
              <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 font-semibold sticky top-0">
                <tr>
                  <th className="px-5 py-3.5 w-44">입고일시</th>
                  <th className="px-5 py-3.5">입고완료 품명</th>
                  <th className="px-5 py-3.5 text-right w-24">수량(D)</th>
                  <th className="px-5 py-3.5 text-center w-24">단위</th>
                  <th className="px-5 py-3.5 w-28">담당자</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  Array.from({length: 4}).map((_, i) => (
                    <tr key={i} className="animate-pulse bg-gray-50/20">
                      <td className="px-5 py-4"><div className="h-4 bg-gray-200 rounded w-full"></div></td>
                      <td className="px-5 py-4"><div className="h-4 bg-gray-200 rounded w-full"></div></td>
                      <td className="px-5 py-4"><div className="h-4 bg-gray-200 rounded w-full"></div></td>
                      <td className="px-5 py-4"><div className="h-4 bg-gray-200 rounded w-full"></div></td>
                      <td className="px-5 py-4"><div className="h-4 bg-gray-200 rounded w-full"></div></td>
                    </tr>
                  ))
                ) : inbounds.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-16 text-center text-gray-500 bg-gray-50/50">
                      <PackageCheck size={32} className="mx-auto text-gray-300 mb-3" />
                      선택하신 달({selectedMonth})에는 입고 이력이 없습니다.
                    </td>
                  </tr>
                ) : (
                  inbounds.map(inbound => (
                    <tr key={inbound.id} className="hover:bg-emerald-50/30 transition-colors">
                      <td className="px-5 py-3.5 text-gray-500 text-xs font-mono">{formatDate(inbound.receivedAt)}</td>
                      <td className="px-5 py-3.5 font-bold text-gray-900">{inbound.item?.name || "알 수 없는 품목"}</td>
                      <td className="px-5 py-3.5 text-right font-bold text-emerald-600">+{inbound.qty}</td>
                      <td className="px-5 py-3.5 text-center text-gray-500 text-xs">{inbound.item?.unit || "-"}</td>
                      <td className="px-5 py-3.5 text-gray-600 text-xs">{inbound.receivedBy}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 수정 모달창 */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-95">
            <div className="px-6 py-5 border-b border-gray-100 flex items-center bg-gray-50/80">
              <h3 className="font-bold text-lg text-gray-900 flex items-center gap-2"><Building2 size={20} className="text-blue-600"/> 거래처 기본 정보 수정</h3>
            </div>
            
            <form onSubmit={handleSave}>
              <div className="p-6 md:p-8 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5">
                <div className="sm:col-span-2">
                  <label className="block text-sm font-semibold text-gray-800 mb-1.5">업체명 <span className="text-red-500">*</span></label>
                  <Input required name="name" value={editingData.name || ""} onChange={handleEditChange} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">담당자명</label>
                  <Input name="contact" value={editingData.contact || ""} onChange={handleEditChange} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">연락처</label>
                  <Input name="phone" value={editingData.phone || ""} onChange={handleEditChange} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">사업자등록번호</label>
                  <Input name="businessNumber" value={editingData.businessNumber || ""} onChange={handleEditChange} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">이메일</label>
                  <Input type="email" name="email" value={editingData.email || ""} onChange={handleEditChange} />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">취급품목 카테고리</label>
                  <Input name="category" value={editingData.category || ""} onChange={handleEditChange} />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">비고 / 기타</label>
                  <textarea name="memo" value={editingData.memo || ""} onChange={handleEditChange} rows={3} className="w-full px-3 py-2 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm resize-none"></textarea>
                </div>
              </div>
              
              <div className="px-6 py-4.5 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
                <Button type="button" variant="outline" onClick={() => setIsEditModalOpen(false)}>취소</Button>
                <Button type="submit" disabled={isSaving} className="bg-blue-600 hover:bg-blue-700 font-bold px-8 shadow-sm">{isSaving ? "저장 중..." : "변경사항 저장"}</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

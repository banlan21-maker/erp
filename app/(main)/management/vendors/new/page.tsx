"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Truck, Save, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function NewVendorPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    name: "",
    contact: "",
    phone: "",
    email: "",
    businessNumber: "",
    category: "",
    memo: ""
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.name.trim()) {
      setError("업체명은 반드시 입력해주세요.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/supply/vendors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData)
      });
      const data = await res.json();

      if (!data.success) {
        setError(data.error || "등록에 실패했습니다.");
        return;
      }

      alert("신규 거래처 등록이 완료되었습니다.");
      router.push("/management/vendors");
      router.refresh();

    } catch (err) {
      setError("서버 오류가 발생했습니다. 다시 시도해주세요.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
          <Truck size={24} className="text-blue-600" />
          신규 거래처 등록
        </h2>
        <p className="text-sm text-gray-500 mt-1">결제 및 입출고 증빙을 위한 협력업체의 세부 정보를 입력합니다.</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl shadow-sm flex items-center gap-2 text-sm">
          <AlertCircle size={16} /> <strong>등록 실패:</strong> {error}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <form onSubmit={handleSubmit} className="p-6 md:p-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-6">

            <div className="sm:col-span-2">
              <label className="block text-sm font-semibold text-gray-800 mb-1.5">업체명 <span className="text-red-500">*</span></label>
              <Input required name="name" value={formData.name} onChange={handleChange} placeholder="예: (주)한국테크 공급" className="w-full" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">담당자명</label>
              <Input name="contact" value={formData.contact} onChange={handleChange} placeholder="예: 홍길동 대리" className="w-full" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">연락처</label>
              <Input name="phone" value={formData.phone} onChange={handleChange} placeholder="예: 010-1234-5678" className="w-full" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">이메일</label>
              <Input type="email" name="email" value={formData.email} onChange={handleChange} placeholder="example@company.com" className="w-full" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">사업자등록번호</label>
              <Input name="businessNumber" value={formData.businessNumber} onChange={handleChange} placeholder="123-45-67890" className="w-full" />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">취급품목 카테고리</label>
              <Input name="category" value={formData.category} onChange={handleChange} placeholder="예: 플라즈마 소모품, 절단기 부품, 복사기 렌탈 등" className="w-full" />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">비고 / 기타메모</label>
              <textarea
                name="memo"
                value={formData.memo}
                onChange={handleChange}
                rows={3}
                className="w-full px-3 py-2 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm resize-none"
                placeholder="입금 계좌번호, 결제 조건 등을 입력하세요."
              />
            </div>
          </div>

          <div className="mt-8 pt-6 border-t border-gray-100 flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => router.back()} className="px-6 text-sm font-medium">취소</Button>
            <Button type="submit" disabled={loading} className="px-8 text-sm font-bold bg-blue-600 hover:bg-blue-700 shadow-sm shadow-blue-200">
              <Save size={16} className="mr-2" />
              {loading ? "등록 중..." : "거래처 등록"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

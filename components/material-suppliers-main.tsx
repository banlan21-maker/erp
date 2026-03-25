"use client";

import { useState } from "react";
import {
  Building2, Users, Phone, Printer, Mail, CreditCard,
  FileText, Search, Plus, List, Building, Trash2, Edit
} from "lucide-react";

type Supplier = {
  id: string;
  name: string;
  manager: string;
  contact1: string;
  contact2: string;
  fax: string;
  email: string;
  bizNumber: string;
  account: string;
  memo: string;
  createdAt: string;
};

const initialFormState = {
  name: "",
  manager: "",
  contact1: "",
  contact2: "",
  fax: "",
  email: "",
  bizNumber: "",
  account: "",
  memo: "",
};

// 가상의 초기 데이터
const mockSuppliers: Supplier[] = [
  {
    id: "1",
    name: "(주)동국제강",
    manager: "김철수 부장",
    contact1: "010-1234-5678",
    contact2: "051-234-5678",
    fax: "051-234-5679",
    email: "chulsoo@dongkuk.com",
    bizNumber: "123-45-67890",
    account: "기업은행 123-456789-01-011",
    memo: "주요 강판 매입처, 결제일 매월 말일",
    createdAt: "2026-03-20",
  },
  {
    id: "2",
    name: "대한철강자재",
    manager: "이영희 과장",
    contact1: "010-9876-5432",
    contact2: "",
    fax: "02-987-6543",
    email: "young@daehan.net",
    bizNumber: "234-56-78901",
    account: "국민은행 987654-01-234567",
    memo: "소모품 및 파이프류",
    createdAt: "2026-03-22",
  }
];

export default function MaterialSuppliersMain() {
  const [activeTab, setActiveTab] = useState<"list" | "register">("list");
  const [suppliers, setSuppliers] = useState<Supplier[]>(mockSuppliers);
  const [formData, setFormData] = useState(initialFormState);
  const [searchTerm, setSearchTerm] = useState("");
  const [viewSupplier, setViewSupplier] = useState<Supplier | null>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      alert("거래처 이름은 필수입니다.");
      return;
    }

    const newSupplier: Supplier = {
      id: Date.now().toString(),
      ...formData,
      createdAt: new Date().toISOString().split('T')[0],
    };

    setSuppliers([newSupplier, ...suppliers]);
    setFormData(initialFormState); // 폼 초기화
    alert("거래처가 성공적으로 등록되었습니다.");
    setActiveTab("list"); // 리스트 탭으로 이동
  };

  const handleDelete = (id: string, name: string) => {
    if (confirm(`'${name}' 거래처를 정말 삭제하시겠습니까?`)) {
      setSuppliers(suppliers.filter((s) => s.id !== id));
    }
  };

  const filteredSuppliers = suppliers.filter((s) =>
    s.name.includes(searchTerm) || s.manager.includes(searchTerm)
  );

  return (
    <div className="space-y-6">
      {/* 타이틀 영역 */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
          <Building size={24} className="text-blue-600" />
          거래처 관리
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          자재 매입 및 판매 거래처의 정보를 등록하고 관리합니다.
        </p>
      </div>

      {/* 탭 네비게이션 */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setActiveTab("list")}
          className={`px-5 py-3 text-sm font-semibold flex items-center gap-2 relative transition-colors ${
            activeTab === "list"
              ? "text-blue-600"
              : "text-gray-500 hover:text-gray-800 hover:bg-gray-50"
          }`}
        >
          <List size={16} />
          거래처 리스트
          {activeTab === "list" && (
            <span className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600 rounded-t-md" />
          )}
        </button>
        <button
          onClick={() => setActiveTab("register")}
          className={`px-5 py-3 text-sm font-semibold flex items-center gap-2 relative transition-colors ${
            activeTab === "register"
              ? "text-blue-600"
              : "text-gray-500 hover:text-gray-800 hover:bg-gray-50"
          }`}
        >
          <Plus size={16} />
          거래처 등록
          {activeTab === "register" && (
            <span className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600 rounded-t-md" />
          )}
        </button>
      </div>

      {/* 탭 컨텐츠 영역 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        
        {/* 거래처 리스트 탭 */}
        {activeTab === "list" && (
          <div>
            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="거래처명 또는 담당자 검색"
                  className="pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-64 bg-white"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <span className="text-sm text-gray-500">
                총 <strong className="text-gray-900">{filteredSuppliers.length}</strong>개의 거래처
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-gray-50 text-gray-600 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 font-medium">거래처명</th>
                    <th className="px-6 py-3 font-medium">담당자</th>
                    <th className="px-6 py-3 font-medium">연락처1</th>
                    <th className="px-6 py-3 font-medium">이메일</th>
                    <th className="px-6 py-3 font-medium">사업자번호</th>
                    <th className="px-6 py-3 font-medium text-center">관리</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredSuppliers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                        등록된 거래처가 없거나 검색 결과가 없습니다.
                      </td>
                    </tr>
                  ) : (
                    filteredSuppliers.map((supplier) => (
                      <tr 
                        key={supplier.id} 
                        className="hover:bg-blue-50/50 transition-colors group cursor-pointer"
                        onClick={() => setViewSupplier(supplier)}
                      >
                        <td className="px-6 py-4 font-bold text-gray-900">
                          {supplier.name}
                        </td>
                        <td className="px-6 py-4 text-gray-700">{supplier.manager || "-"}</td>
                        <td className="px-6 py-4 text-gray-700">{supplier.contact1 || "-"}</td>
                        <td className="px-6 py-4 text-gray-500">{supplier.email || "-"}</td>
                        <td className="px-6 py-4 text-gray-500">{supplier.bizNumber || "-"}</td>
                        <td className="px-6 py-4">
                          <div className="flex justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                            <button title="수정 (준비중)" className="p-1.5 text-gray-400 hover:text-blue-600 bg-white rounded shadow-sm border border-gray-200">
                              <Edit size={14} />
                            </button>
                            <button
                              onClick={() => handleDelete(supplier.id, supplier.name)}
                              title="삭제" 
                              className="p-1.5 text-gray-400 hover:text-red-600 bg-white rounded shadow-sm border border-gray-200"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 거래처 등록 탭 */}
        {activeTab === "register" && (
          <div>
            <div className="p-6 border-b border-gray-100 bg-blue-50/50">
              <h3 className="font-bold text-gray-900">신규 거래처 등록 정보</h3>
              <p className="text-xs text-gray-500 mt-1">필수 정보(*)를 포함하여 거래처 상세 내역을 입력해주세요.</p>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 sm:p-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                
                {/* 1. 거래처 이름 */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-semibold text-gray-800 mb-1.5 flex items-center gap-1.5">
                    <Building2 size={15} className="text-gray-400" />
                    거래처 이름 <span className="text-red-500">*</span>
                  </label>
                  <input
                    required
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    placeholder="예: (주)대한철강"
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-colors"
                  />
                </div>

                {/* 2. 담당자 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-1.5">
                    <Users size={15} className="text-gray-400" />
                    담당자 이름
                  </label>
                  <input
                    name="manager"
                    value={formData.manager}
                    onChange={handleInputChange}
                    placeholder="예: 홍길동 부장"
                    className="w-full px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* 3. 연락처1 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-1.5">
                    <Phone size={15} className="text-gray-400" />
                    주요 연락처 (연락처1)
                  </label>
                  <input
                    name="contact1"
                    value={formData.contact1}
                    onChange={handleInputChange}
                    placeholder="예: 010-1234-5678"
                    className="w-full px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* 4. 연락처2 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-1.5">
                    <Phone size={15} className="text-gray-400" />
                    보조 연락처 (연락처2)
                  </label>
                  <input
                    name="contact2"
                    value={formData.contact2}
                    onChange={handleInputChange}
                    placeholder="예: 051-123-4567"
                    className="w-full px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* 5. 팩스 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-1.5">
                    <Printer size={15} className="text-gray-400" />
                    팩스번호
                  </label>
                  <input
                    name="fax"
                    value={formData.fax}
                    onChange={handleInputChange}
                    placeholder="예: 051-123-4568"
                    className="w-full px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* 6. 이메일 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-1.5">
                    <Mail size={15} className="text-gray-400" />
                    이메일 주소
                  </label>
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    placeholder="예: contact@company.com"
                    className="w-full px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* 7. 사업자번호 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-1.5">
                    <FileText size={15} className="text-gray-400" />
                    사업자등록번호
                  </label>
                  <input
                    name="bizNumber"
                    value={formData.bizNumber}
                    onChange={handleInputChange}
                    placeholder="예: 123-45-67890"
                    className="w-full px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* 8. 계좌번호 */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-1.5">
                    <CreditCard size={15} className="text-gray-400" />
                    결제 계좌번호
                  </label>
                  <input
                    name="account"
                    value={formData.account}
                    onChange={handleInputChange}
                    placeholder="예: 국민은행 123456-01-789012 (예금주명)"
                    className="w-full px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* 9. 메모 */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    메모 (특이사항)
                  </label>
                  <textarea
                    name="memo"
                    value={formData.memo}
                    onChange={handleInputChange}
                    rows={4}
                    placeholder="주요 취급 품목, 결제 조건 등 특이사항을 기록하세요."
                    className="w-full px-4 py-3 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  />
                </div>
              </div>

              {/* 하단 버튼 */}
              <div className="mt-8 pt-6 border-t border-gray-100 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setFormData(initialFormState);
                    setActiveTab("list");
                  }}
                  className="px-6 py-2.5 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 text-sm font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:ring-4 focus:ring-blue-200 transition-all flex items-center gap-2 shadow-sm shadow-blue-200"
                >
                  <Plus size={16} />
                  거래처 등록 완료
                </button>
              </div>
            </form>
          </div>
        )}
      </div>

      {/* 상세 보기 모달 */}
      {viewSupplier && (
        <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50/80">
              <h3 className="font-bold text-lg text-gray-900 flex items-center gap-2">
                <Building2 className="text-blue-600" size={20} />
                {viewSupplier.name}
              </h3>
              <button onClick={() => setViewSupplier(null)} className="text-gray-400 hover:text-gray-600 transition-colors p-1 hover:bg-gray-200 rounded-md">
                <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto w-full">
              <div className="grid grid-cols-2 gap-y-6 gap-x-8">
                <div>
                  <p className="text-xs text-gray-500 mb-1">담당자</p>
                  <p className="text-sm font-medium text-gray-900">{viewSupplier.manager || "-"}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">사업자등록번호</p>
                  <p className="text-sm font-medium text-gray-900">{viewSupplier.bizNumber || "-"}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">주요 연락처 (연락처1)</p>
                  <p className="text-sm font-medium text-gray-900">{viewSupplier.contact1 || "-"}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">보조 연락처 (연락처2)</p>
                  <p className="text-sm font-medium text-gray-900">{viewSupplier.contact2 || "-"}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">이메일 주소</p>
                  <p className="text-sm font-medium text-gray-900">{viewSupplier.email || "-"}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">팩스번호</p>
                  <p className="text-sm font-medium text-gray-900">{viewSupplier.fax || "-"}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-gray-500 mb-1">결제 계좌번호</p>
                  <p className="text-sm font-medium text-gray-900">{viewSupplier.account || "-"}</p>
                </div>
                <div className="col-span-2 mt-2">
                  <p className="text-xs text-gray-500 mb-1">메모 (특이사항)</p>
                  <div className="text-sm text-gray-700 bg-gray-50 p-4 rounded-lg min-h-[80px] border border-gray-100 whitespace-pre-wrap leading-relaxed">
                    {viewSupplier.memo || "등록된 메모가 없습니다."}
                  </div>
                </div>
              </div>
            </div>
            
            <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end">
              <button 
                onClick={() => setViewSupplier(null)}
                className="px-6 py-2.5 text-sm font-bold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors shadow-sm"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

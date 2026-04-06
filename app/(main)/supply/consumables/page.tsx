"use client";

import { useEffect, useState, useMemo } from "react";
import { Package, Search, Filter, AlertCircle, Edit, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const DEPT_LABELS: Record<string, string> = { CUTTING: "절단", FACILITY: "공무" };
const DEPT_COLORS: Record<string, string> = {
  CUTTING: "bg-blue-100 text-blue-700",
  FACILITY: "bg-purple-100 text-purple-700",
};

export default function ConsumablesPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchTerm, setSearchTerm] = useState("");
  const [subCategoryFilter, setSubCategoryFilter] = useState("all");
  const [deptFilter, setDeptFilter] = useState<"all" | "CUTTING" | "FACILITY">("all");

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [stockEditConfirm, setStockEditConfirm] = useState(false);
  const [stockEditValue, setStockEditValue] = useState("");

  const fetchItems = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/supply/items?category=CONSUMABLE");
      const json = await res.json();
      if (json.success) setItems(json.data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchItems(); }, []);

  const uniqueSubCategories = Array.from(new Set(items.map(i => i.subCategory).filter(Boolean)));

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchSearch = item.name.includes(searchTerm) || (item.subCategory && item.subCategory.includes(searchTerm));
      const matchCat = subCategoryFilter === "all" || item.subCategory === subCategoryFilter;
      const matchDept = deptFilter === "all" || item.department === deptFilter;
      return matchSearch && matchCat && matchDept;
    });
  }, [items, searchTerm, subCategoryFilter, deptFilter]);

  const openEditModal = (item: any) => {
    setEditingItem({ ...item });
    setStockEditConfirm(false);
    setStockEditValue(String(item.stockQty ?? 0));
    setIsEditModalOpen(true);
  };

  const handleStockSave = async () => {
    if (!editingItem) return;
    setIsSaving(true);
    try {
      const res = await fetch(`/api/supply/items/${editingItem.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stockQty: Number(stockEditValue) })
      });
      const data = await res.json();
      if (data.success) {
        setEditingItem((prev: any) => ({ ...prev, stockQty: Number(stockEditValue) }));
        setStockEditConfirm(false);
        fetchItems();
      } else {
        alert(data.error);
      }
    } catch {
      alert("서버 연결 실패");
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setEditingItem((prev: any) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem.name || !editingItem.unit) {
      alert("품명과 단위를 입력해주세요.");
      return;
    }
    setIsSaving(true);
    try {
      const res = await fetch(`/api/supply/items/${editingItem.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editingItem.name,
          department: editingItem.department,
          subCategory: editingItem.subCategory,
          unit: editingItem.unit,
          reorderPoint: editingItem.reorderPoint,
          location: editingItem.location,
          memo: editingItem.memo
        })
      });
      const data = await res.json();
      if (data.success) {
        setIsEditModalOpen(false);
        fetchItems();
      } else {
        alert(data.error);
      }
    } catch {
      alert("서버 연결 실패");
    } finally {
      setIsSaving(false);
    }
  };

  const deptTabs = [
    { value: "all", label: "전체" },
    { value: "CUTTING", label: "절단" },
    { value: "FACILITY", label: "공무" },
  ] as const;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Package size={24} className="text-blue-600" /> 소모품 마스터 목록
        </h2>
        <p className="text-sm text-gray-500 mt-1">소모품 현황을 파악하고 상세 정보를 수정합니다. (수량은 입출고 등록으로 변경)</p>
      </div>

      {/* 관리주체 탭 */}
      <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg w-fit border border-gray-200">
        {deptTabs.map(tab => (
          <button
            key={tab.value}
            onClick={() => setDeptFilter(tab.value)}
            className={`px-5 py-1.5 rounded-md text-sm font-semibold transition-all ${
              deptFilter === tab.value
                ? "bg-white shadow-sm text-gray-900 border border-gray-200"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-20 text-gray-400 gap-3">
          <RefreshCw className="animate-spin text-blue-500" size={28} /> 데이터를 불러오는 중입니다...
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-700">총 <strong>{filteredItems.length}</strong>개 품목</span>
            </div>
            <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
              <div className="relative">
                <Filter size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <select
                  value={subCategoryFilter}
                  onChange={(e) => setSubCategoryFilter(e.target.value)}
                  className="pl-7 pr-3 py-1.5 h-9 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-gray-50"
                >
                  <option value="all">분류 전체</option>
                  {uniqueSubCategories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="relative flex-1 sm:flex-none">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <Input
                  placeholder="품명 검색"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 h-9 text-sm lg:w-[250px]"
                />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            <div className="overflow-x-auto min-h-[300px]">
              <table className="w-full text-sm text-left whitespace-nowrap">
                <thead className="bg-gray-50 border-b border-gray-200 text-gray-600">
                  <tr>
                    <th className="px-5 py-3 font-semibold">품명</th>
                    <th className="px-5 py-3 font-semibold">관리주체</th>
                    <th className="px-5 py-3 font-semibold">분류</th>
                    <th className="px-5 py-3 font-semibold text-right">현재재고</th>
                    <th className="px-5 py-3 font-semibold text-right">발주기준점</th>
                    <th className="px-5 py-3 font-semibold text-center">단위</th>
                    <th className="px-5 py-3 font-semibold">보관위치</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredItems.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-5 py-12 text-center text-gray-400">데이터가 없습니다.</td>
                    </tr>
                  ) : (
                    filteredItems.map(item => {
                      const isDanger = item.reorderPoint !== null && item.stockQty <= item.reorderPoint;
                      return (
                        <tr
                          key={item.id}
                          onClick={() => openEditModal(item)}
                          className={`cursor-pointer transition-colors group ${isDanger ? "bg-red-50/40 hover:bg-red-50" : "hover:bg-blue-50/50"}`}
                        >
                          <td className="px-5 py-4 font-bold text-gray-900 group-hover:text-blue-700 transition-colors">
                            <span className="flex items-center gap-2">
                              {item.name}
                              {isDanger && <span className="px-1.5 py-0.5 text-[10px] bg-red-100 text-red-700 rounded font-semibold whitespace-nowrap">발주필요</span>}
                            </span>
                          </td>
                          <td className="px-5 py-4">
                            <span className={`px-2 py-0.5 text-xs rounded-full font-semibold ${DEPT_COLORS[item.department] || "bg-gray-100 text-gray-600"}`}>
                              {DEPT_LABELS[item.department] || item.department}
                            </span>
                          </td>
                          <td className="px-5 py-4 text-gray-600">{item.subCategory || "-"}</td>
                          <td className={`px-5 py-4 text-right font-bold ${isDanger ? "text-red-600" : "text-gray-900"}`}>{item.stockQty}</td>
                          <td className="px-5 py-4 text-right text-gray-500">{item.reorderPoint ?? "-"}</td>
                          <td className="px-5 py-4 text-center text-gray-500 text-xs">{item.unit}</td>
                          <td className="px-5 py-4 text-gray-600">{item.location || "-"}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 재고 직접수정 경고 확인 모달 */}
      {stockEditConfirm && editingItem && (
        <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95">
            <div className="px-6 py-4 border-b border-amber-100 bg-amber-50">
              <h3 className="font-bold text-base text-amber-800 flex items-center gap-2">
                <AlertCircle size={18} className="text-amber-600" /> 재고 직접 수정
              </h3>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-700 leading-relaxed">
                정상적인 재고 반영이 아닙니다.<br/>
                직접 수정하시겠습니까?
              </p>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">수정할 재고 수량</label>
                <Input
                  type="number"
                  value={stockEditValue}
                  onChange={(e) => setStockEditValue(e.target.value)}
                  className="text-center font-bold text-lg"
                  autoFocus
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => setStockEditConfirm(false)}>아니요</Button>
              <Button
                type="button"
                disabled={isSaving}
                onClick={handleStockSave}
                className="bg-amber-500 hover:bg-amber-600 text-white font-bold"
              >
                {isSaving ? "저장 중..." : "예, 수정합니다"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 수정 모달창 */}
      {isEditModalOpen && editingItem && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <h3 className="font-bold text-lg text-gray-900 flex items-center gap-2"><Edit size={18} className="text-blue-600"/> 소모품 마스터 수정</h3>
              <span className="text-xs bg-amber-100 text-amber-700 py-1 px-2 rounded-md font-semibold">재고 직접수정 주의</span>
            </div>

            <form onSubmit={handleSave}>
              <div className="p-6 space-y-4">
                {/* 현재재고 표시 */}
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="text-sm text-gray-600">
                    현재재고: <span className="font-bold text-gray-900 text-base">{editingItem.stockQty ?? 0}</span>
                    <span className="text-gray-500 ml-1 text-xs">{editingItem.unit}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setStockEditConfirm(true); setStockEditValue(String(editingItem.stockQty ?? 0)); }}
                    className="text-xs px-3 py-1.5 bg-amber-100 text-amber-700 hover:bg-amber-200 rounded-md font-semibold transition-colors border border-amber-200"
                  >
                    수정
                  </button>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-800 mb-1.5">품명 <span className="text-red-500">*</span></label>
                  <Input required name="name" value={editingItem.name} onChange={handleEditChange} />
                </div>

                {/* 관리주체 라디오 */}
                <div>
                  <label className="block text-sm font-semibold text-gray-800 mb-2">관리주체 <span className="text-red-500">*</span></label>
                  <div className="flex gap-3">
                    {[{ value: "CUTTING", label: "절단", color: "border-blue-400 bg-blue-50 text-blue-700" }, { value: "FACILITY", label: "공무", color: "border-purple-400 bg-purple-50 text-purple-700" }].map(opt => (
                      <label key={opt.value} className={`flex items-center gap-2 px-5 py-2 rounded-lg border-2 cursor-pointer font-semibold text-sm transition-all ${editingItem.department === opt.value ? opt.color : "border-gray-200 text-gray-500 hover:border-gray-300"}`}>
                        <input
                          type="radio"
                          name="department"
                          value={opt.value}
                          checked={editingItem.department === opt.value}
                          onChange={() => setEditingItem((prev: any) => ({ ...prev, department: opt.value }))}
                          className="sr-only"
                        />
                        {opt.label}
                      </label>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">세부분류</label>
                    <Input name="subCategory" value={editingItem.subCategory || ""} onChange={handleEditChange} />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-800 mb-1.5">단위 <span className="text-red-500">*</span></label>
                    <Input required name="unit" value={editingItem.unit} onChange={handleEditChange} />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">발주 기준점</label>
                  <Input type="number" name="reorderPoint" value={editingItem.reorderPoint || ""} onChange={handleEditChange} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">보관 위치</label>
                  <Input name="location" value={editingItem.location || ""} onChange={handleEditChange} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">비고</label>
                  <textarea name="memo" value={editingItem.memo || ""} onChange={handleEditChange} rows={2} className="w-full px-3 py-2 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm resize-none"></textarea>
                </div>
              </div>

              <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
                <Button type="button" variant="outline" onClick={() => setIsEditModalOpen(false)}>취소</Button>
                <Button type="submit" disabled={isSaving} className="bg-blue-600 hover:bg-blue-700 font-bold">{isSaving ? "저장 중..." : "수정사항 저장"}</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

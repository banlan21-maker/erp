"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Calendar, Search, Filter, History, PackageCheck, PackageMinus,
  RefreshCw, Plus, ShoppingCart, Trash2, X, AlertCircle, Star, ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// ─── 상수 ────────────────────────────────────────────────────────────────────

const DEPT_LABELS: Record<string, string> = { CUTTING: "절단", FACILITY: "공무" };
const DEPT_COLORS: Record<string, string> = {
  CUTTING: "bg-blue-100 text-blue-700",
  FACILITY: "bg-purple-100 text-purple-700",
};

// ─── 검색 가능한 셀렉트 ──────────────────────────────────────────────────────

function SearchableSelect({
  items, value, onChange, placeholder, renderItem, renderSelected, disabled = false, onToggleFavorite,
}: {
  items: any[]; value: string; onChange: (val: string) => void;
  placeholder: string; renderItem: (item: any) => React.ReactNode;
  renderSelected: (item: any) => string; disabled?: boolean;
  onToggleFavorite?: (item: any, e: React.MouseEvent) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const selectedItem = items.find(i => String(i.id) === value);
  const filtered = items.filter(i => renderSelected(i).toLowerCase().includes(search.toLowerCase()));

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setSearch(""); }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button type="button" disabled={disabled}
        onClick={() => { setOpen(v => !v); setSearch(""); }}
        className="w-full flex items-center justify-between px-3 py-2 border border-gray-200 rounded-md bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span className={selectedItem ? "text-gray-900" : "text-gray-400"}>
          {selectedItem?.isFavorite && <Star size={11} className="inline text-yellow-400 fill-yellow-400 mr-1" />}
          {selectedItem ? renderSelected(selectedItem) : placeholder}
        </span>
        <ChevronDown size={14} className="text-gray-400 shrink-0" />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-xl overflow-hidden">
          <div className="p-2 border-b border-gray-100">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input autoFocus type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="검색..." className="w-full pl-7 pr-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>
          </div>
          <ul className="max-h-56 overflow-y-auto">
            {filtered.length === 0 ? (
              <li className="px-4 py-3 text-sm text-gray-400 text-center">검색 결과가 없습니다.</li>
            ) : filtered.map(item => (
              <li key={item.id}
                onMouseDown={() => { onChange(String(item.id)); setOpen(false); setSearch(""); }}
                className={`flex items-center gap-1 px-3 py-2.5 text-sm cursor-pointer hover:bg-blue-50 transition-colors ${String(item.id) === value ? "bg-blue-50 font-semibold text-blue-700" : "text-gray-800"}`}
              >
                {onToggleFavorite && (
                  <button type="button" onMouseDown={(e) => { e.stopPropagation(); onToggleFavorite(item, e); }}
                    className="shrink-0 p-0.5 rounded hover:bg-yellow-50">
                    <Star size={13} className={item.isFavorite ? "text-yellow-400 fill-yellow-400" : "text-gray-300"} />
                  </button>
                )}
                <span className="flex-1">{renderItem(item)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─── 입출고 등록 모달 ─────────────────────────────────────────────────────────

function InOutModal({
  mode, items, vendors, onClose, onDone, onToggleFavorite,
}: {
  mode: "in" | "out";
  items: any[];
  vendors: any[];
  onClose: () => void;
  onDone: () => void;
  onToggleFavorite: (vendor: any, e: React.MouseEvent) => void;
}) {
  const todayStr = () => new Date().toISOString().slice(0, 10);
  const [formData, setFormData] = useState({
    itemId: "", vendorId: "", qty: "", person: "", memo: "", date: todayStr(),
  });
  const [cart, setCart] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deptFilter, setDeptFilter] = useState<"all" | "CUTTING" | "FACILITY">("all");

  const isIn = mode === "in";

  const filteredItems = items.filter(i => {
    const matchDept = deptFilter === "all" || i.department === deptFilter;
    const matchMode = isIn ? true : i.category === "CONSUMABLE";
    return matchDept && matchMode;
  });

  const selectedItemData = items.find(i => i.id === Number(formData.itemId));

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const addToCart = () => {
    setError(null);
    if (!formData.itemId || !formData.qty || !formData.person) {
      setError("필수 항목(품목, 수량, 확인자/사용자)을 입력해주세요."); return;
    }
    if (isIn && !formData.vendorId) {
      setError("매입 거래처를 선택해주세요."); return;
    }
    const selItem = items.find(i => String(i.id) === formData.itemId);
    const selVendor = vendors.find(v => String(v.id) === formData.vendorId);
    setCart(prev => [...prev, {
      _key: `${Date.now()}-${Math.random()}`,
      itemId: formData.itemId,
      itemName: selItem?.name ?? formData.itemId,
      itemUnit: selItem?.unit ?? "",
      vendorId: formData.vendorId,
      vendorName: selVendor?.name ?? "",
      date: formData.date,
      qty: formData.qty,
      person: formData.person,
      memo: formData.memo,
    }]);
    if (isIn) {
      setFormData(prev => ({ ...prev, itemId: "", qty: "" }));
    } else {
      setFormData(prev => ({ ...prev, itemId: "", qty: "", memo: "" }));
    }
  };

  const submitCart = async () => {
    if (cart.length === 0) return;
    setError(null);
    setSubmitting(true);
    try {
      const url = isIn ? "/api/supply/inbound" : "/api/supply/outbound";
      let hasWarning = false;
      for (const c of cart) {
        const payload = isIn
          ? { itemId: c.itemId, vendorId: c.vendorId, qty: c.qty, receivedBy: c.person, memo: c.memo, receivedAt: c.date }
          : { itemId: c.itemId, qty: c.qty, usedBy: c.person, memo: c.memo, usedAt: c.date };
        const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        const data = await res.json();
        if (!data.success) { setError(`[${c.itemName}] ${data.error}`); setSubmitting(false); return; }
        if (!isIn && data.data?.isWarning) hasWarning = true;
      }
      if (hasWarning) window.alert("⚠️ [경보] 일부 품목 재고가 발주 기준점 이하로 떨어졌습니다!");
      else alert(`${isIn ? "입고" : "출고"} ${cart.length}건 처리가 완료되었습니다.`);
      onDone();
      onClose();
    } catch {
      setError("서버 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto mx-4">
        {/* 헤더 */}
        <div className={`flex items-center justify-between px-6 py-4 border-b ${isIn ? "bg-emerald-50 border-emerald-100" : "bg-orange-50 border-orange-100"}`}>
          <h3 className={`font-bold flex items-center gap-2 text-lg ${isIn ? "text-emerald-800" : "text-orange-800"}`}>
            {isIn ? <PackageCheck size={20} /> : <PackageMinus size={20} />}
            {isIn ? "품목 입고 (등록)" : "현장 출고 (사용)"}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <div className="p-6 space-y-5">
          {error && (
            <div className="bg-red-50 border border-red-100 text-red-700 px-4 py-3 text-sm rounded-lg flex items-center gap-2">
              <AlertCircle size={15} /> {error}
            </div>
          )}

          {/* 관리주체 필터 */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-gray-500 shrink-0">관리주체:</span>
            <div className="flex gap-1 bg-gray-100 p-0.5 rounded-lg border border-gray-200">
              {(["all", "CUTTING", "FACILITY"] as const).map(v => (
                <button key={v} type="button" onClick={() => setDeptFilter(v)}
                  className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${deptFilter === v ? "bg-white shadow-sm text-gray-900 border border-gray-200" : "text-gray-500 hover:text-gray-700"}`}>
                  {v === "all" ? "전체" : DEPT_LABELS[v]}
                </button>
              ))}
            </div>
          </div>

          {/* 품목 선택 */}
          <div>
            <label className="block text-sm font-semibold text-gray-800 mb-1.5">
              대상 품목 <span className="text-red-500">*</span>
              {!isIn && <span className="ml-2 text-xs text-gray-400 font-normal">(소모품만 출고 가능)</span>}
            </label>
            <SearchableSelect
              items={filteredItems} value={formData.itemId}
              onChange={(val) => setFormData(prev => ({ ...prev, itemId: val }))}
              placeholder="-- 품목 선택 --"
              renderItem={(item) => (
                <span className="flex items-center gap-2 flex-wrap">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold shrink-0 ${DEPT_COLORS[item.department] || "bg-gray-100 text-gray-600"}`}>{DEPT_LABELS[item.department] || item.department}</span>
                  {item.subCategory && <span className="text-xs text-blue-600 font-medium shrink-0">[{item.subCategory}]</span>}
                  <span className="font-medium">{item.name}</span>
                  <span className="text-gray-400 text-xs ml-auto shrink-0">({item.unit}) 재고: {item.stockQty}</span>
                </span>
              )}
              renderSelected={(item) => `${DEPT_LABELS[item.department] || item.department} | ${item.name} (${item.unit}) 재고: ${item.stockQty}`}
              disabled={filteredItems.length === 0}
            />
          </div>

          {/* 거래처 (입고만) */}
          {isIn && (
            <div>
              <label className="block text-sm font-semibold text-gray-800 mb-1.5">
                매입 거래처 <span className="text-red-500">*</span>
              </label>
              <SearchableSelect
                items={vendors} value={formData.vendorId}
                onChange={(val) => setFormData(prev => ({ ...prev, vendorId: val }))}
                placeholder="-- 거래처 선택 --"
                onToggleFavorite={onToggleFavorite}
                renderItem={(v) => (
                  <span className="flex items-center gap-2">
                    {v.isFavorite && <Star size={11} className="text-yellow-400 fill-yellow-400 shrink-0" />}
                    <span>{v.name}</span>
                    {v.contact && <span className="text-gray-400 text-xs">{v.contact}</span>}
                  </span>
                )}
                renderSelected={(v) => v.contact ? `${v.name} (${v.contact})` : v.name}
              />
            </div>
          )}

          {/* 출고 시 현재재고 표시 */}
          {!isIn && selectedItemData && (
            <div className="text-sm font-bold bg-orange-50 px-3 py-2 rounded-lg border border-orange-200 text-orange-700">
              현재 등록 전 재고: {selectedItemData.stockQty} {selectedItemData.unit}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-800 mb-1.5">
                {isIn ? "입고일" : "출고일"} <span className="text-red-500">*</span>
              </label>
              <Input type="date" name="date" value={formData.date} onChange={handleChange} className="w-full" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-800 mb-1.5">
                {isIn ? "입고수량" : "출고수량"} <span className="text-red-500">*</span>
              </label>
              <Input type="number" min="1"
                max={!isIn && selectedItemData ? selectedItemData.stockQty : undefined}
                name="qty" value={formData.qty} onChange={handleChange} placeholder="0"
                className={`w-full font-bold ${isIn ? "text-emerald-600" : "text-orange-600"}`} />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-800 mb-1.5">
              {isIn ? "확인자 (입고담당)" : "사용자 (수령인)"} <span className="text-red-500">*</span>
            </label>
            <Input name="person" value={formData.person} onChange={handleChange}
              placeholder={isIn ? "예: 물류팀 박대리" : "예: 1라인 김현수"} className="w-full" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">메모 (선택)</label>
            <textarea name="memo" value={formData.memo} onChange={handleChange} rows={2}
              className="w-full px-3 py-2 border border-gray-200 rounded-md focus:outline-none focus:ring-2 text-sm resize-none"
              placeholder="특이사항이나 사유를 적어주세요." />
          </div>

          <div className="flex justify-end">
            <Button type="button" onClick={addToCart}
              className={`px-6 text-sm font-bold ${isIn ? "bg-emerald-600 hover:bg-emerald-700" : "bg-orange-600 hover:bg-orange-700"}`}>
              <ShoppingCart size={15} className="mr-2" /> 장바구니 담기
            </Button>
          </div>

          {/* 장바구니 */}
          {cart.length > 0 && (
            <div className={`rounded-xl border overflow-hidden ${isIn ? "border-emerald-200" : "border-orange-200"}`}>
              <div className={`px-4 py-2.5 border-b flex items-center justify-between ${isIn ? "bg-emerald-50 border-emerald-200" : "bg-orange-50 border-orange-200"}`}>
                <span className={`font-bold text-sm flex items-center gap-2 ${isIn ? "text-emerald-800" : "text-orange-800"}`}>
                  <ShoppingCart size={14} /> 장바구니 — {cart.length}건
                </span>
                <button onClick={() => setCart([])} className="text-xs text-gray-400 hover:text-red-500 flex items-center gap-1">
                  <X size={12} /> 전체 비우기
                </button>
              </div>
              <table className="w-full text-xs whitespace-nowrap bg-white">
                <thead className="bg-gray-50 border-b text-gray-500">
                  <tr>
                    <th className="px-3 py-2 text-left">품목</th>
                    {isIn && <th className="px-3 py-2 text-left">거래처</th>}
                    <th className="px-3 py-2 text-left">{isIn ? "입고일" : "출고일"}</th>
                    <th className="px-3 py-2 text-right">수량</th>
                    <th className="px-3 py-2 text-left">{isIn ? "확인자" : "사용자"}</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {cart.map((c) => (
                    <tr key={c._key} className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-semibold">{c.itemName}</td>
                      {isIn && <td className="px-3 py-2 text-gray-500">{c.vendorName || "-"}</td>}
                      <td className="px-3 py-2 font-mono text-gray-500">{c.date}</td>
                      <td className={`px-3 py-2 text-right font-bold ${isIn ? "text-emerald-700" : "text-orange-700"}`}>
                        {isIn ? "+" : "-"}{c.qty}
                      </td>
                      <td className="px-3 py-2 text-gray-600">{c.person}</td>
                      <td className="px-3 py-2">
                        <button onClick={() => setCart(prev => prev.filter(x => x._key !== c._key))}
                          className="text-gray-300 hover:text-red-500"><Trash2 size={13} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className={`px-4 py-3 border-t flex justify-end ${isIn ? "bg-emerald-50 border-emerald-100" : "bg-orange-50 border-orange-100"}`}>
                <Button onClick={submitCart} disabled={submitting}
                  className={`px-8 font-bold ${isIn ? "bg-emerald-600 hover:bg-emerald-700" : "bg-orange-600 hover:bg-orange-700"}`}>
                  {submitting ? <RefreshCw size={15} className="animate-spin mr-2" /> : null}
                  {cart.length}건 전체 반영
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── 메인 ─────────────────────────────────────────────────────────────────────

export default function HistoryPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-400">로딩 중...</div>}>
      <HistoryContent />
    </Suspense>
  );
}

function HistoryContent() {
  const searchParams = useSearchParams();
  const initTab = searchParams.get("tab") === "outbound" ? "outbound" : "inbound";

  const [activeTab, setActiveTab] = useState<"inbound" | "outbound">(initTab);
  const d = new Date();
  const [month, setMonth] = useState(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  const [searchTerm, setSearchTerm] = useState("");
  const [vendorId, setVendorId] = useState("all");
  const [subCategory, setSubCategory] = useState("all");

  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [vendors, setVendors] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [uniqueSubCategories, setUniqueSubCategories] = useState<string[]>([]);
  const [modalMode, setModalMode] = useState<"in" | "out" | null>(null);

  useEffect(() => {
    async function fetchFilters() {
      try {
        const [vRes, iRes] = await Promise.all([
          fetch("/api/supply/vendors"),
          fetch("/api/supply/items"),
        ]);
        const vJson = await vRes.json();
        const iJson = await iRes.json();
        if (vJson.success) setVendors(vJson.data);
        if (iJson.success) {
          setItems(iJson.data);
          const subs = Array.from(new Set(iJson.data.map((i: any) => i.subCategory).filter(Boolean))) as string[];
          setUniqueSubCategories(subs);
        }
      } catch (e) { console.error(e); }
    }
    fetchFilters();
  }, []);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      let url = `/api/supply/${activeTab}?month=${month}`;
      if (searchTerm) url += `&search=${encodeURIComponent(searchTerm)}`;
      if (subCategory !== "all") url += `&subCategory=${encodeURIComponent(subCategory)}`;
      if (activeTab === "inbound" && vendorId !== "all") url += `&vendorId=${vendorId}`;
      const res = await fetch(url);
      const json = await res.json();
      if (json.success) setData(json.data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchHistory(); }, [activeTab, month, searchTerm, subCategory, vendorId]);

  const handleToggleFavorite = async (vendor: any, e: React.MouseEvent) => {
    e.preventDefault();
    const newVal = !vendor.isFavorite;
    setVendors(prev => {
      const updated = prev.map(v => v.id === vendor.id ? { ...v, isFavorite: newVal } : v);
      return [...updated].sort((a, b) => {
        if (a.isFavorite === b.isFavorite) return a.name.localeCompare(b.name);
        return a.isFavorite ? -1 : 1;
      });
    });
    await fetch(`/api/supply/vendors/${vendor.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isFavorite: newVal }),
    });
  };

  const handleModalDone = () => {
    fetchHistory();
    fetch("/api/supply/items").then(r => r.json()).then(j => { if (j.success) setItems(j.data); });
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  const inboundCols = 12;
  const outboundCols = 10;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
          <History size={24} className="text-blue-600" />
          입출고 전체 이력
        </h2>
        <p className="text-sm text-gray-500 mt-1">월별 입고(매입) 내역 및 현장 출고(사용) 이력을 상세히 조회합니다.</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {/* 탭 */}
        <div className="flex border-b border-gray-100 items-end px-6 pt-4 bg-gray-50/50 gap-4">
          <button
            onClick={() => { setActiveTab("inbound"); setVendorId("all"); }}
            className={`pb-3 px-2 flex items-center gap-2 font-bold text-sm transition-colors border-b-2 ${activeTab === "inbound" ? "text-emerald-700 border-emerald-600" : "text-gray-500 border-transparent hover:text-gray-800"}`}
          >
            <PackageCheck size={18} /> 입고(매입) 이력
          </button>
          <button
            onClick={() => setActiveTab("outbound")}
            className={`pb-3 px-2 flex items-center gap-2 font-bold text-sm transition-colors border-b-2 ${activeTab === "outbound" ? "text-orange-700 border-orange-600" : "text-gray-500 border-transparent hover:text-gray-800"}`}
          >
            <PackageMinus size={18} /> 현장 출고 이력
          </button>
        </div>

        {/* 필터 + 등록 버튼 */}
        <div className="p-5 border-b border-gray-100 flex flex-wrap items-center gap-4 bg-white">
          <div className="relative">
            <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="month" value={month} onChange={e => setMonth(e.target.value)}
              className="pl-9 pr-3 py-1.5 h-9 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-gray-50" />
          </div>
          <div className="relative">
            <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <select value={subCategory} onChange={e => setSubCategory(e.target.value)}
              className="pl-9 pr-3 py-1.5 h-9 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-gray-50">
              <option value="all">분류 전체</option>
              {uniqueSubCategories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          {activeTab === "inbound" && (
            <div className="relative min-w-[200px]">
              <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <select value={vendorId} onChange={e => setVendorId(e.target.value)}
                className="pl-9 pr-3 py-1.5 h-9 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-gray-50 w-full">
                <option value="all">거래처 전체</option>
                {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
          )}
          <div className="relative flex-1 min-w-[200px] lg:flex-none lg:w-[240px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <Input value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
              placeholder="품명 검색" className="pl-9 h-9 text-sm w-full" />
          </div>
          {/* 등록 버튼 */}
          <div className="ml-auto">
            {activeTab === "inbound" ? (
              <Button onClick={() => setModalMode("in")}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center gap-2">
                <Plus size={15} /> 품목입고 (등록)
              </Button>
            ) : (
              <Button onClick={() => setModalMode("out")}
                className="bg-orange-600 hover:bg-orange-700 text-white font-bold flex items-center gap-2">
                <Plus size={15} /> 현장 출고 (사용)
              </Button>
            )}
          </div>
        </div>

        {/* 테이블 */}
        <div className="overflow-x-auto min-h-[400px]">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead className={`border-b text-xs text-gray-600 uppercase ${activeTab === "inbound" ? "bg-emerald-50/30 border-emerald-100" : "bg-orange-50/30 border-orange-100"}`}>
              <tr>
                {activeTab === "inbound" ? (
                  <>
                    <th className="px-4 py-3 font-semibold">입고일</th>
                    <th className="px-4 py-3 font-semibold">관리주체</th>
                    <th className="px-4 py-3 font-semibold">세부분류</th>
                    <th className="px-4 py-3 font-semibold">품명</th>
                    <th className="px-4 py-3 font-semibold">거래처</th>
                    <th className="px-4 py-3 font-semibold text-right">현재재고</th>
                    <th className="px-4 py-3 font-semibold text-right">입고수량</th>
                    <th className="px-4 py-3 font-semibold text-right">입고후재고</th>
                    <th className="px-4 py-3 font-semibold text-center">단위</th>
                    <th className="px-4 py-3 font-semibold">보관위치</th>
                    <th className="px-4 py-3 font-semibold">담당자</th>
                    <th className="px-4 py-3 font-semibold">메모</th>
                  </>
                ) : (
                  <>
                    <th className="px-4 py-3 font-semibold">출고일</th>
                    <th className="px-4 py-3 font-semibold">관리주체</th>
                    <th className="px-4 py-3 font-semibold">세부분류</th>
                    <th className="px-4 py-3 font-semibold">품명</th>
                    <th className="px-4 py-3 font-semibold">수령인</th>
                    <th className="px-4 py-3 font-semibold text-right">현재재고</th>
                    <th className="px-4 py-3 font-semibold text-right">출고수량</th>
                    <th className="px-4 py-3 font-semibold text-right">출고후재고</th>
                    <th className="px-4 py-3 font-semibold text-center">단위</th>
                    <th className="px-4 py-3 font-semibold">메모</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={activeTab === "inbound" ? inboundCols : outboundCols} className="px-5 py-24 text-center text-gray-400">
                    <RefreshCw className="animate-spin text-blue-500 mx-auto mb-2" size={24} />
                    데이터 갱신 중...
                  </td>
                </tr>
              ) : data.length === 0 ? (
                <tr>
                  <td colSpan={activeTab === "inbound" ? inboundCols : outboundCols} className="px-5 py-24 text-center text-gray-400">
                    해당 조건의 입출고 이력이 없습니다.
                  </td>
                </tr>
              ) : (
                data.map((row) => {
                  const beforeQty = row.stockQtyAfter != null
                    ? (activeTab === "inbound" ? row.stockQtyAfter - row.qty : row.stockQtyAfter + row.qty)
                    : null;
                  return (
                    <tr key={row.id} className={`transition-colors ${activeTab === "inbound" ? "hover:bg-emerald-50/40" : "hover:bg-orange-50/40"}`}>
                      {activeTab === "inbound" ? (
                        <>
                          <td className="px-4 py-3 text-xs font-mono text-gray-500">{formatDate(row.receivedAt)}</td>
                          <td className="px-4 py-3">
                            {row.item?.department
                              ? <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${DEPT_COLORS[row.item.department] || "bg-gray-100 text-gray-600"}`}>{DEPT_LABELS[row.item.department] || row.item.department}</span>
                              : <span className="text-gray-300 text-xs">-</span>}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-500">{row.item?.subCategory || "-"}</td>
                          <td className="px-4 py-3 font-semibold text-gray-900">{row.item?.name}</td>
                          <td className="px-4 py-3 text-xs text-gray-600">
                            {row.receivedBy === "재고조정"
                              ? <span className="px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-700 font-semibold">수동조정</span>
                              : row.receivedBy === "초기재고"
                              ? <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-semibold">초기재고</span>
                              : row.vendor?.name || <span className="text-gray-300">-</span>}
                          </td>
                          <td className="px-4 py-3 text-right text-xs text-gray-500">{beforeQty != null ? beforeQty : <span className="text-gray-300">-</span>}</td>
                          <td className="px-4 py-3 text-right font-bold text-emerald-600">+{row.qty}</td>
                          <td className="px-4 py-3 text-right font-bold text-gray-800">{row.stockQtyAfter != null ? row.stockQtyAfter : <span className="text-gray-300 font-normal">-</span>}</td>
                          <td className="px-4 py-3 text-center text-xs text-gray-500">{row.item?.unit}</td>
                          <td className="px-4 py-3 text-xs text-gray-500">{row.item?.location || "-"}</td>
                          <td className="px-4 py-3 text-xs text-gray-600">{row.receivedBy}</td>
                          <td className="px-4 py-3 text-xs text-gray-400">{row.memo || "-"}</td>
                        </>
                      ) : (
                        <>
                          <td className="px-4 py-3 text-xs font-mono text-gray-500">{formatDate(row.usedAt)}</td>
                          <td className="px-4 py-3">
                            {row.item?.department
                              ? <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${DEPT_COLORS[row.item.department] || "bg-gray-100 text-gray-600"}`}>{DEPT_LABELS[row.item.department] || row.item.department}</span>
                              : <span className="text-gray-300 text-xs">-</span>}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-500">{row.item?.subCategory || "-"}</td>
                          <td className="px-4 py-3 font-semibold text-gray-900">{row.item?.name}</td>
                          <td className="px-4 py-3 text-xs text-gray-600">{row.usedBy}</td>
                          <td className="px-4 py-3 text-right text-xs text-gray-500">{beforeQty != null ? beforeQty : <span className="text-gray-300">-</span>}</td>
                          <td className="px-4 py-3 text-right font-bold text-orange-600">-{row.qty}</td>
                          <td className="px-4 py-3 text-right font-bold text-gray-800">{row.stockQtyAfter != null ? row.stockQtyAfter : <span className="text-gray-300 font-normal">-</span>}</td>
                          <td className="px-4 py-3 text-center text-xs text-gray-500">{row.item?.unit}</td>
                          <td className="px-4 py-3 text-xs text-gray-400">{row.memo || "-"}</td>
                        </>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 입출고 등록 모달 */}
      {modalMode && (
        <InOutModal
          mode={modalMode}
          items={items}
          vendors={vendors}
          onClose={() => setModalMode(null)}
          onDone={handleModalDone}
          onToggleFavorite={handleToggleFavorite}
        />
      )}
    </div>
  );
}

"use client";

import { useEffect, useState, useRef } from "react";
import { PackageCheck, PackageMinus, Save, AlertCircle, RefreshCw, History, Search, ChevronDown, ArrowLeftRight, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// 검색 가능한 셀렉트 컴포넌트
function SearchableSelect({
  items,
  value,
  onChange,
  placeholder,
  renderItem,
  renderSelected,
  disabled = false,
  onToggleFavorite,
}: {
  items: any[];
  value: string;
  onChange: (val: string) => void;
  placeholder: string;
  renderItem: (item: any) => React.ReactNode;
  renderSelected: (item: any) => string;
  disabled?: boolean;
  onToggleFavorite?: (item: any, e: React.MouseEvent) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const selectedItem = items.find(i => String(i.id) === value);
  const filtered = items.filter(i =>
    renderSelected(i).toLowerCase().includes(search.toLowerCase())
  );

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
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
              <input
                autoFocus
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="검색..."
                className="w-full pl-7 pr-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>
          <ul className="max-h-56 overflow-y-auto">
            {filtered.length === 0 ? (
              <li className="px-4 py-3 text-sm text-gray-400 text-center">검색 결과가 없습니다.</li>
            ) : (
              filtered.map(item => (
                <li
                  key={item.id}
                  onMouseDown={() => { onChange(String(item.id)); setOpen(false); setSearch(""); }}
                  className={`flex items-center gap-1 px-3 py-2.5 text-sm cursor-pointer hover:bg-blue-50 transition-colors ${String(item.id) === value ? "bg-blue-50 font-semibold text-blue-700" : "text-gray-800"}`}
                >
                  {onToggleFavorite && (
                    <button
                      type="button"
                      onMouseDown={(e) => { e.stopPropagation(); onToggleFavorite(item, e); }}
                      className="shrink-0 p-0.5 rounded hover:bg-yellow-50"
                      title={item.isFavorite ? "즐겨찾기 해제" : "즐겨찾기 등록"}
                    >
                      <Star size={13} className={item.isFavorite ? "text-yellow-400 fill-yellow-400" : "text-gray-300"} />
                    </button>
                  )}
                  <span className="flex-1">{renderItem(item)}</span>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

const DEPT_LABELS: Record<string, string> = { CUTTING: "절단", FACILITY: "공무" };
const DEPT_COLORS: Record<string, string> = {
  CUTTING: "bg-blue-100 text-blue-700",
  FACILITY: "bg-purple-100 text-purple-700",
};

export default function InOutPage() {
  const [topMode, setTopMode] = useState<"in" | "out">("in");
  const [historyTab, setHistoryTab] = useState<"inbound" | "outbound">("inbound");
  const [deptFilter, setDeptFilter] = useState<"all" | "CUTTING" | "FACILITY">("all");

  const [items, setItems] = useState<any[]>([]);
  const [vendors, setVendors] = useState<any[]>([]);
  const [loadingConfig, setLoadingConfig] = useState(true);

  const [historyData, setHistoryData] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const todayStr = () => new Date().toISOString().slice(0, 10);

  const [formData, setFormData] = useState({
    itemId: "",
    vendorId: "",
    qty: "",
    person: "",
    memo: "",
    date: todayStr(),
  });

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      } catch (e) { console.error(e); } finally { setLoadingConfig(false); }
    }
    loadConfig();
    fetchHistoryData("inbound");
  }, []);

  const fetchHistoryData = async (type: "inbound" | "outbound") => {
    setLoadingHistory(true);
    try {
      const d = new Date();
      const currentMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const res = await fetch(`/api/supply/${type}?month=${currentMonth}`);
      const json = await res.json();
      if (json.success) setHistoryData(json.data.slice(0, 20));
    } catch (e) { console.error(e); } finally { setLoadingHistory(false); }
  };

  useEffect(() => { fetchHistoryData(historyTab); }, [historyTab]);

  // 부서 필터 + 입고/출고 모드에 따른 품목 필터링
  const filteredItems = items.filter(i => {
    const matchDept = deptFilter === "all" || i.department === deptFilter;
    const matchMode = topMode === "in" ? true : i.category === "CONSUMABLE";
    return matchDept && matchMode;
  });

  // topMode나 deptFilter 변경 시 선택된 품목이 목록에 없으면 초기화
  useEffect(() => {
    if (formData.itemId && !filteredItems.find(i => String(i.id) === formData.itemId)) {
      setFormData(prev => ({ ...prev, itemId: "" }));
    }
  }, [topMode, deptFilter]);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleToggleFavorite = async (vendor: any, e: React.MouseEvent) => {
    e.preventDefault();
    const newVal = !vendor.isFavorite;
    // optimistic update
    setVendors(prev => {
      const updated = prev.map(v => v.id === vendor.id ? { ...v, isFavorite: newVal } : v);
      return [...updated].sort((a, b) => {
        if (a.isFavorite === b.isFavorite) return a.name.localeCompare(b.name);
        return a.isFavorite ? -1 : 1;
      });
    });
    await fetch(`/api/supply/vendors/${vendor.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isFavorite: newVal }),
    });
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
        ? { itemId: formData.itemId, vendorId: formData.vendorId, qty: formData.qty, receivedBy: formData.person, memo: formData.memo, receivedAt: formData.date }
        : { itemId: formData.itemId, qty: formData.qty, usedBy: formData.person, memo: formData.memo, usedAt: formData.date };

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

      setFormData({ itemId: "", vendorId: "", qty: "", person: "", memo: "", date: todayStr() });

      const targetTab = topMode === "in" ? "inbound" : "outbound";
      setHistoryTab(targetTab);
      fetchHistoryData(targetTab);

      fetch("/api/supply/items").then(r => r.json()).then(j => { if (j.success) setItems(j.data); });

    } catch {
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

  const deptTabs = [
    { value: "all", label: "전체" },
    { value: "CUTTING", label: "절단" },
    { value: "FACILITY", label: "공무" },
  ] as const;

  if (loadingConfig) return <div className="p-10 text-center text-gray-500">초기 정보를 불러오는 중입니다...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
          <ArrowLeftRight size={24} className="text-blue-600" />
          입출고관리
        </h2>
        <p className="text-sm text-gray-500 mt-1">소모품 및 비품의 입고 · 출고 내역을 등록하고 최근 이력을 확인합니다.</p>
      </div>

      {/* 관리주체 필터 */}
      <div className="flex items-center gap-3">
        <span className="text-sm font-semibold text-gray-600 shrink-0">관리주체 :</span>
        <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg border border-gray-200">
          {deptTabs.map(tab => (
            <button
              key={tab.value}
              type="button"
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
        {deptFilter !== "all" && (
          <span className={`text-xs px-2 py-1 rounded-full font-semibold ${DEPT_COLORS[deptFilter]}`}>
            {DEPT_LABELS[deptFilter]} 품목만 표시
          </span>
        )}
      </div>

      {/* 입고/출고 선택 */}
      <div className="flex justify-center">
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

      {/* 등록 폼 */}
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

            {/* 품목 검색 선택 */}
            <div className="sm:col-span-2">
              <label className="block text-sm font-semibold text-gray-800 mb-1.5">
                대상 품목 선택 <span className="text-red-500">*</span>
                {topMode === "out" && <span className="ml-2 text-xs text-gray-400 font-normal">(소모품만 출고 가능)</span>}
              </label>
              <SearchableSelect
                items={filteredItems}
                value={formData.itemId}
                onChange={(val) => setFormData(prev => ({ ...prev, itemId: val }))}
                placeholder={`-- ${deptFilter === "all" ? "전체" : DEPT_LABELS[deptFilter]} 품목 중 선택 --`}
                renderItem={(item) => (
                  <span className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold shrink-0 ${DEPT_COLORS[item.department] || "bg-gray-100 text-gray-600"}`}>
                      {DEPT_LABELS[item.department] || item.department}
                    </span>
                    <span className="text-xs text-gray-400 shrink-0">{item.category === "CONSUMABLE" ? "소모품" : "비품"}</span>
                    {item.subCategory && <span className="text-xs text-blue-600 font-medium shrink-0">[{item.subCategory}]</span>}
                    <span className="font-medium">{item.name}</span>
                    {item.location && <span className="text-xs text-gray-400 shrink-0">📍{item.location}</span>}
                    <span className="text-gray-400 text-xs ml-auto shrink-0">({item.unit}) 재고: {item.stockQty}</span>
                  </span>
                )}
                renderSelected={(item) => {
                  const parts = [
                    DEPT_LABELS[item.department] || item.department,
                    item.category === "CONSUMABLE" ? "소모품" : "비품",
                    item.subCategory ? `[${item.subCategory}]` : null,
                    item.name,
                    item.location ? `📍${item.location}` : null,
                    `(${item.unit}) 재고: ${item.stockQty}`,
                  ].filter(Boolean);
                  return parts.join(" | ");
                }}
                disabled={filteredItems.length === 0}
              />
              {filteredItems.length === 0 && (
                <p className="mt-1 text-xs text-gray-400">선택된 관리주체에 해당하는 품목이 없습니다.</p>
              )}
            </div>

            {/* 거래처 검색 선택 (입고 시만) */}
            {topMode === "in" && (
              <div className="sm:col-span-2">
                <label className="block text-sm font-semibold text-gray-800 mb-1.5">매입 거래처 <span className="text-red-500">*</span></label>
                <SearchableSelect
                  items={vendors}
                  value={formData.vendorId}
                  onChange={(val) => setFormData(prev => ({ ...prev, vendorId: val }))}
                  placeholder="-- 거래처 검색/선택 --"
                  onToggleFavorite={handleToggleFavorite}
                  renderItem={(v) => (
                    <span className="flex items-center gap-2">
                      {v.isFavorite && <Star size={11} className="text-yellow-400 fill-yellow-400 shrink-0" />}
                      <span>{v.name}</span>
                      {v.contact && <span className="text-gray-400 text-xs">{v.contact}</span>}
                      {v.phone && <span className="text-gray-400 text-xs ml-auto">{v.phone}</span>}
                    </span>
                  )}
                  renderSelected={(v) => v.contact ? `${v.name} (${v.contact})` : v.name}
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-semibold text-gray-800 mb-1.5">
                {topMode === "in" ? "입고일" : "출고일"} <span className="text-red-500">*</span>
                <span className="ml-1.5 text-xs text-gray-400 font-normal">(오늘 날짜가 기본값)</span>
              </label>
              <Input required type="date" name="date" value={formData.date} onChange={handleChange} className="w-full" />
            </div>

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

      {/* 하단 입출고 내역 */}
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
                <th className="px-4 py-2.5">{historyTab === "inbound" ? "입고일시" : "출고일시"}</th>
                <th className="px-4 py-2.5">관리주체</th>
                <th className="px-4 py-2.5">품명</th>
                <th className="px-4 py-2.5">세부분류</th>
                <th className="px-4 py-2.5 text-right">수량</th>
                <th className="px-4 py-2.5 font-normal text-center">단위</th>
                <th className="px-4 py-2.5">보관위치</th>
                <th className="px-4 py-2.5">{historyTab === "inbound" ? "담당자" : "사용자"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loadingHistory ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-gray-400"><RefreshCw className="animate-spin inline-block mr-2" size={16} />갱신 중...</td>
                </tr>
              ) : historyData.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-gray-400">이번 달 등록된 내역이 없습니다.</td>
                </tr>
              ) : (
                historyData.map((row) => (
                  <tr key={row.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-xs text-gray-500 font-mono">{formatDate(historyTab === "inbound" ? row.receivedAt : row.usedAt)}</td>
                    <td className="px-4 py-3">
                      {row.item?.department && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${DEPT_COLORS[row.item.department] || "bg-gray-100 text-gray-600"}`}>
                          {DEPT_LABELS[row.item.department] || row.item.department}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-semibold text-gray-800">{row.item?.name}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{row.item?.subCategory || "-"}</td>
                    <td className={`px-4 py-3 text-right font-bold ${historyTab === 'inbound' ? 'text-emerald-600' : 'text-orange-600'}`}>
                      {historyTab === 'inbound' ? '+' : '-'}{row.qty}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-500 text-xs">{row.item?.unit}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{row.item?.location || "-"}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{historyTab === "inbound" ? row.receivedBy : row.usedBy}</td>
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

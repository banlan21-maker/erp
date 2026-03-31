"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { PackageCheck, PackageMinus, Search, Check, ChevronDown, AlertTriangle, RefreshCw, X } from "lucide-react";

// ─── 타입 ──────────────────────────────────────────────────────────────────

interface Item {
  id: number;
  name: string;
  category: string;
  department: string;
  unit: string;
  stockQty: number;
  reorderPoint: number | null;
}
interface Vendor { id: number; name: string; contact: string | null }

const DEPT_LABEL: Record<string, string> = { CUTTING: "절단", FACILITY: "공무" };
const DEPT_COLOR: Record<string, string> = {
  CUTTING:  "bg-blue-500/20 text-blue-300 border-blue-500/30",
  FACILITY: "bg-purple-500/20 text-purple-300 border-purple-500/30",
};
const CAT_LABEL: Record<string, string> = { CONSUMABLE: "소모품", FIXTURE: "비품" };

// ─── 검색 드롭다운 ──────────────────────────────────────────────────────────

function SearchDropdown<T extends { id: number | string; name: string }>({
  items,
  value,
  onChange,
  placeholder,
  renderItem,
}: {
  items: T[];
  value: string;
  onChange: (id: string, item: T) => void;
  placeholder: string;
  renderItem: (item: T) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const selected = items.find(i => String(i.id) === value);
  const filtered = useMemo(() =>
    items.filter(i => i.name.toLowerCase().includes(search.toLowerCase())),
    [items, search]
  );

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false); setSearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => { setOpen(v => !v); setSearch(""); }}
        className="w-full flex items-center justify-between px-4 py-4 bg-gray-800 border border-gray-700 rounded-xl text-left active:bg-gray-700 transition-colors"
      >
        <span className={selected ? "text-white font-semibold" : "text-gray-500"}>
          {selected ? selected.name : placeholder}
        </span>
        <ChevronDown size={18} className="text-gray-500 shrink-0" />
      </button>

      {open && (
        <div className="absolute z-50 mt-2 w-full bg-gray-800 border border-gray-700 rounded-xl shadow-2xl overflow-hidden">
          <div className="p-3 border-b border-gray-700">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                autoFocus
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="검색..."
                className="w-full pl-9 pr-3 py-2.5 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>
          <ul className="max-h-60 overflow-y-auto">
            {filtered.length === 0 ? (
              <li className="px-4 py-4 text-sm text-gray-500 text-center">검색 결과 없음</li>
            ) : filtered.map(item => (
              <li
                key={item.id}
                onMouseDown={() => { onChange(String(item.id), item); setOpen(false); setSearch(""); }}
                className={`px-4 py-3 cursor-pointer transition-colors border-b border-gray-700/50 last:border-0 ${
                  String(item.id) === value ? "bg-blue-600/20" : "active:bg-gray-700"
                }`}
              >
                {renderItem(item)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─── 메인 컴포넌트 ──────────────────────────────────────────────────────────

export default function FieldSupply({
  items: initialItems,
  vendors,
}: {
  items: Item[];
  vendors: Vendor[];
}) {
  const [mode, setMode] = useState<"in" | "out">("in");
  const [deptFilter, setDeptFilter] = useState<"all" | "CUTTING" | "FACILITY">("all");

  const [items, setItems] = useState<Item[]>(initialItems);
  const [selectedItemId, setSelectedItemId] = useState("");
  const [selectedVendorId, setSelectedVendorId] = useState("");
  const [qty, setQty] = useState("");
  const [person, setPerson] = useState("");
  const [memo, setMemo] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [recentHistory, setRecentHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // 모드 변경시 품목 초기화
  useEffect(() => { setSelectedItemId(""); }, [mode, deptFilter]);

  // 필터된 품목 목록
  const filteredItems = useMemo(() => items.filter(i => {
    const matchDept = deptFilter === "all" || i.department === deptFilter;
    const matchMode = mode === "in" ? true : i.category === "CONSUMABLE";
    return matchDept && matchMode;
  }), [items, deptFilter, mode]);

  const selectedItem = items.find(i => String(i.id) === selectedItemId);
  const selectedVendor = vendors.find(v => String(v.id) === selectedVendorId);

  const fetchHistory = async () => {
    setLoadingHistory(true);
    try {
      const d = new Date();
      const month = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
      const type = mode === "in" ? "inbound" : "outbound";
      const res = await fetch(`/api/supply/${type}?month=${month}`);
      const json = await res.json();
      if (json.success) setRecentHistory(json.data.slice(0, 5));
    } catch { /* ignore */ } finally { setLoadingHistory(false); }
  };

  useEffect(() => { fetchHistory(); }, [mode]);

  const refreshItems = async () => {
    try {
      const res = await fetch("/api/supply/items");
      const json = await res.json();
      if (json.success) setItems(json.data);
    } catch { /* ignore */ }
  };

  const handleSubmit = async () => {
    if (!selectedItemId || !qty || !person.trim()) {
      setResult({ ok: false, msg: "품목, 수량, 담당자를 입력해주세요." });
      return;
    }
    if (mode === "in" && !selectedVendorId) {
      setResult({ ok: false, msg: "입고 거래처를 선택해주세요." });
      return;
    }
    if (mode === "out" && selectedItem && selectedItem.stockQty < Number(qty)) {
      setResult({ ok: false, msg: `재고 부족 (현재 ${selectedItem.stockQty}${selectedItem.unit})` });
      return;
    }

    setSubmitting(true);
    setResult(null);
    try {
      const url = mode === "in" ? "/api/supply/inbound" : "/api/supply/outbound";
      const payload = mode === "in"
        ? { itemId: selectedItemId, vendorId: selectedVendorId, qty, receivedBy: person, memo: memo || null }
        : { itemId: selectedItemId, qty, usedBy: person, memo: memo || null };

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!data.success) {
        setResult({ ok: false, msg: data.error });
        return;
      }

      const isWarning = mode === "out" && data.data?.isWarning;
      const modeLabel = mode === "in" ? "입고" : "출고";
      setResult({
        ok: true,
        msg: isWarning
          ? `✅ ${modeLabel} 완료!\n⚠️ 재고가 발주 기준점 이하입니다!`
          : `✅ ${modeLabel} 완료!`,
      });

      // 폼 초기화 (담당자는 유지)
      setSelectedItemId("");
      setSelectedVendorId("");
      setQty("");
      setMemo("");

      await Promise.all([refreshItems(), fetchHistory()]);
    } catch {
      setResult({ ok: false, msg: "서버 오류가 발생했습니다." });
    } finally {
      setSubmitting(false);
    }
  };

  const now = new Date();
  const dateStr = `${now.getFullYear()}.${String(now.getMonth()+1).padStart(2,"0")}.${String(now.getDate()).padStart(2,"0")}`;

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* 헤더 */}
      <div className="sticky top-0 z-30 bg-gray-950/95 backdrop-blur border-b border-gray-800 px-4 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-base font-bold tracking-tight">현장 입출고</h1>
          <p className="text-xs text-gray-500 mt-0.5">{dateStr}</p>
        </div>
        <div className="text-xs text-gray-600 font-medium">구매/자재</div>
      </div>

      <div className="px-4 py-5 space-y-5 max-w-lg mx-auto pb-20">

        {/* ── 입고 / 출고 선택 ── */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setMode("in")}
            className={`flex items-center justify-center gap-2 py-4 rounded-2xl font-bold text-base transition-all ${
              mode === "in"
                ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/30"
                : "bg-gray-800 text-gray-400 border border-gray-700"
            }`}
          >
            <PackageCheck size={20} /> 입고
          </button>
          <button
            onClick={() => setMode("out")}
            className={`flex items-center justify-center gap-2 py-4 rounded-2xl font-bold text-base transition-all ${
              mode === "out"
                ? "bg-orange-500 text-white shadow-lg shadow-orange-500/30"
                : "bg-gray-800 text-gray-400 border border-gray-700"
            }`}
          >
            <PackageMinus size={20} /> 출고
          </button>
        </div>

        {/* ── 관리주체 필터 ── */}
        <div>
          <p className="text-xs text-gray-500 font-semibold mb-2 uppercase tracking-wide">관리주체</p>
          <div className="grid grid-cols-3 gap-2">
            {(["all", "CUTTING", "FACILITY"] as const).map(d => (
              <button
                key={d}
                onClick={() => setDeptFilter(d)}
                className={`py-2.5 rounded-xl text-sm font-semibold transition-all ${
                  deptFilter === d
                    ? d === "all" ? "bg-gray-500 text-white" : d === "CUTTING" ? "bg-blue-500 text-white shadow-md shadow-blue-500/30" : "bg-purple-500 text-white shadow-md shadow-purple-500/30"
                    : "bg-gray-800 text-gray-400 border border-gray-700"
                }`}
              >
                {d === "all" ? "전체" : DEPT_LABEL[d]}
              </button>
            ))}
          </div>
        </div>

        {/* ── 품목 선택 ── */}
        <div>
          <p className="text-xs text-gray-500 font-semibold mb-2 uppercase tracking-wide">
            품목 선택 {mode === "out" && <span className="text-orange-400 normal-case font-normal">— 소모품만</span>}
          </p>
          <SearchDropdown
            items={filteredItems}
            value={selectedItemId}
            onChange={(id) => setSelectedItemId(id)}
            placeholder={`품목을 검색/선택하세요`}
            renderItem={(item) => (
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold ${DEPT_COLOR[item.department] ?? ""}`}>
                      {DEPT_LABEL[item.department] ?? item.department}
                    </span>
                    <span className="text-xs text-gray-400">{CAT_LABEL[item.category] ?? item.category}</span>
                  </div>
                  <p className="text-white font-semibold mt-0.5">{item.name}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className={`text-sm font-bold ${item.reorderPoint !== null && item.stockQty <= item.reorderPoint ? "text-red-400" : "text-emerald-400"}`}>
                    {item.stockQty}
                  </p>
                  <p className="text-xs text-gray-500">{item.unit}</p>
                </div>
              </div>
            )}
          />
          {/* 선택된 품목 재고 표시 */}
          {selectedItem && (
            <div className={`mt-2 px-4 py-3 rounded-xl flex items-center justify-between ${
              mode === "out" && selectedItem.reorderPoint !== null && (selectedItem.stockQty - Number(qty || 0)) <= selectedItem.reorderPoint
                ? "bg-red-500/10 border border-red-500/30"
                : "bg-gray-800/60 border border-gray-700"
            }`}>
              <span className="text-sm text-gray-400">현재 재고</span>
              <span className="font-bold text-lg text-white">{selectedItem.stockQty} <span className="text-sm text-gray-400">{selectedItem.unit}</span></span>
            </div>
          )}
        </div>

        {/* ── 거래처 (입고만) ── */}
        {mode === "in" && (
          <div>
            <p className="text-xs text-gray-500 font-semibold mb-2 uppercase tracking-wide">매입 거래처</p>
            <SearchDropdown
              items={vendors}
              value={selectedVendorId}
              onChange={(id) => setSelectedVendorId(id)}
              placeholder="거래처 검색/선택"
              renderItem={(v) => (
                <div>
                  <p className="text-white font-semibold">{v.name}</p>
                  {v.contact && <p className="text-xs text-gray-400 mt-0.5">{v.contact}</p>}
                </div>
              )}
            />
          </div>
        )}

        {/* ── 수량 ── */}
        <div>
          <p className="text-xs text-gray-500 font-semibold mb-2 uppercase tracking-wide">
            {mode === "in" ? "입고 수량" : "출고 수량"}
            {selectedItem && <span className="text-gray-600 font-normal ml-1">({selectedItem.unit})</span>}
          </p>
          <input
            type="number"
            inputMode="numeric"
            min="1"
            max={mode === "out" && selectedItem ? selectedItem.stockQty : undefined}
            value={qty}
            onChange={e => setQty(e.target.value)}
            placeholder="0"
            className={`w-full px-4 py-5 bg-gray-800 border rounded-xl text-center text-3xl font-bold focus:outline-none transition-colors placeholder-gray-700 ${
              mode === "in"
                ? "border-gray-700 focus:border-emerald-500 text-emerald-400"
                : "border-gray-700 focus:border-orange-500 text-orange-400"
            }`}
          />
        </div>

        {/* ── 담당자 ── */}
        <div>
          <p className="text-xs text-gray-500 font-semibold mb-2 uppercase tracking-wide">
            {mode === "in" ? "확인자 (입고 담당)" : "사용자 (수령인)"}
          </p>
          <input
            type="text"
            value={person}
            onChange={e => setPerson(e.target.value)}
            placeholder={mode === "in" ? "예: 박대리" : "예: 김현수"}
            className="w-full px-4 py-4 bg-gray-800 border border-gray-700 rounded-xl text-white text-base font-semibold placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>

        {/* ── 비고 (옵션) ── */}
        <div>
          <p className="text-xs text-gray-500 font-semibold mb-2 uppercase tracking-wide">비고 <span className="font-normal text-gray-600">(선택)</span></p>
          <textarea
            value={memo}
            onChange={e => setMemo(e.target.value)}
            placeholder="특이사항 입력"
            rows={2}
            className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white text-sm placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-colors resize-none"
          />
        </div>

        {/* ── 결과 메시지 ── */}
        {result && (
          <div className={`px-4 py-4 rounded-xl flex items-start gap-3 ${
            result.ok ? "bg-emerald-500/15 border border-emerald-500/30" : "bg-red-500/15 border border-red-500/30"
          }`}>
            {result.ok
              ? <Check size={18} className="text-emerald-400 mt-0.5 shrink-0" />
              : <AlertTriangle size={18} className="text-red-400 mt-0.5 shrink-0" />
            }
            <p className={`text-sm font-semibold whitespace-pre-line ${result.ok ? "text-emerald-300" : "text-red-300"}`}>
              {result.msg}
            </p>
            <button onClick={() => setResult(null)} className="ml-auto text-gray-600 hover:text-gray-400">
              <X size={14} />
            </button>
          </div>
        )}

        {/* ── 등록 버튼 ── */}
        <button
          onClick={handleSubmit}
          disabled={submitting || !selectedItemId || !qty || !person.trim() || (mode === "in" && !selectedVendorId)}
          className={`w-full py-5 rounded-2xl font-bold text-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
            mode === "in"
              ? "bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-white shadow-lg shadow-emerald-500/30"
              : "bg-orange-500 hover:bg-orange-400 active:bg-orange-600 text-white shadow-lg shadow-orange-500/30"
          }`}
        >
          {submitting
            ? <RefreshCw size={20} className="animate-spin mx-auto" />
            : mode === "in" ? "입고 등록" : "출고 등록"
          }
        </button>

        {/* ── 최근 내역 (오늘 5건) ── */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide">
              최근 {mode === "in" ? "입고" : "출고"} 내역
            </p>
            <button onClick={fetchHistory} className="text-xs text-gray-600 hover:text-gray-400 flex items-center gap-1">
              <RefreshCw size={11} className={loadingHistory ? "animate-spin" : ""} /> 새로고침
            </button>
          </div>

          {recentHistory.length === 0 ? (
            <p className="text-center text-xs text-gray-700 py-6">이번 달 내역이 없습니다.</p>
          ) : (
            <div className="space-y-2">
              {recentHistory.map(row => {
                const dateVal = mode === "in" ? row.receivedAt : row.usedAt;
                const d = new Date(dateVal);
                const timeStr = `${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
                return (
                  <div key={row.id} className="flex items-center justify-between px-4 py-3 bg-gray-800/60 rounded-xl border border-gray-700/50">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{row.item?.name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {timeStr} · {mode === "in" ? row.receivedBy : row.usedBy}
                      </p>
                    </div>
                    <span className={`text-base font-bold ml-3 shrink-0 ${mode === "in" ? "text-emerald-400" : "text-orange-400"}`}>
                      {mode === "in" ? "+" : "-"}{row.qty} <span className="text-xs text-gray-500">{row.item?.unit}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

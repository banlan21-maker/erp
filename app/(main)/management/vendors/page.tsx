"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Truck, Search, Plus, RefreshCw,
  ArrowUp, ArrowDown, ArrowUpDown, Filter as FilterIcon, XCircle,
  Pencil, Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import ColumnFilterDropdown from "@/components/column-filter-dropdown";
import {
  getCascadedFilteredRows, getAllCascadedOptions,
  type ColumnAccessorMap, type ColFilters,
} from "@/lib/cascading-filters";

type FactoryKey = "진교" | "진동" | "공용";
const FACTORY_BADGE: Record<string, string> = {
  진교: "bg-sky-100 text-sky-700 border-sky-200",
  진동: "bg-violet-100 text-violet-700 border-violet-200",
  공용: "bg-amber-100 text-amber-700 border-amber-200",
};

interface Vendor {
  id: number;
  name: string;
  factory: FactoryKey | string;
  contact?: string | null;
  phone?: string | null;
  landline?: string | null;
  fax?: string | null;
  email?: string | null;
  businessNumber?: string | null;
  category?: string | null;
  memo?: string | null;
  isFavorite: boolean;
}

// Project.MD § 13.X 표준 cascading filter 패턴
const COLS = [
  { key: "name",           label: "업체명",           filterable: true },
  { key: "factory",        label: "담당공장",         filterable: true },
  { key: "contact",        label: "담당자명",         filterable: true },
  { key: "phone",          label: "연락처",           filterable: true },
  { key: "landline",       label: "일반전화",         filterable: true },
  { key: "fax",            label: "FAX",              filterable: true },
  { key: "email",          label: "이메일",           filterable: true },
  { key: "businessNumber", label: "사업자등록번호",   filterable: true },
  { key: "category",       label: "취급품목 카테고리", filterable: true },
  { key: "memo",           label: "비고",             filterable: false },
] as const;
type ColKey = (typeof COLS)[number]["key"];

export default function VendorsPage() {
  const router = useRouter();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  // cascading filter + 정렬
  const [colFilters, setColFilters] = useState<ColFilters>({});
  const [openCol,    setOpenCol]    = useState<ColKey | null>(null);
  const [anchorEl,   setAnchorEl]   = useState<HTMLElement | null>(null);
  const [sortKey,    setSortKey]    = useState<ColKey | null>(null);
  const [sortDir,    setSortDir]    = useState<"asc" | "desc">("asc");

  const fetchVendors = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/supply/vendors");
      const json = await res.json();
      if (json.success) setVendors(json.data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchVendors(); }, []);

  // accessors
  const accessors = useMemo<ColumnAccessorMap<Vendor>>(() => ({
    name:           v => v.name,
    factory:        v => v.factory ?? "공용",
    contact:        v => v.contact ?? "",
    phone:          v => v.phone ?? "",
    landline:       v => v.landline ?? "",
    fax:            v => v.fax ?? "",
    email:          v => v.email ?? "",
    businessNumber: v => v.businessNumber ?? "",
    category:       v => v.category ?? "",
  }), []);

  // 검색 → cascading 필터 → 정렬
  const searchFiltered = useMemo(() =>
    !searchTerm
      ? vendors
      : vendors.filter(v =>
          v.name.includes(searchTerm) ||
          (v.contact?.includes(searchTerm) ?? false)
        ),
    [vendors, searchTerm],
  );

  const cascadedRows = useMemo(
    () => getCascadedFilteredRows(searchFiltered, colFilters, accessors),
    [searchFiltered, colFilters, accessors],
  );
  const distinctValues = useMemo(
    () => getAllCascadedOptions(searchFiltered, colFilters, accessors),
    [searchFiltered, colFilters, accessors],
  );

  const sortedRows = useMemo(() => {
    if (!sortKey) return cascadedRows;
    const acc = accessors[sortKey];
    if (!acc) return cascadedRows;
    const arr = [...cascadedRows];
    arr.sort((a, b) => {
      const av = String(acc(a) ?? "");
      const bv = String(acc(b) ?? "");
      const cmp = av.localeCompare(bv, "ko", { numeric: true });
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [cascadedRows, sortKey, sortDir, accessors]);

  const handleSort = (k: ColKey) => {
    if (sortKey === k) {
      if (sortDir === "asc") setSortDir("desc");
      else { setSortKey(null); setSortDir("asc"); }
    } else { setSortKey(k); setSortDir("asc"); }
  };

  const filterCount = Object.values(colFilters).filter(v => v.length > 0).length;

  // 삭제 핸들러
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const handleDelete = async (vendor: Vendor, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`'${vendor.name}' 거래처를 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) return;
    setDeletingId(vendor.id);
    try {
      const res = await fetch(`/api/supply/vendors/${vendor.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!json.success) {
        alert(json.error ?? "삭제 실패");
        return;
      }
      setVendors(prev => prev.filter(v => v.id !== vendor.id));
    } catch {
      alert("서버 오류가 발생했습니다.");
    } finally { setDeletingId(null); }
  };
  const handleEdit = (vendor: Vendor, e: React.MouseEvent) => {
    e.stopPropagation();
    router.push(`/management/vendors/${vendor.id}?edit=1`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Truck size={24} className="text-blue-600" /> 자재 거래처 관리
          </h2>
          <p className="text-sm text-gray-500 mt-1">소모품 및 비품을 공급하는 협력업체를 관리합니다.</p>
        </div>
        <Button
          onClick={() => router.push("/management/vendors/new")}
          className="bg-blue-600 hover:bg-blue-700 font-bold shadow-sm"
        >
          <Plus size={16} className="mr-2" /> 신규 거래처 등록
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-20 text-gray-400 gap-3">
          <RefreshCw className="animate-spin text-blue-500" size={28} /> 데이터를 불러오는 중입니다...
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="text-sm font-medium text-gray-700">
                총 <strong>{sortedRows.length}</strong>곳의 파트너사
              </div>
              {filterCount > 0 && (
                <button
                  onClick={() => setColFilters({})}
                  className="flex items-center gap-1.5 text-xs px-2 py-1 bg-blue-50 border border-blue-200 text-blue-700 rounded-md hover:bg-blue-100"
                  title="모든 컬럼 필터 초기화"
                >
                  <FilterIcon size={11} fill="currentColor" />
                  필터 {filterCount}개
                  <XCircle size={12} />
                </button>
              )}
            </div>
            <div className="relative w-full sm:w-auto">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <Input
                placeholder="업체명 또는 담당자 검색"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="pl-9 h-9 text-sm lg:w-[280px]"
              />
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
            <table className="w-full text-sm text-left whitespace-nowrap">
              <thead className="bg-gray-50 border-b-2 border-gray-300">
                <tr>
                  {COLS.map(col => {
                    const active = (colFilters[col.key]?.length ?? 0) > 0;
                    const isSort = sortKey === col.key;
                    const SortI  = isSort ? (sortDir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
                    return (
                      <th key={col.key} className="px-3 py-2 text-[11px] font-semibold text-gray-500 border-r border-gray-200 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <button onClick={() => handleSort(col.key)} className="inline-flex items-center gap-1 hover:text-gray-700">
                            {col.label}
                            <SortI size={11} className={isSort ? "text-blue-500" : "text-gray-300"} />
                          </button>
                          {col.filterable && (
                            <button
                              onClick={e => { setOpenCol(col.key); setAnchorEl(e.currentTarget); }}
                              className="text-gray-400 hover:text-gray-700"
                            >
                              <FilterIcon size={11} className={active ? "text-blue-500 fill-blue-500" : ""} fill={active ? "currentColor" : "none"} />
                            </button>
                          )}
                        </div>
                      </th>
                    );
                  })}
                  <th className="px-3 py-2 text-[11px] font-semibold text-gray-500 text-center whitespace-nowrap">액션</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sortedRows.length === 0 ? (
                  <tr>
                    <td colSpan={COLS.length + 1} className="px-3 py-12 text-center text-gray-400 text-sm">
                      {vendors.length === 0 ? "등록된 거래처가 없습니다." : "검색·필터 조건에 맞는 거래처가 없습니다."}
                    </td>
                  </tr>
                ) : (
                  sortedRows.map(vendor => (
                    <tr
                      key={vendor.id}
                      onClick={() => router.push(`/management/vendors/${vendor.id}`)}
                      className="cursor-pointer hover:bg-gray-50/70 transition-colors group"
                    >
                      <td className="px-3 py-1 text-xs font-bold text-gray-900 border-r border-gray-100 group-hover:text-blue-700 transition-colors">{vendor.name}</td>
                      <td className="px-3 py-1 text-xs border-r border-gray-100">
                        <span className={`text-[11px] px-2 py-0.5 rounded-full border font-semibold ${FACTORY_BADGE[vendor.factory ?? "공용"]}`}>
                          {vendor.factory ?? "공용"}
                        </span>
                      </td>
                      <td className="px-3 py-1 text-xs text-gray-700 border-r border-gray-100">{vendor.contact || <span className="text-gray-300">-</span>}</td>
                      <td className="px-3 py-1 text-xs text-gray-700 border-r border-gray-100 font-mono">{vendor.phone || <span className="text-gray-300">-</span>}</td>
                      <td className="px-3 py-1 text-xs text-gray-700 border-r border-gray-100 font-mono">{vendor.landline || <span className="text-gray-300">-</span>}</td>
                      <td className="px-3 py-1 text-xs text-gray-700 border-r border-gray-100 font-mono">{vendor.fax || <span className="text-gray-300">-</span>}</td>
                      <td className="px-3 py-1 text-xs text-gray-700 border-r border-gray-100">{vendor.email || <span className="text-gray-300">-</span>}</td>
                      <td className="px-3 py-1 text-xs text-gray-700 border-r border-gray-100 font-mono">{vendor.businessNumber || <span className="text-gray-300">-</span>}</td>
                      <td className="px-3 py-1 text-xs text-gray-700 border-r border-gray-100">{vendor.category || <span className="text-gray-300">-</span>}</td>
                      <td className="px-3 py-1 text-xs text-gray-500 truncate max-w-[200px]" title={vendor.memo ?? ""}>{vendor.memo || <span className="text-gray-300">-</span>}</td>
                      <td className="px-3 py-1 text-xs text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={e => handleEdit(vendor, e)}
                            title="수정"
                            className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            onClick={e => handleDelete(vendor, e)}
                            disabled={deletingId === vendor.id}
                            title="삭제"
                            className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-40"
                          >
                            <Trash2 size={13} />
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

      {/* 컬럼 필터 드롭다운 */}
      {openCol && anchorEl && (
        <ColumnFilterDropdown
          anchorEl={anchorEl}
          values={distinctValues[openCol] ?? []}
          selected={colFilters[openCol] ?? []}
          onApply={sel => {
            setColFilters(p => ({ ...p, [openCol]: sel }));
            setOpenCol(null); setAnchorEl(null);
          }}
          onClose={() => { setOpenCol(null); setAnchorEl(null); }}
        />
      )}
    </div>
  );
}

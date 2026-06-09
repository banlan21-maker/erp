"use client";

import { useState, useEffect, useCallback } from "react";
import { Filter, X, Search, RefreshCw, Package, StickyNote } from "lucide-react";
import { Button } from "@/components/ui/button";
import ColumnFilterDropdown, { type FilterValue } from "@/components/column-filter-dropdown";
import { DetailModal, EditModal, ReregisterModal, type Remnant } from "@/components/remnant-tabs";
import { serializeColFilters } from "@/lib/client-cascading";

/* ── filters key (클라이언트) → distinct API 쿼리스트링 param ── */
const REMNANT_QS_KEY: Record<string, string> = {
  shape:      "shapes",
  material:   "materials",
  thickness:  "thicknesses",
  width1:     "width1s",
  length1:    "length1s",
  width2:     "width2s",
  length2:    "length2s",
  weight:     "weights",
  status:     "statuses",
  location:   "locations",
  heatNo:     "heatNos",
  vessel:     "sources",        // client: vessel → server: source
  block:      "sourceBlocks",   // client: block  → server: sourceBlock
};

// ─── 통합 잔재 리스트 탭 ────────────────────────────────────────────────────
// 등록잔재 컬럼 레이아웃 기준 — 현장잔재/여유원재/등록잔재 3종 모두 동일하게 사용
// typeFilter 로 종류를 고정. 행 클릭하면 DetailModal → 수정/잔여등록 가능

const SHAPE_LABEL: Record<string, string>  = { RECTANGLE: "사각형", L_SHAPE: "L자형", IRREGULAR: "불규칙형" };
const STATUS_LABEL: Record<string, string> = { IN_STOCK: "재고", EXHAUSTED: "소진" };
const STATUS_COLOR: Record<string, string> = {
  IN_STOCK:  "bg-green-100 text-green-700",
  EXHAUSTED: "bg-gray-100 text-gray-500",
};

// reservedFor 우선 (확정), 그 외엔 status 기준
function remnantDisplayStatus(r: { status: string; reservedFor: string | null }): { label: string; cls: string; reservedFor?: string } {
  if (r.status === "EXHAUSTED") return { label: "소진", cls: "bg-gray-100 text-gray-500" };
  if (r.reservedFor)            return { label: "확정", cls: "bg-blue-100 text-blue-700", reservedFor: r.reservedFor };
  if (r.status === "IN_STOCK")  return { label: "재고", cls: "bg-green-100 text-green-700" };
  return { label: STATUS_LABEL[r.status] ?? r.status, cls: STATUS_COLOR[r.status] ?? "bg-gray-100 text-gray-500" };
}

type RemnantRow = {
  id: string; remnantNo: string; shape: string; material: string; type: string;
  thickness: number; width1: number | null; length1: number | null;
  width2: number | null; length2: number | null; weight: number;
  sourceBlock: string | null; sourceVesselName: string | null; status: string;
  reservedFor: string | null;
  heatNo: string | null;
  location: string | null;
  memo: string | null;
  registeredBy: string;
  createdAt: string;
  sourceProjectId: string | null;
  sourceProject: { id: string; projectCode: string; projectName: string } | null;
  assignedToLists: { block: string | null; project: { projectCode: string } | null }[];
};

const PAGE_SIZE = 50;

const COLS = [
  { key: "remnantNo",  label: "잔재번호",      align: "left",   filterable: true  },
  { key: "vessel",     label: "발생호선",      align: "left",   filterable: true  },
  { key: "block",      label: "발생블록",      align: "left",   filterable: true  },
  { key: "heatNo",     label: "발생판번호",    align: "left",   filterable: true  },
  { key: "shape",      label: "형태",          align: "left",   filterable: true  },
  { key: "material",   label: "재질",          align: "left",   filterable: true  },
  { key: "thickness",  label: "두께",          align: "right",  filterable: true  },
  { key: "width1",     label: "폭1",           align: "right",  filterable: true  },
  { key: "width2",     label: "폭2",           align: "right",  filterable: true  },
  { key: "length1",    label: "길이1",         align: "right",  filterable: true  },
  { key: "length2",    label: "길이2",         align: "right",  filterable: true  },
  { key: "weight",     label: "중량(kg)",      align: "right",  filterable: true  },
  { key: "location",   label: "위치",          align: "left",   filterable: true  },
  { key: "status",     label: "상태",           align: "center", filterable: true  },
  { key: "usedVessel", label: "사용호선/블록", align: "left",   filterable: false }, // 파생값 — 필터 미지원
  { key: "memo",       label: "메모",          align: "center", filterable: false },
] as const;

export default function RemnantListTab({
  typeFilter,
  titleLabel,
}: {
  typeFilter: "REMNANT" | "SURPLUS" | "REGISTERED";
  titleLabel?: string;
}) {
  const [remnants,       setRemnants]       = useState<RemnantRow[]>([]);
  const [loading,        setLoading]        = useState(false);
  const [search,         setSearch]         = useState("");
  const [filters,        setFilters]        = useState<Record<string, string[]>>({ status: ["IN_STOCK"] }); // 기본: 재고만
  const [distinctValues, setDistinctValues] = useState<Record<string, FilterValue[]>>({});
  const [openCol,        setOpenCol]        = useState<string | null>(null);
  const [anchorEl,       setAnchorEl]       = useState<HTMLElement | null>(null);
  const [page,           setPage]           = useState(1);
  const [total,          setTotal]          = useState(0);
  const [totalPages,     setTotalPages]     = useState(1);

  // 행 클릭 모달
  const [detailItem, setDetailItem] = useState<RemnantRow | null>(null);
  const [editItem,   setEditItem]   = useState<RemnantRow | null>(null);
  const [reregItem,  setReregItem]  = useState<RemnantRow | null>(null);

  // distinct 값 로드 (typeFilter + cascading filters 기준)
  useEffect(() => {
    const qs = serializeColFilters(filters, REMNANT_QS_KEY);
    const url = `/api/remnants/distinct?type=${typeFilter}${qs ? `&${qs}` : ""}`;
    fetch(url)
      .then(r => r.ok ? r.json() : {})
      .then(d => setDistinctValues(d));
  }, [typeFilter, filters]);

  // 서버사이드 필터 + 페이지네이션
  const fetchData = useCallback(async () => {
    setLoading(true);
    const p = new URLSearchParams();
    p.set("type", typeFilter);
    p.set("page", String(page));
    if (search) p.set("search", search);
    const cf = filters;
    if (cf.shape?.length)       p.set("shapes",      cf.shape.join(","));
    if (cf.material?.length)    p.set("materials",   cf.material.join(","));
    if (cf.thickness?.length)   p.set("thicknesses", cf.thickness.join(","));
    if (cf.width1?.length)      p.set("widths1",     cf.width1.join(","));
    if (cf.length1?.length)     p.set("lengths1",    cf.length1.join(","));
    if (cf.width2?.length)      p.set("widths2",     cf.width2.join(","));
    if (cf.length2?.length)     p.set("lengths2",    cf.length2.join(","));
    if (cf.weight?.length)      p.set("weights",     cf.weight.join(","));
    if (cf.heatNo?.length)      p.set("heatNos",     cf.heatNo.join(","));
    if (cf.status?.length)      p.set("statuses",    cf.status.join(","));
    if (cf.vessel?.length)      p.set("sources",     cf.vessel.join(","));
    if (cf.block?.length)       p.set("sourceBlocks",cf.block.join(","));
    if (cf.location?.length)    p.set("locations",   cf.location.join(","));

    try {
      const res  = await fetch(`/api/remnants?${p}`);
      const data = await res.json();
      if (data.data) {
        setRemnants(data.data);
        setTotal(data.total ?? data.data.length);
        setTotalPages(data.totalPages ?? 1);
      }
    } finally { setLoading(false); }
  }, [typeFilter, page, search, filters]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { setPage(1); }, [filters, search]);

  // 컬럼별 distinct 키 매핑
  const getDistinctForCol = (col: string): FilterValue[] => {
    const map: Record<string, string> = {
      vessel: "source", block: "sourceBlock", heatNo: "heatNo",
      shape: "shape", material: "material", thickness: "thickness",
      width1: "width1", length1: "length1", width2: "width2", length2: "length2",
      weight: "weight", status: "status", location: "location",
    };
    return distinctValues[map[col] ?? col] ?? [];
  };

  const activeCount = Object.values(filters).filter(v => v.length > 0).length;
  const totalWeight = remnants.reduce((s, r) => s + r.weight, 0);

  const openFilter = (col: string, el: HTMLElement) => {
    if (openCol === col) { setOpenCol(null); setAnchorEl(null); return; }
    setOpenCol(col); setAnchorEl(el);
  };

  // RemnantRow → Remnant (모달에 넘기기)
  const toRemnant = (r: RemnantRow): Remnant => ({
    ...r,
    heatNo: r.heatNo,
    assignedToLists: r.assignedToLists,
  });

  return (
    <div className="space-y-3">
      {/* 헤더: 제목 + 검색 + 필터초기화 + 새로고침 */}
      <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center gap-3 flex-wrap">
        <Package size={14} className="text-blue-500 shrink-0" />
        <h3 className="text-sm font-semibold text-gray-700 shrink-0">
          {titleLabel ?? "잔재 목록"} <span className="text-xs text-gray-400 font-normal">({total}건)</span>
        </h3>
        <div className="relative flex-1 max-w-xs">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="잔재번호·재질·호선·위치 검색"
            className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>
        {activeCount > 0 && (
          <button
            onClick={() => setFilters({})}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs border border-blue-300 text-blue-600 rounded-lg hover:bg-blue-50"
          >
            <X size={12} /> 필터 {activeCount}개 초기화
          </button>
        )}
        <Button variant="outline" size="sm" onClick={fetchData} className="text-xs shrink-0 ml-auto">
          <RefreshCw size={12} className="mr-1" /> 새로고침
        </Button>
      </div>

      {/* 테이블 */}
      {loading ? (
        <div className="bg-white border border-gray-200 rounded-xl flex justify-center py-12 text-gray-400 gap-2">
          <RefreshCw className="animate-spin" size={18} /> 불러오는 중...
        </div>
      ) : (
        <div className="bg-white border rounded-xl overflow-x-auto">
          <table className="w-full text-xs whitespace-nowrap">
            <thead className="bg-gray-50 border-b">
              <tr>
                {COLS.map(({ key, label, align, filterable }) => {
                  const active = (filters[key]?.length ?? 0) > 0;
                  // 여유원재(SURPLUS) 는 '발생판번호' 대신 '판번호' 로 표시
                  const displayLabel = (typeFilter === "SURPLUS" && key === "heatNo") ? "판번호" : label;
                  if (!filterable) {
                    return (
                      <th key={key} className={`px-3 py-2.5 text-${align} text-gray-500 font-semibold`}>
                        {displayLabel}
                      </th>
                    );
                  }
                  return (
                    <th key={key} className={`px-3 py-2.5 text-${align} text-gray-500 font-semibold`}>
                      <button
                        onClick={e => openFilter(key, e.currentTarget)}
                        className={`flex items-center gap-1 ${align === "right" ? "ml-auto" : align === "center" ? "mx-auto" : ""} hover:text-gray-700`}
                      >
                        {displayLabel}
                        <Filter size={10} className={active ? "text-blue-500 fill-blue-500" : "text-gray-400"} fill={active ? "currentColor" : "none"} />
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y">
              {remnants.length === 0 ? (
                <tr><td colSpan={COLS.length} className="text-center py-8 text-gray-400">
                  {activeCount > 0 || search ? "검색·필터 조건에 맞는 데이터가 없습니다." : "등록된 잔재가 없습니다."}
                  {(activeCount > 0 || search) && (
                    <button onClick={() => { setFilters({}); setSearch(""); }} className="ml-2 text-blue-500 hover:underline">초기화</button>
                  )}
                </td></tr>
              ) : remnants.map(r => (
                <tr key={r.id} onClick={() => setDetailItem(r)} className="hover:bg-blue-50/40 cursor-pointer transition-colors">
                  <td className="px-3 py-2 font-mono text-blue-600 font-medium">{r.remnantNo}</td>
                  <td className="px-3 py-2 text-gray-700">{r.sourceProject?.projectCode ?? r.sourceVesselName ?? "-"}</td>
                  <td className="px-3 py-2 text-gray-700">{r.sourceBlock ?? "-"}</td>
                  <td className="px-3 py-2 font-mono text-gray-600">{r.heatNo ?? "-"}</td>
                  <td className="px-3 py-2"><span className="px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded text-[10px] font-medium">{SHAPE_LABEL[r.shape] ?? r.shape}</span></td>
                  <td className="px-3 py-2"><span className="px-1.5 py-0.5 bg-slate-100 rounded font-medium">{r.material}</span></td>
                  <td className="px-3 py-2 text-right">{r.thickness}</td>
                  <td className="px-3 py-2 text-right">{r.width1?.toLocaleString() ?? "-"}</td>
                  <td className="px-3 py-2 text-right">{r.width2?.toLocaleString() ?? "-"}</td>
                  <td className="px-3 py-2 text-right">{r.length1?.toLocaleString() ?? "-"}</td>
                  <td className="px-3 py-2 text-right">{r.length2?.toLocaleString() ?? "-"}</td>
                  <td className="px-3 py-2 text-right font-semibold">{r.weight.toFixed(1)}</td>
                  <td className="px-3 py-2 text-gray-600">{r.location ?? <span className="text-gray-300">-</span>}</td>
                  <td className="px-3 py-2 text-center">
                    {(() => {
                      const ds = remnantDisplayStatus(r);
                      return (
                        <div className="inline-flex flex-col items-center gap-0.5">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${ds.cls}`}>{ds.label}</span>
                          {ds.reservedFor && <span className="text-[9px] text-blue-600 font-mono">{ds.reservedFor}</span>}
                        </div>
                      );
                    })()}
                  </td>
                  <td className="px-3 py-2 text-gray-700">
                    {r.status === "EXHAUSTED" && r.assignedToLists?.length > 0
                      ? `${r.assignedToLists[0].project?.projectCode ?? "-"} / ${r.assignedToLists[0].block ?? "-"}`
                      : "-"}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {r.memo && r.memo.trim() ? (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded text-[10px] font-medium" title={r.memo}>
                        <StickyNote size={11} /> 메모
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50 border-t">
              <tr>
                <td colSpan={11} className="px-3 py-2 text-gray-500 font-medium">합계 ({remnants.length}건 / 전체 {total}건)</td>
                <td className="px-3 py-2 text-right font-bold text-gray-700">{totalWeight.toFixed(1)}kg</td>
                <td /><td /><td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>{(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} / {total}건</span>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage(1)} disabled={page === 1} className="px-2 py-1 rounded border border-gray-200 hover:bg-gray-100 disabled:opacity-30">«</button>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-2 py-1 rounded border border-gray-200 hover:bg-gray-100 disabled:opacity-30">‹</button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const start = Math.max(1, Math.min(page - 2, totalPages - 4));
              const pg = start + i;
              return (
                <button key={pg} onClick={() => setPage(pg)}
                  className={`px-2.5 py-1 rounded border text-xs ${pg === page ? "bg-blue-600 text-white border-blue-600" : "border-gray-200 hover:bg-gray-100"}`}
                >{pg}</button>
              );
            })}
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-2 py-1 rounded border border-gray-200 hover:bg-gray-100 disabled:opacity-30">›</button>
            <button onClick={() => setPage(totalPages)} disabled={page === totalPages} className="px-2 py-1 rounded border border-gray-200 hover:bg-gray-100 disabled:opacity-30">»</button>
          </div>
        </div>
      )}

      {/* 컬럼 필터 드롭다운 */}
      {openCol && anchorEl && (
        <ColumnFilterDropdown
          anchorEl={anchorEl}
          values={getDistinctForCol(openCol)}
          selected={filters[openCol] ?? []}
          onApply={sel => { setFilters(f => ({ ...f, [openCol]: sel })); setOpenCol(null); setAnchorEl(null); }}
          onClose={() => { setOpenCol(null); setAnchorEl(null); }}
        />
      )}

      {/* 상세 → 수정/잔여 모달 체인 */}
      {detailItem && !editItem && !reregItem && (
        <DetailModal
          remnant={toRemnant(detailItem)}
          onClose={() => setDetailItem(null)}
          onEdit={() => { setEditItem(detailItem); setDetailItem(null); }}
          onReregister={() => { setReregItem(detailItem); setDetailItem(null); }}
        />
      )}
      {editItem && (
        <EditModal
          remnant={toRemnant(editItem)}
          onClose={() => setEditItem(null)}
          onSaved={() => { setEditItem(null); fetchData(); }}
          onPermanentDeleted={() => { setEditItem(null); fetchData(); }}
        />
      )}
      {reregItem && (
        <ReregisterModal
          remnant={toRemnant(reregItem)}
          onClose={() => setReregItem(null)}
          onSaved={() => { setReregItem(null); fetchData(); }}
        />
      )}
    </div>
  );
}

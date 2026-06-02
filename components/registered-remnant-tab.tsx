"use client";

import { useState, useEffect, useCallback } from "react";
import { Filter, X } from "lucide-react";
import ColumnFilterDropdown from "@/components/column-filter-dropdown";

// ─── 등록잔재 탭 (잔재관리 메뉴 내) ──────────────────────────────────────────
// 종류 = REGISTERED 인 잔재만 보여줌
// 등록 경로 2가지:
//   1) 프로젝트에서 블록강재등록 시 잔재 사용 → 자동으로 REGISTERED 잔재 생성
//   2) 잔재관리 > 잔재등록 탭에서 종류=등록잔재 선택해 직접 등록

const SHAPE_LABEL: Record<string, string> = { RECTANGLE: "사각형", L_SHAPE: "L자형" };
const STATUS_LABEL_R: Record<string, string> = { IN_STOCK: "재고", EXHAUSTED: "소진" };
const STATUS_COLOR_R: Record<string, string> = {
  IN_STOCK:  "bg-green-100 text-green-700",
  EXHAUSTED: "bg-gray-100 text-gray-500",
};

// 잔재 상태 — reservedFor 우선 (확정), 그 외에는 status 기준
function remnantDisplayStatus(r: { status: string; reservedFor: string | null }): { label: string; cls: string; reservedFor?: string } {
  if (r.status === "EXHAUSTED") return { label: "소진", cls: "bg-gray-100 text-gray-500" };
  if (r.reservedFor)            return { label: "확정", cls: "bg-blue-100 text-blue-700", reservedFor: r.reservedFor };
  if (r.status === "IN_STOCK")  return { label: "재고", cls: "bg-green-100 text-green-700" };
  return { label: STATUS_LABEL_R[r.status] ?? r.status, cls: STATUS_COLOR_R[r.status] ?? "bg-gray-100 text-gray-500" };
}

type RemnantRow = {
  id: string; remnantNo: string; shape: string; material: string;
  thickness: number; width1: number | null; length1: number | null;
  width2: number | null; length2: number | null; weight: number;
  sourceBlock: string | null; sourceVesselName: string | null; status: string;
  reservedFor: string | null;
  heatNo: string | null;
  sourceProject: { projectCode: string } | null;
  assignedToLists: { block: string | null; project: { projectCode: string } | null }[];
};

const COLS = [
  { key: "remnantNo", label: "잔재번호",   align: "left"  },
  { key: "vessel",    label: "발생호선",   align: "left"  },
  { key: "block",     label: "발생블록",   align: "left"  },
  { key: "heatNo",    label: "발생판번호", align: "left"  },
  { key: "shape",     label: "형태",       align: "left"  },
  { key: "material",  label: "재질",       align: "left"  },
  { key: "thickness", label: "두께",       align: "right" },
  { key: "width1",    label: "폭1",        align: "right" },
  { key: "width2",    label: "폭2",        align: "right" },
  { key: "length1",   label: "길이1",      align: "right" },
  { key: "length2",   label: "길이2",      align: "right" },
  { key: "weight",    label: "중량(kg)",   align: "right" },
  { key: "status",    label: "상태",        align: "center"},
  { key: "usedVessel", label: "사용호선/블록", align: "left"  },
] as const;

export default function RegisteredRemnantTab() {
  const [remnants,       setRemnants]       = useState<RemnantRow[]>([]);
  const [loading,        setLoading]        = useState(false);
  const [filters,        setFilters]        = useState<Record<string, string[]>>({});
  const [distinctValues, setDistinctValues] = useState<Record<string, { value: string; label: string }[]>>({});
  const [openCol,        setOpenCol]        = useState<string | null>(null);
  const [anchorEl,       setAnchorEl]       = useState<HTMLElement | null>(null);
  const [page,           setPage]           = useState(1);
  const [total,          setTotal]          = useState(0);
  const [totalPages,     setTotalPages]     = useState(1);

  useEffect(() => {
    fetch("/api/remnants/distinct?type=REGISTERED")
      .then(r => r.ok ? r.json() : {})
      .then(d => setDistinctValues(d));
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const p = new URLSearchParams();
    p.set("type", "REGISTERED");
    p.set("page", String(page));
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

    fetch(`/api/remnants?${p}`)
      .then(r => r.json())
      .then(d => {
        if (d.data) {
          setRemnants(d.data);
          setTotal(d.total ?? d.data.length);
          setTotalPages(d.totalPages ?? 1);
        }
      })
      .finally(() => setLoading(false));
  }, [page, filters]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { setPage(1); }, [filters]);

  const getDistinctForCol = (col: string) => {
    const map: Record<string, string> = {
      vessel: "source", block: "sourceBlock", heatNo: "heatNo",
      shape: "shape", material: "material", thickness: "thickness",
      width1: "width1", length1: "length1", width2: "width2", length2: "length2",
      weight: "weight", status: "status",
    };
    return distinctValues[map[col] ?? col] ?? [];
  };

  const activeCount = Object.values(filters).filter(v => v.length > 0).length;
  const totalWeight = remnants.reduce((s, r) => s + r.weight, 0);

  const openFilter = (col: string, el: HTMLElement) => {
    if (openCol === col) { setOpenCol(null); setAnchorEl(null); return; }
    setOpenCol(col); setAnchorEl(el);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <h3 className="text-base font-semibold text-gray-800">등록잔재리스트</h3>
        <span className="text-xs text-gray-400">{total}건</span>
        {activeCount > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded-md">
            <Filter size={11} fill="currentColor" />
            필터 {activeCount}개 적용
            <button onClick={() => setFilters({})} className="ml-0.5 hover:text-blue-800"><X size={11} /></button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="text-center py-10 text-gray-400 text-sm">불러오는 중...</div>
      ) : (
        <div className="bg-white border rounded-xl overflow-x-auto">
          <table className="w-full text-xs whitespace-nowrap">
            <thead className="bg-gray-50 border-b">
              <tr>
                {COLS.map(({ key, label, align }) => {
                  const active = (filters[key]?.length ?? 0) > 0;
                  return (
                    <th key={key} className={`px-3 py-2.5 text-${align} text-gray-500 font-semibold`}>
                      <button
                        onClick={e => openFilter(key, e.currentTarget)}
                        className={`flex items-center gap-1 ${align === "right" ? "ml-auto" : ""} hover:text-gray-700`}
                      >
                        {label}
                        <Filter size={10} className={active ? "text-blue-500 fill-blue-500" : "text-gray-400"} fill={active ? "currentColor" : "none"} />
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y">
              {remnants.length === 0 ? (
                <tr><td colSpan={14} className="text-center py-8 text-gray-400">
                  {activeCount > 0 ? "필터 조건에 맞는 데이터가 없습니다." : "등록된 잔재가 없습니다."}
                  {activeCount > 0 && <button onClick={() => setFilters({})} className="ml-2 text-blue-500 hover:underline">필터 초기화</button>}
                </td></tr>
              ) : remnants.map(r => (
                <tr key={r.id} className="hover:bg-gray-50">
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
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50 border-t">
              <tr>
                <td colSpan={11} className="px-3 py-2 text-gray-500 font-medium">합계 ({remnants.length}건 / 전체 {total}건)</td>
                <td className="px-3 py-2 text-right font-bold text-gray-700">{totalWeight.toFixed(1)}kg</td>
                <td /><td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>{(page - 1) * 50 + 1}–{Math.min(page * 50, total)} / {total}건</span>
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

      {openCol && anchorEl && (
        <ColumnFilterDropdown
          anchorEl={anchorEl}
          values={getDistinctForCol(openCol)}
          selected={filters[openCol] ?? []}
          onApply={sel => { setFilters(f => ({ ...f, [openCol]: sel })); setOpenCol(null); setAnchorEl(null); }}
          onClose={() => { setOpenCol(null); setAnchorEl(null); }}
        />
      )}
    </div>
  );
}

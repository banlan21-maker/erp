"use client";

/**
 * 블록별 BOM리스트 탭
 * - 블록 선택 전: 호선/블록 목록
 * - 블록 선택 후: 해당 블록의 BOM 항목 테이블
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList, FolderOpen, ArrowLeft, Trash2, X } from "lucide-react";
import Link from "next/link";

interface ProjectOption {
  id: string;
  projectCode: string;
  projectName: string;
}

interface BomItem {
  id: string;
  hosin: string;
  block: string;
  partName: string;
  thickness: string | null;
  size: string | null;
  material: string | null;
  process: string | null;
  qty: number | null;
  weight: number | null;
  nestNo: string | null;
  sourceFile: string | null;
  vendor: { name: string } | null;
}

const COLUMNS = [
  { key: "hosin",     label: "호선",     align: "left"  as const, filterable: true  },
  { key: "block",     label: "블록",     align: "left"  as const, filterable: true  },
  { key: "partName",  label: "파트명",   align: "left"  as const, filterable: true  },
  { key: "thickness", label: "두께",     align: "right" as const, filterable: true  },
  { key: "size",      label: "사이즈",   align: "left"  as const, filterable: true  },
  { key: "material",  label: "재질",     align: "left"  as const, filterable: true  },
  { key: "process",   label: "가공",     align: "left"  as const, filterable: true  },
  { key: "qty",       label: "수량",     align: "right" as const, filterable: false },
  { key: "weight",    label: "중량(kg)", align: "right" as const, filterable: false },
  { key: "nestNo",    label: "NEST NO",  align: "left"  as const, filterable: true  },
] as const;

type ColKey = (typeof COLUMNS)[number]["key"];

export default function BomMain({
  projectOptions,
  projectId,
}: {
  projectOptions: ProjectOption[];
  projectId?: string | null;
}) {
  const router = useRouter();
  const [items,   setItems]   = useState<BomItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [deleting,setDeleting]= useState(false);
  const [filters, setFilters] = useState<Partial<Record<ColKey, string>>>({});

  const setFilter = (key: ColKey, val: string) =>
    setFilters(p => val ? { ...p, [key]: val } : Object.fromEntries(Object.entries(p).filter(([k]) => k !== key)));

  const filtered = items.filter(item =>
    COLUMNS.every(col => {
      const f = filters[col.key];
      if (!f) return true;
      const v = String(item[col.key as keyof BomItem] ?? "").toLowerCase();
      return v.includes(f.toLowerCase());
    })
  );

  const activeProject = projectOptions.find(p => p.id === projectId) ?? null;

  const loadItems = useCallback(async (pid: string) => {
    setLoading(true);
    const r = await fetch(`/api/bom?projectId=${pid}`);
    setItems(await r.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    if (projectId) loadItems(projectId);
    else setItems([]);
  }, [projectId, loadItems]);

  // 전체 삭제
  const deleteAll = async () => {
    if (!projectId || !activeProject) return;
    if (!confirm(`[${activeProject.projectCode}] ${activeProject.projectName}의 BOM 전체를 삭제하시겠습니까?`)) return;
    setDeleting(true);
    await fetch(`/api/bom?projectId=${projectId}`, { method: "DELETE" });
    setItems([]);
    setDeleting(false);
  };

  // ── 블록 선택 후: BOM 테이블 ──
  if (projectId && activeProject) {
    const totalQty = filtered.reduce((s, r) => s + (r.qty ?? 0), 0);
    const totalWt  = filtered.reduce((s, r) => s + (r.weight ?? 0), 0);
    const vendor   = items[0]?.vendor?.name ?? null;
    const hasFilter = Object.keys(filters).length > 0;

    return (
      <div className="space-y-4">
        {/* 상단 */}
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => router.push("/cutpart/projects?tab=bom")}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
          >
            <ArrowLeft size={15} /> 목록으로
          </button>
          <h3 className="text-base font-semibold text-gray-800">
            [{activeProject.projectCode}] {activeProject.projectName}
          </h3>
          {vendor && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
              업체: {vendor}
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-gray-400">
              {hasFilter ? `${filtered.length}/${items.length}건` : `${items.length}건`}
              {" · "}수량 {totalQty.toLocaleString()} · {totalWt.toFixed(3)}t
            </span>
            {hasFilter && (
              <button onClick={() => setFilters({})}
                className="flex items-center gap-1 px-2 py-1 text-xs text-blue-600 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100">
                <X size={10} /> 필터초기화
              </button>
            )}
            {items.length > 0 && (
              <button
                onClick={deleteAll}
                disabled={deleting}
                className="flex items-center gap-1 px-2.5 py-1 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 disabled:opacity-40"
              >
                <Trash2 size={11} /> 전체삭제
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="text-center py-16 text-gray-400 text-sm">불러오는 중...</div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400 bg-white rounded-xl border">
            <ClipboardList size={36} className="mb-3 opacity-30" />
            <p className="text-sm">등록된 BOM이 없습니다.</p>
            <p className="text-xs mt-1 text-gray-300">BOM 등록 탭에서 엑셀 파일을 업로드하세요.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  {/* 컬럼 헤더 */}
                  <tr className="bg-gray-800 text-white">
                    <th className="px-2 py-2 text-center font-semibold w-8">No</th>
                    {COLUMNS.map(c => (
                      <th key={c.key}
                        className={`px-3 py-2 font-semibold whitespace-nowrap ${c.align === "right" ? "text-right" : "text-left"}`}>
                        {c.label}
                      </th>
                    ))}
                  </tr>
                  {/* 필터 행 */}
                  <tr className="bg-gray-700">
                    <td className="px-2 py-1" />
                    {COLUMNS.map(c => (
                      <td key={c.key} className="px-1.5 py-1">
                        {c.filterable ? (
                          <div className="relative">
                            <input
                              value={filters[c.key] ?? ""}
                              onChange={e => setFilter(c.key, e.target.value)}
                              placeholder="필터..."
                              className="w-full bg-gray-600 text-white placeholder-gray-400 text-xs px-2 py-0.5 rounded border border-gray-500 focus:outline-none focus:border-blue-400"
                            />
                            {filters[c.key] && (
                              <button onClick={() => setFilter(c.key, "")}
                                className="absolute right-1 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white">
                                <X size={10} />
                              </button>
                            )}
                          </div>
                        ) : null}
                      </td>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map((item, i) => (
                    <tr key={item.id} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                      <td className="px-2 py-1.5 text-center text-gray-400">{i + 1}</td>
                      <td className="px-3 py-1.5 text-gray-600">{item.hosin}</td>
                      <td className="px-3 py-1.5 text-gray-600">{item.block}</td>
                      <td className="px-3 py-1.5 font-medium text-gray-800">{item.partName}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-gray-600">{item.thickness ?? "-"}</td>
                      <td className="px-3 py-1.5 text-gray-600">{item.size ?? "-"}</td>
                      <td className="px-3 py-1.5 text-gray-600">{item.material ?? "-"}</td>
                      <td className="px-3 py-1.5 text-gray-600">{item.process ?? "-"}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-gray-700">{item.qty?.toLocaleString() ?? "-"}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-gray-700">{item.weight?.toFixed(3) ?? "-"}</td>
                      <td className="px-3 py-1.5 text-gray-500 font-mono text-[11px]">{item.nestNo ?? "-"}</td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={11} className="px-4 py-8 text-center text-gray-400">필터 결과가 없습니다.</td>
                    </tr>
                  )}
                </tbody>
                <tfoot>
                  <tr className="bg-blue-50 text-blue-800 font-semibold">
                    <td colSpan={8} className="px-3 py-2 text-right text-xs">합 계</td>
                    <td className="px-3 py-2 text-right tabular-nums text-xs">{totalQty.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-xs">{totalWt.toFixed(3)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── 블록 선택 전: 호선/블록 목록 ──
  const grouped: Record<string, ProjectOption[]> = {};
  for (const p of projectOptions) {
    if (!grouped[p.projectCode]) grouped[p.projectCode] = [];
    grouped[p.projectCode].push(p);
  }

  if (projectOptions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-400 bg-white rounded-xl border">
        <FolderOpen size={36} className="mb-3 opacity-40" />
        <p className="text-sm">등록된 호선이 없습니다.</p>
        <Link href="/cutpart/projects/new" className="text-xs text-blue-500 hover:underline mt-1">호선 먼저 등록하기 →</Link>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {Object.entries(grouped).map(([code, blocks]) => (
        <div key={code} className="bg-white rounded-xl border overflow-hidden">
          <div className="px-4 py-2.5 bg-gray-50 border-b">
            <span className="text-xs font-bold text-gray-500">호선 [{code}]</span>
          </div>
          <div className="divide-y">
            {blocks.map(block => (
              <button
                key={block.id}
                onClick={() => router.push(`/cutpart/projects?tab=bom&projectId=${block.id}`)}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-blue-50 transition-colors text-left"
              >
                <ClipboardList size={13} className="text-purple-400 flex-shrink-0" />
                <span className="text-sm font-medium text-gray-800">{block.projectName}</span>
                <span className="ml-auto text-xs text-gray-400">BOM 조회 →</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

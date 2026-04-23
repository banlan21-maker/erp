export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import DrawingTable from "@/components/drawing-table";

export default async function VesselDrawingsPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const vesselCode = decodeURIComponent(code);

  const projects = await prisma.project.findMany({
    where: { projectCode: vesselCode },
    orderBy: { projectName: "asc" },
    include: { drawingLists: { orderBy: { createdAt: "asc" } } },
  });

  if (projects.length === 0) notFound();

  const allDrawings = projects.flatMap((p) =>
    p.drawingLists.map((d) => ({ ...d, _blockName: p.projectName }))
  );

  const totalQty = allDrawings.reduce((s, d) => s + d.qty, 0);
  const totalSteel = allDrawings.reduce((s, d) => s + (d.steelWeight ?? 0), 0);

  const remnants = await prisma.remnant.findMany({
    where: {
      drawingList: { project: { projectCode: vesselCode } },
    },
    include: {
      drawingList: { select: { block: true, drawingNo: true } },
      sourceProject: { select: { projectCode: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const SHAPE_LABEL: Record<string, string> = {
    RECTANGLE: "사각형",
    L_SHAPE: "L자형",
    IRREGULAR: "불규칙형",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/cutpart/projects">
          <Button variant="ghost" size="sm" className="flex items-center gap-1 text-gray-500">
            <ArrowLeft size={14} /> 목록
          </Button>
        </Link>
        <div>
          <h2 className="text-xl font-bold text-gray-900">
            호선 [{vesselCode}] — 전체 강재리스트
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {projects.length}개 블록 · {allDrawings.length}행 · 총 {totalQty}매 · {totalSteel.toFixed(3)}t
          </p>
        </div>
      </div>

      {/* 블록별 요약 */}
      <div className="flex flex-wrap gap-2">
        {projects.map((p) => (
          <Link
            key={p.id}
            href={`/cutpart/projects?tab=list&projectId=${p.id}`}
            className="flex items-center gap-2 px-3 py-1.5 bg-white border rounded-lg hover:border-blue-400 hover:bg-blue-50 transition-colors text-sm"
          >
            <span className="font-semibold text-gray-800">{p.projectName}</span>
            <span className="text-xs text-gray-400">{p.drawingLists.length}행</span>
          </Link>
        ))}
      </div>

      {/* 블록별 강재리스트 */}
      {projects.map((p) => (
        <div key={p.id} className="space-y-2">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-gray-700">
              블록 [{p.projectName}]
            </h3>
            <span className="text-xs text-gray-400">{p.drawingLists.length}행</span>
            <Link href={`/cutpart/projects?tab=list&projectId=${p.id}`} className="text-xs text-blue-500 hover:underline ml-auto">
              상세 →
            </Link>
          </div>
          {p.drawingLists.length > 0 ? (
            <DrawingTable drawings={p.drawingLists} projectId={p.id} projectCode={vesselCode} />
          ) : (
            <div className="text-xs text-gray-400 bg-gray-50 rounded-lg border px-4 py-3">
              강재리스트가 없습니다.
            </div>
          )}
        </div>
      ))}

      {/* 등록잔재 리스트 */}
      <div className="space-y-2">
        <h3 className="text-sm font-bold text-gray-700 flex items-center gap-2">
          등록잔재 리스트
          <span className="text-xs font-normal text-gray-400">({remnants.length}건)</span>
        </h3>
        {remnants.length === 0 ? (
          <div className="text-xs text-gray-400 bg-gray-50 rounded-lg border px-4 py-3">
            등록된 잔재가 없습니다.
          </div>
        ) : (
          <div className="bg-white border rounded-xl overflow-x-auto">
            <table className="w-full text-xs whitespace-nowrap">
              <thead className="bg-gray-50 border-b">
                <tr>
                  {["잔재번호","블록","형태","재질","두께(mm)","폭1","길이1","폭2","길이2","중량(kg)"].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-gray-500 font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {remnants.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 font-mono text-blue-600">{r.remnantNo}</td>
                    <td className="px-3 py-2 text-gray-700">{r.drawingList?.block ?? "-"}</td>
                    <td className="px-3 py-2">
                      <span className="px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded text-[10px] font-medium">
                        {SHAPE_LABEL[r.shape] ?? r.shape}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="px-1.5 py-0.5 bg-slate-100 rounded font-medium">{r.material}</span>
                    </td>
                    <td className="px-3 py-2 text-right">{r.thickness}</td>
                    <td className="px-3 py-2 text-right">{r.width1?.toLocaleString() ?? "-"}</td>
                    <td className="px-3 py-2 text-right">{r.length1?.toLocaleString() ?? "-"}</td>
                    <td className="px-3 py-2 text-right">{r.width2?.toLocaleString() ?? "-"}</td>
                    <td className="px-3 py-2 text-right">{r.length2?.toLocaleString() ?? "-"}</td>
                    <td className="px-3 py-2 text-right font-semibold text-gray-800">{r.weight.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 border-t">
                <tr>
                  <td colSpan={9} className="px-3 py-2 text-xs text-gray-500 font-medium">합계 ({remnants.length}건)</td>
                  <td className="px-3 py-2 text-right text-xs font-bold text-gray-700">
                    {remnants.reduce((s, r) => s + r.weight, 0).toFixed(1)}kg
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

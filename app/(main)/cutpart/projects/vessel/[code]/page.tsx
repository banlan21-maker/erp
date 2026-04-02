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
            href={`/cutpart/projects/${p.id}`}
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
            <Link href={`/cutpart/projects/${p.id}`} className="text-xs text-blue-500 hover:underline ml-auto">
              상세 →
            </Link>
          </div>
          {p.drawingLists.length > 0 ? (
            <DrawingTable drawings={p.drawingLists} projectId={p.id} />
          ) : (
            <div className="text-xs text-gray-400 bg-gray-50 rounded-lg border px-4 py-3">
              강재리스트가 없습니다.
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

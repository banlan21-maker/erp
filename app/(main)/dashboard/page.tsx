export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FolderOpen, FileSpreadsheet, Layers, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { DashboardEquipmentProgress } from "@/components/dashboard-equipment-progress";

const STATUS_COLOR: Record<string, string> = {
  ACTIVE: "bg-green-100 text-green-700",
  COMPLETED: "bg-gray-100 text-gray-600",
  ON_HOLD: "bg-yellow-100 text-yellow-700",
};
const STATUS_LABEL: Record<string, string> = { ACTIVE: "진행중", COMPLETED: "완료", ON_HOLD: "보류" };
const TYPE_COLOR: Record<string, string> = {
  A: "bg-blue-100 text-blue-700",
  B: "bg-green-100 text-green-700",
};

export default async function DashboardPage() {
  const [
    totalProjects,
    activeProjects,
    projectsByType,
    totalDrawings,
    recentProjects,
    recentDrawings,
  ] = await Promise.all([
    prisma.project.count(),
    prisma.project.count({ where: { status: "ACTIVE" } }),
    prisma.project.groupBy({ by: ["type"], _count: { type: true } }),
    prisma.drawingList.count(),
    prisma.project.findMany({
      take: 6,
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { drawingLists: true } } },
    }),
    prisma.drawingList.findMany({
      take: 8,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        material: true,
        thickness: true,
        qty: true,
        block: true,
        createdAt: true,
        project: { select: { id: true, projectCode: true, projectName: true } },
      },
    }),
  ]);

  // 호선 수 (unique projectCode)
  const allCodes = await prisma.project.findMany({ select: { projectCode: true }, distinct: ["projectCode"] });
  const totalVessels = allCodes.length;

  const typeMap: Record<string, number> = {};
  for (const g of projectsByType) typeMap[g.type] = g._count.type;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">현황 대시보드</h2>
        <p className="text-sm text-gray-500 mt-1">CNC 절단 파트 ERP 실시간 현황</p>
      </div>

      {/* 장비별 작업 현황 위젯 */}
      <DashboardEquipmentProgress />

      {/* 요약 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard
          title="호선 수"
          value={totalVessels}
          sub={`블록 ${totalProjects}건`}
          icon={<FolderOpen size={20} className="text-blue-500" />}
          bg="bg-blue-50"
        />
        <SummaryCard
          title="진행중 블록"
          value={activeProjects}
          sub={`완료 ${totalProjects - activeProjects}건`}
          icon={<CheckCircle2 size={20} className="text-green-500" />}
          bg="bg-green-50"
        />
        <SummaryCard
          title="강재리스트"
          value={totalDrawings}
          sub="총 등록 행 수"
          icon={<FileSpreadsheet size={20} className="text-purple-500" />}
          bg="bg-purple-50"
        />
        <SummaryCard
          title="유형 A / B"
          value={typeMap["A"] ?? 0}
          sub={`유형 B: ${typeMap["B"] ?? 0}건`}
          icon={<Layers size={20} className="text-orange-500" />}
          bg="bg-orange-50"
        />
      </div>

      {/* 최근 블록 + 최근 강재리스트 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold text-gray-700">최근 등록 블록</CardTitle>
            <Link href="/projects" className="text-xs text-blue-600 hover:underline">전체보기</Link>
          </CardHeader>
          <CardContent>
            {recentProjects.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">등록된 프로젝트가 없습니다.</p>
            ) : (
              <div className="space-y-1">
                {recentProjects.map((p) => (
                  <Link
                    key={p.id}
                    href={`/projects/${p.id}`}
                    className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <span className={`text-xs px-1.5 py-0.5 rounded font-bold ${TYPE_COLOR[p.type]}`}>
                      {p.type}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-gray-800 truncate">
                        [{p.projectCode}] {p.projectName}
                      </p>
                    </div>
                    <span className="text-xs text-gray-400 flex-shrink-0">{p._count.drawingLists}행</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${STATUS_COLOR[p.status]}`}>
                      {STATUS_LABEL[p.status]}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold text-gray-700">최근 등록 강재</CardTitle>
            <Link href="/drawings" className="text-xs text-blue-600 hover:underline">전체보기</Link>
          </CardHeader>
          <CardContent>
            {recentDrawings.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">등록된 강재가 없습니다.</p>
            ) : (
              <div className="space-y-1">
                {recentDrawings.map((d) => (
                  <Link
                    key={d.id}
                    href={`/projects/${d.project.id}`}
                    className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <span className="text-xs px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded font-mono">
                      {d.material}
                    </span>
                    <p className="text-xs text-gray-700 flex-1 truncate">
                      [{d.project.projectCode}] {d.project.projectName}
                      {d.block ? ` — ${d.block}` : ""}
                    </p>
                    <span className="text-xs text-gray-400 flex-shrink-0">
                      {d.thickness}t · {d.qty}매
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

    </div>
  );
}

function SummaryCard({
  title, value, sub, icon, bg,
}: {
  title: string; value: number; sub: string; icon: React.ReactNode; bg: string;
}) {
  return (
    <Card className={bg}>
      <CardContent className="pt-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-gray-500 font-medium">{title}</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{value.toLocaleString()}</p>
            <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
          </div>
          <div className="p-2 bg-white rounded-lg shadow-sm">{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}

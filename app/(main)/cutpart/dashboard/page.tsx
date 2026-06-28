export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FolderOpen, FileSpreadsheet, CheckCircle2, LayoutDashboard, TrendingUp } from "lucide-react";
import Link from "next/link";
import { DashboardEquipmentProgress } from "@/components/dashboard-equipment-progress";

const STATUS_COLOR: Record<string, string> = {
  ACTIVE: "bg-green-100 text-green-700",
  COMPLETED: "bg-gray-100 text-gray-600",
  ON_HOLD: "bg-yellow-100 text-yellow-700",
};
const STATUS_LABEL: Record<string, string> = { ACTIVE: "진행중", COMPLETED: "완료", ON_HOLD: "보류" };

export default async function DashboardPage() {
  const [
    totalDrawings,
    recentProjects,
    allProjects,
    totalByProj,
    cutByProj,
    activeLogProjs,
    lastCutByProj,
    allCodes,
  ] = await Promise.all([
    prisma.drawingList.count(),
    prisma.project.findMany({
      take: 6,
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { drawingLists: true } } },
    }),
    prisma.project.findMany({ select: { id: true, projectCode: true, projectName: true } }),
    prisma.drawingList.groupBy({ by: ["projectId"], _count: { _all: true } }),
    prisma.drawingList.groupBy({ by: ["projectId"], where: { status: "CUT" }, _count: { _all: true } }),
    // 절단 진행중(STARTED/PAUSED) 활성 작업이 있는 프로젝트 — 정규작업만(돌발 제외)
    prisma.cuttingLog.groupBy({ by: ["projectId"], where: { isUrgent: false, status: { in: ["STARTED", "PAUSED"] } }, _count: { _all: true } }),
    // 프로젝트별 마지막 절단완료일(= 블록 완료일) — 정규작업만
    prisma.cuttingLog.groupBy({ by: ["projectId"], where: { isUrgent: false, status: "COMPLETED", endAt: { not: null } }, _max: { endAt: true } }),
    prisma.project.findMany({ select: { projectCode: true }, distinct: ["projectCode"] }),
  ]);
  const totalVessels = allCodes.length;
  const totalProjects = allProjects.length;

  const totalMap   = new Map(totalByProj.map(r => [r.projectId, r._count._all]));
  const cutMap     = new Map(cutByProj.map(r => [r.projectId, r._count._all]));
  const activeSet  = new Set(activeLogProjs.filter(r => r.projectId).map(r => r.projectId as string));
  const lastCutMap = new Map(lastCutByProj.filter(r => r.projectId && r._max.endAt).map(r => [r.projectId as string, r._max.endAt as Date]));

  // 블록 절단 상태 분류 — Project.status 가 아니라 "실제 절단(CUT) 도면 수" 기준.
  //  · 완료   = 등록된 모든 도면이 절단완료 (total>0 && cut===total)
  //  · 진행중 = 1장 이상 절단됨(cut>0) 또는 절단작업 진행중(STARTED/PAUSED), 단 완료 아님
  //  · 대기   = 절단 0장 (등록·확정만) → 표시 안 함
  type BlockStat = { id: string; projectCode: string; projectName: string; total: number; cut: number; pct: number; doneAt: Date | null };
  const blocks: BlockStat[] = [];
  for (const p of allProjects) {
    const total = totalMap.get(p.id) ?? 0;
    if (total === 0) continue;
    const cut = cutMap.get(p.id) ?? 0;
    blocks.push({
      id: p.id, projectCode: p.projectCode, projectName: p.projectName,
      total, cut, pct: Math.round((cut / total) * 100), doneAt: lastCutMap.get(p.id) ?? null,
    });
  }
  const completeBlocks   = blocks.filter(b => b.cut === b.total);                                   // 100%
  const inProgressBlocks = blocks.filter(b => b.cut < b.total && (b.cut > 0 || activeSet.has(b.id))); // 1장+ 절단/진행중
  const completeCount   = completeBlocks.length;
  const inProgressCount = inProgressBlocks.length;

  // 진행 중 — 최근 절단순(없으면 진행률순), 상위 6
  const inProgress = [...inProgressBlocks]
    .sort((a, b) => (b.doneAt?.getTime() ?? 0) - (a.doneAt?.getTime() ?? 0) || b.pct - a.pct)
    .slice(0, 6);
  // 최근 완료 — 완료일 최신순, 상위 6
  const recentDone = completeBlocks
    .filter(b => b.doneAt)
    .sort((a, b) => (b.doneAt as Date).getTime() - (a.doneAt as Date).getTime())
    .slice(0, 6);

  const fmtKDate = (d: Date) => {
    const s = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
    const [y, m, dd] = s.split("-");
    return `${y}년 ${m}월 ${dd}일`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <LayoutDashboard size={24} className="text-blue-600" />
          절단 대시보드
        </h2>
        <p className="text-sm text-gray-500 mt-1">CNC 절단 파트 ERP 실시간 현황</p>
      </div>

      {/* 장비별 작업 현황 위젯 */}
      <DashboardEquipmentProgress />

      {/* 요약 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <SummaryCard
          title="호선 수"
          value={totalVessels}
          sub={`블록 ${totalProjects}건`}
          icon={<FolderOpen size={20} className="text-blue-500" />}
          bg="bg-blue-50"
        />
        <SummaryCard
          title="진행중 블록"
          value={inProgressCount}
          sub={`완료 ${completeCount}건`}
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
      </div>

      {/* 최근 블록 + 최근 강재리스트 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold text-gray-700">최근 등록 블록</CardTitle>
            <Link href="/cutpart/projects" className="text-xs text-blue-600 hover:underline">전체보기</Link>
          </CardHeader>
          <CardContent>
            {recentProjects.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">등록된 프로젝트가 없습니다.</p>
            ) : (
              <div className="space-y-1">
                {recentProjects.map((p) => (
                  <Link
                    key={p.id}
                    href={`/cutpart/projects?tab=list&projectId=${p.id}`}
                    className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50 transition-colors"
                  >
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
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-gray-700">블록 절단 현황</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* 진행 중 블록 — 진행률 */}
            <div className="space-y-2">
              <p className="text-[11px] font-bold text-gray-400 flex items-center gap-1">
                <TrendingUp size={12} className="text-blue-500" /> 진행 중 블록
              </p>
              {inProgress.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-2">진행 중인 블록이 없습니다.</p>
              ) : inProgress.map((p) => (
                <Link key={p.id} href={`/cutpart/projects?tab=list&projectId=${p.id}`} className="block group">
                  <div className="flex items-center justify-between gap-2 text-xs mb-0.5">
                    <span className="font-medium text-gray-700 truncate group-hover:text-blue-700">
                      [{p.projectCode}] {p.projectName} <span className="text-gray-400 font-normal">절단진행중</span>
                    </span>
                    <span className="font-bold text-blue-600 tabular-nums shrink-0">{p.pct}%</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 rounded-full" style={{ width: `${p.pct}%` }} />
                  </div>
                  <p className="text-[10px] text-gray-400 mt-0.5">{p.cut}/{p.total}행 절단</p>
                </Link>
              ))}
            </div>

            {/* 최근 완료 블록 — 어제까지 */}
            <div className="pt-3 border-t border-gray-100 space-y-1">
              <p className="text-[11px] font-bold text-gray-400 flex items-center gap-1">
                <CheckCircle2 size={12} className="text-green-500" /> 최근 완료 블록 <span className="font-normal text-gray-300">(어제까지)</span>
              </p>
              {recentDone.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-2">최근 완료된 블록이 없습니다.</p>
              ) : recentDone.map((p) => (
                <Link key={p.id} href={`/cutpart/projects?tab=list&projectId=${p.id}`} className="flex items-center justify-between gap-2 p-1.5 rounded-lg hover:bg-gray-50 text-xs">
                  <span className="font-medium text-gray-700 truncate">[{p.projectCode}] {p.projectName}</span>
                  <span className="text-gray-500 shrink-0 tabular-nums">{fmtKDate(p.doneAt as Date)} 절단완료</span>
                </Link>
              ))}
            </div>
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
    <Card className={`${bg} py-0`}>
      <CardContent className="px-4 py-2.5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] text-gray-500 font-medium leading-tight">{title}</p>
            <p className="text-lg font-bold text-gray-900 leading-tight mt-0.5">{value.toLocaleString()}</p>
            <p className="text-[10px] text-gray-400 leading-tight">{sub}</p>
          </div>
          <div className="p-1.5 bg-white rounded-md shadow-sm shrink-0">{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}

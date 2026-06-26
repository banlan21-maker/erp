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
  // "최근 완료"는 어제까지 기준 — 오늘 KST 자정(=어제 끝)
  const kstTodayStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const yesterdayEnd = new Date(`${kstTodayStr}T00:00:00+09:00`);

  const [
    totalProjects,
    activeProjects,
    totalDrawings,
    recentProjects,
    activeProjs,
    completedProjs,
    totalByProj,
    cutByProj,
    lastCutByProj,
    allCodes,
  ] = await Promise.all([
    prisma.project.count(),
    prisma.project.count({ where: { status: "ACTIVE" } }),
    prisma.drawingList.count(),
    prisma.project.findMany({
      take: 6,
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { drawingLists: true } } },
    }),
    prisma.project.findMany({ where: { status: "ACTIVE" },    select: { id: true, projectCode: true, projectName: true } }),
    prisma.project.findMany({ where: { status: "COMPLETED" }, select: { id: true, projectCode: true, projectName: true } }),
    prisma.drawingList.groupBy({ by: ["projectId"], _count: { _all: true } }),
    prisma.drawingList.groupBy({ by: ["projectId"], where: { status: "CUT" }, _count: { _all: true } }),
    // 정규작업(돌발 제외) 절단완료 로그의 프로젝트별 마지막 절단일 = 블록 완료일
    prisma.cuttingLog.groupBy({ by: ["projectId"], where: { isUrgent: false, status: "COMPLETED", endAt: { not: null } }, _max: { endAt: true } }),
    prisma.project.findMany({ select: { projectCode: true }, distinct: ["projectCode"] }),
  ]);
  const totalVessels = allCodes.length;

  const totalMap = new Map(totalByProj.map(r => [r.projectId, r._count._all]));
  const cutMap   = new Map(cutByProj.map(r => [r.projectId, r._count._all]));
  const lastCutMap = new Map(
    lastCutByProj.filter(r => r.projectId && r._max.endAt).map(r => [r.projectId as string, r._max.endAt as Date]),
  );

  // 진행 중 블록 — ACTIVE + 절단 시작(cut>0). 진행률 = CUT/전체 도면행. 진행률 높은 순.
  const inProgress = activeProjs
    .map(p => {
      const total = totalMap.get(p.id) ?? 0;
      const cut = cutMap.get(p.id) ?? 0;
      return { ...p, total, cut, pct: total > 0 ? Math.round((cut / total) * 100) : 0 };
    })
    .filter(p => p.cut > 0 && p.total > 0)
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 6);

  // 최근 완료 블록 — 어제까지 완료. 마지막 절단일 최신순.
  const recentDone = completedProjs
    .map(p => ({ ...p, doneAt: lastCutMap.get(p.id) ?? null }))
    .filter(p => p.doneAt && p.doneAt.getTime() < yesterdayEnd.getTime())
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

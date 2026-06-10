export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import ProjectsMain from "@/components/projects-main";

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; projectId?: string }>;
}) {
  const { tab: rawTab = "vessels", projectId } = await searchParams;
  // upload·remnants 탭은 제거됨 — vessels로 폴백 (remnants는 잔재관리 메뉴로 이동)
  const tab = (rawTab === "upload" || rawTab === "remnants") ? "vessels" : rawTab;

  const projects = await prisma.project.findMany({
    orderBy: [{ projectCode: "asc" }, { projectName: "asc" }],
    include: { _count: { select: { drawingLists: true } } },
  });

  // 블록별 CUT 수량 집계 (상태 동적 계산용)
  const cutCountsRaw = await prisma.drawingList.groupBy({
    by: ["projectId"],
    where: { status: "CUT" },
    _count: { _all: true },
  });
  const cutCountMap = new Map(cutCountsRaw.map((r) => [r.projectId, r._count._all]));

  const projectOptions = projects.map((p) => {
    const total = p._count.drawingLists;
    const cut   = cutCountMap.get(p.id) ?? 0;
    const status = total === 0 ? null : total === cut ? "COMPLETED" : "ACTIVE";
    return {
      id: p.id,
      projectCode: p.projectCode,
      projectName: p.projectName,
      drawingCount: total,
      status,
      storageLocation: p.storageLocation ?? null,
    };
  });

  // 호선별 그룹핑 (호선리스트 탭용)
  const grouped: Record<string, { code: string; totalDrawings: number; blocks: typeof projects }> = {};
  for (const p of projects) {
    if (!grouped[p.projectCode]) {
      grouped[p.projectCode] = { code: p.projectCode, totalDrawings: 0, blocks: [] };
    }
    grouped[p.projectCode].blocks.push(p);
    grouped[p.projectCode].totalDrawings += p._count.drawingLists;
  }
  const vessels = Object.values(grouped).map((g) => ({
    code: g.code,
    totalDrawings: g.totalDrawings,
    blocks: g.blocks.map((p) => {
      const total = p._count.drawingLists;
      const cut   = cutCountMap.get(p.id) ?? 0;
      const status = total === 0 ? null : total === cut ? "COMPLETED" : "ACTIVE";
      return {
        id: p.id,
        projectCode: p.projectCode,
        projectName: p.projectName,
        type: p.type,
        client: p.client ?? "",
        status,
        drawingCount: total,
        createdAt: p.createdAt,
        storageLocation: p.storageLocation ?? null,
      };
    }),
  }));

  // 최근 등록 현황 (강재등록 탭용)
  const recentUploads = await prisma.drawingList.findMany({
    distinct: ["projectId"],
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      projectId: true,
      sourceFile: true,
      createdAt: true,
      project: { select: { projectCode: true, projectName: true } },
    },
  });

  // 강재리스트 탭에서 특정 프로젝트 선택 시 도면 목록 로드
  let drawings: Awaited<ReturnType<typeof prisma.drawingList.findMany>> = [];
  let activeProject: { id: string; projectCode: string; projectName: string; storageLocation: string | null } | null = null;

  if ((tab === "list" || tab === "bom") && projectId) {
    const proj = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, projectCode: true, projectName: true, storageLocation: true },
    });
    if (proj) {
      // 잔재 사용 도면의 type/사이즈/번호 등을 SSR 단에서 함께 fetch — 클라이언트 추가 fetch 불필요
      drawings = await prisma.drawingList.findMany({
        where: { projectId },
        orderBy: { createdAt: "asc" },
        include: {
          assignedRemnant: {
            select: {
              id: true, remnantNo: true, type: true, shape: true,
              width1: true, length1: true, width2: true, length2: true, weight: true,
            },
          },
        },
      });
      activeProject = {
        id: proj.id,
        projectCode: proj.projectCode,
        projectName: proj.projectName,
        storageLocation: proj.storageLocation ?? null,
      };
    }
  }

  return (
    <ProjectsMain
      tab={tab}
      vessels={vessels}
      projectOptions={projectOptions}
      recentUploads={recentUploads}
      drawings={drawings}
      activeProject={activeProject}
      projectId={projectId ?? null}
    />
  );
}

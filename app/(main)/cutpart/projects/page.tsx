export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import ProjectsMain from "@/components/projects-main";

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; projectId?: string }>;
}) {
  const { tab = "vessels", projectId } = await searchParams;

  const projects = await prisma.project.findMany({
    orderBy: [{ projectCode: "asc" }, { projectName: "asc" }],
    include: { _count: { select: { drawingLists: true } } },
  });

  const projectOptions = projects.map((p) => ({
    id: p.id,
    projectCode: p.projectCode,
    projectName: p.projectName,
    drawingCount: p._count.drawingLists,
    status: p.status,
    storageLocation: p.storageLocation ?? null,
  }));

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
    blocks: g.blocks.map((p) => ({
      id: p.id,
      projectCode: p.projectCode,
      projectName: p.projectName,
      type: p.type,
      client: p.client ?? "",
      status: p.status,
      drawingCount: p._count.drawingLists,
      createdAt: p.createdAt,
      storageLocation: p.storageLocation ?? null,
    })),
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

  if ((tab === "list" || tab === "bom" || tab === "remnants") && projectId) {
    const proj = await prisma.project.findUnique({
      where: { id: projectId },
      include: { drawingLists: { orderBy: { createdAt: "asc" } } },
    });
    if (proj) {
      drawings = proj.drawingLists;
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

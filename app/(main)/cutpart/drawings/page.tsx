export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import DrawingsMain from "@/components/drawings-main";

export default async function DrawingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; projectId?: string }>;
}) {
  const { tab = "upload", projectId } = await searchParams;

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

  // 강재리스트 탭에서 특정 프로젝트 선택 시 해당 도면 목록 로드
  let drawings: Awaited<ReturnType<typeof prisma.drawingList.findMany>> = [];
  let activeProject: { id: string; projectCode: string; projectName: string; storageLocation: string | null } | null = null;
  let specAvailability: Record<string, number> = {};

  if (tab === "list" && projectId) {
    const proj = await prisma.project.findUnique({
      where: { id: projectId },
      include: { drawingLists: { orderBy: { createdAt: "asc" } } },
    });
    if (proj) {
      drawings = proj.drawingLists;
      activeProject = { id: proj.id, projectCode: proj.projectCode, projectName: proj.projectName, storageLocation: proj.storageLocation ?? null };

      // REGISTERED 행의 스펙+블록별 "남은 입고 가능 수량" 계산
      // = 이 호선의 해당 사양 중 (미확정 + 이 블록이 확정한 것) 합계
      const uniqueSpecBlocks = [...new Map(
        drawings
          .filter(d => d.status === "REGISTERED")
          .map(d => {
            const block = d.block ?? "UNKNOWN";
            return [`${d.material}|${d.thickness}|${d.width}|${d.length}|${block}`,
              { material: d.material, thickness: d.thickness, width: d.width, length: d.length, block }];
          })
      ).values()];

      for (const sb of uniqueSpecBlocks) {
        const key = `${sb.material}|${sb.thickness}|${sb.width}|${sb.length}|${sb.block}`;
        specAvailability[key] = await prisma.steelPlan.count({
          where: {
            vesselCode: proj.projectCode,
            material: sb.material, thickness: sb.thickness, width: sb.width, length: sb.length,
            status: "RECEIVED",
            OR: [{ reservedFor: null }, { reservedFor: sb.block }],
          },
        });
      }
    }
  }

  // 최근 업로드 (강재등록 탭용)
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

  return (
    <DrawingsMain
      tab={tab}
      projectId={projectId ?? null}
      projectOptions={projectOptions}
      recentUploads={recentUploads}
      drawings={drawings}
      activeProject={activeProject}
      specAvailability={specAvailability}
    />
  );
}

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
  let confirmedDrawingIds: string[] = [];

  if (tab === "list" && projectId) {
    const proj = await prisma.project.findUnique({
      where: { id: projectId },
      include: { drawingLists: { orderBy: { createdAt: "asc" } } },
    });
    if (proj) {
      drawings = proj.drawingLists;
      activeProject = { id: proj.id, projectCode: proj.projectCode, projectName: proj.projectName, storageLocation: proj.storageLocation ?? null };

      // WAITING 행 중 확정된 것 계산
      const waitingRows = drawings.filter(d => d.status === "WAITING");
      // 규격+블록별 그룹화
      const groups = new Map<string, string[]>();
      for (const row of waitingRows) {
        const key = `${row.material}|${row.thickness}|${row.width}|${row.length}|${row.block ?? "UNKNOWN"}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(row.id);
      }
      for (const [key, ids] of groups) {
        const parts = key.split("|");
        const [material, , , , block] = parts;
        const thickness = Number(parts[1]);
        const width = Number(parts[2]);
        const length = Number(parts[3]);
        const reservedCount = await prisma.steelPlan.count({
          where: { vesselCode: proj.projectCode, material, thickness, width, length, status: "RECEIVED", reservedFor: block },
        });
        confirmedDrawingIds.push(...ids.slice(0, reservedCount));
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
      confirmedDrawingIds={confirmedDrawingIds}
    />
  );
}

export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import DrawingsMain from "@/components/drawings-main";

export default async function DrawingsPage() {
  const projects = await prisma.project.findMany({
    orderBy: [{ projectCode: "asc" }, { projectName: "asc" }],
    include: { _count: { select: { drawingLists: true } } },
  });

  // 최근 업로드 목록 (프로젝트별 최신 강재리스트)
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

  // 프로젝트 목록 (호선/블록 선택용)
  const projectOptions = projects.map((p) => ({
    id: p.id,
    projectCode: p.projectCode,
    projectName: p.projectName,
    drawingCount: p._count.drawingLists,
  }));

  return <DrawingsMain projectOptions={projectOptions} recentUploads={recentUploads} />;
}

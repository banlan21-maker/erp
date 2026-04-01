export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Plus, Anchor } from "lucide-react";
import ProjectTree from "@/components/project-tree";
import UrgentRegisterButton from "@/components/urgent-register-button";

export default async function ProjectsPage() {
  const projects = await prisma.project.findMany({
    orderBy: [{ projectCode: "asc" }, { projectName: "asc" }],
    include: { _count: { select: { drawingLists: true } } },
  });

  const projectsForButton = projects.map(p => ({
    id: p.id,
    projectCode: p.projectCode,
    projectName: p.projectName,
  }));

  // 호선코드 기준 그룹핑
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
      client: p.client,
      status: p.status,
      drawingCount: p._count.drawingLists,
      createdAt: p.createdAt,
      storageLocation: p.storageLocation ?? null,
    })),
  }));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Anchor size={24} className="text-blue-600" />
            호선 · 프로젝트
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            호선 {vessels.length}개 · 블록 {projects.length}건
          </p>
        </div>
        <div className="flex items-center gap-2">
          <UrgentRegisterButton projects={projectsForButton} />
          <Link href="/projects/new">
            <Button className="flex items-center gap-2">
              <Plus size={16} /> 호선 등록
            </Button>
          </Link>
        </div>
      </div>

      <ProjectTree vessels={vessels} />
    </div>
  );
}

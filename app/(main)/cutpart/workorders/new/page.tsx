export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import WorkOrderForm from "@/components/workorder-form";

export default async function NewWorkOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string }>;
}) {
  const { projectId } = await searchParams;

  const [projects, drawings, equipment] = await Promise.all([
    prisma.project.findMany({
      where: { status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
      select: { id: true, projectCode: true, projectName: true, type: true },
    }),
    projectId
      ? prisma.drawingList.findMany({
          where: { projectId },
          orderBy: { createdAt: "asc" },
          select: { id: true, block: true, drawingNo: true, material: true, thickness: true },
        })
      : [],
    prisma.equipment.findMany({
      where: { status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, type: true },
    }),
  ]);

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">작업지시 생성</h2>
        <p className="text-sm text-gray-500 mt-0.5">절단 작업지시를 생성합니다.</p>
      </div>
      <WorkOrderForm
        projects={projects}
        initialDrawings={drawings}
        equipment={equipment}
        defaultProjectId={projectId}
      />
    </div>
  );
}

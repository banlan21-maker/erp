export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import WorklogAdmin from "@/components/worklog-admin";

export default async function WorklogPage() {
  const [equipment, projects, workers] = await Promise.all([
    prisma.equipment.findMany({
      where: { status: { not: "INACTIVE" } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, type: true },
    }),
    prisma.project.findMany({
      where: { status: "ACTIVE" },
      orderBy: [{ projectCode: "asc" }, { projectName: "asc" }],
      select: { id: true, projectCode: true, projectName: true },
    }),
    prisma.worker.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <WorklogAdmin
      equipment={equipment.map((e) => ({ ...e, type: e.type as string }))}
      projects={projects}
      workers={workers}
    />
  );
}

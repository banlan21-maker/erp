export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import ScheduleManager from "@/components/schedule-manager";

export default async function SchedulePage() {
  const projects = await prisma.project.findMany({
    where: { status: "ACTIVE" },
    orderBy: [{ projectCode: "asc" }, { projectName: "asc" }],
    select: { id: true, projectCode: true, projectName: true },
  });

  return <ScheduleManager projects={projects} />;
}

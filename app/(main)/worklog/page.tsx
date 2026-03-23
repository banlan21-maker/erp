export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import WorklogMain from "@/components/worklog-main";

export default async function WorklogPage() {
  const [equipment, projects, workers] = await Promise.all([
    prisma.equipment.findMany({
      where: { status: { not: "INACTIVE" } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, type: true, status: true },
    }),
    prisma.project.findMany({
      where: { status: "ACTIVE" },
      orderBy: [{ projectCode: "asc" }, { projectName: "asc" }],
      select: { id: true, projectCode: true, projectName: true },
    }),
    prisma.worker.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, nationality: true },
    }),
  ]);

  const today = new Date();
  const dayStart = new Date(today); dayStart.setHours(0, 0, 0, 0);
  const dayEnd   = new Date(today); dayEnd.setHours(23, 59, 59, 999);

  const rawLogs = await prisma.cuttingLog.findMany({
    where: { startAt: { gte: dayStart, lte: dayEnd } },
    include: {
      equipment: { select: { id: true, name: true, type: true } },
      project:   { select: { projectCode: true, projectName: true } },
    },
    orderBy: { startAt: "desc" },
  });

  const todayLogs = rawLogs.map((l) => ({
    ...l,
    status:    l.status as "STARTED" | "COMPLETED",
    equipment: { ...l.equipment, type: l.equipment.type as string },
    startAt:   l.startAt.toISOString(),
    endAt:     l.endAt?.toISOString() ?? null,
    createdAt: l.createdAt.toISOString(),
    updatedAt: l.updatedAt.toISOString(),
    width:        l.width        ?? null,
    length:       l.length       ?? null,
    qty:          l.qty          ?? null,
    drawingNo:    l.drawingNo    ?? null,
    drawingListId: l.drawingListId ?? null,
  }));

  return (
    <WorklogMain
      equipment={equipment.map((e) => ({ ...e, type: e.type as string, status: e.status as string }))}
      projects={projects}
      workers={workers}
      todayLogs={todayLogs}
    />
  );
}

export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import FieldWorklog from "@/components/field-worklog";

export default async function FieldWorklogPage() {
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
      where: { isCncOp: true },
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
    width:     l.width ?? null, length: l.length ?? null,
    qty:       l.qty   ?? null, drawingNo: l.drawingNo ?? null,
    drawingListId: l.drawingListId ?? null,
  }));

  return (
    <FieldWorklog
      equipment={equipment.map((e) => ({ ...e, type: e.type as string }))}
      projects={projects}
      workers={workers}
      todayLogs={todayLogs}
    />
  );
}

export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import FieldWorklog from "@/components/field-worklog";

export const metadata: Metadata = { title: "현장 작업일보" };

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

  // KST(Asia/Seoul) 기준 오늘 자정~23:59:59.999 — Docker container 가 UTC 라도 안전
  const kstDateStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
  const dayStart = new Date(`${kstDateStr}T00:00:00+09:00`);
  const dayEnd   = new Date(`${kstDateStr}T23:59:59.999+09:00`);

  // /api/cutting-logs 의 includeStuck 와 동일 — 어제 시작해 오늘까지 진행 중인 STARTED 도 포함
  const rawLogs = await prisma.cuttingLog.findMany({
    where: {
      OR: [
        { startAt: { gte: dayStart, lte: dayEnd } },
        { status: "STARTED" },
      ],
    },
    include: {
      equipment: { select: { id: true, name: true, type: true } },
      project:   { select: { projectCode: true, projectName: true } },
      pauses:    { select: { reason: true, reasonText: true, pausedAt: true, resumedAt: true }, orderBy: { pausedAt: "asc" } },
    },
    orderBy: { startAt: "desc" },
  });

  const todayLogs = rawLogs.map((l) => ({
    ...l,
    status:    l.status as "STARTED" | "PAUSED" | "COMPLETED",
    equipment: { ...l.equipment, type: l.equipment.type as string },
    startAt:   l.startAt.toISOString(),
    endAt:     l.endAt?.toISOString() ?? null,
    createdAt: l.createdAt.toISOString(),
    updatedAt: l.updatedAt.toISOString(),
    width:     l.width ?? null, length: l.length ?? null,
    qty:       l.qty   ?? null, drawingNo: l.drawingNo ?? null,
    drawingListId: l.drawingListId ?? null,
    pauses: l.pauses.map((p) => ({
      ...p,
      pausedAt:  p.pausedAt.toISOString(),
      resumedAt: p.resumedAt?.toISOString() ?? null,
    })),
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

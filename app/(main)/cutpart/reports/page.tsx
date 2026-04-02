export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import ReportsMain from "@/components/reports-main";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const params = await searchParams;

  // 기본값: 이번달 1일 ~ 오늘
  const today = new Date();
  const defaultFrom = new Date(today.getFullYear(), today.getMonth(), 1)
    .toISOString()
    .split("T")[0];
  const defaultTo = today.toISOString().split("T")[0];

  const fromStr = params.from ?? defaultFrom;
  const toStr   = params.to   ?? defaultTo;

  const from = new Date(fromStr); from.setHours(0, 0, 0, 0);
  const to   = new Date(toStr);   to.setHours(23, 59, 59, 999);

  const rawLogs = await prisma.cuttingLog.findMany({
    where: {
      status:  "COMPLETED",
      startAt: { gte: from, lte: to },
    },
    include: {
      equipment:   { select: { id: true, name: true, type: true } },
      project:     { select: { projectCode: true, projectName: true } },
      drawingList: { select: { steelWeight: true, useWeight: true } },
    },
    orderBy: { startAt: "asc" },
  });

  const logs = rawLogs.map((l) => ({
    ...l,
    status:    l.status as string,
    equipment: { ...l.equipment, type: l.equipment.type as string },
    startAt:   l.startAt.toISOString(),
    endAt:     l.endAt?.toISOString() ?? null,
    createdAt: l.createdAt.toISOString(),
    updatedAt: l.updatedAt.toISOString(),
    width:         l.width         ?? null,
    length:        l.length        ?? null,
    qty:           l.qty           ?? null,
    drawingNo:     l.drawingNo     ?? null,
    drawingListId: l.drawingListId ?? null,
    steelWeight:   l.drawingList?.steelWeight ?? null,
    useWeight:     l.drawingList?.useWeight   ?? null,
  }));

  return <ReportsMain logs={logs} fromStr={fromStr} toStr={toStr} />;
}

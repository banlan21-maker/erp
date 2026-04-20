/**
 * 절단 작업 보고서 페이지
 *
 * 정규작업(isUrgent=false)과 돌발작업(isUrgent=true) 모두 포함.
 * 기간 필터 적용. 기본값: 이번달 1일 ~ 오늘.
 */
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
  const today       = new Date();
  const defaultFrom = new Date(today.getFullYear(), today.getMonth(), 1)
    .toISOString().split("T")[0];
  const defaultTo   = today.toISOString().split("T")[0];

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
      drawingList: { select: { steelWeight: true, useWeight: true, block: true } },
      urgentWork:  {
        select: {
          urgentNo:   true,
          title:      true,
          requester:  true,
          department: true,
          // 돌발작업 연결 잔재의 W1/L1/W2/L2 (L자형이면 W2/L2 존재)
          remnant: {
            select: { width1: true, length1: true, width2: true, length2: true },
          },
        },
      },
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
    isUrgent:      l.isUrgent,
    urgentNo:      l.urgentWork?.urgentNo  ?? null,
    urgentTitle:   l.urgentWork?.title     ?? null,
    requester:     l.urgentWork?.requester  ?? null,
    department:    l.urgentWork?.department ?? null,
    // 통합 치수 (정규: CuttingLog.width/length, 돌발: remnant.width1/length1/width2/length2)
    dimW1: l.urgentWork?.remnant?.width1  ?? l.width  ?? null,
    dimL1: l.urgentWork?.remnant?.length1 ?? l.length ?? null,
    dimW2: l.urgentWork?.remnant?.width2  ?? null,
    dimL2: l.urgentWork?.remnant?.length2 ?? null,
    // 강재 중량: DrawingList.steelWeight 우선, 없으면 치수로 계산
    steelWeight: (() => {
      const sw = l.drawingList?.steelWeight;
      if (sw != null) return sw;
      if (l.thickness && l.width && l.length) {
        return Math.round(l.thickness * l.width * l.length * 7.85 / 1_000_000 * 100) / 100;
      }
      return null;
    })(),
    useWeight: l.drawingList?.useWeight ?? null,
    block: l.drawingList?.block ?? null,
  }));

  return <ReportsMain logs={logs} fromStr={fromStr} toStr={toStr} />;
}

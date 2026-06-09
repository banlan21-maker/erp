/**
 * 절단 작업 보고서 페이지
 *
 * 정규작업(isUrgent=false)과 돌발작업(isUrgent=true) 모두 포함.
 * 기간 필터 적용. 기본값: 이번달 1일 ~ 오늘.
 */
export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import ReportsMain from "@/components/reports-main";
import { calcPauseMs, calcNightOffMs } from "@/lib/cutting-time";

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
      drawingList: {
        select: {
          steelWeight: true, useWeight: true, block: true,
          assignedRemnant: { select: { width1: true, length1: true, width2: true, length2: true } },
        },
      },
      pauses:      { select: { reason: true, reasonText: true, pausedAt: true, resumedAt: true }, orderBy: { pausedAt: "asc" } },
      urgentWork:  {
        select: {
          urgentNo:   true,
          title:      true,
          requester:  true,
          department: true,
          useWeight:  true,   // 돌발 사용중량 (등록 시 입력)
          // 돌발작업 연결 잔재의 W1/L1/W2/L2 (L자형이면 W2/L2 존재)
          remnant: {
            select: { remnantNo: true, width1: true, length1: true, width2: true, length2: true },
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
    isUrgent:          l.isUrgent,
    urgentNo:          l.urgentWork?.urgentNo   ?? null,
    urgentTitle:       l.urgentWork?.title      ?? null,
    requester:         l.urgentWork?.requester  ?? null,
    department:        l.urgentWork?.department ?? null,
    urgentRemnantNo:   l.urgentWork?.remnant?.remnantNo ?? null,
    // 통합 치수: 돌발→urgentWork.remnant, 등록잔재정규→drawingList.assignedRemnant, 일반→CuttingLog.width/length
    dimW1: l.urgentWork?.remnant?.width1  ?? l.drawingList?.assignedRemnant?.width1  ?? l.width  ?? null,
    dimL1: l.urgentWork?.remnant?.length1 ?? l.drawingList?.assignedRemnant?.length1 ?? l.length ?? null,
    dimW2: l.urgentWork?.remnant?.width2  ?? l.drawingList?.assignedRemnant?.width2  ?? null,
    dimL2: l.urgentWork?.remnant?.length2 ?? l.drawingList?.assignedRemnant?.length2 ?? null,
    // 강재 중량: DrawingList.steelWeight 우선, 없으면 (W1×L1 - W2×L2) × T × 7.85
    steelWeight: (() => {
      const sw = l.drawingList?.steelWeight;
      if (sw != null) return sw;
      // 돌발: urgentWork.remnant 치수, 정규잔재: drawingList.assignedRemnant, 일반: width/length
      const w1 = l.urgentWork?.remnant?.width1  ?? l.drawingList?.assignedRemnant?.width1  ?? l.width;
      const l1 = l.urgentWork?.remnant?.length1 ?? l.drawingList?.assignedRemnant?.length1 ?? l.length;
      const w2 = l.urgentWork?.remnant?.width2  ?? l.drawingList?.assignedRemnant?.width2  ?? null;
      const l2 = l.urgentWork?.remnant?.length2 ?? l.drawingList?.assignedRemnant?.length2 ?? null;
      if (l.thickness && w1 && l1) {
        const area = w1 * l1 - (w2 ?? 0) * (l2 ?? 0);
        return Math.round(l.thickness * area * 7.85 / 1_000_000 * 100) / 100;
      }
      return null;
    })(),
    // 사용중량 — 돌발은 UrgentWork.useWeight, 정규는 DrawingList.useWeight
    useWeight: l.urgentWork?.useWeight ?? l.drawingList?.useWeight ?? null,
    block: l.drawingList?.block ?? null,
    pauses: l.pauses.map((p) => ({
      ...p,
      pausedAt:  p.pausedAt.toISOString(),
      resumedAt: p.resumedAt?.toISOString() ?? null,
    })),
    // 중단시간 — 일반 중단 합 (퇴근/야간이월 제외)
    pauseMs: calcPauseMs(l.pauses),
    // 야간이월시간 — 총가동시간 계산에서 빼낼 용도
    nightOffMs: calcNightOffMs(l.pauses),
  }));

  return <ReportsMain logs={logs} fromStr={fromStr} toStr={toStr} />;
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * GET /api/schedules/gantt
 * 간트차트용 데이터: 스케줄 + 작업일보 실적 조인
 * 완료율 = 작업일보 useWeight 합 ÷ DrawingList 총 useWeight × 100
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const includeArchive  = searchParams.get("includeArchive") === "true";
    const includeCompleted = searchParams.get("includeCompleted") === "true";

    const statusFilter = includeArchive
      ? {}
      : includeCompleted
        ? { status: { not: "CANCELLED" as const } }
        : { status: { notIn: ["CANCELLED", "COMPLETED"] as ("CANCELLED" | "COMPLETED")[] } };

    const schedules = await prisma.cncSchedule.findMany({
      where: statusFilter,
      include: {
        project: {
          select: {
            id: true,
            projectCode: true,
            projectName: true,
            drawingLists: {
              select: {
                id: true,
                useWeight: true,
                steelWeight: true,
                status: true,
              },
            },
            cuttingLogs: {
              where: { status: "COMPLETED" },
              select: {
                id: true,
                startAt: true,
                endAt: true,
                operator: true,
                equipment: { select: { id: true, name: true } },
              },
              orderBy: { startAt: "asc" },
            },
          },
        },
      },
      orderBy: [{ priority: "asc" }, { plannedStart: "asc" }],
    });

    const ganttData = schedules.map(s => {
      const drawings     = s.project?.drawingLists ?? [];
      const cuttingLogs  = s.project?.cuttingLogs  ?? [];

      // 총 중량 (useWeight 우선, 없으면 steelWeight)
      const totalWeight = drawings.reduce((sum, d) =>
        sum + (d.useWeight ?? d.steelWeight ?? 0), 0
      );

      // 완료된 강재 중량 합계 (CUT 상태 도면의 useWeight)
      const cutWeight = drawings
        .filter(d => d.status === "CUT")
        .reduce((sum, d) => sum + (d.useWeight ?? d.steelWeight ?? 0), 0);

      const completionRate = totalWeight > 0
        ? Math.min(100, Math.round((cutWeight / totalWeight) * 100))
        : 0;

      // 실제 착수일 / 완료일 (작업일보 기준)
      const actualStart = cuttingLogs.length > 0
        ? cuttingLogs[0].startAt.toISOString()
        : null;
      const completedLogs = cuttingLogs.filter(l => l.endAt);
      const actualEnd = completedLogs.length > 0
        ? completedLogs[completedLogs.length - 1].endAt!.toISOString()
        : null;

      // 지연일수 (완료율 100% 미만이고 계획 완료일 지난 경우)
      let delayDays: number | null = null;
      if (s.plannedEnd && completionRate < 100) {
        const diff = Math.floor(
          (Date.now() - new Date(s.plannedEnd).getTime()) / 86400000
        );
        if (diff > 0) delayDays = diff;
      } else if (s.plannedEnd && actualEnd && completionRate === 100) {
        const diff = Math.floor(
          (new Date(actualEnd).getTime() - new Date(s.plannedEnd).getTime()) / 86400000
        );
        delayDays = diff; // 음수면 단축
      }

      return {
        id:               s.id,
        vesselCode:       s.vesselCode,
        blockName:        s.blockName,
        projectId:        s.projectId,
        plannedStart:     s.plannedStart?.toISOString()     ?? null,
        plannedEnd:       s.plannedEnd?.toISOString()       ?? null,
        deliveryFactory:  s.deliveryFactory?.toISOString()  ?? null,
        deliveryAssembly: s.deliveryAssembly?.toISOString() ?? null,
        workType:         s.workType,
        status:           s.status,
        holdReason:       s.holdReason,
        priority:         s.priority,
        memo:             s.memo,
        // 실적
        actualStart,
        actualEnd,
        completionRate,
        totalWeight,
        cutWeight,
        delayDays,
        logCount:         cuttingLogs.length,
      };
    });

    return NextResponse.json({ success: true, data: ganttData });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

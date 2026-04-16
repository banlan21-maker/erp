import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * GET /api/schedules/gantt
 *
 * 간트차트용 스케줄 데이터 반환.
 *
 * ── 완료율 계산 ──────────────────────────────────────────────────────────────
 * 완료율 = CUT 상태 DrawingList의 중량 합 ÷ 전체 DrawingList 중량 합 × 100
 * (useWeight 우선, 없으면 steelWeight 사용)
 *
 * ── 스케줄 ↔ 절단 작업일보 연결 ────────────────────────────────────────────
 * 절단 작업일보(CuttingLog)와의 직접 연결은 제거됨.
 * 완료율은 DrawingList.status("CUT") 기준으로만 계산.
 * 차후 절단파트 전체가 안정화되면 실적(actualStart/actualEnd) 연동 재검토 예정.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams }  = new URL(request.url);
    const includeArchive    = searchParams.get("includeArchive")   === "true";
    const includeCompleted  = searchParams.get("includeCompleted") === "true";

    // 상태 필터: 기본값은 CANCELLED·COMPLETED 제외
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
            // DrawingList 상태만 포함 (절단 실적 직접 연결 제거)
            drawingLists: {
              select: {
                id: true,
                useWeight:   true,
                steelWeight: true,
                status:      true,
              },
            },
          },
        },
      },
      orderBy: [{ priority: "asc" }, { plannedStart: "asc" }],
    });

    const ganttData = schedules.map(s => {
      const drawings = s.project?.drawingLists ?? [];

      // ── 중량 집계 (useWeight 우선, 없으면 steelWeight) ──────────────────────
      const totalWeight = drawings.reduce(
        (sum, d) => sum + (d.useWeight ?? d.steelWeight ?? 0), 0
      );
      const cutWeight = drawings
        .filter(d => d.status === "CUT")
        .reduce((sum, d) => sum + (d.useWeight ?? d.steelWeight ?? 0), 0);

      // ── 완료율 (0~100%) ────────────────────────────────────────────────────
      const completionRate = totalWeight > 0
        ? Math.min(100, Math.round((cutWeight / totalWeight) * 100))
        : 0;

      // ── 지연일수 (계획 완료일 경과 & 미완료인 경우 양수, 단축 시 음수) ─────
      let delayDays: number | null = null;
      if (s.plannedEnd && completionRate < 100) {
        const diff = Math.floor((Date.now() - new Date(s.plannedEnd).getTime()) / 86400000);
        if (diff > 0) delayDays = diff;
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
        // 실적 (차후 절단파트 안정화 후 재연동 예정)
        actualStart:      null,
        actualEnd:        null,
        completionRate,
        totalWeight,
        cutWeight,
        delayDays,
        logCount:         0,
      };
    });

    return NextResponse.json({ success: true, data: ganttData });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

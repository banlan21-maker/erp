/**
 * POST /api/steel-plan/sync
 *
 * 강재 상태를 현재 작업일보(CuttingLog) 기준으로 자동 동기화.
 *
 * ── 동기화 규칙 ──────────────────────────────────────────────────────────────
 * [SteelPlan]
 *   COMPLETED 상태인데 actualHeatNo가 활성 작업일보(COMPLETED CuttingLog)에
 *   존재하지 않으면 → RECEIVED로 복원 + actual* 필드 초기화
 *
 * [SteelPlanHeat]
 *   CUT 상태인데 해당 heatNo로 완료된 작업일보가 없으면 → WAITING으로 복원
 *
 * ── 호출 시점 ─────────────────────────────────────────────────────────────────
 * 강재입고관리 새로고침 버튼 클릭 시 자동 실행.
 * 작업일보 삭제 후 강재 상태가 자동 복원되지 않은 경우를 자동으로 수정.
 */

export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST() {
  try {
    // ── 현재 활성 작업일보의 heatNo 목록 (COMPLETED 상태) ──────────────────
    // 이 목록에 있는 heatNo는 실제로 사용 중이므로 COMPLETED 상태가 정당함
    const activeLogs = await prisma.cuttingLog.findMany({
      where:  { status: "COMPLETED", heatNo: { not: "" } },
      select: { heatNo: true },
    });
    const activeHeatNos = new Set(activeLogs.map(l => l.heatNo.trim()).filter(Boolean));

    // ── SteelPlan 동기화 ────────────────────────────────────────────────────
    // COMPLETED 상태인데 actualHeatNo가 활성 작업일보에 없으면 → RECEIVED 복원
    const orphanedPlans = await prisma.steelPlan.findMany({
      where:  { status: "COMPLETED", actualHeatNo: { not: null } },
      select: { id: true, actualHeatNo: true },
    });

    const planIdsToRevert = orphanedPlans
      .filter(p => p.actualHeatNo && !activeHeatNos.has(p.actualHeatNo.trim()))
      .map(p => p.id);

    let revertedPlans = 0;
    if (planIdsToRevert.length > 0) {
      const result = await prisma.steelPlan.updateMany({
        where: { id: { in: planIdsToRevert } },
        data:  {
          status:           "RECEIVED",
          actualHeatNo:     null,
          actualVesselCode: null,
          actualDrawingNo:  null,
        },
      });
      revertedPlans = result.count;
    }

    // actualHeatNo가 null인데 COMPLETED인 이상한 케이스도 복원
    const noHeatPlans = await prisma.steelPlan.updateMany({
      where: { status: "COMPLETED", actualHeatNo: null },
      data:  { status: "RECEIVED" },
    });

    // ── SteelPlanHeat 동기화 ───────────────────────────────────────────────
    // CUT 상태인데 해당 heatNo로 완료된 작업일보가 없으면 → WAITING 복원
    const cutHeats = await prisma.steelPlanHeat.findMany({
      where:  { status: "CUT" },
      select: { id: true, heatNo: true },
    });

    const heatIdsToRevert = cutHeats
      .filter(h => !activeHeatNos.has(h.heatNo.trim()))
      .map(h => h.id);

    let revertedHeats = 0;
    if (heatIdsToRevert.length > 0) {
      const result = await prisma.steelPlanHeat.updateMany({
        where: { id: { in: heatIdsToRevert } },
        data:  { status: "WAITING" },
      });
      revertedHeats = result.count;
    }

    return NextResponse.json({
      success: true,
      revertedPlans:  revertedPlans + noHeatPlans.count,
      revertedHeats,
    });
  } catch (error) {
    console.error("[POST /api/steel-plan/sync]", error);
    return NextResponse.json(
      { success: false, error: "동기화 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

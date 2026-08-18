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
import { syncDrawingListBySpecs } from "@/lib/sync-drawing-spec";

export async function POST() {
  try {
    // ── 현재 활성 작업일보의 '소진 근거' 수집 (COMPLETED 상태) ──────────────
    // 이 목록에 있으면 실제로 사용 중이므로 COMPLETED/CUT 상태가 정당하다.
    //
    // ⚠ 예전에는 **작업일보의 heatNo 문자열만** 봤다. 그런데 그 문자열은 현장에서 손으로 적은
    //   값이라 틀릴 수 있고(옆 호선 판번호 오기 등), 그때 실제로 소진한 판은 `consumedHeatId`
    //   에 정확히 기록된다(스키마 주석: "절단완료 시 '실제로' 소진한 판번호 id").
    //   문자열만 보면 → 손으로 교정해 둔 판번호가 [새로고침] 한 번에 대기로 되돌아가고
    //   절단일(cutAt)까지 지워진다. 실제로 2026-08-18 교정한 B56848103 이 그렇게 취소됐다.
    //   → consumedHeatId 로 연결된 판번호도 '근거 있음'으로 인정한다. (2026-08-18)
    const activeLogs = await prisma.cuttingLog.findMany({
      where:  { status: "COMPLETED" },
      select: { heatNo: true, consumedHeatId: true },
    });
    const activeHeatNos = new Set(activeLogs.map(l => (l.heatNo ?? "").trim()).filter(Boolean));
    const consumedHeatIds = new Set(activeLogs.map(l => l.consumedHeatId).filter((x): x is string => !!x));
    // consumedHeatId 로 지목된 판번호의 heatNo 도 '근거 있는 문자열'로 취급 (SteelPlan.actualHeatNo 대조용)
    if (consumedHeatIds.size > 0) {
      const consumed = await prisma.steelPlanHeat.findMany({
        where: { id: { in: [...consumedHeatIds] } }, select: { heatNo: true },
      });
      for (const h of consumed) { const v = (h.heatNo ?? "").trim(); if (v) activeHeatNos.add(v); }
    }

    // ── SteelPlan 동기화 ────────────────────────────────────────────────────
    // COMPLETED 상태인데 actualHeatNo가 활성 작업일보에 없으면 → RECEIVED 복원
    // sync 호출용 spec 도 함께 수집
    const orphanedPlans = await prisma.steelPlan.findMany({
      where:  { status: "COMPLETED", actualHeatNo: { not: null } },
      select: {
        id: true, actualHeatNo: true,
        vesselCode: true, material: true, thickness: true, width: true, length: true,
      },
    });

    const toRevert = orphanedPlans
      .filter(p => p.actualHeatNo && !activeHeatNos.has(p.actualHeatNo.trim()));
    const planIdsToRevert = toRevert.map(p => p.id);
    const revertedSpecs = toRevert.map(p => ({
      vesselCode: p.vesselCode, material: p.material,
      thickness:  p.thickness, width: p.width, length: p.length,
    }));

    let revertedPlans = 0;
    if (planIdsToRevert.length > 0) {
      const result = await prisma.steelPlan.updateMany({
        where: { id: { in: planIdsToRevert } },
        data:  {
          status:           "RECEIVED",
          actualHeatNo:     null,
          actualVesselCode: null,
          actualDrawingNo:  null,
          archivedAt:       null, // 숨김 해제 — 재고로 되돌리면서 도장을 남기면 유령 재고가 된다
        },
      });
      revertedPlans = result.count;
    }

    // actualHeatNo가 null인데 COMPLETED인 케이스 복원.
    //
    // ⚠ issuedAt 이 있으면 건드리지 않는다 — 2026-08-18 발견:
    //   유령 확정 사후정리처럼 **손으로 절단완료 처리한 강재**는 status·issuedAt 만 세팅하고
    //   actualHeatNo 는 비어 있다(소진 근거가 판번호가 아니라 사람 판단이라). 그런데 이 규칙이
    //   그걸 무조건 RECEIVED 로 되돌려, 강재입고관리 [새로고침] 한 번에 교정이 조용히 취소됐다.
    //   실제로 2026-07-21 교정한 4장 중 살아있던 1장(KYTS-1022/S70PS)이 이렇게 되돌아왔고,
    //   정합성 진단 H 가 그걸 다시 잡아냈다. issuedAt = '절단완료 처리를 실제로 거쳤다'는 흔적이므로
    //   그게 있으면 정상 완료로 보고 남긴다. 잘못된 건이면 진단 H·D 가 별도로 띄운다.
    const noHeatWhere = { status: "COMPLETED" as const, actualHeatNo: null, issuedAt: null };
    const noHeatPlanRecords = await prisma.steelPlan.findMany({
      where: noHeatWhere,
      select: { vesselCode: true, material: true, thickness: true, width: true, length: true },
    });
    revertedSpecs.push(...noHeatPlanRecords);
    const noHeatPlans = await prisma.steelPlan.updateMany({
      where: noHeatWhere,
      data:  { status: "RECEIVED", archivedAt: null },
    });

    // ── SteelPlanHeat 동기화 ───────────────────────────────────────────────
    // CUT 상태인데 해당 heatNo로 완료된 작업일보가 없으면 → WAITING 복원
    const cutHeats = await prisma.steelPlanHeat.findMany({
      where:  { status: "CUT" },
      select: { id: true, heatNo: true },
    });

    // consumedHeatId 로 정확히 지목된 판은 문자열이 안 맞아도 근거가 있다 → 되돌리지 않는다
    const heatIdsToRevert = cutHeats
      .filter(h => !consumedHeatIds.has(h.id) && !activeHeatNos.has(h.heatNo.trim()))
      .map(h => h.id);

    let revertedHeats = 0;
    if (heatIdsToRevert.length > 0) {
      const result = await prisma.steelPlanHeat.updateMany({
        where: { id: { in: heatIdsToRevert } },
        data:  { status: "WAITING", cutAt: null, archivedAt: null },
      });
      revertedHeats = result.count;
    }

    // ── DrawingList 자동 재계산 — 복원된 spec 들에 대해 sync ──────────────
    // SteelPlan 풀이 늘어났으므로 동일 spec DrawingList 가 REGISTERED → WAITING
    // 으로 자동 승격되어야 함
    if (revertedSpecs.length > 0) {
      await syncDrawingListBySpecs(revertedSpecs);
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

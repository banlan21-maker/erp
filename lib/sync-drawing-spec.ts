/**
 * DrawingList 상태 동기화 유틸
 *
 * 용도: 절단 작업 완료 or 취소 시, 해당 스펙(재질+두께+폭+길이)의
 *       모든 DrawingList 상태를 SteelPlan 확정 수량에 맞게 재계산.
 *
 * ── 상태 규칙 ────────────────────────────────────────────────────────────────
 * SteelPlan.reservedFor = "호선/블록" → 해당 DrawingList WAITING
 * 확정 수량 초과분 → REGISTERED
 * (CAUTION·CUT 상태는 건드리지 않음)
 *
 * ── reservedFor 형식 ─────────────────────────────────────────────────────────
 * 신규: "1022/S80PS" (projectCode/block)
 * 구형(legacy): "S80PS" (block만)
 *
 * ── 호출 시점 ────────────────────────────────────────────────────────────────
 * - 절단 완료(PATCH action="complete"): 완료 후
 * - 절단 삭제(DELETE): 삭제 후
 * - 강재 입고 확정(steel-plan/receive): 입고 처리 후
 */

import { prisma } from "@/lib/prisma";

export async function syncDrawingListBySpec(
  projectVesselCode: string,  // 사용하는 프로젝트의 호선 코드
  material:          string,
  thickness:         number,
  width:             number,
  length:            number,
) {
  // ── 해당 호선의 프로젝트 ID 목록 ─────────────────────────────────────────
  const projects = await prisma.project.findMany({
    where:  { projectCode: projectVesselCode },
    select: { id: true },
  });
  if (projects.length === 0) return;

  // ── 동기화 대상 DrawingList 조회 (CAUTION·CUT 제외) ──────────────────────
  const rows = await prisma.drawingList.findMany({
    where: {
      projectId: { in: projects.map((p) => p.id) },
      material, thickness, width, length,
      NOT: { status: { in: ["CAUTION", "CUT"] } },
    },
    orderBy: { createdAt: "asc" },
    select:  { id: true, block: true },
  });

  // ── 블록별 그룹화 ─────────────────────────────────────────────────────────
  const byBlock = new Map<string, string[]>();
  for (const row of rows) {
    const blockCode = row.block ?? "UNKNOWN";
    if (!byBlock.has(blockCode)) byBlock.set(blockCode, []);
    byBlock.get(blockCode)!.push(row.id);
  }

  // ── 블록별 확정 수량 기준으로 WAITING/REGISTERED 결정 ────────────────────
  const toWaiting:    string[] = [];
  const toRegistered: string[] = [];

  for (const [blockCode, ids] of byBlock) {
    // 신규 형식: "projectVesselCode/blockCode" (어느 호선 철판이든 상관없이 매칭)
    const newFmt = `${projectVesselCode}/${blockCode}`;
    const confirmedNew = await prisma.steelPlan.count({
      where: { material, thickness, width, length, reservedFor: newFmt },
    });
    // 구형 형식(legacy): 블록코드만, 같은 vesselCode
    const confirmedOld = confirmedNew === 0
      ? await prisma.steelPlan.count({
          where: { vesselCode: projectVesselCode, material, thickness, width, length, reservedFor: blockCode },
        })
      : 0;

    const confirmedCount = confirmedNew + confirmedOld;
    toWaiting.push(...ids.slice(0, confirmedCount));
    toRegistered.push(...ids.slice(confirmedCount));
  }

  // ── 일괄 업데이트 ─────────────────────────────────────────────────────────
  if (toWaiting.length > 0)
    await prisma.drawingList.updateMany({ where: { id: { in: toWaiting } },    data: { status: "WAITING"    } });
  if (toRegistered.length > 0)
    await prisma.drawingList.updateMany({ where: { id: { in: toRegistered } }, data: { status: "REGISTERED" } });
}

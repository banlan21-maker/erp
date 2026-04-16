/**
 * DrawingList 상태 동기화 유틸
 *
 * 용도: 절단 작업 완료 or 취소 시, 해당 스펙(재질+두께+폭+길이)의
 *       모든 DrawingList 상태를 SteelPlan 확정 수량에 맞게 재계산.
 *
 * ── 상태 규칙 ────────────────────────────────────────────────────────────────
 * SteelPlan.status = RECEIVED & reservedFor = 블록코드  →  해당 DrawingList WAITING
 * 확정 수량 초과분  →  REGISTERED
 * (CAUTION·CUT 상태는 건드리지 않음)
 *
 * ── 호출 시점 ────────────────────────────────────────────────────────────────
 * - 절단 완료(PATCH action="complete"): SteelPlan COMPLETED 처리 후
 * - 절단 삭제(DELETE): SteelPlan RECEIVED 복원 후
 * - 강재 입고 확정(steel-plan/receive): 입고 처리 후
 */

import { prisma } from "@/lib/prisma";

export async function syncDrawingListBySpec(
  vesselCode: string,
  material:   string,
  thickness:  number,
  width:      number,
  length:     number,
) {
  // ── 해당 호선(vesselCode)의 프로젝트 ID 목록 ──────────────────────────────
  const projects = await prisma.project.findMany({
    where:  { projectCode: vesselCode },
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

  // ── 블록별 확정 수량(RECEIVED + reservedFor) 기준으로 WAITING/REGISTERED 결정
  const toWaiting:    string[] = [];
  const toRegistered: string[] = [];

  for (const [blockCode, ids] of byBlock) {
    // 해당 블록에 확정된 SteelPlan 수량
    const confirmedCount = await prisma.steelPlan.count({
      where: { vesselCode, material, thickness, width, length, status: "RECEIVED", reservedFor: blockCode },
    });
    // 확정 수량만큼 WAITING, 나머지 REGISTERED
    toWaiting.push(...ids.slice(0, confirmedCount));
    toRegistered.push(...ids.slice(confirmedCount));
  }

  // ── 일괄 업데이트 ─────────────────────────────────────────────────────────
  if (toWaiting.length > 0)
    await prisma.drawingList.updateMany({ where: { id: { in: toWaiting } },    data: { status: "WAITING"    } });
  if (toRegistered.length > 0)
    await prisma.drawingList.updateMany({ where: { id: { in: toRegistered } }, data: { status: "REGISTERED" } });
}

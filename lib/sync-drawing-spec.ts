import { prisma } from "@/lib/prisma";

/**
 * 특정 스펙(vesselCode + 재질/두께/폭/길이)의 DrawingList 상태 동기화
 * 확정(reservedFor)된 블록 → WAITING, 미확정 블록 → REGISTERED
 */
export async function syncDrawingListBySpec(
  vesselCode: string,
  material: string,
  thickness: number,
  width: number,
  length: number,
) {
  const projects = await prisma.project.findMany({
    where: { projectCode: vesselCode },
    select: { id: true },
  });
  if (projects.length === 0) return;

  const rows = await prisma.drawingList.findMany({
    where: {
      projectId: { in: projects.map((p) => p.id) },
      material, thickness, width, length,
      NOT: { status: { in: ["CAUTION", "CUT"] } },
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, block: true },
  });

  const byBlock = new Map<string, string[]>();
  for (const row of rows) {
    const blockCode = row.block ?? "UNKNOWN";
    if (!byBlock.has(blockCode)) byBlock.set(blockCode, []);
    byBlock.get(blockCode)!.push(row.id);
  }

  const toWaiting: string[] = [];
  const toRegistered: string[] = [];

  for (const [blockCode, ids] of byBlock) {
    const confirmedCount = await prisma.steelPlan.count({
      where: { vesselCode, material, thickness, width, length, status: "RECEIVED", reservedFor: blockCode },
    });
    toWaiting.push(...ids.slice(0, confirmedCount));
    toRegistered.push(...ids.slice(confirmedCount));
  }

  if (toWaiting.length > 0)
    await prisma.drawingList.updateMany({ where: { id: { in: toWaiting } }, data: { status: "WAITING" } });
  if (toRegistered.length > 0)
    await prisma.drawingList.updateMany({ where: { id: { in: toRegistered } }, data: { status: "REGISTERED" } });
}

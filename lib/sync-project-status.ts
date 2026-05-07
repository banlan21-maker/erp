/**
 * 블록(Project) 완료 상태 자동 동기화
 *
 * 호출 시점:
 *   - 절단 완료(PATCH action="complete") 후
 *   - 작업일보 삭제(DELETE) 후
 *
 * 규칙:
 *   해당 projectId의 DrawingList 전체가 모두 CUT → Project.status = COMPLETED
 *   하나라도 CUT이 아닌 항목 존재 → Project.status = ACTIVE
 *   DrawingList가 아예 없으면 → 변경 없음 (미등록 블록은 건드리지 않음)
 */

import { prisma } from "@/lib/prisma";

export async function syncProjectStatus(projectId: string): Promise<void> {
  const rows = await prisma.drawingList.findMany({
    where:  { projectId },
    select: { status: true },
  });

  // 강재리스트가 없는 블록은 완료 판정하지 않음
  if (rows.length === 0) return;

  const allCut = rows.every((r) => r.status === "CUT");

  await prisma.project.update({
    where: { id: projectId },
    data:  { status: allCut ? "COMPLETED" : "ACTIVE" },
  });
}

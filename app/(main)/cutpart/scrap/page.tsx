export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import ScrapMain from "@/components/scrap-main";

export default async function ScrapPage() {
  const [projects, remnants] = await Promise.all([
    prisma.project.findMany({
      orderBy: [{ projectCode: "asc" }, { projectName: "asc" }],
      select: { id: true, projectCode: true, projectName: true },
    }),
    prisma.remnant.findMany({
      where: { status: "IN_STOCK", reservedFor: null },   // 미확정(미선점) 잔재만 — 돌발 사용 선택용
      orderBy: { remnantNo: "asc" },
      select: { id: true, remnantNo: true, type: true, material: true, thickness: true, weight: true, heatNo: true, needsConsult: true },
    }),
  ]);

  return <ScrapMain projects={projects} remnants={remnants} />;
}

export const dynamic = "force-dynamic";

import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import UrgentMain from "@/components/urgent-main";

export default async function UrgentPage() {
  const [projects, remnants] = await Promise.all([
    prisma.project.findMany({
      orderBy: [{ projectCode: "asc" }],
      select: { id: true, projectCode: true, projectName: true },
    }),
    prisma.remnant.findMany({
      where: { status: "IN_STOCK", reservedFor: null },   // 이미 확정(선점)된 잔재는 선택 목록에서 제외
      orderBy: { remnantNo: "asc" },
      select: { id: true, remnantNo: true, type: true, shape: true, material: true, thickness: true, width1: true, length1: true, weight: true, location: true, needsConsult: true },
    }),
  ]);

  return (
    <Suspense>
      <UrgentMain projects={projects} remnants={remnants} />
    </Suspense>
  );
}

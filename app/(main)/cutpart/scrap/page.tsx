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
      where: { status: "IN_STOCK" },
      orderBy: { remnantNo: "asc" },
      select: { id: true, remnantNo: true, material: true, thickness: true, weight: true, needsConsult: true },
    }),
  ]);

  return <ScrapMain projects={projects} remnants={remnants} />;
}

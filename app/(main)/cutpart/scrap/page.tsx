export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import ScrapMain from "@/components/scrap-main";

export default async function ScrapPage() {
  const projects = await prisma.project.findMany({
    orderBy: [{ projectCode: "asc" }, { projectName: "asc" }],
    select: { id: true, projectCode: true, projectName: true },
  });

  return <ScrapMain projects={projects} />;
}

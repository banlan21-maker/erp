export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import ScrapMain from "@/components/scrap-main";

export default async function ScrapPage() {
  const [projects, remnants] = await Promise.all([
    prisma.project.findMany({
      orderBy: [{ projectCode: "asc" }, { projectName: "asc" }],
      select: { id: true, projectCode: true, projectName: true },
    }),
    // 돌발작업 사용 강재 후보 — 실물이 있고(IN_STOCK, 발생예정 제외) 다른 곳에 안 잡혔고
    // 외부출고로 선별되지도 않은 잔재만. 선택 모달이 재질·두께·폭·길이·위치·중량을 표로
    // 보여주고 검색까지 하므로 치수 컬럼을 모두 내려준다.
    prisma.remnant.findMany({
      where: { status: "IN_STOCK", reservedFor: null, shipoutMarkedAt: null },
      orderBy: { remnantNo: "asc" },
      select: {
        id: true, remnantNo: true, type: true, shape: true,
        material: true, thickness: true,
        width1: true, length1: true, width2: true, length2: true,
        weight: true, location: true, heatNo: true,
      },
    }),
  ]);

  return <ScrapMain projects={projects} remnants={remnants} />;
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/drawings/availability?projectId=xxx
// 해당 프로젝트 호선의 스펙별 미확정(선점 가능) 입고 수량 반환
// 반환: { [스펙키]: number }  예) { "AH36|14|1950|8400": 3 }
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  if (!projectId) {
    return NextResponse.json({ success: false, error: "projectId가 필요합니다." }, { status: 400 });
  }

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) {
    return NextResponse.json({ success: false, data: {} });
  }

  // 이 프로젝트의 고유 스펙 목록
  const specs = await prisma.drawingList.findMany({
    where: { projectId },
    select: { material: true, thickness: true, width: true, length: true },
    distinct: ["material", "thickness", "width", "length"],
  });

  const result: Record<string, number> = {};
  for (const s of specs) {
    const key = `${s.material}|${s.thickness}|${s.width}|${s.length}`;
    result[key] = await prisma.steelPlan.count({
      where: {
        vesselCode: project.projectCode,
        material: s.material,
        thickness: s.thickness,
        width: s.width,
        length: s.length,
        status: "RECEIVED",
        reservedFor: null,
      },
    });
  }

  return NextResponse.json({ success: true, data: result });
}

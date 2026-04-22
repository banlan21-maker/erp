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

  // 이 프로젝트의 고유 스펙 목록 (행별 대체호선 포함)
  const rows = await prisma.drawingList.findMany({
    where: { projectId },
    select: { material: true, thickness: true, width: true, length: true, alternateVesselCode: true },
  });

  // 스펙별로 그룹화 (키: "material|thickness|width|length")
  // 같은 스펙이라도 대체호선이 다를 수 있으므로 행별로 steelVessel 결정
  const result: Record<string, number> = {};
  for (const r of rows) {
    const steelVessel = r.alternateVesselCode?.trim() || project.projectCode;
    const key = `${r.material}|${r.thickness}|${r.width}|${r.length}|${steelVessel}`;
    if (key in result) continue; // 이미 계산됨
    result[key] = await prisma.steelPlan.count({
      where: {
        vesselCode: steelVessel,
        material: r.material,
        thickness: r.thickness,
        width: r.width,
        length: r.length,
        status: "RECEIVED",
        reservedFor: null,
      },
    });
  }

  return NextResponse.json({ success: true, data: result });
}

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

  // 이 프로젝트의 스펙+대체호선 목록
  const rows = await prisma.drawingList.findMany({
    where: { projectId },
    select: { material: true, thickness: true, width: true, length: true, alternateVesselCode: true },
  });

  // 스펙+대체호선 조합별로 유니크 집합
  const specMap = new Map<string, { material: string; thickness: number; width: number; length: number; steelVessel: string }>();
  for (const r of rows) {
    const steelVessel = r.alternateVesselCode?.trim() || project.projectCode;
    const key = `${r.material}|${r.thickness}|${r.width}|${r.length}|${steelVessel}`;
    if (!specMap.has(key)) specMap.set(key, { material: r.material, thickness: r.thickness, width: r.width, length: r.length, steelVessel });
  }

  const result: Record<string, number> = {};
  for (const [key, s] of specMap) {
    // key에서 steelVessel 제거한 스펙키 (UI에서 조회용)
    const specKey = `${s.material}|${s.thickness}|${s.width}|${s.length}|${s.steelVessel}`;
    result[specKey] = await prisma.steelPlan.count({
      where: {
        vesselCode: s.steelVessel,
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

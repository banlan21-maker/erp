import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// 재질 정규화: 공백 제거 + 소문자 (업로드 매칭 로직과 동일)
const norm = (s: string) => s.trim().toLowerCase();

// GET /api/drawings/availability?projectId=xxx
// 해당 프로젝트 호선의 스펙별 미확정(선점 가능) 입고 수량 반환
// 반환: { [스펙키]: number }  예) { "AH36|14|1950|8400|1022": 3 }
// 주의: 키는 프론트엔드와 동일하게 DrawingList.material 원본값을 사용하되,
//       철판 매칭은 trim+lowercase 관대 비교로 수행 (공백/대소문자 불일치 방지)
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

  // 매칭 대상 호선 목록 (기본 프로젝트 호선 + 행별 대체호선)
  const vessels = new Set<string>();
  for (const r of rows) {
    vessels.add(r.alternateVesselCode?.trim() || project.projectCode);
  }
  if (vessels.size === 0) {
    return NextResponse.json({ success: true, data: {} });
  }

  // 후보 철판 (RECEIVED + 미예약 + 출고예정 아님) — 한 번에 조회 후 JS에서 관대 매칭
  // 출고 선별/예정(shipoutMarkedAt)된 강재는 절단 가용에서 제외 (절단↔출고 상호배제)
  const plates = await prisma.steelPlan.findMany({
    where: {
      vesselCode: { in: [...vessels] },
      status: "RECEIVED",
      reservedFor: null,
      shipoutMarkedAt: null,
    },
    select: { vesselCode: true, material: true, thickness: true, width: true, length: true },
  });

  const result: Record<string, number> = {};
  for (const r of rows) {
    const steelVessel = r.alternateVesselCode?.trim() || project.projectCode;
    const key = `${r.material}|${r.thickness}|${r.width}|${r.length}|${steelVessel}`;
    if (key in result) continue; // 이미 계산됨
    result[key] = plates.filter(
      (p) =>
        p.vesselCode === steelVessel &&
        norm(p.material) === norm(r.material) &&
        p.thickness === r.thickness &&
        p.width === r.width &&
        p.length === r.length
    ).length;
  }

  return NextResponse.json({ success: true, data: result });
}

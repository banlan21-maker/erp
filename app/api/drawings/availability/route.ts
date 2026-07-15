import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// 재질 정규화: 공백 제거 + 소문자 (업로드 매칭 로직과 동일)
const norm = (s: string) => s.trim().toLowerCase();

// GET /api/drawings/availability?projectId=xxx
// 해당 프로젝트 호선의 스펙별 미확정(선점 가능) 입고 수량 반환
//
// 반환:
//   data: { [스펙키]: number }  하위호환 (사용 가능 자재 수)
//   detail: { [스펙키]: { available, reservedElsewhere, shipoutMarked } }
//     · available          — 실제 확정 가능 강재 수 (RECEIVED + 미예약 + 미선별)
//     · reservedElsewhere  — RECEIVED 이나 다른 블록에 이미 확정된 강재 수
//     · shipoutMarked      — RECEIVED 이나 외부출고로 선별된 강재 수 (사용 불가 이유 표시용, N6)
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
    return NextResponse.json({ success: false, data: {}, detail: {} });
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
    return NextResponse.json({ success: true, data: {}, detail: {} });
  }

  // 후보 철판을 상태별로 한 번에 로드 (같은 vessel/spec 조회 3회 대신 1회 조회 후 JS 파티션)
  const allReceived = await prisma.steelPlan.findMany({
    where: {
      vesselCode: { in: [...vessels] },
      status: "RECEIVED",
    },
    select: {
      vesselCode: true, material: true, thickness: true, width: true, length: true,
      reservedFor: true, shipoutMarkedAt: true,
    },
  });

  const result:  Record<string, number> = {};
  const detail:  Record<string, { available: number; reservedElsewhere: number; shipoutMarked: number }> = {};
  for (const r of rows) {
    const steelVessel = r.alternateVesselCode?.trim() || project.projectCode;
    const key = `${r.material}|${r.thickness}|${r.width}|${r.length}|${steelVessel}`;
    if (key in result) continue;
    const matched = allReceived.filter(
      (p) =>
        p.vesselCode === steelVessel &&
        norm(p.material) === norm(r.material) &&
        p.thickness === r.thickness &&
        p.width === r.width &&
        p.length === r.length,
    );
    const available         = matched.filter((p) => !p.reservedFor && !p.shipoutMarkedAt).length;
    const reservedElsewhere = matched.filter((p) => !!p.reservedFor).length;
    const shipoutMarked     = matched.filter((p) => !!p.shipoutMarkedAt).length;
    result[key] = available;
    detail[key] = { available, reservedElsewhere, shipoutMarked };
  }

  return NextResponse.json({ success: true, data: result, detail });
}

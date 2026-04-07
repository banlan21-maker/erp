import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// 확정 기준으로 DrawingList 상태 동기화 (확정 블록 → WAITING, 미확정 → REGISTERED)
async function syncDrawingListBySpec(
  vesselCode: string, material: string,
  thickness: number, width: number, length: number,
) {
  const projects = await prisma.project.findMany({
    where: { projectCode: vesselCode },
    select: { id: true },
  });
  if (projects.length === 0) return;

  const rows = await prisma.drawingList.findMany({
    where: {
      projectId: { in: projects.map((p) => p.id) },
      material, thickness, width, length,
      NOT: { status: { in: ["CAUTION", "CUT"] } },
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, block: true },
  });

  const byBlock = new Map<string, string[]>();
  for (const row of rows) {
    const blockCode = row.block ?? "UNKNOWN";
    if (!byBlock.has(blockCode)) byBlock.set(blockCode, []);
    byBlock.get(blockCode)!.push(row.id);
  }

  const toWaiting: string[] = [];
  const toRegistered: string[] = [];
  for (const [blockCode, ids] of byBlock) {
    const confirmedCount = await prisma.steelPlan.count({
      where: { vesselCode, material, thickness, width, length, status: "RECEIVED", reservedFor: blockCode },
    });
    toWaiting.push(...ids.slice(0, confirmedCount));
    toRegistered.push(...ids.slice(confirmedCount));
  }

  if (toWaiting.length > 0)
    await prisma.drawingList.updateMany({ where: { id: { in: toWaiting } }, data: { status: "WAITING" } });
  if (toRegistered.length > 0)
    await prisma.drawingList.updateMany({ where: { id: { in: toRegistered } }, data: { status: "REGISTERED" } });
}

// POST /api/drawings/reserve-bulk
// REGISTERED 상태 행에 대해 SteelPlan 확정 처리 후 DrawingList 상태 동기화
export async function POST(request: NextRequest) {
  try {
    const { projectId } = await request.json();
    if (!projectId) {
      return NextResponse.json({ success: false, error: "projectId가 필요합니다." }, { status: 400 });
    }

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      return NextResponse.json({ success: false, error: "프로젝트를 찾을 수 없습니다." }, { status: 404 });
    }
    const vesselCode = project.projectCode;

    // 확정 대상: REGISTERED 행 (아직 확정 안 된 것들)
    const pendingRows = await prisma.drawingList.findMany({
      where: { projectId, status: "REGISTERED" },
    });

    // 규격+블록별 그룹화
    const grouped = new Map<string, {
      material: string; thickness: number; width: number; length: number; block: string; needed: number;
    }>();
    for (const row of pendingRows) {
      const blockCode = row.block ?? "UNKNOWN";
      const key = `${row.material}|${row.thickness}|${row.width}|${row.length}|${blockCode}`;
      if (!grouped.has(key)) {
        grouped.set(key, { material: row.material, thickness: row.thickness, width: row.width, length: row.length, block: blockCode, needed: 0 });
      }
      grouped.get(key)!.needed++;
    }

    let confirmed = 0;
    let skipped = 0;
    const syncedSpecs = new Set<string>();

    for (const spec of grouped.values()) {
      const { material, thickness, width, length, block: blockCode, needed } = spec;

      // 이미 이 블록으로 확정된 수량
      const alreadyCount = await prisma.steelPlan.count({
        where: { vesselCode, material, thickness, width, length, status: "RECEIVED", reservedFor: blockCode },
      });

      const toConfirm = needed - alreadyCount;
      if (toConfirm <= 0) { skipped += needed; continue; }

      const plans = await prisma.steelPlan.findMany({
        where: { vesselCode, material, thickness, width, length, status: "RECEIVED", reservedFor: null },
        take: toConfirm,
        orderBy: { createdAt: "asc" },
      });

      for (const plan of plans) {
        await prisma.steelPlan.update({
          where: { id: plan.id },
          data: { reservedFor: blockCode },
        });
        confirmed++;
      }
      skipped += toConfirm - plans.length;

      // 이 스펙에 대해 한 번만 sync
      const specKey = `${material}|${thickness}|${width}|${length}`;
      if (!syncedSpecs.has(specKey)) {
        syncedSpecs.add(specKey);
        await syncDrawingListBySpec(vesselCode, material, thickness, width, length);
      }
    }

    return NextResponse.json({ success: true, data: { confirmed, skipped } });
  } catch (error) {
    console.error("[POST /api/drawings/reserve-bulk]", error);
    return NextResponse.json({ success: false, error: "일괄 확정 중 오류가 발생했습니다." }, { status: 500 });
  }
}

// DELETE /api/drawings/reserve-bulk
// 해당 프로젝트의 확정 전체 취소 후 DrawingList 상태 동기화
export async function DELETE(request: NextRequest) {
  try {
    const { projectId } = await request.json();
    if (!projectId) {
      return NextResponse.json({ success: false, error: "projectId가 필요합니다." }, { status: 400 });
    }

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      return NextResponse.json({ success: false, error: "프로젝트를 찾을 수 없습니다." }, { status: 404 });
    }
    const vesselCode = project.projectCode;

    // 이 프로젝트의 고유 블록코드 + 스펙 목록
    const allRows = await prisma.drawingList.findMany({
      where: { projectId },
      select: { material: true, thickness: true, width: true, length: true, block: true },
    });

    const blockCodes = [...new Set(allRows.map((r) => r.block ?? "UNKNOWN"))];

    // 해당 블록코드로 확정된 SteelPlan 전체 해제
    const { count: cancelled } = await prisma.steelPlan.updateMany({
      where: { vesselCode, status: "RECEIVED", reservedFor: { in: blockCodes } },
      data: { reservedFor: null },
    });

    // 고유 스펙별 DrawingList 상태 동기화
    const uniqueSpecs = new Map<string, { material: string; thickness: number; width: number; length: number }>();
    for (const row of allRows) {
      const key = `${row.material}|${row.thickness}|${row.width}|${row.length}`;
      if (!uniqueSpecs.has(key)) uniqueSpecs.set(key, { material: row.material, thickness: row.thickness, width: row.width, length: row.length });
    }
    for (const spec of uniqueSpecs.values()) {
      await syncDrawingListBySpec(vesselCode, spec.material, spec.thickness, spec.width, spec.length);
    }

    return NextResponse.json({ success: true, data: { cancelled } });
  } catch (error) {
    console.error("[DELETE /api/drawings/reserve-bulk]", error);
    return NextResponse.json({ success: false, error: "일괄 확정 취소 중 오류가 발생했습니다." }, { status: 500 });
  }
}

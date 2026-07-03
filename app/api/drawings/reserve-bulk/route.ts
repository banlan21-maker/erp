import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncDrawingListBySpecs } from "@/lib/sync-drawing-spec";
import { syncProjectStatus } from "@/lib/sync-project-status";

export const dynamic = "force-dynamic";

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

    // 등록잔재 사용 행 (assignedRemnantId IS NOT NULL) — CUT 제외, 나머지 모두 WAITING 처리
    // status 조건을 REGISTERED로 한정하지 않음: CAUTION/WAITING 상태여도 잔재 확정 가능
    const assignedRaw = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM "DrawingList"
      WHERE "projectId" = ${projectId} AND status != 'CUT' AND "assignedRemnantId" IS NOT NULL
    `;
    const assignedRowIds = assignedRaw.map(r => r.id);
    const promotedRemnantRowIds: string[] = []; // 실제로 확정(WAITING 승격)한 잔재사용 도면 (출고선별 잔재는 제외)

    // 원재 사용 행 (assignedRemnantId IS NULL)
    // ORDER BY createdAt, id — 강재 부족 시 블록별 분배가 결정적이도록 보장
    // (PostgreSQL heap 스캔 순서에 의존하면 호출마다 다른 결과 가능)
    const pendingRows = await prisma.$queryRaw<{
      id: string; material: string; thickness: number; width: number; length: number;
      block: string | null; alternateVesselCode: string | null;
    }[]>`
      SELECT id, material, thickness, width, length, block, "alternateVesselCode"
      FROM "DrawingList"
      WHERE "projectId" = ${projectId} AND status = 'REGISTERED' AND "assignedRemnantId" IS NULL
      ORDER BY "createdAt" ASC, id ASC
    `;

    if (assignedRowIds.length > 0) {
      // 잔재(Remnant) 확정 — 도면 WAITING 승격 + reservedFor 표식.
      // 단, 출고선별(shipoutMarkedAt)된 잔재를 쓰는 도면은 확정하지 않음(REGISTERED 유지) —
      // 절단↔출고 상호배제(원판과 대칭). 이미 다른 블록에 reservedFor 있는 잔재는 덮어쓰지 않음(선점 보호).
      const assignedRows = await prisma.drawingList.findMany({
        where: { id: { in: assignedRowIds } },
        select: { id: true, block: true, assignedRemnantId: true, assignedRemnant: { select: { shipoutMarkedAt: true } } },
      });
      for (const row of assignedRows) {
        if (row.assignedRemnant?.shipoutMarkedAt) continue; // 출고선별 잔재 → 확정 스킵
        await prisma.drawingList.update({ where: { id: row.id }, data: { status: "WAITING" } });
        promotedRemnantRowIds.push(row.id);
        if (!row.assignedRemnantId) continue;
        await prisma.remnant.updateMany({
          where: { id: row.assignedRemnantId, reservedFor: null, shipoutMarkedAt: null },
          data:  { reservedFor: `${vesselCode}/${row.block ?? "UNKNOWN"}` },
        });
      }
    }

    // 규격+블록+대체호선별 그룹화
    const grouped = new Map<string, {
      material: string; thickness: number; width: number; length: number; block: string; steelVessel: string; needed: number;
    }>();
    for (const row of pendingRows) {
      const blockCode = row.block ?? "UNKNOWN";
      const steelVessel = row.alternateVesselCode?.trim() || vesselCode;
      const key = `${row.material}|${row.thickness}|${row.width}|${row.length}|${blockCode}|${steelVessel}`;
      if (!grouped.has(key)) {
        grouped.set(key, { material: row.material, thickness: row.thickness, width: row.width, length: row.length, block: blockCode, steelVessel, needed: 0 });
      }
      grouped.get(key)!.needed++;
    }

    let confirmed = 0;
    let skipped = 0;
    // 동기화할 스펙 수집 (steelVessel 별로 구분 — alt vessel 도면 누락 방지)
    const specsToSync = new Map<string, {
      vesselCode: string; material: string; thickness: number; width: number; length: number;
    }>();

    for (const spec of grouped.values()) {
      const { material, thickness, width, length, block: blockCode, steelVessel, needed } = spec;
      const reservedFor = `${vesselCode}/${blockCode}`;

      // pendingRows 는 이미 status='REGISTERED' 만 필터링했으므로 needed 자체가
      // "추가로 확정해야 하는 도면 수". alreadyCount 를 다시 빼면 이중 차감되어
      // 1차에 부분확정된 후 2차 일괄확정 시 부족분이 정확히 안 채워짐.
      // (예: 도면 5장, 1차 1장만 확정 → 2차에 4장 확정되어야 하는데 3장만 확정되던 버그)
      const toConfirm = needed;
      if (toConfirm <= 0) continue;

      const plans = await prisma.steelPlan.findMany({
        // 출고 선별/예정(shipoutMarkedAt)된 강재는 절단 일괄확정 대상에서 제외 (절단↔출고 상호배제)
        where: { vesselCode: steelVessel, material, thickness, width, length, status: "RECEIVED", reservedFor: null, shipoutMarkedAt: null },
        take: toConfirm,
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      });

      for (const plan of plans) {
        await prisma.steelPlan.update({
          where: { id: plan.id },
          data: { reservedFor },
        });
        confirmed++;
      }
      skipped += toConfirm - plans.length;

      // sync 대상: steelVessel + spec 키 (alt vessel 도 sync 대상)
      const specKey = `${steelVessel}|${material}|${thickness}|${width}|${length}`;
      if (!specsToSync.has(specKey)) {
        specsToSync.set(specKey, { vesselCode: steelVessel, material, thickness, width, length });
      }
    }

    // 모든 예약 완료 후 스펙별 DrawingList 상태 동기화 (steelVessel 기준)
    await syncDrawingListBySpecs([...specsToSync.values()]);

    // sync가 assigned 행을 덮어쓸 수 있으므로 다시 WAITING으로 복원 —
    // 단 실제 확정한 행만(출고선별 잔재로 스킵한 도면은 REGISTERED 유지, 상호배제).
    if (promotedRemnantRowIds.length > 0) {
      await prisma.drawingList.updateMany({
        where: { id: { in: promotedRemnantRowIds } },
        data: { status: "WAITING" },
      });
    }

    // 블록 완료상태 재동기화 — 미절단 행이 있으면 COMPLETED 블록도 ACTIVE 로 복귀
    // (현장작업일보가 ACTIVE 블록만 노출하므로, 완료블록에 강재 추가 후 작업 가능하게)
    await syncProjectStatus(projectId);

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

    // 이 프로젝트의 고유 블록코드 + 스펙 목록 (alt vessel 도 sync 대상)
    const allRows = await prisma.drawingList.findMany({
      where: { projectId },
      select: { material: true, thickness: true, width: true, length: true, block: true, alternateVesselCode: true },
    });

    const blockCodes = [...new Set(allRows.map((r) => r.block ?? "UNKNOWN"))];
    // 신규 형식: "호선/블록" + 구형 형식: 블록만
    const newFmtCodes = blockCodes.map((b) => `${vesselCode}/${b}`);

    // 절단완료(CUT) 도면이 있으면 확정취소 불가 — 작업일보에서 절단완료 취소 먼저 필요
    const cutCount = await prisma.drawingList.count({
      where: { projectId, status: "CUT" },
    });
    if (cutCount > 0) {
      return NextResponse.json({
        success: false,
        error: `절단완료된 도면이 ${cutCount}건 있습니다. 작업일보에서 절단완료 취소 후 다시 시도하세요.`,
      }, { status: 409 });
    }

    // 출고완료(ISSUED) 항목이 있으면 확정취소 불가 — 입출고장에서 출고취소 먼저 필요
    // 신규 형식("호선/블록")은 호선 정보 포함 → 그대로 매칭
    // 구형 형식(블록만)은 호선 필터 필수 → 다른 프로젝트의 동명 블록과 충돌 방지
    const issuedPlates = await prisma.steelPlan.findMany({
      where: {
        status: "ISSUED",
        OR: [
          { reservedFor: { in: newFmtCodes } },
          { vesselCode, reservedFor: { in: blockCodes } },
        ],
      },
      select: {
        vesselCode: true, material: true, thickness: true,
        width: true, length: true, reservedFor: true,
      },
      take: 5,
    });
    if (issuedPlates.length > 0) {
      const sample = issuedPlates.slice(0, 3).map(p =>
        `[${p.reservedFor}] ${p.material} t${p.thickness} ${p.width}×${p.length}`
      ).join(", ");
      return NextResponse.json({
        success: false,
        error: `출고완료된 철판이 ${issuedPlates.length}장${issuedPlates.length === 5 ? "+" : ""} 있습니다. 입출고장에서 출고취소 후 다시 시도하세요.\n예시: ${sample}`,
      }, { status: 409 });
    }

    // 등록잔재 사용 행 확정 취소: WAITING → REGISTERED (raw SQL로 Prisma 버전 무관)
    const assignedWaitingRaw = await prisma.$queryRaw<{ id: string; assignedRemnantId: string | null }[]>`
      SELECT id, "assignedRemnantId" FROM "DrawingList"
      WHERE "projectId" = ${projectId} AND status = 'WAITING' AND "assignedRemnantId" IS NOT NULL
    `;
    if (assignedWaitingRaw.length > 0) {
      await prisma.drawingList.updateMany({
        where: { id: { in: assignedWaitingRaw.map(r => r.id) } },
        data: { status: "REGISTERED" },
      });

      // 잔재(Remnant) reservedFor 도 해제 — 본 프로젝트 호선/블록 매칭하는 것만
      const remnantIds = Array.from(new Set(assignedWaitingRaw.map(r => r.assignedRemnantId).filter((x): x is string => !!x)));
      const ownReservedFors = [...newFmtCodes, ...blockCodes];
      if (remnantIds.length > 0) {
        await prisma.remnant.updateMany({
          where: { id: { in: remnantIds }, reservedFor: { in: ownReservedFors } },
          data: { reservedFor: null },
        });
      }
    }

    // 원재사용 행: SteelPlan 예약 해제 (RECEIVED만)
    const { count: cancelledNew } = await prisma.steelPlan.updateMany({
      where: { status: "RECEIVED", reservedFor: { in: newFmtCodes } },
      data: { reservedFor: null },
    });
    const { count: cancelledOld } = await prisma.steelPlan.updateMany({
      where: { vesselCode, status: "RECEIVED", reservedFor: { in: blockCodes } },
      data: { reservedFor: null },
    });
    const cancelled = cancelledNew + cancelledOld;

    // 고유 (steelVessel, 스펙) 별 DrawingList 상태 동기화 — alt vessel 누락 방지
    const uniqueSpecs = new Map<string, {
      vesselCode: string; material: string; thickness: number; width: number; length: number;
    }>();
    for (const row of allRows) {
      const steelVessel = row.alternateVesselCode?.trim() || vesselCode;
      const key = `${steelVessel}|${row.material}|${row.thickness}|${row.width}|${row.length}`;
      if (!uniqueSpecs.has(key)) {
        uniqueSpecs.set(key, {
          vesselCode: steelVessel,
          material: row.material, thickness: row.thickness, width: row.width, length: row.length,
        });
      }
    }
    await syncDrawingListBySpecs([...uniqueSpecs.values()]);

    // 블록 완료상태 재동기화 (확정취소로 행 상태가 바뀐 후)
    await syncProjectStatus(projectId);

    return NextResponse.json({ success: true, data: { cancelled } });
  } catch (error) {
    console.error("[DELETE /api/drawings/reserve-bulk]", error);
    return NextResponse.json({ success: false, error: "일괄 확정 취소 중 오류가 발생했습니다." }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncDrawingListBySpecs } from "@/lib/sync-drawing-spec";
import { syncProjectStatus } from "@/lib/sync-project-status";

export const dynamic = "force-dynamic";

// POST /api/drawings/reserve-bulk
// REGISTERED 상태 행에 대해 SteelPlan 확정 처리 후 DrawingList 상태 동기화
export async function POST(request: NextRequest) {
  try {
    const { projectId, drawingIds } = await request.json();
    if (!projectId) {
      return NextResponse.json({ success: false, error: "projectId가 필요합니다." }, { status: 400 });
    }
    // 선택 확정: drawingIds 지정 시 그 항목만, 없으면 프로젝트 전체 대상
    const ids: string[] | undefined = Array.isArray(drawingIds) && drawingIds.length > 0 ? drawingIds : undefined;

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      return NextResponse.json({ success: false, error: "프로젝트를 찾을 수 없습니다." }, { status: 404 });
    }
    const vesselCode = project.projectCode;

    // 등록잔재 사용 행 (assignedRemnantId IS NOT NULL) — CUT 제외, 나머지 모두 WAITING 처리
    // status 조건을 REGISTERED로 한정하지 않음: CAUTION/WAITING 상태여도 잔재 확정 가능
    const assignedRaw = await prisma.drawingList.findMany({
      where: { projectId, status: { not: "CUT" }, assignedRemnantId: { not: null }, ...(ids ? { id: { in: ids } } : {}) },
      select: { id: true },
    });
    const assignedRowIds = assignedRaw.map(r => r.id);
    const promotedRemnantRowIds: string[] = []; // 실제로 확정(WAITING 승격)한 잔재사용 도면 (출고선별 잔재는 제외)

    // 원재 사용 행 (assignedRemnantId IS NULL)
    // ORDER BY createdAt, id — 강재 부족 시 블록별 분배가 결정적이도록 보장
    const pendingRows = await prisma.drawingList.findMany({
      where: { projectId, status: "REGISTERED", assignedRemnantId: null, ...(ids ? { id: { in: ids } } : {}) },
      select: { id: true, material: true, thickness: true, width: true, length: true, block: true, alternateVesselCode: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });

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

// DELETE /api/drawings/reserve-bulk  { projectId, drawingIds? }
// 확정취소 — 유연 처리: 절단완료(CUT)·투입(ISSUED 판재로 확정)된 건은 그대로 두고,
//   확정취소 가능한 것(WAITING + RECEIVED 판재로 확정)만 해제.
//   drawingIds 지정 시 선택 항목만, 없으면 프로젝트 전체 WAITING 대상.
export async function DELETE(request: NextRequest) {
  try {
    const { projectId, drawingIds } = await request.json();
    if (!projectId) {
      return NextResponse.json({ success: false, error: "projectId가 필요합니다." }, { status: 400 });
    }
    const ids: string[] | undefined = Array.isArray(drawingIds) && drawingIds.length > 0 ? drawingIds : undefined;

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      return NextResponse.json({ success: false, error: "프로젝트를 찾을 수 없습니다." }, { status: 404 });
    }
    const vesselCode = project.projectCode;

    // 확정취소 대상 = WAITING 도면 (CUT 은 자동 제외). 선택(ids) 있으면 그 안에서만.
    const targets = await prisma.drawingList.findMany({
      where: { projectId, status: "WAITING", ...(ids ? { id: { in: ids } } : {}) },
      select: { id: true, material: true, thickness: true, width: true, length: true, block: true, alternateVesselCode: true, assignedRemnantId: true },
    });

    // 건너뛴 절단완료(CUT) 수 (메시지용) — 선택 범위 기준
    const cutSkipped = await prisma.drawingList.count({
      where: { projectId, status: "CUT", ...(ids ? { id: { in: ids } } : {}) },
    });

    let cancelled = 0;
    let issuedSkipped = 0;
    const specsToSync = new Map<string, {
      vesselCode: string; material: string; thickness: number; width: number; length: number;
    }>();

    // 1) 잔재(assigned) WAITING → REGISTERED + 잔재 reservedFor 해제 (sync 는 잔재행 미관리)
    const assignedTargets = targets.filter(t => t.assignedRemnantId);
    if (assignedTargets.length > 0) {
      await prisma.drawingList.updateMany({
        where: { id: { in: assignedTargets.map(t => t.id) } },
        data: { status: "REGISTERED" },
      });
      cancelled += assignedTargets.length;
      const remnantIds = [...new Set(assignedTargets.map(t => t.assignedRemnantId).filter((x): x is string => !!x))];
      if (remnantIds.length > 0) {
        const blockCodes = [...new Set(assignedTargets.map(t => t.block ?? "UNKNOWN"))];
        const ownReservedFors = [...blockCodes.map(b => `${vesselCode}/${b}`), ...blockCodes];
        await prisma.remnant.updateMany({
          where: { id: { in: remnantIds }, reservedFor: { in: ownReservedFors } },
          data: { reservedFor: null },
        });
      }
    }

    // 2) 원재 WAITING — (steelVessel, 스펙, 블록) 그룹별 count 만큼 RECEIVED 판재 해제.
    //    ISSUED(투입) 판재는 남겨 스킵 → 그만큼의 도면은 WAITING 유지 (역순 가드).
    const origTargets = targets.filter(t => !t.assignedRemnantId);
    const groups = new Map<string, {
      steelVessel: string; material: string; thickness: number; width: number; length: number; block: string; count: number;
    }>();
    for (const t of origTargets) {
      const block = t.block ?? "UNKNOWN";
      const steelVessel = t.alternateVesselCode?.trim() || vesselCode;
      const key = `${steelVessel}|${t.material}|${t.thickness}|${t.width}|${t.length}|${block}`;
      if (!groups.has(key)) groups.set(key, { steelVessel, material: t.material, thickness: t.thickness, width: t.width, length: t.length, block, count: 0 });
      groups.get(key)!.count++;
    }
    // N14: 해제된 강재 정보를 사용자에게 안내하기 위해 각 강재의 판번호 흔적도 함께 수집
    const releasedList: { id: string; vesselCode: string; material: string; thickness: number; width: number; length: number; heatNo: string | null }[] = [];
    for (const g of groups.values()) {
      const newFmt = `${vesselCode}/${g.block}`;
      // 신규("호선/블록") 또는 구형("블록") 형식으로 확정된 RECEIVED 판재를 count 만큼 해제
      const releasable = await prisma.steelPlan.findMany({
        where: {
          vesselCode: g.steelVessel, material: g.material, thickness: g.thickness, width: g.width, length: g.length,
          status: "RECEIVED",
          OR: [{ reservedFor: newFmt }, { reservedFor: g.block }],
        },
        take: g.count,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        // N14: 해제된 강재 안내용 정보 수집 (actualHeatNo — 절단 후 취소된 판재의 판번호 흔적)
        select: {
          id: true, vesselCode: true, material: true,
          thickness: true, width: true, length: true, actualHeatNo: true,
        },
      });
      if (releasable.length > 0) {
        await prisma.steelPlan.updateMany({ where: { id: { in: releasable.map(p => p.id) } }, data: { reservedFor: null } });
        cancelled += releasable.length;
        for (const p of releasable) {
          releasedList.push({
            id: p.id, vesselCode: p.vesselCode, material: p.material,
            thickness: p.thickness, width: p.width, length: p.length,
            heatNo: p.actualHeatNo,
          });
        }
      }
      issuedSkipped += g.count - releasable.length; // RECEIVED 부족분 = ISSUED(투입)로 확정된 도면
      const specKey = `${g.steelVessel}|${g.material}|${g.thickness}|${g.width}|${g.length}`;
      if (!specsToSync.has(specKey)) specsToSync.set(specKey, { vesselCode: g.steelVessel, material: g.material, thickness: g.thickness, width: g.width, length: g.length });
    }

    // 3) 상태 동기화 — 프로젝트 전체 스펙 (alt vessel 포함) 재계산
    const allRows = await prisma.drawingList.findMany({
      where: { projectId },
      select: { material: true, thickness: true, width: true, length: true, alternateVesselCode: true },
    });
    for (const row of allRows) {
      const steelVessel = row.alternateVesselCode?.trim() || vesselCode;
      const key = `${steelVessel}|${row.material}|${row.thickness}|${row.width}|${row.length}`;
      if (!specsToSync.has(key)) specsToSync.set(key, { vesselCode: steelVessel, material: row.material, thickness: row.thickness, width: row.width, length: row.length });
    }
    await syncDrawingListBySpecs([...specsToSync.values()]);
    await syncProjectStatus(projectId);

    return NextResponse.json({ success: true, data: { cancelled, cutSkipped, issuedSkipped, released: releasedList } });
  } catch (error) {
    console.error("[DELETE /api/drawings/reserve-bulk]", error);
    return NextResponse.json({ success: false, error: "일괄 확정 취소 중 오류가 발생했습니다." }, { status: 500 });
  }
}

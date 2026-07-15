import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncDrawingListBySpecs } from "@/lib/sync-drawing-spec";
import { syncProjectStatus } from "@/lib/sync-project-status";

// PATCH /api/drawings/[id] - 강재리스트 행 수정 또는 상태 변경
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    // ── 상태 강제 변경 (관리자 비상 도구) ──────────────────────────────────
    // 단순 status 표시 변경만 수행. SteelPlan / SteelPlanHeat 차감 안 함.
    // 정규 절단완료는 cutting-logs API 를 사용해야 SteelPlan COMPLETED 전환 +
    // actualHeatNo 기록 등 풀 정합성 유지. 본 액션은 잘못된 표시만 교정하는 용도.
    //
    // ⚠️  주의: 본 분기는 즉시 sync 를 호출하지 않으나, 다른 endpoint 의 sync
    //     트리거(steel-plan 변경 / drawings 다른 행 수정 / reserve-bulk / cutting-logs 등)
    //     가 동일 (effectiveVessel, spec) 으로 sync 를 발동시키면 본 행도 candidate
    //     에 포함되어 자연 status (usable RECEIVED 기반) 으로 재계산될 수 있음.
    //     영구 고정이 필요하면 추가 manualOverride 플래그 도입 필요 (Phase 3).
    if (body.action === "status") {
      const { status } = body;
      const validStatuses = ["REGISTERED", "WAITING", "CUT"];
      if (!validStatuses.includes(status)) {
        return NextResponse.json({ success: false, error: "유효하지 않은 상태입니다." }, { status: 400 });
      }
      const updated = await prisma.drawingList.update({
        where: { id },
        data: {
          status,
          receivedAt: status === "WAITING" ? new Date() : status === "REGISTERED" ? null : undefined,
        },
        include: {
          remnants: { where: { parentRemnantId: null } },
        },
      });

      // 절단완료(CUT) 시: 자식 등록잔재에 heatNo 자동부여 + PENDING→IN_STOCK
      if (status === "CUT" && updated.heatNo) {
        const childIds = updated.remnants.map((r: { id: string }) => r.id);
        if (childIds.length > 0) {
          await prisma.remnant.updateMany({
            where: { id: { in: childIds }, status: "PENDING" },
            data:  { heatNo: updated.heatNo, status: "IN_STOCK" },
          });
        }
      }

      return NextResponse.json({ success: true, data: updated });
    }

    // ── 필드 수정 ──────────────────────────────────────────────────────────
    const { block, drawingNo, heatNo, material, thickness, width, length, qty, steelWeight, useWeight, alternateVesselCode } = body;

    if (!material || !thickness || !width || !length || !qty) {
      return NextResponse.json(
        { success: false, error: "재질, 두께, 폭, 길이, 수량은 필수입니다." },
        { status: 400 }
      );
    }

    // 현재 row 조회
    const current = await prisma.drawingList.findUnique({
      where: { id },
      include: { project: { select: { projectCode: true } } },
    });
    if (!current) {
      return NextResponse.json({ success: false, error: "항목을 찾을 수 없습니다." }, { status: 404 });
    }

    const projectCode  = current.project.projectCode;
    const newBlock     = block?.trim() || null;
    const newMaterial  = material.trim().toUpperCase();
    const newThickness = Number(thickness);
    const newWidth     = Number(width);
    const newLength    = Number(length);
    const newAltVessel = (alternateVesselCode ?? "").trim() || null;

    const blockChanged     = (current.block ?? null) !== newBlock;
    const specChanged      = current.material !== newMaterial
                          || current.thickness !== newThickness
                          || current.width     !== newWidth
                          || current.length    !== newLength;
    const altVesselChanged = (current.alternateVesselCode ?? null) !== newAltVessel;

    // 블록·스펙·대체호선이 바뀐 경우 → WAITING 이면 기존 SteelPlan 예약 해제
    if ((blockChanged || specChanged || altVesselChanged) && current.status === "WAITING") {
      const oldVessel = current.alternateVesselCode?.trim() || projectCode;
      const oldBlock  = current.block ?? "UNKNOWN";
      const oldFmt    = `${projectCode}/${oldBlock}`;

      const toRelease = await prisma.steelPlan.findFirst({
        where: {
          vesselCode:  oldVessel,
          material:    current.material,
          thickness:   current.thickness,
          width:       current.width,
          length:      current.length,
          status:      "RECEIVED",
          reservedFor: { in: [oldFmt, oldBlock] },
        },
        orderBy: { createdAt: "desc" },
      });
      if (toRelease) {
        await prisma.steelPlan.update({ where: { id: toRelease.id }, data: { reservedFor: null } });
      }
    }

    // DrawingList row 업데이트
    await prisma.drawingList.update({
      where: { id },
      data: {
        block:               newBlock,
        drawingNo:           drawingNo?.trim()   || null,
        heatNo:              heatNo?.trim()      || null,
        material:            newMaterial,
        thickness:           newThickness,
        width:               newWidth,
        length:              newLength,
        qty:                 Math.round(Number(qty)),
        steelWeight:         steelWeight !== "" && steelWeight != null ? Number(steelWeight) : null,
        useWeight:           useWeight   !== "" && useWeight   != null ? Number(useWeight)   : null,
        alternateVesselCode: newAltVessel,
      },
    });

    // ── 통합 sync — 옛 spec + 새 spec (변경됐으면 둘 다) ─────────────────
    // status 는 sync 가 결정. PATCH 가 직접 newStatus 계산하지 않음.
    if (specChanged || altVesselChanged || blockChanged) {
      const oldVessel = current.alternateVesselCode?.trim() || projectCode;
      const newVessel = newAltVessel || projectCode;
      await syncDrawingListBySpecs([
        { vesselCode: oldVessel, material: current.material, thickness: current.thickness, width: current.width, length: current.length },
        { vesselCode: newVessel, material: newMaterial,      thickness: newThickness,      width: newWidth,      length: newLength },
      ]);
    } else {
      // 스펙 미변경이라도 heatNo 등만 바뀐 경우엔 status 재계산 불필요
    }

    const updated = await prisma.drawingList.findUnique({ where: { id } });
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("[PATCH /api/drawings/[id]]", error);
    return NextResponse.json(
      { success: false, error: "수정 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

// DELETE /api/drawings/[id] - 강재리스트 행 삭제
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // 삭제 전 현재 row 조회 (SteelPlan 확정 해제를 위해)
    const current = await prisma.drawingList.findUnique({
      where: { id },
      include: { project: { select: { projectCode: true } } },
    });
    if (!current) {
      return NextResponse.json({ success: false, error: "도면을 찾을 수 없습니다." }, { status: 404 });
    }

    // I3: 절단완료(CUT) / 확정(WAITING) 도면은 삭제 차단 — 먼저 작업일보에서 절단취소 / 확정취소 필요.
    //     CuttingLog 참조 있어도 차단 (도면과 로그가 분리된 상태로 방치되는 것 방지).
    if (current.status === "CUT" || current.status === "WAITING") {
      const stateLabel = current.status === "CUT" ? "절단완료(CUT)" : "확정(WAITING)";
      return NextResponse.json({
        success: false,
        error: `${stateLabel} 상태 도면은 삭제할 수 없습니다.\n먼저 작업일보에서 절단취소 → 확정취소 후 시도하세요.`,
      }, { status: 409 });
    }
    const linkedLogCount = await prisma.cuttingLog.count({ where: { drawingListId: id } });
    if (linkedLogCount > 0) {
      return NextResponse.json({
        success: false,
        error: `이 도면에 연결된 작업일보가 ${linkedLogCount}건 있습니다.\n먼저 작업일보를 삭제하거나 절단취소 후 시도하세요.`,
      }, { status: 409 });
    }

    await prisma.drawingList.delete({ where: { id } });

    // SteelPlan 확정 예약 해제 및 sync
    const projectCode     = current.project.projectCode;
    const effectiveVessel = current.alternateVesselCode?.trim() || projectCode;
    const oldBlock        = current.block ?? "UNKNOWN";
    const oldFmt          = `${projectCode}/${oldBlock}`;

    const toRelease = await prisma.steelPlan.findFirst({
      where: {
        vesselCode:  effectiveVessel,
        material:    current.material,
        thickness:   current.thickness,
        width:       current.width,
        length:      current.length,
        status:      "RECEIVED",
        reservedFor: { in: [oldFmt, oldBlock] },
      },
      orderBy: { createdAt: "desc" },
    });

    if (toRelease) {
      await prisma.steelPlan.update({ where: { id: toRelease.id }, data: { reservedFor: null } });
    }

    await syncDrawingListBySpecs([{
      vesselCode: effectiveVessel,
      material:   current.material,
      thickness:  current.thickness,
      width:      current.width,
      length:     current.length,
    }]);

    // I8: 마지막 미완료 도면 삭제로 블록의 모든 도면이 CUT 이 되면
    //     Project.status 를 COMPLETED 로 자동 판정 (R5)
    await syncProjectStatus(current.projectId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/drawings/[id]]", error);
    return NextResponse.json(
      { success: false, error: "삭제 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

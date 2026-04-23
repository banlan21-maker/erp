import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncDrawingListBySpec } from "@/lib/sync-drawing-spec";

// PATCH /api/drawings/[id] - 강재리스트 행 수정 또는 상태 변경
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    // 상태 변경 전용
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
          // 입고(WAITING)로 변경 시 입고일 기록, 등록으로 되돌리면 초기화
          receivedAt: status === "WAITING" ? new Date() : status === "REGISTERED" ? null : undefined,
        },
        include: { remnants: { where: { parentRemnantId: null } } },
      });

      // 절단완료(CUT) 시: 자식 등록잔재에 heatNo 자동부여 + PENDING→IN_STOCK
      if (status === "CUT" && updated.heatNo) {
        const childIds = updated.remnants.map((r: { id: string }) => r.id);
        if (childIds.length > 0) {
          await prisma.remnant.updateMany({
            where: { id: { in: childIds }, status: "PENDING" },
            data: { heatNo: updated.heatNo, status: "IN_STOCK" },
          });
        }
      }

      return NextResponse.json({ success: true, data: updated });
    }

    // 필드 수정
    const { block, drawingNo, heatNo, material, thickness, width, length, qty, steelWeight, useWeight, alternateVesselCode } = body;

    if (!material || !thickness || !width || !length || !qty) {
      return NextResponse.json(
        { success: false, error: "재질, 두께, 폭, 길이, 수량은 필수입니다." },
        { status: 400 }
      );
    }

    // 현재 row 조회 (SteelPlan 확정 해제 여부 판단)
    const current = await prisma.drawingList.findUnique({
      where: { id },
      include: { project: { select: { projectCode: true } } },
    });
    if (!current) {
      return NextResponse.json({ success: false, error: "항목을 찾을 수 없습니다." }, { status: 404 });
    }

    const projectCode       = current.project.projectCode;
    const newBlock          = block?.trim() || null;
    const newMaterial       = material.trim();
    const newThickness      = Number(thickness);
    const newWidth          = Number(width);
    const newLength         = Number(length);
    const newAltVessel      = (alternateVesselCode ?? "").trim() || null;

    const blockChanged      = (current.block ?? null) !== newBlock;
    const specChanged       = current.material !== newMaterial
      || current.thickness !== newThickness
      || current.width     !== newWidth
      || current.length    !== newLength;
    const altVesselChanged  = (current.alternateVesselCode ?? null) !== newAltVessel;

    // 블록·스펙·대체호선이 바뀐 경우 → WAITING이면 기존 SteelPlan 예약 해제
    if ((blockChanged || specChanged || altVesselChanged) && current.status === "WAITING") {
      const oldVessel  = current.alternateVesselCode?.trim() || projectCode;
      const oldBlock   = current.block ?? "UNKNOWN";
      const oldFmt     = `${projectCode}/${oldBlock}`;

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

    // 기존 스펙 DrawingList 상태 동기화 (변경 전 스펙 기준)
    if (blockChanged || specChanged || altVesselChanged) {
      await syncDrawingListBySpec(projectCode, current.material, current.thickness, current.width, current.length);
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

    // 새 스펙·대체호선 기준으로 status 재계산
    if (specChanged || altVesselChanged || blockChanged) {
      const effectiveVessel = newAltVessel || projectCode;
      const blockCode       = newBlock ?? "UNKNOWN";
      const newFmt          = `${projectCode}/${blockCode}`;

      // 이 행의 스펙이 대상 호선에 존재하는지
      const specExists = await prisma.steelPlan.count({
        where: { vesselCode: effectiveVessel, material: newMaterial, thickness: newThickness, width: newWidth, length: newLength },
      });

      let newStatus: string;
      if (specExists === 0) {
        newStatus = "CAUTION";
      } else {
        // 이 블록으로 이미 확정된 판재가 있으면 WAITING
        const reserved = await prisma.steelPlan.count({
          where: {
            vesselCode:  effectiveVessel,
            material:    newMaterial,
            thickness:   newThickness,
            width:       newWidth,
            length:      newLength,
            status:      "RECEIVED",
            reservedFor: { in: [newFmt, blockCode] },
          },
        });
        newStatus = reserved > 0 ? "WAITING" : "REGISTERED";
      }

      await prisma.drawingList.update({ where: { id }, data: { status: newStatus as "CAUTION" | "REGISTERED" | "WAITING" } });
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

    await prisma.drawingList.delete({ where: { id } });

    // SteelPlan 확정 예약 해제 및 동기화
    if (current) {
      const projectCode   = current.project.projectCode;
      const effectiveVessel = current.alternateVesselCode?.trim() || projectCode;
      const oldBlock      = current.block ?? "UNKNOWN";
      const oldFmt        = `${projectCode}/${oldBlock}`;

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

      await syncDrawingListBySpec(projectCode, current.material, current.thickness, current.width, current.length);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/drawings/[id]]", error);
    return NextResponse.json(
      { success: false, error: "삭제 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

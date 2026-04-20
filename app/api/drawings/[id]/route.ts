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
      });
      return NextResponse.json({ success: true, data: updated });
    }

    // 필드 수정
    const { block, drawingNo, heatNo, material, thickness, width, length, qty, steelWeight, useWeight } = body;

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

    const newBlock     = block?.trim() || null;
    const newMaterial  = material.trim();
    const newThickness = Number(thickness);
    const newWidth     = Number(width);
    const newLength    = Number(length);

    const blockChanged = (current.block ?? null) !== newBlock;
    const specChanged  = current.material !== newMaterial
      || current.thickness !== newThickness
      || current.width     !== newWidth
      || current.length    !== newLength;

    // 블록 또는 스펙이 바뀐 경우 → 기존 SteelPlan 예약 1건 해제
    if (blockChanged || specChanged) {
      const vesselCode = current.project.projectCode;
      const oldBlock   = current.block ?? "UNKNOWN";

      const toRelease = await prisma.steelPlan.findFirst({
        where: {
          vesselCode,
          material:  current.material,
          thickness: current.thickness,
          width:     current.width,
          length:    current.length,
          status:    "RECEIVED",
          reservedFor: oldBlock,
        },
        orderBy: { createdAt: "desc" },
      });

      if (toRelease) {
        await prisma.steelPlan.update({
          where: { id: toRelease.id },
          data:  { reservedFor: null },
        });
      }

      // 기존 스펙 DrawingList 상태 동기화
      await syncDrawingListBySpec(vesselCode, current.material, current.thickness, current.width, current.length);
    }

    // DrawingList row 업데이트
    const updated = await prisma.drawingList.update({
      where: { id },
      data: {
        block:       newBlock,
        drawingNo:   drawingNo?.trim()   || null,
        heatNo:      heatNo?.trim()      || null,
        material:    newMaterial,
        thickness:   newThickness,
        width:       newWidth,
        length:      newLength,
        qty:         Math.round(Number(qty)),
        steelWeight: steelWeight !== "" && steelWeight != null ? Number(steelWeight) : null,
        useWeight:   useWeight   !== "" && useWeight   != null ? Number(useWeight)   : null,
      },
    });

    // 스펙이 달라진 경우 새 스펙도 동기화
    if (specChanged) {
      await syncDrawingListBySpec(current.project.projectCode, newMaterial, newThickness, newWidth, newLength);
    }

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
      const vesselCode = current.project.projectCode;
      const oldBlock   = current.block ?? "UNKNOWN";

      const toRelease = await prisma.steelPlan.findFirst({
        where: {
          vesselCode,
          material:  current.material,
          thickness: current.thickness,
          width:     current.width,
          length:    current.length,
          status:    "RECEIVED",
          reservedFor: oldBlock,
        },
        orderBy: { createdAt: "desc" },
      });

      if (toRelease) {
        await prisma.steelPlan.update({
          where: { id: toRelease.id },
          data:  { reservedFor: null },
        });
      }

      await syncDrawingListBySpec(vesselCode, current.material, current.thickness, current.width, current.length);
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

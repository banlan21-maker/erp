import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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

    const updated = await prisma.drawingList.update({
      where: { id },
      data: {
        block: block?.trim() || null,
        drawingNo: drawingNo?.trim() || null,
        heatNo: heatNo?.trim() || null,
        material: material.trim(),
        thickness: Number(thickness),
        width: Number(width),
        length: Number(length),
        qty: Math.round(Number(qty)),
        steelWeight: steelWeight !== "" && steelWeight != null ? Number(steelWeight) : null,
        useWeight: useWeight !== "" && useWeight != null ? Number(useWeight) : null,
      },
    });

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
    await prisma.drawingList.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/drawings/[id]]", error);
    return NextResponse.json(
      { success: false, error: "삭제 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

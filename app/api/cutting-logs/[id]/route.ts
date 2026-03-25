import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// PATCH /api/cutting-logs/[id] - 절단 종료 또는 수정
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { action, memo, heatNo, material, thickness, operator } = body;

    if (action === "complete") {
      // 절단 종료 처리
      const log = await prisma.cuttingLog.update({
        where: { id },
        data: {
          status: "COMPLETED",
          endAt: new Date(),
          ...(memo !== undefined ? { memo: memo?.trim() || null } : {}),
        },
        include: { equipment: { select: { name: true } } },
      });

      // 같은 도면번호의 DrawingList 중 WAITING 상태인 첫 번째 항목을 CUT으로 변경
      if (log.drawingNo && log.projectId) {
        const target = await prisma.drawingList.findFirst({
          where: {
            projectId: log.projectId,
            drawingNo:  log.drawingNo,
            status:     "WAITING",
          },
          orderBy: { createdAt: "asc" },
        });
        if (target) {
          await prisma.drawingList.update({
            where: { id: target.id },
            data: {
              status: "CUT",
              ...(log.heatNo?.trim() ? { heatNo: log.heatNo.trim() } : {}),
            },
          });
          // 절단 로그에 drawingListId 기록 (삭제 시 복원 용도)
          await prisma.cuttingLog.update({
            where: { id },
            data: { drawingListId: target.id },
          });
        }
      }

      return NextResponse.json({ success: true, data: log });
    }

    // 일반 수정
    const log = await prisma.cuttingLog.update({
      where: { id },
      data: {
        ...(heatNo !== undefined ? { heatNo: heatNo?.trim() || null } : {}),
        ...(material !== undefined ? { material: material?.trim() || null } : {}),
        ...(thickness !== undefined ? { thickness: thickness ? Number(thickness) : null } : {}),
        ...(operator ? { operator: operator.trim() } : {}),
        ...(memo !== undefined ? { memo: memo?.trim() || null } : {}),
      },
    });
    return NextResponse.json({ success: true, data: log });
  } catch (error) {
    console.error("[PATCH /api/cutting-logs/[id]]", error);
    return NextResponse.json(
      { success: false, error: "작업일보 수정 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

// DELETE /api/cutting-logs/[id] - 작업 기록 삭제 (강재 상태 복원 포함)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // 삭제 전 로그 조회 (drawingListId 확인)
    const log = await prisma.cuttingLog.findUnique({ where: { id } });
    if (!log) {
      return NextResponse.json({ success: false, error: "기록을 찾을 수 없습니다." }, { status: 404 });
    }

    // drawingListId가 있으면 해당 강재를 CUT → WAITING으로 복원
    if (log.drawingListId) {
      const drawing = await prisma.drawingList.findUnique({ where: { id: log.drawingListId } });
      if (drawing && drawing.status === "CUT") {
        await prisma.drawingList.update({
          where: { id: log.drawingListId },
          data: { status: "WAITING" },
        });
      }
    }

    await prisma.cuttingLog.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/cutting-logs/[id]]", error);
    return NextResponse.json(
      { success: false, error: "삭제 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

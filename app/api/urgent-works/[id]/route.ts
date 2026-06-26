import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { applyCuttingRestore } from "@/lib/cutting-complete";

// PATCH /api/urgent-works/[id]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body   = await request.json();
    const {
      title, urgency, requester, department,
      projectId, vesselName,
      requestDate, dueDate,
      materialMemo, drawingNo, destination, useWeight,
      remnantId, status, registeredBy, memo,
    } = body;

    const prev = await prisma.urgentWork.findUnique({
      where: { id },
      select: { urgentNo: true, remnantId: true },
    });

    const updated = await prisma.urgentWork.update({
      where: { id },
      data: {
        ...(title        !== undefined ? { title:        title.trim() }                          : {}),
        ...(urgency      !== undefined ? { urgency }                                             : {}),
        ...(requester    !== undefined ? { requester:    requester    || null }                  : {}),
        ...(department   !== undefined ? { department:   department   || null }                  : {}),
        ...(projectId    !== undefined ? { projectId:    projectId    || null }                  : {}),
        ...(vesselName   !== undefined ? { vesselName:   vesselName   || null }                  : {}),
        ...(requestDate  !== undefined ? { requestDate:  new Date(requestDate) }                 : {}),
        ...(dueDate      !== undefined ? { dueDate:      dueDate ? new Date(dueDate) : null }    : {}),
        ...(materialMemo !== undefined ? { materialMemo: materialMemo || null }                  : {}),
        ...(drawingNo    !== undefined ? { drawingNo:    drawingNo    || null }                  : {}),
        ...(destination  !== undefined ? { destination:  destination  || null }                  : {}),
        ...(useWeight    !== undefined ? { useWeight:    useWeight != null && useWeight !== "" ? Number(useWeight) : null } : {}),
        ...(remnantId    !== undefined ? { remnantId:    remnantId    || null }                  : {}),
        ...(status       !== undefined ? { status }                                              : {}),
        ...(registeredBy !== undefined ? { registeredBy: registeredBy || null }                  : {}),
        ...(memo         !== undefined ? { memo:         memo         || null }                  : {}),
      },
      include: {
        project: { select: { id: true, projectCode: true, projectName: true } },
        remnant: { select: { id: true, remnantNo: true, material: true, thickness: true, needsConsult: true } },
      },
    });

    // 사용 잔재 변경 시 확정정보(돌발번호) 이관 — 기존 잔재는 해제, 새 잔재에 기록
    if (remnantId !== undefined && prev) {
      const newRemnantId = remnantId || null;
      if (prev.remnantId && prev.remnantId !== newRemnantId) {
        await prisma.remnant.updateMany({
          where: { id: prev.remnantId, reservedFor: prev.urgentNo },
          data:  { reservedFor: null },
        });
      }
      if (newRemnantId) {
        await prisma.remnant.updateMany({
          where: { id: newRemnantId, reservedFor: null },
          data:  { reservedFor: prev.urgentNo },
        });
      }
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

// DELETE /api/urgent-works/[id]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const work = await prisma.urgentWork.findUnique({
      where: { id },
      select: { urgentNo: true, remnantId: true },
    });
    if (!work) {
      return NextResponse.json({ success: false, error: "기록을 찾을 수 없습니다." }, { status: 404 });
    }
    // 연결된 작업로그 — onDelete:SetNull 이라 그냥 두면 고아(STARTED)로 남아 장비를 영구 점유한다.
    // 강재/잔재 상태를 복원한 뒤 함께 삭제 (UI 안내문 "연결 작업로그도 함께 삭제"와 일치).
    const logs = await prisma.cuttingLog.findMany({ where: { urgentWorkId: id } });
    await prisma.$transaction(async (tx) => {
      for (const log of logs) {
        await applyCuttingRestore(tx, log);
        await tx.cuttingLog.delete({ where: { id: log.id } });
      }
      // 선점 잔재의 확정정보(돌발번호) 해제 — 이 돌발이 선점한 잔재만
      if (work.remnantId) {
        await tx.remnant.updateMany({
          where: { id: work.remnantId, reservedFor: work.urgentNo },
          data:  { reservedFor: null },
        });
      }
      await tx.urgentWork.delete({ where: { id } });
    }, { maxWait: 5000, timeout: 20000 });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

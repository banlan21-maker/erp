import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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
    // 삭제 전 선점 잔재의 확정정보(돌발번호) 해제 — 이 돌발이 선점한 잔재만
    const work = await prisma.urgentWork.findUnique({
      where: { id },
      select: { urgentNo: true, remnantId: true },
    });
    await prisma.urgentWork.delete({ where: { id } });
    if (work?.remnantId) {
      await prisma.remnant.updateMany({
        where: { id: work.remnantId, reservedFor: work.urgentNo },
        data:  { reservedFor: null },
      });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

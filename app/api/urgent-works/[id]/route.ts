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
      materialMemo, drawingNo, destination,
      remnantId, status, registeredBy, memo,
    } = body;

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

    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// DELETE /api/urgent-works/[id]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.urgentWork.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

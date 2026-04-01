import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// PATCH /api/schedules/[id]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const {
      projectId, vesselCode, blockName,
      plannedStart, plannedEnd, deliveryFactory, deliveryAssembly,
      workType, status, holdReason, priority, memo,
    } = body;

    const updated = await prisma.cncSchedule.update({
      where: { id },
      data: {
        ...(projectId    !== undefined ? { projectId:        projectId    || null } : {}),
        ...(vesselCode   !== undefined ? { vesselCode:       vesselCode.trim() }   : {}),
        ...(blockName    !== undefined ? { blockName:        blockName.trim() }    : {}),
        ...(plannedStart !== undefined ? { plannedStart:     plannedStart  ? new Date(plannedStart)  : null } : {}),
        ...(plannedEnd   !== undefined ? { plannedEnd:       plannedEnd    ? new Date(plannedEnd)    : null } : {}),
        ...(deliveryFactory  !== undefined ? { deliveryFactory:  deliveryFactory  ? new Date(deliveryFactory)  : null } : {}),
        ...(deliveryAssembly !== undefined ? { deliveryAssembly: deliveryAssembly ? new Date(deliveryAssembly) : null } : {}),
        ...(workType     !== undefined ? { workType }      : {}),
        ...(status       !== undefined ? { status }        : {}),
        ...(holdReason   !== undefined ? { holdReason:     holdReason || null } : {}),
        ...(priority     !== undefined ? { priority:       Number(priority) }   : {}),
        ...(memo         !== undefined ? { memo:           memo || null }       : {}),
      },
      include: { project: { select: { id: true, projectCode: true, projectName: true } } },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// DELETE /api/schedules/[id] — 실제 삭제
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.cncSchedule.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

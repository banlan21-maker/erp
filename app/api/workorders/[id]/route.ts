import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Priority, WorkOrderStatus } from "@prisma/client";

// PATCH /api/workorders/[id] - 작업지시 수정 (상태·장비·우선순위)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { status, equipmentId, priority, dueDate, memo } = body;

    const workOrder = await prisma.workOrder.update({
      where: { id },
      data: {
        ...(status ? { status: status as WorkOrderStatus } : {}),
        ...(equipmentId !== undefined ? { equipmentId: equipmentId || null } : {}),
        ...(priority ? { priority: priority as Priority } : {}),
        ...(dueDate !== undefined ? { dueDate: dueDate ? new Date(dueDate) : null } : {}),
        ...(memo !== undefined ? { memo: memo?.trim() || null } : {}),
        ...(status === "IN_PROGRESS" ? { assignedAt: new Date() } : {}),
      },
      include: {
        project: { select: { projectCode: true, projectName: true } },
        equipment: { select: { name: true } },
      },
    });

    return NextResponse.json({ success: true, data: workOrder });
  } catch (error) {
    console.error("[PATCH /api/workorders/[id]]", error);
    return NextResponse.json(
      { success: false, error: "작업지시 수정 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

// DELETE /api/workorders/[id]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.workOrder.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/workorders/[id]]", error);
    return NextResponse.json(
      { success: false, error: "작업지시 삭제 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

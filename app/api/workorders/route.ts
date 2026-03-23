import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Priority, WorkOrderStatus } from "@prisma/client";

// 작업지시 번호 자동 생성: WO-YYYYMMDD-NNNN
async function generateOrderNo(): Promise<string> {
  const today = new Date();
  const prefix = `WO-${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;

  const lastOrder = await prisma.workOrder.findFirst({
    where: { orderNo: { startsWith: prefix } },
    orderBy: { orderNo: "desc" },
  });

  let seq = 1;
  if (lastOrder) {
    const parts = lastOrder.orderNo.split("-");
    seq = parseInt(parts[parts.length - 1], 10) + 1;
  }

  return `${prefix}-${String(seq).padStart(4, "0")}`;
}

// GET /api/workorders - 작업지시 목록 조회
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");
    const status = searchParams.get("status") as WorkOrderStatus | null;

    const workOrders = await prisma.workOrder.findMany({
      where: {
        ...(projectId ? { projectId } : {}),
        ...(status ? { status } : {}),
      },
      include: {
        project: { select: { projectCode: true, projectName: true, type: true } },
        drawingList: { select: { block: true, drawingNo: true, material: true, thickness: true } },
        equipment: { select: { name: true, type: true } },
      },
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
    });

    return NextResponse.json({ success: true, data: workOrders });
  } catch (error) {
    console.error("[GET /api/workorders]", error);
    return NextResponse.json(
      { success: false, error: "작업지시 목록 조회 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

// POST /api/workorders - 작업지시 생성
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { projectId, drawingListId, equipmentId, priority, dueDate, memo } = body;

    if (!projectId) {
      return NextResponse.json(
        { success: false, error: "projectId가 필요합니다." },
        { status: 400 }
      );
    }

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      return NextResponse.json(
        { success: false, error: "프로젝트를 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    const orderNo = await generateOrderNo();

    const workOrder = await prisma.workOrder.create({
      data: {
        projectId,
        drawingListId: drawingListId || null,
        equipmentId: equipmentId || null,
        orderNo,
        priority: (priority as Priority) || "NORMAL",
        dueDate: dueDate ? new Date(dueDate) : null,
        memo: memo?.trim() || null,
      },
      include: {
        project: { select: { projectCode: true, projectName: true, type: true } },
        drawingList: { select: { block: true, drawingNo: true } },
        equipment: { select: { name: true } },
      },
    });

    return NextResponse.json({ success: true, data: workOrder }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/workorders]", error);
    return NextResponse.json(
      { success: false, error: "작업지시 생성 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

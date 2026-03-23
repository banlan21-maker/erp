import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/dashboard - 현황 대시보드 데이터
export async function GET() {
  try {
    const [
      totalProjects,
      activeProjects,
      projectsByType,
      totalWorkOrders,
      workOrdersByStatus,
      totalDrawings,
      recentProjects,
      recentWorkOrders,
    ] = await Promise.all([
      // 전체 프로젝트 수
      prisma.project.count(),

      // 진행 중 프로젝트 수
      prisma.project.count({ where: { status: "ACTIVE" } }),

      // 유형별 프로젝트 수
      prisma.project.groupBy({
        by: ["type"],
        _count: { type: true },
      }),

      // 전체 작업지시 수
      prisma.workOrder.count(),

      // 상태별 작업지시 수
      prisma.workOrder.groupBy({
        by: ["status"],
        _count: { status: true },
      }),

      // 전체 강재리스트 행 수
      prisma.drawingList.count(),

      // 최근 등록 프로젝트 5개
      prisma.project.findMany({
        take: 5,
        orderBy: { createdAt: "desc" },
        include: {
          _count: { select: { drawingLists: true, workOrders: true } },
        },
      }),

      // 최근 작업지시 10개
      prisma.workOrder.findMany({
        take: 10,
        orderBy: { createdAt: "desc" },
        include: {
          project: { select: { projectCode: true, projectName: true, type: true } },
          equipment: { select: { name: true, type: true } },
        },
      }),
    ]);

    const workOrderStatusMap: Record<string, number> = {};
    for (const g of workOrdersByStatus) {
      workOrderStatusMap[g.status] = g._count.status;
    }

    const projectTypeMap: Record<string, number> = {};
    for (const g of projectsByType) {
      projectTypeMap[g.type] = g._count.type;
    }

    return NextResponse.json({
      success: true,
      data: {
        summary: {
          totalProjects,
          activeProjects,
          totalWorkOrders,
          totalDrawings,
          pendingWorkOrders: workOrderStatusMap["PENDING"] ?? 0,
          inProgressWorkOrders: workOrderStatusMap["IN_PROGRESS"] ?? 0,
          completedWorkOrders: workOrderStatusMap["COMPLETED"] ?? 0,
          typeAProjects: projectTypeMap["A"] ?? 0,
          typeBProjects: projectTypeMap["B"] ?? 0,
        },
        recentProjects,
        recentWorkOrders,
      },
    });
  } catch (error) {
    console.error("[GET /api/dashboard]", error);
    return NextResponse.json(
      { success: false, error: "대시보드 데이터 조회 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

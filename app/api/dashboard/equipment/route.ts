import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    // 모든 활성(ACTIVE) 장비 조회
    const equipment = await prisma.equipment.findMany({
      where: { status: "ACTIVE" },
      orderBy: { name: "asc" }
    });

    // 금일 시작된 절단 실적 조회
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const logs = await prisma.cuttingLog.findMany({
      where: {
        startAt: { gte: startOfDay }
      },
      orderBy: { startAt: "desc" },
      include: {
        project: { select: { projectCode: true, projectName: true } }
      }
    });

    // 장비별로 가장 최근 작업 내역 매핑
    const equipProgress = equipment.map((eq) => {
      const recentLog = logs.find((l) => l.equipmentId === eq.id);
      return {
        equipment: eq,
        recentLog: recentLog || null
      };
    });

    return NextResponse.json({ success: true, data: equipProgress });
  } catch (error) {
    console.error("Dashboard equipment error:", error);
    return NextResponse.json({ success: false, error: "조회 실패" }, { status: 500 });
  }
}

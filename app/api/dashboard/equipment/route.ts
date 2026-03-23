export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    // 모든 활성(ACTIVE) 장비 조회
    const equipment = await prisma.equipment.findMany({
      where: { status: "ACTIVE" },
      orderBy: { name: "asc" }
    });

    // 금일 시작된 절단 실적 조회 (한국 시간 기준 자정)
    const formatter = new Intl.DateTimeFormat('en-CA', { // 'en-CA' outputs YYYY-MM-DD
      timeZone: 'Asia/Seoul',
      year: 'numeric', month: '2-digit', day: '2-digit',
    });
    const kstDateString = formatter.format(new Date());
    const startOfDay = new Date(`${kstDateString}T00:00:00+09:00`);

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

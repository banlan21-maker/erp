import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/mgmt-inspection?year=YYYY&month=MM
//   year/month 지정 시: 그 달에 다음 검사 예정인 항목만
//   미지정 시: 전체 검사 항목 (현재 상태 스냅샷)
export async function GET(request: NextRequest) {
  try {
    const sp = new URL(request.url).searchParams;
    const year  = sp.get("year");
    const month = sp.get("month");

    const where: Record<string, unknown> = {};
    if (year && month) {
      const ym = `${year}-${String(month).padStart(2, "0")}`;
      const start = new Date(`${ym}-01T00:00:00.000Z`);
      const end   = new Date(start);
      end.setMonth(end.getMonth() + 1);
      where.nextInspectAt = { gte: start, lt: end };
    }

    const data = await prisma.mgmtInspectionItem.findMany({
      where,
      orderBy: [{ nextInspectAt: "asc" }, { itemName: "asc" }],
      include: {
        equipment: { select: { id: true, name: true, code: true, kind: true, managementNo: true } },
      },
    });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[GET /api/mgmt-inspection]", error);
    return NextResponse.json({ success: false, error: "조회 오류" }, { status: 500 });
  }
}

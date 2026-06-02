import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// POST /api/mgmt-repair  — 수선이력 등록
// body: { equipmentId, repairedAt, cause?, content, contractor?, costs?: [{itemName, amount}], memo? }
export async function POST(request: NextRequest) {
  try {
    const { equipmentId, repairedAt, cause, content, contractor, costs, memo } = await request.json();

    if (!equipmentId) {
      return NextResponse.json({ success: false, error: "장비 ID는 필수입니다." }, { status: 400 });
    }
    if (!content?.trim()) {
      return NextResponse.json({ success: false, error: "조치 내용은 필수입니다." }, { status: 400 });
    }
    if (!repairedAt) {
      return NextResponse.json({ success: false, error: "수선일은 필수입니다." }, { status: 400 });
    }

    const costItems: { itemName: string; amount: number }[] = Array.isArray(costs)
      ? costs
          .map((c: { itemName?: string; amount?: number | string }) => ({
            itemName: String(c.itemName ?? "").trim(),
            amount: Math.round(Number(c.amount) || 0),
          }))
          .filter((c) => c.itemName && c.amount > 0)
      : [];

    const total = costItems.reduce((s, c) => s + c.amount, 0);

    const log = await prisma.mgmtRepairLog.create({
      data: {
        equipmentId,
        repairedAt: new Date(repairedAt),
        cause: cause?.trim() || null,
        content: content.trim(),
        contractor: contractor?.trim() || null,
        cost: total || null,
        memo: memo?.trim() || null,
        costs: {
          create: costItems.map((c, i) => ({ itemName: c.itemName, amount: c.amount, sortOrder: i })),
        },
      },
      include: { costs: { orderBy: { sortOrder: "asc" } } },
    });

    return NextResponse.json({ success: true, data: log }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/mgmt-repair]", error);
    return NextResponse.json({ success: false, error: "등록 오류" }, { status: 500 });
  }
}

// GET /api/mgmt-repair?year=YYYY&month=MM — 전체 장비 월별 수선이력 (엑셀 다운로드용)
// equipmentId 지정 시 해당 장비만
export async function GET(request: NextRequest) {
  try {
    const sp = new URL(request.url).searchParams;
    const year  = sp.get("year");
    const month = sp.get("month");
    const equipmentId = sp.get("equipmentId");

    const where: Record<string, unknown> = {};
    if (year && month) {
      const ym = `${year}-${String(month).padStart(2, "0")}`;
      const start = new Date(`${ym}-01T00:00:00.000Z`);
      const end   = new Date(start);
      end.setMonth(end.getMonth() + 1);
      where.repairedAt = { gte: start, lt: end };
    }
    if (equipmentId) where.equipmentId = equipmentId;

    const data = await prisma.mgmtRepairLog.findMany({
      where,
      orderBy: [{ repairedAt: "asc" }, { createdAt: "asc" }],
      include: {
        equipment: { select: { id: true, name: true, code: true, kind: true, managementNo: true } },
        costs:     { orderBy: { sortOrder: "asc" } },
      },
    });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[GET /api/mgmt-repair]", error);
    return NextResponse.json({ success: false, error: "조회 오류" }, { status: 500 });
  }
}

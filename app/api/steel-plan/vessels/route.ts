export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/steel-plan/vessels — SteelPlan에 등록된 고유 호선 목록
export async function GET() {
  const rows = await prisma.steelPlan.findMany({
    select: { vesselCode: true },
    distinct: ["vesselCode"],
    orderBy: { vesselCode: "asc" },
  });

  return NextResponse.json({ success: true, data: rows.map((r) => r.vesselCode) });
}

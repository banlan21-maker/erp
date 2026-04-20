/**
 * POST /api/steel-plan/mark-printed
 *
 * 선별지시서 출력 후 해당 ID 목록에 selectionPrintedAt 기록.
 *
 * Request body: { ids: string[] }
 */

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const { ids }: { ids: string[] } = await req.json();
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ ok: true, count: 0 });
    }
    const now = new Date();
    const { count } = await prisma.steelPlan.updateMany({
      where: { id: { in: ids } },
      data:  { selectionPrintedAt: now },
    });
    return NextResponse.json({ ok: true, count });
  } catch (error) {
    console.error("[POST /api/steel-plan/mark-printed]", error);
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}

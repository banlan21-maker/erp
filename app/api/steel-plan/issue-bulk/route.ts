/**
 * POST /api/steel-plan/issue-bulk
 *
 * 선택된 ID 목록을 RECEIVED → ISSUED 로 일괄 출고 처리.
 *
 * Request body: { ids: string[], issuedAt?: string (ISO) }
 * Response:     { success: true, count: number }
 */

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const { ids, issuedAt }: { ids: string[]; issuedAt?: string } = await req.json();

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: "출고 항목이 없습니다." }, { status: 400 });
    }

    const issuedDate = issuedAt ? new Date(issuedAt) : new Date();

    // 출고 선별/예정(shipoutMarkedAt)된 철판은 절단투입 불가 — 출고확정 취소가 먼저 (절단↔출고 상호배제)
    // (조용히 마킹을 지우고 투입하면 출고흐름이 선별해둔 강재를 가로채게 됨)
    const shipoutMarked = await prisma.steelPlan.count({
      where: { id: { in: ids }, shipoutMarkedAt: { not: null } },
    });
    if (shipoutMarked > 0) {
      return NextResponse.json(
        { error: `출고 선별/예정된 철판이 ${shipoutMarked}장 있습니다. 출고확정 취소 후 투입하세요.` },
        { status: 409 }
      );
    }

    // 블록 확정(reservedFor)이 없는 철판은 출고 불가
    const unconfirmed = await prisma.steelPlan.count({
      where: { id: { in: ids }, status: "RECEIVED", reservedFor: null },
    });
    if (unconfirmed > 0) {
      return NextResponse.json(
        { error: `블록 미확정 철판이 ${unconfirmed}장 있습니다. 블록강재리스트에서 확정 후 출고하세요.` },
        { status: 409 }
      );
    }

    const { count } = await prisma.steelPlan.updateMany({
      where: { id: { in: ids }, status: "RECEIVED" },
      // 출고 처리 시 보관위치도 자동 미지정(null) — 적치장을 떠났으므로
      data:  { status: "ISSUED", issuedAt: issuedDate, storageLocation: null },
    });

    return NextResponse.json({ success: true, count });
  } catch (error) {
    console.error("[POST /api/steel-plan/issue-bulk]", error);
    return NextResponse.json({ error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}

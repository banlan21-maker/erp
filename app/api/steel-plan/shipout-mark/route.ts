/**
 * 출고등록 — 출고 확정(선별) 마킹 / 취소
 *
 * POST /api/steel-plan/shipout-mark
 *   { action: "mark",   items: [{ id, heatNo }] }  → shipoutMarkedAt=now, shipoutHeatNo=heatNo
 *   { action: "unmark", ids: [id, ...] }           → shipoutMarkedAt=null, shipoutHeatNo=null
 *
 *   상태(status)는 건드리지 않음(입고 유지). 되돌리기는 unmark.
 */
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = body?.action === "unmark" ? "unmark" : "mark";

    if (action === "unmark") {
      const ids: string[] = Array.isArray(body?.ids) ? body.ids.filter((x: unknown) => typeof x === "string") : [];
      if (!ids.length) return NextResponse.json({ success: true, count: 0 });
      const { count } = await prisma.steelPlan.updateMany({
        where: { id: { in: ids } },
        data:  { shipoutMarkedAt: null, shipoutHeatNo: null },
      });
      return NextResponse.json({ success: true, count });
    }

    // mark — 행마다 판번호가 달라 개별 update (트랜잭션)
    const rawItems: unknown[] = Array.isArray(body?.items) ? body.items : [];
    const items = rawItems
      .map((it) => it as { id?: unknown; heatNo?: unknown })
      .filter((it) => typeof it.id === "string")
      .map((it) => ({ id: it.id as string, heatNo: it.heatNo ? String(it.heatNo).trim() : null }));
    if (!items.length) return NextResponse.json({ success: true, count: 0 });

    const now = new Date();
    let count = 0;
    await prisma.$transaction(async (tx) => {
      for (const it of items) {
        // RECEIVED·미마킹일 때만 — 동시 선점/상태변경 방어, 없는 id는 무시(P2025 회피)
        const r = await tx.steelPlan.updateMany({
          where: { id: it.id, status: "RECEIVED", shipoutMarkedAt: null },
          data:  { shipoutMarkedAt: now, shipoutHeatNo: it.heatNo },
        });
        count += r.count;
      }
    });
    return NextResponse.json({ success: true, count, requested: items.length });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "처리 실패" }, { status: 500 });
  }
}

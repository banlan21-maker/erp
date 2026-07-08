export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/steel-plan/backfill-issued
 *   절단완료(COMPLETED)됐지만 출고일(issuedAt)이 비어 있는 강재를,
 *   같은 사양의 절단 판번호(SteelPlanHeat.cutAt) → 없으면 updatedAt 기준으로 출고일 일괄 기록.
 *   GET(?preview) 또는 dryRun 으로 대상 수만 확인 가능.
 */
const specKey = (x: { vesselCode: string; material: string; thickness: number; width: number; length: number }) =>
  `${x.vesselCode}|${x.material}|${x.thickness}|${x.width}|${x.length}`;

export async function POST(req: NextRequest) {
  try {
    const dryRun = !!(await req.json().catch(() => ({})))?.dryRun;

    const plans = await prisma.steelPlan.findMany({
      where: { status: "COMPLETED", issuedAt: null },
      select: { id: true, vesselCode: true, material: true, thickness: true, width: true, length: true, updatedAt: true },
    });
    if (plans.length === 0) return NextResponse.json({ success: true, count: 0 });
    if (dryRun) return NextResponse.json({ success: true, count: plans.length });

    // 사양 → 절단완료일(cutAt) 매핑 (같은 사양의 CUT 판번호 중 가장 이른 cutAt)
    const heats = await prisma.steelPlanHeat.findMany({
      where: { status: "CUT", cutAt: { not: null } },
      select: { vesselCode: true, material: true, thickness: true, width: true, length: true, cutAt: true },
    });
    const cutMap = new Map<string, Date>();
    for (const h of heats) {
      if (!h.cutAt) continue;
      const k = specKey(h);
      const prev = cutMap.get(k);
      if (!prev || h.cutAt < prev) cutMap.set(k, h.cutAt);
    }

    // 목표 출고일별로 묶어 updateMany (효율)
    const byIso = new Map<string, string[]>();
    for (const p of plans) {
      const d = cutMap.get(specKey(p)) ?? p.updatedAt;
      const iso = d.toISOString();
      (byIso.get(iso) ?? byIso.set(iso, []).get(iso)!).push(p.id);
    }
    let count = 0;
    for (const [iso, ids] of byIso) {
      const r = await prisma.steelPlan.updateMany({ where: { id: { in: ids } }, data: { issuedAt: new Date(iso) } });
      count += r.count;
    }
    return NextResponse.json({ success: true, count });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/steel-plan/backfill-issued
 *   절단완료(COMPLETED)됐지만 출고일(issuedAt)이 비어 있는 강재에 출고일을 일괄 기록.
 *   근거 우선순위: ① 같은 사양 절단 판번호의 cutAt  ② 같은 사양 완료 작업일보의 endAt
 *   둘 다 없으면 **건드리지 않는다**(skipped 로 보고).
 *   dryRun 으로 대상 수만 확인 가능.
 *
 * ⚠ 예전엔 근거가 없으면 `updatedAt` 을 썼는데 이건 위험하다 —
 *   `issuedAt` 은 아카이브 판정의 **유일한 축**(§16-2)이라, 아카이브 왕복 뒤에 이 기능을 돌리면
 *   출고일이 "아카이브를 누른 시각"으로 영구히 덮어써져 판정이 통째로 틀어진다.
 *   추정치를 박느니 비워 두는 편이 안전하다(비어 있으면 아카이브 대상에서 빠질 뿐, 화면엔 보인다).
 */
const specKey = (x: { vesselCode: string; material: string; thickness: number; width: number; length: number }) =>
  `${x.vesselCode}|${x.material}|${x.thickness}|${x.width}|${x.length}`;

export async function POST(req: NextRequest) {
  try {
    const dryRun = !!(await req.json().catch(() => ({})))?.dryRun;

    const plans = await prisma.steelPlan.findMany({
      where: { status: "COMPLETED", issuedAt: null },
      select: { id: true, vesselCode: true, material: true, thickness: true, width: true, length: true },
    });
    if (plans.length === 0) return NextResponse.json({ success: true, count: 0, skipped: 0 });
    if (dryRun) return NextResponse.json({ success: true, count: plans.length, skipped: 0 });

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

    // 2차 근거 — 같은 사양의 완료 작업일보 중 가장 이른 종료시각 (판번호가 없어도 절단 사실은 남는다)
    const logs = await prisma.cuttingLog.findMany({
      where: { status: "COMPLETED", endAt: { not: null } },
      select: {
        material: true, thickness: true, width: true, length: true, endAt: true,
        project: { select: { projectCode: true } },
        // 대체호선 — 강재는 '빌려준 호선'에서 나가므로 작업호선(projectCode)으로 키를 만들면
        //   그 강재를 영영 못 찾는다. lib/cutting-complete.ts 의 effectiveVessel 과 같은 기준으로 맞춘다.
        drawingList: { select: { alternateVesselCode: true } },
      },
    });
    const logMap = new Map<string, Date>();
    for (const l of logs) {
      if (!l.endAt || !l.material || l.thickness == null || l.width == null || l.length == null) continue;
      const vessel = l.drawingList?.alternateVesselCode?.trim() || l.project?.projectCode || "";
      if (!vessel) continue;
      const k = specKey({ vesselCode: vessel, material: l.material, thickness: l.thickness, width: l.width, length: l.length });
      const prev = logMap.get(k);
      if (!prev || l.endAt < prev) logMap.set(k, l.endAt);
    }

    // 목표 출고일별로 묶어 updateMany (효율). 근거 없는 건은 건너뛴다.
    const byIso = new Map<string, string[]>();
    let skipped = 0;
    for (const p of plans) {
      const k = specKey(p);
      const d = cutMap.get(k) ?? logMap.get(k) ?? null;
      if (!d) { skipped++; continue; }   // ★ updatedAt 폴백 금지 — 위 주석 참조
      const iso = d.toISOString();
      (byIso.get(iso) ?? byIso.set(iso, []).get(iso)!).push(p.id);
    }
    let count = 0;
    for (const [iso, ids] of byIso) {
      const r = await prisma.steelPlan.updateMany({ where: { id: { in: ids } }, data: { issuedAt: new Date(iso) } });
      count += r.count;
    }
    return NextResponse.json({ success: true, count, skipped });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

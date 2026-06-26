export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { computeCoverage, type MarkedPlate, type MatchRemnant } from "@/lib/steel-match-select";

type Spec = { vesselCode: string; material: string; thickness: number; width: number; length: number };

// GET /api/steel-match — 매칭 작업 목록
export async function GET() {
  try {
    const jobs = await prisma.steelMatchJob.findMany({ orderBy: { createdAt: "desc" } });

    // 라벨(=매칭이름)으로 작업별 출고/선별 강재를 묶어 처리수 계산.
    //  · 출고(SHIPPED_OUT) 강재도 포함 — 선별 후 출고돼도 선별수에서 빠지지 않게.
    const sel = { vesselCode: true, material: true, thickness: true, width: true, length: true, shipoutLabel: true } as const;
    const remSel = { material: true, thickness: true, width1: true, length1: true } as const;
    const [markedAll, shippedAll, markedRemRows, shippedRemItems] = await Promise.all([
      prisma.steelPlan.findMany({ where: { shipoutMarkedAt: { not: null }, shipoutLabel: { not: null } }, select: sel }),
      prisma.steelPlan.findMany({ where: { status: "SHIPPED_OUT", shipoutLabel: { not: null } }, select: sel }),
      // 잔재는 호선·작업 무관 전역 풀 (잔재 모델 자체가 작업 라벨이 없음) — 모든 작업에 공통 적용.
      // 절단 미확정(reservedFor null) 선별 잔재만 (절단확정 잔재는 출고 선별 아님 — 강재와 대칭).
      prisma.remnant.findMany({ where: { shipoutMarkedAt: { not: null }, status: { not: "EXHAUSTED" }, reservedFor: null }, select: remSel }),
      prisma.shipmentItem.findMany({
        where: { remnantId: { not: null }, vehicle: { shipment: { status: "ACTIVE" } } },
        select: { remnant: { select: remSel } },
      }),
    ]);
    const toRem = (r: { material: string; thickness: number; width1: number | null; length1: number | null }): MatchRemnant =>
      ({ material: r.material, thickness: r.thickness, width: r.width1 ?? -1, length: r.length1 ?? -1 });
    const markedRemnants  = markedRemRows.map(toRem);
    const shippedRemnants = shippedRemItems.map(it => it.remnant).filter((r): r is NonNullable<typeof r> => !!r).map(toRem);
    const groupByLabel = (rows: (MarkedPlate & { shipoutLabel: string | null })[]) => {
      const m = new Map<string, MarkedPlate[]>();
      for (const p of rows) {
        const k = p.shipoutLabel!;
        let arr = m.get(k);
        if (!arr) { arr = []; m.set(k, arr); }
        arr.push(p);
      }
      return m;
    };
    const markedByLabel  = groupByLabel(markedAll);
    const shippedByLabel = groupByLabel(shippedAll);

    return NextResponse.json({
      success: true,
      data: jobs.map(j => {
        const specs = (Array.isArray(j.specs) ? j.specs : []) as unknown as Spec[];
        const cov = computeCoverage(specs, {
          shippedPlates: shippedByLabel.get(j.name) ?? [],
          markedPlates:  markedByLabel.get(j.name) ?? [],
          shippedRemnants, markedRemnants,
        });
        const selectedCount = cov.filter(c => c !== null).length;          // 처리(선별+출고)
        const shippedCount  = cov.filter(c => c?.state === "shipped").length; // 그중 출고
        return {
          id: j.id,
          name: j.name,
          author: j.author,
          statuses: j.statuses,
          reservedFilter: j.reservedFilter,
          specCount: specs.length,
          selectedCount,
          shippedCount,
          createdAt: j.createdAt.toISOString(),
        };
      }),
    });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

// POST /api/steel-match — 매칭 작업 생성 (업로드 사양 + 이름 + 대상 상태 저장)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const name = (body.name ?? "").toString().trim();
    const author = body.author ? String(body.author).trim() : null;
    const statuses = (body.statuses ?? "ALL").toString();
    const reservedFilter = body.reservedFilter === "NONE" ? "NONE" : "ANY";
    const rawSpecs: unknown[] = Array.isArray(body.specs) ? body.specs : [];

    if (!name) {
      return NextResponse.json({ success: false, error: "매칭 이름을 입력하세요." }, { status: 400 });
    }
    if (!author) {
      return NextResponse.json({ success: false, error: "작성자를 입력하세요." }, { status: 400 });
    }

    const specs: Spec[] = rawSpecs
      .map((raw) => {
        const s = raw as Record<string, unknown>;
        return {
          vesselCode: s.vesselCode ? String(s.vesselCode).trim() : "",
          material:   String(s.material ?? "").trim(),
          thickness:  Number(s.thickness),
          width:      Number(s.width),
          length:     Number(s.length),
        };
      })
      .filter((s) => s.material && s.thickness && s.width && s.length);

    if (specs.length === 0) {
      return NextResponse.json({ success: false, error: "유효한 사양 행이 없습니다. (재질·두께·폭·길이 필요)" }, { status: 400 });
    }

    const job = await prisma.steelMatchJob.create({
      data: { name, author, statuses, reservedFilter, specs: specs as unknown as Prisma.InputJsonValue },
    });
    return NextResponse.json({ success: true, data: { id: job.id } }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

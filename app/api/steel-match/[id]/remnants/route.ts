export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// 강재매칭 — 저장된 사양을 잔재(여유원재/등록잔재/현장잔재)와 매칭.
// GET /api/steel-match/[id]/remnants?type=SURPLUS|REGISTERED|REMNANT
//   잔재 매칭은 사양(재질·두께·폭·길이)만 기준 — 호선 무관 (잔재는 크기로 재활용).
//   치수는 잔재의 width1/length1(전체폭·전체길이) 기준.

const fmtT = (v: number) => parseFloat(v.toFixed(1));
const fmtL = (v: number) => Math.round(v);
const calcWeight = (t: number, w: number, l: number) => parseFloat(((t * w * l * 7.85) / 1_000_000).toFixed(1));

type Spec = { vesselCode: string; material: string; thickness: number; width: number; length: number };
const TYPES = ["SURPLUS", "REGISTERED", "REMNANT"] as const;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const type = new URL(req.url).searchParams.get("type") ?? "";
    if (!(TYPES as readonly string[]).includes(type)) {
      return NextResponse.json({ success: false, error: "type 이 올바르지 않습니다." }, { status: 400 });
    }

    const job = await prisma.steelMatchJob.findUnique({ where: { id } });
    if (!job) return NextResponse.json({ success: false, error: "매칭 작업을 찾을 수 없습니다." }, { status: 404 });
    const specs = (Array.isArray(job.specs) ? job.specs : []) as unknown as Spec[];

    const remnants = await prisma.remnant.findMany({
      where: { type: type as "SURPLUS" | "REGISTERED" | "REMNANT" },
      include: { sourceProject: { select: { projectCode: true } } },
      orderBy: { createdAt: "asc" },
    });

    const remRows = remnants.map(r => ({
      id: r.id,
      remnantNo: r.remnantNo,
      shape: r.shape,
      material: r.material,
      thickness: r.thickness,
      width1: r.width1,
      length1: r.length1,
      width2: r.width2,
      length2: r.length2,
      weight: r.weight,
      location: r.location,
      heatNo: r.heatNo,
      status: r.status,
      shipoutMarkedAt: r.shipoutMarkedAt ? r.shipoutMarkedAt.toISOString() : null,
      reservedFor: r.reservedFor,
      vessel: r.sourceVesselName || r.sourceProject?.projectCode || "",
    }));
    type RemRow = (typeof remRows)[number];

    // 사양 매칭 — 재질 + 두께 + 폭(width1) + 길이(length1). 호선 무관.
    const matchSpec = (s: Spec, r: RemRow) =>
      r.material.trim().toUpperCase() === s.material.trim().toUpperCase() &&
      fmtT(r.thickness) === fmtT(s.thickness) &&
      r.width1 != null && fmtL(r.width1) === fmtL(s.width) &&
      r.length1 != null && fmtL(r.length1) === fmtL(s.length);

    const rows: { matched: boolean; spec: Spec; remnant: (RemRow & { weightCalc: number }) | null }[] = [];
    const seen = new Set<string>();
    for (const s of specs) {
      const ms = remRows.filter(r => matchSpec(s, r));
      let pushed = false;
      for (const r of ms) {
        if (seen.has(r.id)) continue;
        seen.add(r.id);
        // 잔재는 저장 중량 사용 (불규칙형 면적식 부정확 방지). 없으면 사양으로 계산.
        const weightCalc = r.weight || calcWeight(r.thickness, r.width1 ?? 0, r.length1 ?? 0);
        rows.push({ matched: true, spec: s, remnant: { ...r, weightCalc } });
        pushed = true;
      }
      // 매칭 잔재가 없거나 모두 앞선 동일사양에 소비됨 → 사양이 사라지지 않게 미매칭 행 유지
      if (!pushed) rows.push({ matched: false, spec: s, remnant: null });
    }

    return NextResponse.json({ success: true, data: { rows } });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

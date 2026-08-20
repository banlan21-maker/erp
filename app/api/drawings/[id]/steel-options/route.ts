export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/drawings/[id]/steel-options
 *
 * 그 도면행을 자를 수 있는 **4종 강재 후보**를 한 번에 돌려준다.
 *   ① 정규강재(SteelPlan) — 개별 선택이 아니라 '재고에서 확정 시 자동 선점' 이므로 **가능 수량**만
 *   ② 여유원재 ③ 등록잔재 ④ 현장잔재 — 실제 고를 수 있는 잔재 목록
 *
 * 잔재 후보 조건: 재고(IN_STOCK) · 미확정(reservedFor null 또는 이 도면이 이미 쓰는 것) · 외부출고 미선별.
 * 사양은 **거르지 않고 판정만 붙인다**(fits/reason) — 현장이 조금 큰 판을 일부러 쓰는 경우가 있어
 * 화면에서 경고만 하고 선택 자체는 막지 않는다. 정렬은 '맞는 것 → 면적 작은 것' 순.
 */
const up = (s: string | null | undefined) => (s ?? "").trim().toUpperCase();

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const d = await prisma.drawingList.findUnique({
      where: { id },
      include: { project: { select: { projectCode: true } } },
    });
    if (!d) return NextResponse.json({ success: false, error: "도면을 찾을 수 없습니다." }, { status: 404 });

    const vessel = d.alternateVesselCode?.trim() || d.project.projectCode;
    const block  = d.block ?? "UNKNOWN";
    const mineFmt = [`${d.project.projectCode}/${block}`, block];

    // ── ① 정규강재 재고 (확정 가능 = RECEIVED + 미확정 + 외부출고 미선별) ──
    const [planAvailable, planReservedElsewhere, planShipoutMarked] = await Promise.all([
      prisma.steelPlan.count({ where: {
        vesselCode: vessel, material: d.material, thickness: d.thickness, width: d.width, length: d.length,
        status: "RECEIVED", reservedFor: null, shipoutMarkedAt: null, archivedAt: null,
      }}),
      prisma.steelPlan.count({ where: {
        vesselCode: vessel, material: d.material, thickness: d.thickness, width: d.width, length: d.length,
        status: "RECEIVED", NOT: { reservedFor: null }, archivedAt: null,
      }}),
      prisma.steelPlan.count({ where: {
        vesselCode: vessel, material: d.material, thickness: d.thickness, width: d.width, length: d.length,
        status: "RECEIVED", NOT: { shipoutMarkedAt: null }, archivedAt: null,
      }}),
    ]);

    // ── ②③④ 잔재 후보 ──────────────────────────────────────────────────
    const remnants = await prisma.remnant.findMany({
      where: {
        status: "IN_STOCK",
        shipoutMarkedAt: null,
        OR: [{ reservedFor: null }, ...(d.assignedRemnantId ? [{ id: d.assignedRemnantId }] : [])],
      },
      select: {
        id: true, remnantNo: true, type: true, shape: true, material: true, thickness: true,
        width1: true, width2: true, length1: true, length2: true, weight: true,
        heatNo: true, location: true, reservedFor: true,
        sourceBlock: true, sourceVesselName: true,
        sourceProject: { select: { projectCode: true } },
      },
    });

    const judge = (r: (typeof remnants)[number]) => {
      const reasons: string[] = [];
      if (up(r.material) !== up(d.material)) reasons.push(`재질 다름(${r.material})`);
      if (r.thickness !== d.thickness)       reasons.push(`두께 다름(${r.thickness}t)`);
      if ((r.width1 ?? 0) < d.width)         reasons.push("폭 부족");
      if ((r.length1 ?? 0) < d.length)       reasons.push("길이 부족");
      return { fits: reasons.length === 0, reason: reasons.join(" · ") };
    };

    const rows = remnants.map(r => {
      const j = judge(r);
      return {
        ...r,
        sourceVessel: r.sourceProject?.projectCode ?? r.sourceVesselName ?? null,
        area: (r.width1 ?? 0) * (r.length1 ?? 0),
        isCurrent: r.id === d.assignedRemnantId,
        ...j,
      };
    }).sort((a, b) => (a.fits === b.fits ? a.area - b.area : a.fits ? -1 : 1));

    const byType = (t: string) => rows.filter(r => r.type === t);

    return NextResponse.json({
      success: true,
      drawing: {
        id: d.id, block: d.block, drawingNo: d.drawingNo, status: d.status,
        material: d.material, thickness: d.thickness, width: d.width, length: d.length,
        vessel, assignedRemnantId: d.assignedRemnantId, mineFmt,
      },
      plan: { available: planAvailable, reservedElsewhere: planReservedElsewhere, shipoutMarked: planShipoutMarked },
      surplus:    byType("SURPLUS"),
      registered: byType("REGISTERED"),
      remnant:    byType("REMNANT"),
    });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

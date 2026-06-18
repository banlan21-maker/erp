/**
 * 출고등록 — 판번호로 입고 강재 매칭
 *
 * GET /api/steel-plan/shipout-match?heatNo=XXXX&exclude=id1,id2
 *   1) 판번호(heatNo)로 SteelPlanHeat 찾기 (SHIPPED 제외)
 *   2) 그 판의 사양과 같은 입고(RECEIVED) 강재 중 아직 출고확정 안 됐고
 *      이번에 안 고른(exclude) 것 1장을 FIFO(입고일/생성일 순)로 반환
 *
 *   반환:
 *     matched=true  → { plan: {...} }
 *     matched=false → reason: "NOT_FOUND"(없는 판번호) | "NOT_RECEIVED"(입고분 없음/소진)
 */
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const FLOAT_TOL = 0.001;

export async function GET(req: NextRequest) {
  try {
    const sp = new URL(req.url).searchParams;
    const heatNo = (sp.get("heatNo") ?? "").trim();
    const exclude = (sp.get("exclude") ?? "").split(",").filter(Boolean);
    if (!heatNo) {
      return NextResponse.json({ success: false, error: "판번호를 입력하세요." }, { status: 400 });
    }

    // 1) 판번호로 미사용(WAITING) 원판 찾기 — CUT(절단 소진)·SHIPPED(출고)는 원판이 없으므로 제외
    const heat = await prisma.steelPlanHeat.findFirst({
      where: { heatNo, status: "WAITING" },
      orderBy: { createdAt: "asc" },
    });
    if (!heat) {
      // 존재 자체가 없는지 / 이미 절단·출고로 소진됐는지 구분해 현장 오입력을 노출
      const exists = await prisma.steelPlanHeat.findFirst({ where: { heatNo }, select: { id: true } });
      return NextResponse.json({ success: true, matched: false, reason: exists ? "ALREADY_USED" : "NOT_FOUND", heatNo });
    }

    // 같은 판번호로 이미 출고확정된 강재가 있으면 중복 소진 방지 (모달 재오픈/다른 세션 대비)
    const dup = await prisma.steelPlan.findFirst({
      where: { shipoutHeatNo: heatNo, shipoutMarkedAt: { not: null } },
      select: { id: true },
    });
    if (dup) {
      return NextResponse.json({ success: true, matched: false, reason: "ALREADY_MARKED", heatNo });
    }

    // 2) 같은 사양의 입고 강재 중 아직 출고확정 안 됐고 이번에 안 고른 것 1장 (FIFO)
    const plan = await prisma.steelPlan.findFirst({
      where: {
        vesselCode: heat.vesselCode,
        material:   heat.material,
        thickness: { gte: heat.thickness - FLOAT_TOL, lte: heat.thickness + FLOAT_TOL },
        width:     { gte: heat.width - FLOAT_TOL, lte: heat.width + FLOAT_TOL },
        length:    { gte: heat.length - FLOAT_TOL, lte: heat.length + FLOAT_TOL },
        status: "RECEIVED",
        shipoutMarkedAt: null,
        ...(exclude.length ? { id: { notIn: exclude } } : {}),
      },
      orderBy: [{ receivedAt: "asc" }, { createdAt: "asc" }],
    });
    if (!plan) {
      return NextResponse.json({ success: true, matched: false, reason: "NOT_RECEIVED", heatNo });
    }

    return NextResponse.json({
      success: true,
      matched: true,
      heatNo,
      plan: {
        id: plan.id,
        vesselCode: plan.vesselCode,
        material: plan.material,
        thickness: plan.thickness,
        width: plan.width,
        length: plan.length,
        storageLocation: plan.storageLocation,
        status: plan.status,
      },
    });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "조회 실패" }, { status: 500 });
  }
}

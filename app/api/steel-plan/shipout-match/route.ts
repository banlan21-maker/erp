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
import { findHeatsByNo, heatExists } from "@/lib/heat-lookup";

const FLOAT_TOL = 0.001;

export async function GET(req: NextRequest) {
  try {
    const sp = new URL(req.url).searchParams;
    const heatNo = (sp.get("heatNo") ?? "").trim();
    const exclude = (sp.get("exclude") ?? "").split(",").filter(Boolean);
    if (!heatNo) {
      return NextResponse.json({ success: false, error: "판번호를 입력하세요." }, { status: 400 });
    }

    // 1) 판번호로 미사용(WAITING) 원판 찾기 — CUT(절단 소진)·SHIPPED(출고)는 원판이 없으므로 제외.
    //    표기 정규화 폴백(R15)으로 하이픈 등 표기차 흡수(SUS-4 ↔ SUS4).
    const heats = await findHeatsByNo(heatNo, "WAITING");
    if (heats.length === 0) {
      // 존재 자체가 없는지 / 이미 절단·출고로 소진됐는지 구분해 현장 오입력을 노출
      const exists = await heatExists(heatNo);
      return NextResponse.json({ success: true, matched: false, reason: exists ? "ALREADY_USED" : "NOT_FOUND", heatNo });
    }
    const heat = heats[0];

    // 규격 매칭 — 호선은 걸지 않는다(R12). 판번호는 철판 고유번호이고 호선은 입고 예산 꼬리표일 뿐.
    // 야드에 자매호선 철판이 섞여 쌓이므로 호선으로 잠그면 유용 강재 선별이 막힌다.
    const specWhere = {
      material:   heat.material,
      thickness: { gte: heat.thickness - FLOAT_TOL, lte: heat.thickness + FLOAT_TOL },
      width:     { gte: heat.width - FLOAT_TOL, lte: heat.width + FLOAT_TOL },
      length:    { gte: heat.length - FLOAT_TOL, lte: heat.length + FLOAT_TOL },
      ...(exclude.length ? { id: { notIn: exclude } } : {}),
    };

    // 같은 판번호(정규화 일치 포함)로 이미 출고확정된 강재가 있으면 중복 소진 방지 (모달 재오픈/다른 세션 대비)
    const markHeatNos = heats.map(h => h.heatNo);
    const dup = await prisma.steelPlan.findFirst({
      where: {
        shipoutHeatNo: { in: markHeatNos }, shipoutMarkedAt: { not: null },
        material: specWhere.material, thickness: specWhere.thickness, width: specWhere.width, length: specWhere.length,
      },
      select: { id: true },
    });
    if (dup) {
      return NextResponse.json({ success: true, matched: false, reason: "ALREADY_MARKED", heatNo });
    }

    // 2) 같은 규격의 입고 강재 중 아직 출고확정 안 됐고 이번에 안 고른 것 1장.
    //    같은 호선을 먼저(receivedAt·createdAt FIFO), 없으면 타 호선. 현장이 대개 같은 호선을 집기 때문.
    const availWhere = { ...specWhere, status: "RECEIVED" as const, shipoutMarkedAt: null, reservedFor: null };
    const plan =
      await prisma.steelPlan.findFirst({
        where: { ...availWhere, vesselCode: heat.vesselCode },
        orderBy: [{ receivedAt: "asc" }, { createdAt: "asc" }],
      })
      ?? await prisma.steelPlan.findFirst({
        where: availWhere,
        orderBy: [{ receivedAt: "asc" }, { createdAt: "asc" }],
      });
    if (!plan) {
      // N4: 후보 0건일 때 원인 세분화 — 사용자가 정확한 다음 액션을 알 수 있게. (호선 무관으로 판정)
      //     (a) 확정(reservedFor) 때문에 제외 → RESERVED_FOR_CUTTING (확정취소 필요)
      //     (b) 그 외 → NOT_RECEIVED (실제 미입고/투입/절단/외부)
      const reserved = await prisma.steelPlan.findFirst({
        where: { ...specWhere, status: "RECEIVED", shipoutMarkedAt: null, reservedFor: { not: null } },
        select: { id: true, reservedFor: true },
      });
      if (reserved) {
        return NextResponse.json({
          success: true, matched: false,
          reason: "RESERVED_FOR_CUTTING",
          heatNo,
          reservedFor: reserved.reservedFor,
        });
      }
      return NextResponse.json({ success: true, matched: false, reason: "NOT_RECEIVED", heatNo });
    }

    return NextResponse.json({
      success: true,
      matched: true,
      // 입력이 하이픈을 빼고 들어왔어도 DB 등록 표기로 응답 — 선별목록·거래명세표에 실물 라벨 표기
      heatNo: heat.heatNo,
      plan: {
        id: plan.id,
        vesselCode: plan.vesselCode,
        material: plan.material,
        thickness: plan.thickness,
        width: plan.width,
        length: plan.length,
        storageLocation: plan.storageLocation,
        status: plan.status,
        // 입력 판번호의 호선과 다른 호선의 강재인가 (UI 가 실물 대조 경고 배지)
        otherVessel: plan.vesselCode !== heat.vesselCode,
      },
    });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "조회 실패" }, { status: 500 });
  }
}

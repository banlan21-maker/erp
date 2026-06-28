/**
 * 현장 출고관리 — 잔재번호로 출고 가능한 잔재 조회 (여유원재/등록잔재/현장잔재)
 *
 * GET /api/remnants/shipout-field?remnantNo=XXXX
 *   잔재번호(고유)로 잔재 1건을 찾아 출고 가능 여부 판정.
 *   출고 가능 = status=IN_STOCK + reservedFor=null + 활성 출고장에 미포함.
 *
 *   matched=true  → { remnant: { ...사양 } }
 *   matched=false → reason: NOT_FOUND | RESERVED(절단확정) | EXHAUSTED(소진) | PENDING(미절단) | ALREADY_SHIPPED
 */
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const remnantNo = (new URL(req.url).searchParams.get("remnantNo") ?? "").trim();
    if (!remnantNo) return NextResponse.json({ success: false, error: "잔재번호를 입력하세요." }, { status: 400 });

    const r = await prisma.remnant.findFirst({
      where: { remnantNo },
      include: { sourceProject: { select: { projectCode: true } } },
    });
    if (!r) return NextResponse.json({ success: true, matched: false, reason: "NOT_FOUND", remnantNo });
    if (r.status === "EXHAUSTED") return NextResponse.json({ success: true, matched: false, reason: "EXHAUSTED", remnantNo });
    if (r.reservedFor)           return NextResponse.json({ success: true, matched: false, reason: "RESERVED", remnantNo });
    if (r.status !== "IN_STOCK") return NextResponse.json({ success: true, matched: false, reason: "PENDING", remnantNo });

    // 이미 활성 출고장에 포함된 잔재인지
    const active = await prisma.shipmentItem.findFirst({
      where: { remnantId: r.id, vehicle: { shipment: { status: "ACTIVE" } } },
      select: { id: true },
    });
    if (active) return NextResponse.json({ success: true, matched: false, reason: "ALREADY_SHIPPED", remnantNo });

    return NextResponse.json({
      success: true,
      matched: true,
      remnantNo,
      remnant: {
        id: r.id,
        remnantNo: r.remnantNo,
        type: r.type,
        vesselCode: r.sourceVesselName || r.sourceProject?.projectCode || "",
        material: r.material,
        thickness: r.thickness,
        width1: r.width1,
        length1: r.length1,
        weight: r.weight,
        heatNo: r.heatNo,
        location: r.location,
      },
    });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "조회 실패" }, { status: 500 });
  }
}

/**
 * 거래명세서 자재 행 인라인 편집
 * PATCH /api/shipments/[id]/vehicles/[vid]/items/[iid]
 *   body: { block?, cutScheduledDate?, classSociety?, drawingNo?, cuttingEquipment?, selectionOrderNo? }
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const norm = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
};

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; vid: string; iid: string }> }
) {
  try {
    const { id, vid, iid } = await params;
    const body = await req.json();

    const item = await prisma.shipmentItem.findUnique({
      where: { id: iid },
      select: { vehicleId: true, steelPlanId: true, vehicle: { select: { shipmentId: true } } },
    });
    if (!item || item.vehicleId !== vid || item.vehicle.shipmentId !== id) {
      return NextResponse.json({ success: false, error: "자재를 찾을 수 없습니다." }, { status: 404 });
    }
    // 원판(steelPlanId) 항목의 판번호는 판번호 마스터(SteelPlanHeat)와 결합돼 있어 스냅샷 단독 편집 금지.
    // (편집하면 마스터·취소복원이 옛 판번호를 따라가 정합이 깨짐. 변경은 출고 취소 후 재등록으로.)
    if (body.heatNo !== undefined && item.steelPlanId) {
      return NextResponse.json({ success: false, error: "원판 출고의 판번호는 여기서 변경할 수 없습니다. 출고 취소 후 다시 등록하세요." }, { status: 400 });
    }

    const data: Record<string, unknown> = {};
    if (body.block            !== undefined) data.block            = norm(body.block);
    if (body.classSociety     !== undefined) data.classSociety     = norm(body.classSociety);
    if (body.drawingNo        !== undefined) data.drawingNo        = norm(body.drawingNo);
    if (body.cuttingEquipment !== undefined) data.cuttingEquipment = norm(body.cuttingEquipment);
    if (body.selectionOrderNo !== undefined) data.selectionOrderNo = norm(body.selectionOrderNo);
    if (body.cutScheduledDate !== undefined) {
      data.cutScheduledDate =
        typeof body.cutScheduledDate === "string" && /^\d{4}-\d{2}-\d{2}/.test(body.cutScheduledDate)
          ? new Date(body.cutScheduledDate) : null;
    }
    if (body.heatNo !== undefined) data.heatNo = norm(body.heatNo);

    const updated = await prisma.shipmentItem.update({ where: { id: iid }, data });
    return NextResponse.json({
      success: true,
      data: {
        ...updated,
        cutScheduledDate: updated.cutScheduledDate?.toISOString() ?? null,
        createdAt: updated.createdAt.toISOString(),
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "수정 실패";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

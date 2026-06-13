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
      select: { vehicleId: true, vehicle: { select: { shipmentId: true } } },
    });
    if (!item || item.vehicleId !== vid || item.vehicle.shipmentId !== id) {
      return NextResponse.json({ success: false, error: "자재를 찾을 수 없습니다." }, { status: 404 });
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

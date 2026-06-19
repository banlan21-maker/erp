/**
 * 거래명세서 차분별 양식 필드 인라인 편집
 *
 * PATCH /api/shipments/[id]/vehicles/[vid]
 *   body: { issueDate?, writerName?, writerPhone?, receiverName? }
 *   또는 차량 정보 수정 가능 (driverName/driverPhone 등)
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
  { params }: { params: Promise<{ id: string; vid: string }> }
) {
  try {
    const { id, vid } = await params;
    const body = await req.json();

    const data: Record<string, unknown> = {};
    if (body.issueDate !== undefined) {
      const v = typeof body.issueDate === "string" && /^\d{4}-\d{2}-\d{2}/.test(body.issueDate) ? new Date(body.issueDate) : null;
      data.issueDate = v;
    }
    if (body.writerName   !== undefined) data.writerName   = norm(body.writerName);
    if (body.writerPhone  !== undefined) data.writerPhone  = norm(body.writerPhone);
    if (body.receiverName !== undefined) data.receiverName = norm(body.receiverName);
    // 차량번호는 거래명세표 출력 전에 입력 — 시작값이 빈 문자열일 수 있으므로 빈값 허용("" 저장)
    if (body.vehicleNo    !== undefined) data.vehicleNo = norm(body.vehicleNo) ?? "";
    if (body.driverName  !== undefined) data.driverName  = norm(body.driverName);
    if (body.driverPhone !== undefined) data.driverPhone = norm(body.driverPhone);
    if (body.loadLimit   !== undefined) data.loadLimit   = body.loadLimit == null ? null : Number(body.loadLimit);

    // shipment id 가드
    const v = await prisma.shipmentVehicle.findUnique({ where: { id: vid }, select: { shipmentId: true } });
    if (!v || v.shipmentId !== id) {
      return NextResponse.json({ success: false, error: "차분을 찾을 수 없습니다." }, { status: 404 });
    }

    const updated = await prisma.shipmentVehicle.update({
      where: { id: vid },
      data,
      include: { items: true },
    });
    return NextResponse.json({
      success: true,
      data: {
        ...updated,
        issueDate:  updated.issueDate?.toISOString()  ?? null,
        invoicedAt: updated.invoicedAt?.toISOString() ?? null,
        createdAt:  updated.createdAt.toISOString(),
        updatedAt:  updated.updatedAt.toISOString(),
        items: updated.items.map(it => ({
          ...it,
          cutScheduledDate: it.cutScheduledDate?.toISOString() ?? null,
          createdAt: it.createdAt.toISOString(),
        })),
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "수정 실패";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

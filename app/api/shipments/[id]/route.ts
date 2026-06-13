import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const s = await prisma.shipment.findUnique({
    where: { id },
    include: { vehicles: { orderBy: { sequence: "asc" }, include: { items: true } } },
  });
  if (!s) return NextResponse.json({ success: false, error: "존재하지 않습니다." }, { status: 404 });
  return NextResponse.json({
    success: true,
    data: {
      ...s,
      shippedAt:   s.shippedAt.toISOString(),
      cancelledAt: s.cancelledAt?.toISOString() ?? null,
      createdAt:   s.createdAt.toISOString(),
      updatedAt:   s.updatedAt.toISOString(),
      vehicles: s.vehicles.map(v => ({
        ...v,
        invoicedAt: v.invoicedAt?.toISOString() ?? null,
        createdAt:  v.createdAt.toISOString(),
        updatedAt:  v.updatedAt.toISOString(),
        items: v.items.map(it => ({ ...it, createdAt: it.createdAt.toISOString() })),
      })),
    },
  });
}

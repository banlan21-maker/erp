export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import ShipmentDetailMain from "@/components/shipment-detail-main";

interface PageProps { params: Promise<{ id: string }> }

export default async function ShipmentDetailPage({ params }: PageProps) {
  const { id } = await params;
  const s = await prisma.shipment.findUnique({
    where: { id },
    include: { vehicles: { orderBy: { sequence: "asc" }, include: { items: true } } },
  });
  if (!s) notFound();

  const serialized = {
    id:           s.id,
    shipmentNo:   s.shipmentNo,
    shippedAt:    s.shippedAt.toISOString(),
    status:       s.status,
    cancelledAt:  s.cancelledAt?.toISOString() ?? null,
    cancelReason: s.cancelReason,
    memo:         s.memo,
    vehicles: s.vehicles.map(v => ({
      id:              v.id,
      sequence:        v.sequence,
      vehicleNo:       v.vehicleNo,
      driverName:      v.driverName,
      driverPhone:     v.driverPhone,
      invoiceNo:       v.invoiceNo,
      totalWeight:     v.totalWeight,
      loadLimit:       v.loadLimit,
      supplierSnapshot: v.supplierSnapshot as { name?: string | null; bizNo?: string | null } | null,
      deliverySnapshot: v.deliverySnapshot as { name?: string | null; bizNo?: string | null } | null,
      items: v.items.map(it => ({
        id:         it.id,
        vesselCode: it.vesselCode,
        material:   it.material,
        thickness:  it.thickness,
        width:      it.width,
        length:     it.length,
        weight:     it.weight,
        block:      it.block,
        heatNo:     it.heatNo,
      })),
    })),
  };

  return <ShipmentDetailMain initial={serialized} />;
}

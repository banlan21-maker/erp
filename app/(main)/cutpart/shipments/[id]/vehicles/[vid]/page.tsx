export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import InvoicePrint, { type InvoiceVehicle, type SupplierSnapshot } from "@/components/invoice-print";

interface PageProps {
  params: Promise<{ id: string; vid: string }>;
}

export default async function ShipmentVehicleInvoicePage({ params }: PageProps) {
  const { id, vid } = await params;
  const v = await prisma.shipmentVehicle.findUnique({
    where: { id: vid },
    include: { items: true, shipment: true },
  });
  if (!v || v.shipmentId !== id) notFound();

  const dataForClient: InvoiceVehicle = {
    id:           v.id,
    shipmentId:   v.shipmentId,
    sequence:     v.sequence,
    vehicleNo:    v.vehicleNo,
    driverName:   v.driverName,
    driverPhone:  v.driverPhone,
    invoiceNo:    v.invoiceNo,
    issueDate:    v.issueDate?.toISOString() ?? null,
    writerName:   v.writerName,
    writerPhone:  v.writerPhone,
    receiverName: v.receiverName,
    supplierSnapshot: (v.supplierSnapshot as SupplierSnapshot | null) ?? null,
    deliverySnapshot: (v.deliverySnapshot as SupplierSnapshot | null) ?? null,
    items: v.items.map(it => ({
      id:               it.id,
      vesselCode:       it.vesselCode,
      material:         it.material,
      thickness:        it.thickness,
      width:            it.width,
      length:           it.length,
      weight:           it.weight,
      block:            it.block,
      heatNo:           it.heatNo,
      remnantNo:        it.remnantNo,
      cutScheduledDate: it.cutScheduledDate?.toISOString() ?? null,
      classSociety:     it.classSociety,
      drawingNo:        it.drawingNo,
      cuttingEquipment: it.cuttingEquipment,
      selectionOrderNo: it.selectionOrderNo,
    })),
  };

  return (
    <div className="space-y-4 print:space-y-0">
      <div className="no-print flex items-center gap-2 text-sm print:hidden">
        <a href={`/cutpart/shipments/${id}`} className="text-blue-600 hover:underline">← 출고장 {v.shipment.shipmentNo}</a>
        <span className="text-gray-400">/ 차분 #{v.sequence} ({v.vehicleNo})</span>
      </div>
      <InvoicePrint vehicle={dataForClient} />
    </div>
  );
}

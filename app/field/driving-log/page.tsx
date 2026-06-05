export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import FieldTransportTabs from "@/components/field-transport-tabs";

export const metadata: Metadata = { title: "현장 운송 등록" };

export default async function FieldDrivingLogPage() {
  const [vehicles, workers] = await Promise.all([
    prisma.transportVehicle.findMany({
      where: { usage: { not: "DISPOSED" }, vehicleType: "VEHICLE" },
      orderBy: { code: "asc" },
      select: { id: true, code: true, name: true, plateNo: true, mileage: true },
    }),
    prisma.worker.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, position: true },
    }),
  ]);

  return <FieldTransportTabs vehicles={vehicles} workers={workers} />;
}

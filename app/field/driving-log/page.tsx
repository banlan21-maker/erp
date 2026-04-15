export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import FieldDrivingLog from "@/components/field-driving-log";

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

  return <FieldDrivingLog vehicles={vehicles} workers={workers} />;
}

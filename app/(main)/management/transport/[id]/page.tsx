import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import TransportCard from "@/components/transport-card";

export const dynamic = "force-dynamic";

export default async function TransportCardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const vehicle = await prisma.transportVehicle.findUnique({
    where: { id },
    include: {
      specs: { orderBy: { sortOrder: "asc" } },
      consumables: {
        orderBy: { sortOrder: "asc" },
        include: { logs: { orderBy: { replacedAt: "desc" } } },
      },
      inspections: {
        include: { logs: { orderBy: { completedAt: "desc" } } },
      },
      repairs: { orderBy: { repairedAt: "desc" } },
    },
  });

  if (!vehicle) notFound();

  const serialized = {
    ...vehicle,
    acquiredAt: vehicle.acquiredAt ? vehicle.acquiredAt.toISOString().split("T")[0] : null,
    insuranceExpiry: vehicle.insuranceExpiry ? vehicle.insuranceExpiry.toISOString().split("T")[0] : null,
    inspExpiry: vehicle.inspExpiry ? vehicle.inspExpiry.toISOString().split("T")[0] : null,
    createdAt: vehicle.createdAt.toISOString(),
    updatedAt: vehicle.updatedAt.toISOString(),
    consumables: vehicle.consumables.map(c => ({
      ...c,
      lastReplacedAt: c.lastReplacedAt ? c.lastReplacedAt.toISOString().split("T")[0] : "",
      nextReplaceAt: c.nextReplaceAt ? c.nextReplaceAt.toISOString().split("T")[0] : null,
      logs: c.logs.map(log => ({
        ...log,
        replacedAt: log.replacedAt.toISOString().split("T")[0],
        createdAt: log.createdAt.toISOString(),
      })),
    })),
    inspections: vehicle.inspections.map(ins => ({
      ...ins,
      lastInspectedAt: ins.lastInspectedAt ? ins.lastInspectedAt.toISOString().split("T")[0] : "",
      nextInspectAt: ins.nextInspectAt ? ins.nextInspectAt.toISOString().split("T")[0] : null,
      logs: ins.logs.map(log => ({
        ...log,
        completedAt: log.completedAt.toISOString().split("T")[0],
        createdAt: log.createdAt.toISOString(),
      })),
    })),
    repairs: vehicle.repairs.map(r => ({
      ...r,
      repairedAt: r.repairedAt.toISOString().split("T")[0],
      createdAt: r.createdAt.toISOString(),
    })),
  };

  return <TransportCard vehicle={serialized} />;
}

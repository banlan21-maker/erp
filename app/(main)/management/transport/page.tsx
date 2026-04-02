import { prisma } from "@/lib/prisma";
import TransportMain from "@/components/transport-main";

export const dynamic = "force-dynamic";

export default async function TransportPage() {
  const vehicles = await prisma.transportVehicle.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      specs: { orderBy: { sortOrder: "asc" } },
      consumables: { orderBy: { sortOrder: "asc" } },
      inspections: true,
    },
  });

  const serialized = vehicles.map(v => ({
    ...v,
    acquiredAt: v.acquiredAt ? v.acquiredAt.toISOString().split("T")[0] : null,
    insuranceExpiry: v.insuranceExpiry ? v.insuranceExpiry.toISOString().split("T")[0] : null,
    inspExpiry: v.inspExpiry ? v.inspExpiry.toISOString().split("T")[0] : null,
    createdAt: v.createdAt.toISOString(),
    updatedAt: v.updatedAt.toISOString(),
    consumables: v.consumables.map(c => ({
      ...c,
      lastReplacedAt: c.lastReplacedAt ? c.lastReplacedAt.toISOString().split("T")[0] : "",
      nextReplaceAt: c.nextReplaceAt ? c.nextReplaceAt.toISOString().split("T")[0] : null,
    })),
    inspections: v.inspections.map(ins => ({
      ...ins,
      lastInspectedAt: ins.lastInspectedAt ? ins.lastInspectedAt.toISOString().split("T")[0] : "",
      nextInspectAt: ins.nextInspectAt ? ins.nextInspectAt.toISOString().split("T")[0] : null,
    })),
  }));

  return <TransportMain initialVehicles={serialized} />;
}

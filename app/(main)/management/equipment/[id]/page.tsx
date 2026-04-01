import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import EquipmentCard from "@/components/equipment-card";

export const dynamic = "force-dynamic";

export default async function EquipmentCardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const equipment = await prisma.mgmtEquipment.findUnique({
    where: { id },
    include: {
      specs: { orderBy: { sortOrder: "asc" } },
      inspections: {
        include: {
          logs: { orderBy: { completedAt: "desc" } },
        },
      },
      repairs: { orderBy: { repairedAt: "desc" } },
    },
  });

  if (!equipment) notFound();

  const serialized = {
    ...equipment,
    acquiredAt: equipment.acquiredAt ? equipment.acquiredAt.toISOString().split("T")[0] : null,
    createdAt: equipment.createdAt.toISOString(),
    updatedAt: equipment.updatedAt.toISOString(),
    specs: equipment.specs,
    inspections: equipment.inspections.map(ins => ({
      ...ins,
      lastInspectedAt: ins.lastInspectedAt ? ins.lastInspectedAt.toISOString().split("T")[0] : "",
      nextInspectAt: ins.nextInspectAt ? ins.nextInspectAt.toISOString().split("T")[0] : null,
      logs: ins.logs.map(log => ({
        ...log,
        completedAt: log.completedAt.toISOString().split("T")[0],
        createdAt: log.createdAt.toISOString(),
      })),
    })),
    repairs: equipment.repairs.map(r => ({
      ...r,
      repairedAt: r.repairedAt.toISOString().split("T")[0],
      createdAt: r.createdAt.toISOString(),
    })),
  };

  return <EquipmentCard equipment={serialized} />;
}

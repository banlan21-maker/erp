import { prisma } from "@/lib/prisma";
import EquipmentMain from "@/components/equipment-main";

export const dynamic = "force-dynamic";

export default async function EquipmentPage() {
  const [equipments, kinds] = await Promise.all([
    prisma.mgmtEquipment.findMany({
      orderBy: { createdAt: "asc" },
      include: {
        specs: { orderBy: { sortOrder: "asc" } },
        inspections: true,
      },
    }),
    prisma.mgmtEquipmentKindPreset.findMany({
      orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
    }),
  ]);

  const serialized = equipments.map(eq => ({
    ...eq,
    acquiredAt: eq.acquiredAt ? eq.acquiredAt.toISOString().split("T")[0] : null,
    createdAt: eq.createdAt.toISOString(),
    updatedAt: eq.updatedAt.toISOString(),
    inspections: eq.inspections.map(ins => ({
      ...ins,
      lastInspectedAt: ins.lastInspectedAt ? ins.lastInspectedAt.toISOString().split("T")[0] : "",
      nextInspectAt: ins.nextInspectAt ? ins.nextInspectAt.toISOString().split("T")[0] : null,
    })),
  }));

  return <EquipmentMain initialEquipments={serialized} initialKinds={kinds} />;
}

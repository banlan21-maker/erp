export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import FieldSupply from "@/components/field-supply";

export default async function FieldSupplyPage() {
  const [items, vendors] = await Promise.all([
    prisma.supplyItem.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true, name: true, category: true, department: true,
        unit: true, stockQty: true, reorderPoint: true,
      },
    }),
    prisma.vendor.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, contact: true },
    }),
  ]);

  return (
    <FieldSupply
      items={items.map(i => ({ ...i, category: i.category as string, department: i.department as string }))}
      vendors={vendors}
    />
  );
}

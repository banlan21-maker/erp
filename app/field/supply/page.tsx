export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import FieldSupply from "@/components/field-supply";

export const metadata: Metadata = { title: "현장 자재 신청" };

export default async function FieldSupplyPage() {
  const [items, vendors] = await Promise.all([
    prisma.supplyItem.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true, name: true, category: true, department: true,
        subCategory: true, unit: true, stockQty: true, reorderPoint: true, location: true,
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

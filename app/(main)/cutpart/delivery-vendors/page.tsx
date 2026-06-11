export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import DeliveryVendorsMain from "@/components/delivery-vendors-main";

export const metadata: Metadata = { title: "납품처관리" };

export default async function DeliveryVendorsPage() {
  const list = await prisma.deliveryVendor.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  });

  const serialized = list.map(v => ({
    ...v,
    createdAt: v.createdAt.toISOString(),
    updatedAt: v.updatedAt.toISOString(),
  }));

  return <DeliveryVendorsMain initial={serialized} />;
}

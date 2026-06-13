export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import ExternalShipoutTabs from "@/components/external-shipout-tabs";

export const metadata: Metadata = { title: "외부출고관리" };

export default async function ExternalShipoutPage() {
  // 납품처/공급처 — 서버에서 미리 fetch
  const vendors = await prisma.deliveryVendor.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  });
  const serialized = vendors.map(v => ({
    ...v,
    createdAt: v.createdAt.toISOString(),
    updatedAt: v.updatedAt.toISOString(),
  }));

  return <ExternalShipoutTabs initialVendors={serialized} />;
}

import { prisma } from "@/lib/prisma";
import WorkersMain from "@/components/workers-main";

export const dynamic = "force-dynamic";

export default async function WorkersPage() {
  const workers = await prisma.worker.findMany({ orderBy: { createdAt: "asc" } });

  const serialized = workers.map((w) => ({
    ...w,
    joinDate:    w.joinDate    ? w.joinDate.toISOString().split("T")[0]    : null,
    birthDate:   w.birthDate   ? w.birthDate.toISOString().split("T")[0]   : null,
    visaExpiry:  w.visaExpiry  ? w.visaExpiry.toISOString().split("T")[0]  : null,
    createdAt: w.createdAt.toISOString(),
    updatedAt: w.updatedAt.toISOString(),
  }));

  return <WorkersMain workers={serialized} />;
}

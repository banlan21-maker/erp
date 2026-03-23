import { prisma } from "@/lib/prisma";
import WorkersMain from "@/components/workers-main";

export const dynamic = "force-dynamic";

export default async function WorkersPage() {
  const workers = await prisma.worker.findMany({ orderBy: { createdAt: "asc" } });

  const serialized = workers.map((w) => ({
    ...w,
    birthDate: w.birthDate ? w.birthDate.toISOString().split("T")[0] : null,
    createdAt: w.createdAt.toISOString(),
    updatedAt: w.updatedAt.toISOString(),
  }));

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">인원관리</h1>
        <p className="text-sm text-gray-500 mt-1">작업 인원을 등록하고 관리합니다.</p>
      </div>
      <WorkersMain workers={serialized} />
    </div>
  );
}

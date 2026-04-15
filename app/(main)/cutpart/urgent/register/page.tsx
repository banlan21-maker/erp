export const dynamic = "force-dynamic";

import { Zap } from "lucide-react";
import { prisma } from "@/lib/prisma";
import UrgentRegisterForm from "@/components/urgent-register-form";

export default async function UrgentRegisterPage() {
  const [projects, remnants] = await Promise.all([
    prisma.project.findMany({
      orderBy: [{ projectCode: "asc" }],
      select: { id: true, projectCode: true, projectName: true },
    }),
    prisma.remnant.findMany({
      where: { status: "IN_STOCK" },
      orderBy: { remnantNo: "asc" },
      select: { id: true, remnantNo: true, material: true, thickness: true, weight: true, needsConsult: true },
    }),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Zap size={24} className="text-orange-500" />
          돌발 등록
        </h2>
        <p className="text-sm text-gray-500 mt-0.5">신규 돌발작업을 등록합니다</p>
      </div>
      <UrgentRegisterForm projects={projects} remnants={remnants} />
    </div>
  );
}

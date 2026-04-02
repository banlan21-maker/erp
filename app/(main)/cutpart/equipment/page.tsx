export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import EquipmentManager from "@/components/equipment-manager";

export default async function EquipmentPage() {
  const equipment = await prisma.equipment.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, type: true, status: true, memo: true },
  });

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">장비 관리</h2>
        <p className="text-sm text-gray-500 mt-0.5">절단기 장비 마스터 등록·관리</p>
      </div>
      <EquipmentManager initialEquipment={equipment} />
    </div>
  );
}

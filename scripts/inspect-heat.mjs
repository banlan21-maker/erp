// 특정 판번호 상세 조회 (읽기 전용).
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const HN = process.argv[2] || "12468654635";

async function main() {
  console.log(`■ 판번호 "${HN}" 조사\n`);
  const heats = await prisma.steelPlanHeat.findMany({ where: { heatNo: HN },
    select: { vesselCode: true, material: true, thickness: true, width: true, length: true, status: true, uploadBatchNo: true } });
  console.log(`판번호리스트(SteelPlanHeat) ${heats.length}행:`);
  heats.forEach((h) => console.log(`  호선=${h.vesselCode || "(빈값)"} | ${h.material} ${h.thickness}×${h.width}×${h.length} | ${h.status} | 배치=${h.uploadBatchNo ?? "-"}`));

  const logs = await prisma.cuttingLog.findMany({ where: { heatNo: HN },
    select: { status: true, material: true, thickness: true, width: true, length: true, drawingNo: true, operator: true, startAt: true, endAt: true,
      project: { select: { projectCode: true } }, drawingList: { select: { block: true, alternateVesselCode: true } } } });
  console.log(`\n작업일보(CuttingLog) ${logs.length}건:`);
  logs.forEach((l) => console.log(`  ${l.status} | 호선=${l.project?.projectCode ?? "-"} | 대체=${l.drawingList?.alternateVesselCode ?? "-"} | block=${l.drawingList?.block ?? "-"} | ${l.material} ${l.thickness}×${l.width}×${l.length} | 도면=${l.drawingNo} | ${l.operator}`));

  const plans = await prisma.steelPlan.findMany({ where: { actualHeatNo: HN },
    select: { vesselCode: true, status: true, reservedFor: true } });
  console.log(`\n강재목록(SteelPlan, actualHeatNo=${HN}) ${plans.length}장:`);
  plans.forEach((p) => console.log(`  호선=${p.vesselCode} | ${p.status} | 확정=${p.reservedFor ?? "-"}`));

  await prisma.$disconnect();
}
main().catch(async (e) => { console.error("오류:", e.message); await prisma.$disconnect(); process.exit(1); });

// 호선명 일괄 변경 — 여러 테이블의 vessel/project 코드를 안전한 이름으로. 기본 미리보기, 쓰기는 --apply.
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const [OLD, NEW] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const APPLY = process.argv.includes("--apply");

async function main() {
  if (!OLD || !NEW) { console.error('사용법: node scripts/rename-vessel.mjs "옛이름" "새이름" [--apply]'); process.exit(1); }
  console.log(`호선명 변경: ${JSON.stringify(OLD)} → ${JSON.stringify(NEW)}  (${APPLY ? "적용" : "미리보기"})\n`);

  const c = {
    steelPlan: await prisma.steelPlan.count({ where: { vesselCode: OLD } }),
    steelPlanHeat: await prisma.steelPlanHeat.count({ where: { vesselCode: OLD } }),
    shipmentItem: await prisma.shipmentItem.count({ where: { vesselCode: OLD } }),
    project: await prisma.project.count({ where: { projectCode: OLD } }),
    remnant: await prisma.remnant.count({ where: { sourceVesselName: OLD } }),
  };
  console.log("발견:");
  Object.entries(c).forEach(([k, v]) => console.log(`  ${k}: ${v}`));

  if (APPLY) {
    await prisma.$transaction(async (tx) => {
      if (c.steelPlan) await tx.steelPlan.updateMany({ where: { vesselCode: OLD }, data: { vesselCode: NEW } });
      if (c.steelPlanHeat) await tx.steelPlanHeat.updateMany({ where: { vesselCode: OLD }, data: { vesselCode: NEW } });
      if (c.shipmentItem) await tx.shipmentItem.updateMany({ where: { vesselCode: OLD }, data: { vesselCode: NEW } });
      if (c.project) await tx.project.updateMany({ where: { projectCode: OLD }, data: { projectCode: NEW } });
      if (c.remnant) await tx.remnant.updateMany({ where: { sourceVesselName: OLD }, data: { sourceVesselName: NEW } });
    });
    console.log(`\n✔ 변경 완료.`);
  } else {
    console.log(`\n※ 미리보기. 적용: node scripts/rename-vessel.mjs "${OLD}" "${NEW}" --apply`);
  }
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error("오류:", e.message); await prisma.$disconnect(); process.exit(1); });

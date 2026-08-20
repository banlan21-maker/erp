import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const p = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const names = new Set((await p.steelMatchJob.findMany({ select: { name: true } })).map(j => j.name));
const plans = await p.steelPlan.groupBy({ by: ["shipoutLabel"], where: { NOT: { shipoutLabel: null } }, _count: { _all: true } });
const rems  = await p.remnant.groupBy({ by: ["shipoutLabel"], where: { NOT: { shipoutLabel: null } }, _count: { _all: true } });
const bad = (rows, kind) => {
  const orphan = rows.filter(r => !names.has(r.shipoutLabel));
  console.log(`■ ${kind} 라벨 ${rows.length}종 · 그중 매칭작업에 없는 이름 ${orphan.length}종 (합 ${orphan.reduce((s,x)=>s+x._count._all,0)}건)`);
  for (const o of orphan.slice(0, 12)) console.log(`     "${o.shipoutLabel}" ${o._count._all}건`);
};
bad(plans, "강재");
bad(rems, "잔재");
await p.$disconnect();

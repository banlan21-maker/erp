import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const p = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

console.log("■ 대체호선 값이 실제 강재 호선으로 존재하는가 (매칭 가능 여부)");
const alts = [...new Set((await p.drawingList.findMany({ where: { NOT: { alternateVesselCode: null } }, select: { alternateVesselCode: true } })).map(x => x.alternateVesselCode.trim()))];
for (const a of alts.sort()) {
  const n = await p.steelPlan.count({ where: { vesselCode: a } });
  console.log(`   ${a.padEnd(14)} 강재 ${String(n).padStart(5)}장 ${n === 0 ? "  ← 매칭 대상 없음" : ""}`);
}

console.log("\n■ 자기 호선을 대체호선으로 적은 행 (무의미 지정)");
const self = (await p.drawingList.findMany({ where: { NOT: { alternateVesselCode: null } }, select: { alternateVesselCode: true, status: true, project: { select: { projectCode: true } } } }))
  .filter(x => x.alternateVesselCode.trim() === (x.project?.projectCode ?? "").trim());
console.log(`   ${self.length}행 ${JSON.stringify(self.reduce((a,x)=>(a[x.status]=(a[x.status]??0)+1,a),{}))}`);

console.log("\n■ 강재 호선 목록 상위");
for (const r of (await p.steelPlan.groupBy({ by: ["vesselCode"], _count: { _all: true } })).sort((a,b)=>b._count._all-a._count._all).slice(0,14))
  console.log(`   ${(r.vesselCode ?? "(공란)").padEnd(14)} ${r._count._all}`);
await p.$disconnect();

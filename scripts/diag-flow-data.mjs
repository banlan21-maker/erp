import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const p = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const g = await p.remnant.groupBy({ by: ["type", "status"], _count: { _all: true } });
console.log("■ 잔재 종류×상태");
for (const r of g.sort((a,b)=>a.type.localeCompare(b.type))) console.log(`   ${r.type.padEnd(11)} ${r.status.padEnd(10)} ${r._count._all}`);

console.log("\n■ 등록잔재(REGISTERED) 원판 연결 상태 — 사전등록이 원판에 매달려 있는가");
const reg = await p.remnant.findMany({ where: { type: "REGISTERED" }, select: { status: true, drawingListId: true, heatNo: true, parentRemnantId: true } });
const link = { 도면연결: 0, 미연결: 0 }, hn = { 판번호있음: 0, 없음: 0 };
for (const r of reg) { r.drawingListId ? link.도면연결++ : link.미연결++; r.heatNo ? hn.판번호있음++ : hn.없음++; }
console.log(`   총 ${reg.length}건 · ${JSON.stringify(link)} · ${JSON.stringify(hn)}`);
console.log(`   부모잔재 연결(잔재→자식잔재): ${reg.filter(r=>r.parentRemnantId).length}건`);

console.log("\n■ 대체호선(alternateVesselCode) 실사용");
const alt = await p.drawingList.findMany({ where: { NOT: { alternateVesselCode: null } }, select: { alternateVesselCode: true, status: true, project: { select: { projectCode: true } } } });
console.log(`   ${alt.length}행`);
const pairs = {};
for (const a of alt) { const k = `${a.project?.projectCode} → ${a.alternateVesselCode}`; pairs[k] = (pairs[k]??0)+1; }
for (const [k,v] of Object.entries(pairs).sort((x,y)=>y[1]-x[1]).slice(0,12)) console.log(`     ${k.padEnd(24)} ${v}`);

console.log("\n■ 강재(SteelPlan) 상태 분포 — 등록/입고/확정 단계 실재 여부");
for (const r of await p.steelPlan.groupBy({ by: ["status"], _count: { _all: true } })) console.log(`   ${r.status.padEnd(14)} ${r._count._all}`);
const resv = await p.steelPlan.count({ where: { NOT: { reservedFor: null } } });
console.log(`   그중 확정(reservedFor 있음): ${resv}장`);

console.log("\n■ 도면행 상태 분포");
for (const r of await p.drawingList.groupBy({ by: ["status"], _count: { _all: true } })) console.log(`   ${r.status.padEnd(12)} ${r._count._all}`);
await p.$disconnect();

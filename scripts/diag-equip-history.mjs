import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const p = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
console.log("■ 장비", await p.mgmtEquipment.count(), "대 · 검사항목", await p.mgmtInspectionItem.count(), "개");
const rep = await p.mgmtRepairLog.findMany({ select: { repairedAt: true, cost: true, downtimeMinutes: true, costs: { select: { amount: true } } } });
const ins = await p.mgmtInspectionLog.findMany({ select: { completedAt: true } });
console.log(`■ 수선이력 ${rep.length}건 · 검사이력 ${ins.length}건`);
const by = {};
const key = (d) => new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit"}).format(d);
for (const r of rep) { const k = key(r.repairedAt); by[k] = by[k] ?? { 수선:0, 비용:0, 비가동:0, 검사:0 };
  by[k].수선++; by[k].비용 += r.costs.length ? r.costs.reduce((s,c)=>s+c.amount,0) : (r.cost ?? 0); by[k].비가동 += r.downtimeMinutes ?? 0; }
for (const g of ins) { const k = key(g.completedAt); by[k] = by[k] ?? { 수선:0, 비용:0, 비가동:0, 검사:0 }; by[k].검사++; }
console.log("\n월별:");
for (const k of Object.keys(by).sort()) {
  const v = by[k];
  console.log(`   ${k}  수선 ${String(v.수선).padStart(3)}건 · 비용 ${String(v.비용.toLocaleString()).padStart(12)}원 · 비가동 ${String(v.비가동).padStart(5)}분 · 검사 ${v.검사}건`);
}
await p.$disconnect();

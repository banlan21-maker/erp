/**
 * 외부출고분이 아카이브 판정에 제대로 걸리는지 점검 (읽기 전용).
 *
 * 아카이브 판정축:
 *   강재(SteelPlan)      status COMPLETED(절단) | SHIPPED_OUT(외부출고) + finishedAt
 *   판번호(SteelPlanHeat) status CUT(절단)      | SHIPPED(외부출고)     + cutAt / shippedAt
 * 판정 날짜가 비면 대상에서 조용히 빠진다(잘못 숨기는 것보다 안전한 설계).
 * → 외부출고분에 날짜가 비어 영영 안 숨는 것이 있는지 센다.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const p = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

console.log("■ 1) 강재(SteelPlan) — 절단 vs 외부출고");
for (const st of ["COMPLETED", "SHIPPED_OUT"]) {
  const total   = await p.steelPlan.count({ where: { status: st } });
  const noDate  = await p.steelPlan.count({ where: { status: st, finishedAt: null } });
  const arch    = await p.steelPlan.count({ where: { status: st, NOT: { archivedAt: null } } });
  const label   = st === "COMPLETED" ? "절단완료" : "외부출고";
  console.log(`   ${label.padEnd(6)} 총 ${String(total).padStart(5)}장 · 이미숨김 ${String(arch).padStart(5)} · 판정일(finishedAt) 없음 ${String(noDate).padStart(4)} ${noDate ? "← 영영 안 숨음" : ""}`);
}

console.log("\n■ 2) 판번호(SteelPlanHeat) — 절단 vs 외부출고");
const rows = [
  ["CUT", "절단", "cutAt"],
  ["SHIPPED", "외부출고", "shippedAt"],
];
for (const [st, label, field] of rows) {
  const total  = await p.steelPlanHeat.count({ where: { status: st } });
  const noDate = await p.steelPlanHeat.count({ where: { status: st, [field]: null } });
  const arch   = await p.steelPlanHeat.count({ where: { status: st, NOT: { archivedAt: null } } });
  console.log(`   ${label.padEnd(6)} 총 ${String(total).padStart(5)}건 · 이미숨김 ${String(arch).padStart(5)} · 판정일(${field}) 없음 ${String(noDate).padStart(4)} ${noDate ? "← 영영 안 숨음" : ""}`);
}

console.log("\n■ 3) 개월수별 아카이브 대상 — 절단분과 출고분을 나눠서");
function cutoffOf(m) {
  const now = new Date(), d = new Date(now);
  d.setDate(1); d.setMonth(d.getMonth() - m);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(now.getDate(), last));
  d.setHours(now.getHours(), now.getMinutes(), 0, 0);
  return d;
}
for (const m of [1, 2, 3, 6]) {
  const c = cutoffOf(m);
  const planCut  = await p.steelPlan.count({ where: { archivedAt: null, status: "COMPLETED",   finishedAt: { not: null, lte: c } } });
  const planShip = await p.steelPlan.count({ where: { archivedAt: null, status: "SHIPPED_OUT", finishedAt: { not: null, lte: c } } });
  const heatCut  = await p.steelPlanHeat.count({ where: { archivedAt: null, status: "CUT",     cutAt:     { not: null, lte: c } } });
  const heatShip = await p.steelPlanHeat.count({ where: { archivedAt: null, status: "SHIPPED", shippedAt: { not: null, lte: c } } });
  console.log(`   ${String(m).padStart(2)}개월  강재 절단 ${String(planCut).padStart(4)} + 출고 ${String(planShip).padStart(4)} = ${String(planCut + planShip).padStart(4)} | 판번호 절단 ${String(heatCut).padStart(4)} + 출고 ${String(heatShip).padStart(4)} = ${String(heatCut + heatShip).padStart(4)} | 격차 ${(planCut + planShip) - (heatCut + heatShip)}`);
}

console.log("\n■ 4) 아카이브 대상이 아닌 것 — 잔재(Remnant)");
const rg = await p.remnant.groupBy({ by: ["type", "status"], _count: { _all: true } });
for (const r of rg.sort((a, b) => a.type.localeCompare(b.type))) {
  console.log(`   ${r.type.padEnd(11)} ${r.status.padEnd(10)} ${r._count._all}`);
}
const shippedRem = await p.shipmentItem.count({ where: { remnantId: { not: null }, vehicle: { shipment: { status: "ACTIVE" } } } });
console.log(`   그중 외부출고로 나간 잔재(활성 출고장 기준): ${shippedRem}건 — 아카이브 개념 자체가 없어 목록에 계속 남는다`);

console.log("\n■ 5) 출고장(Shipment) 자체");
const sh = await p.shipment.groupBy({ by: ["status"], _count: { _all: true } });
console.log(`   ${JSON.stringify(Object.fromEntries(sh.map(x => [x.status, x._count._all])))} — 출고장 문서에는 숨김 기능이 없다`);

await p.$disconnect();

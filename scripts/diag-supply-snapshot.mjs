/**
 * 자재 이력 스냅샷 불일치·재고 차이 원인 규명 (읽기 전용).
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const p = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

console.log("■ 재고가 이력과 안 맞는 3개 품목의 정체");
for (const id of [2, 18, 19]) {
  const it = await p.supplyItem.findUnique({ where: { id }, include: { inbounds: true, outbounds: true } });
  if (!it) continue;
  console.log(`   [${it.id}] ${it.name} · 구분 ${it.category} · 재고 ${it.stockQty} · 이력 입${it.inbounds.length}/출${it.outbounds.length} · 등록 ${it.createdAt.toISOString().slice(0,10)}`);
}
const fx = await p.supplyItem.findMany({ where: { category: "FIXTURE" }, select: { id: true, name: true, stockQty: true } });
console.log(`   비품(FIXTURE) 목록: ${fx.map(x => `[${x.id}]${x.name}(${x.stockQty})`).join(" · ")}`);

console.log("\n■ 입출고 일시에 '시각' 이 들어 있나 (같은 날 순서를 가릴 수 있나)");
const outs = await p.supplyOutbound.findMany({ select: { usedAt: true }, take: 400 });
const ins  = await p.supplyInbound.findMany({ select: { receivedAt: true }, take: 400 });
const midnight = (d) => d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0;
const kstMidnight = (d) => { const k = new Date(d.getTime() + 9 * 3600000); return k.getUTCHours() === 0 && k.getUTCMinutes() === 0; };
console.log(`   출고 ${outs.length}건 중 UTC 자정 ${outs.filter(x => midnight(x.usedAt)).length} · KST 자정 ${outs.filter(x => kstMidnight(x.usedAt)).length}`);
console.log(`   입고 ${ins.length}건 중 UTC 자정 ${ins.filter(x => midnight(x.receivedAt)).length} · KST 자정 ${ins.filter(x => kstMidnight(x.receivedAt)).length}`);
console.log(`   표본: ${outs.slice(0, 5).map(x => x.usedAt.toISOString()).join(" · ")}`);

console.log("\n■ '전극'(id 9) 이력을 id 순서로 재계산 — 등록순으로 보면 스냅샷이 맞는가");
const it9 = await p.supplyItem.findUnique({
  where: { id: 9 },
  include: { inbounds: { orderBy: { id: "asc" } }, outbounds: { orderBy: { id: "asc" } } },
});
const moves = [
  ...it9.inbounds.map(x => ({ id: x.id, t: x.receivedAt, d: +x.qty, after: x.stockQtyAfter, k: "입고" })),
  ...it9.outbounds.map(x => ({ id: x.id, t: x.usedAt, d: -x.qty, after: x.stockQtyAfter, k: "출고" })),
].sort((a, b) => a.id - b.id);
let run = 0, okById = 0, ngById = 0;
for (const m of moves) {
  run += m.d;
  if (m.after === run) okById++; else ngById++;
}
console.log(`   id(등록) 순 재계산: 일치 ${okById} · 불일치 ${ngById} / 총 ${moves.length}`);

const movesByTime = [...moves].sort((a, b) => a.t - b.t || a.id - b.id);
let run2 = 0, okT = 0, ngT = 0;
for (const m of movesByTime) { run2 += m.d; if (m.after === run2) okT++; else ngT++; }
console.log(`   일시 순 재계산  : 일치 ${okT} · 불일치 ${ngT} / 총 ${moves.length}`);
console.log(`   → 최종 누적 ${run} · 실제 재고 ${it9.stockQty}`);

console.log("\n   최근 8건 (등록순)");
for (const m of moves.slice(-8))
  console.log(`     #${String(m.id).padStart(4)} ${m.k} ${m.t.toISOString().slice(0,16)} ${String(m.d).padStart(5)} → 스냅 ${m.after}`);

console.log("\n■ 재고 0 인 소모품 — 실제로 다 쓴 것인가");
const zero = await p.supplyItem.findMany({
  where: { category: "CONSUMABLE", stockQty: 0 },
  include: { outbounds: { orderBy: { usedAt: "desc" }, take: 1 }, inbounds: { orderBy: { receivedAt: "desc" }, take: 1 } },
});
for (const z of zero)
  console.log(`   [${z.id}] ${z.name.padEnd(18)} 기준 ${z.reorderPoint} · 마지막입고 ${z.inbounds[0]?.receivedAt.toISOString().slice(0,10) ?? "-"} · 마지막출고 ${z.outbounds[0]?.usedAt.toISOString().slice(0,10) ?? "-"}`);

await p.$disconnect();

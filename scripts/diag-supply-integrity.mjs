/**
 * 구매/자재 파트 데이터 정합성 점검 (읽기 전용).
 *
 * 이 모듈은 현재 재고(SupplyItem.stockQty)를 **컬럼에 들고 있다**.
 * 입출고 이력과 어긋나기 쉬운 구조라 실제로 어긋났는지 세어 본다.
 *   ① 재고 = 입고합 - 출고합 이 맞는가
 *   ② 음수 재고가 있는가
 *   ③ stockQtyAfter 스냅샷이 시간순으로 앞뒤가 맞는가
 *   ④ 수량 0·음수 이력이 있는가
 *   ⑤ 담당자·거래처 누락
 *   ⑥ 발주 기준점 판정
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const p = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const items = await p.supplyItem.findMany({
  include: {
    inbounds:  { orderBy: { receivedAt: "asc" } },
    outbounds: { orderBy: { usedAt: "asc" } },
  },
});
console.log(`■ 품목 ${items.length}개 · 입고이력 ${items.reduce((s, i) => s + i.inbounds.length, 0)}건 · 출고이력 ${items.reduce((s, i) => s + i.outbounds.length, 0)}건`);
const byCat = {}, byDept = {};
for (const i of items) { byCat[i.category] = (byCat[i.category] ?? 0) + 1; byDept[i.department] = (byDept[i.department] ?? 0) + 1; }
console.log(`   구분 ${JSON.stringify(byCat)} · 관리주체 ${JSON.stringify(byDept)}`);

console.log("\n■ ① 재고 = 입고합 − 출고합 이 맞는가");
const mismatch = [];
for (const it of items) {
  const inSum  = it.inbounds.reduce((s, x) => s + x.qty, 0);
  const outSum = it.outbounds.reduce((s, x) => s + x.qty, 0);
  const calc = inSum - outSum;
  if (calc !== it.stockQty) mismatch.push({ it, inSum, outSum, calc });
}
console.log(`   어긋난 품목: ${mismatch.length}/${items.length}`);
for (const m of mismatch.slice(0, 20))
  console.log(`     [${m.it.id}] ${m.it.name.padEnd(20)} 재고 ${String(m.it.stockQty).padStart(6)} · 계산 ${String(m.calc).padStart(6)} (입 ${m.inSum} − 출 ${m.outSum}) · 차 ${m.it.stockQty - m.calc}`);
if (mismatch.length > 20) console.log(`     … 외 ${mismatch.length - 20}건`);

console.log("\n■ ② 음수 재고");
const neg = items.filter(i => i.stockQty < 0);
console.log(`   ${neg.length}건`);
for (const n of neg.slice(0, 10)) console.log(`     [${n.id}] ${n.name} → ${n.stockQty}`);

console.log("\n■ ③ stockQtyAfter 스냅샷이 시간순으로 이어지는가");
let snapBad = 0, snapNull = 0;
const snapSamples = [];
for (const it of items) {
  const moves = [
    ...it.inbounds.map(x => ({ t: x.receivedAt, d: +x.qty, after: x.stockQtyAfter, kind: "입고", id: x.id })),
    ...it.outbounds.map(x => ({ t: x.usedAt, d: -x.qty, after: x.stockQtyAfter, kind: "출고", id: x.id })),
  ].sort((a, b) => a.t - b.t || a.kind.localeCompare(b.kind));
  let run = 0;
  for (const m of moves) {
    run += m.d;
    if (m.after == null) { snapNull++; continue; }
    if (m.after !== run) {
      snapBad++;
      if (snapSamples.length < 12)
        snapSamples.push(`[${it.id}] ${it.name} · ${m.kind}#${m.id} ${m.t.toISOString().slice(0,10)} 스냅 ${m.after} vs 누적 ${run}`);
    }
  }
}
console.log(`   스냅샷 불일치 ${snapBad}건 · 스냅샷 없음 ${snapNull}건`);
for (const x of snapSamples) console.log(`     ${x}`);

console.log("\n■ ④ 수량이 0 이하인 이력");
const badIn  = items.flatMap(i => i.inbounds.filter(x => x.qty <= 0).map(x => ({ i, x, k: "입고" })));
const badOut = items.flatMap(i => i.outbounds.filter(x => x.qty <= 0).map(x => ({ i, x, k: "출고" })));
console.log(`   입고 ${badIn.length}건 · 출고 ${badOut.length}건`);
for (const b of [...badIn, ...badOut].slice(0, 10)) console.log(`     [${b.i.id}] ${b.i.name} ${b.k} ${b.x.qty}`);

console.log("\n■ ⑤ 담당자·거래처 누락");
const noRecv = items.flatMap(i => i.inbounds.filter(x => !x.receivedBy?.trim()));
const noUser = items.flatMap(i => i.outbounds.filter(x => !x.usedBy?.trim()));
const noVend = items.flatMap(i => i.inbounds.filter(x => x.vendorId == null));
console.log(`   입고 담당자 없음 ${noRecv.length} · 출고 사용자 없음 ${noUser.length} · 거래처 없음 ${noVend.length}`);

console.log("\n■ ⑥ 발주 기준점");
const cons = items.filter(i => i.category === "CONSUMABLE" || i.category === "소모품");
const noRop = cons.filter(i => i.reorderPoint == null);
const below = cons.filter(i => i.reorderPoint != null && i.stockQty <= i.reorderPoint);
console.log(`   소모품 ${cons.length}개 · 기준점 미설정 ${noRop.length}개 · 기준점 이하(발주필요) ${below.length}개`);
for (const b of below.slice(0, 10)) console.log(`     [${b.id}] ${b.name.padEnd(20)} 재고 ${String(b.stockQty).padStart(5)} ≤ 기준 ${b.reorderPoint}`);

console.log("\n■ ⑦ 이력 날짜 분포 (미래 날짜·이상치 확인)");
const now = new Date();
const future = [
  ...items.flatMap(i => i.inbounds.filter(x => x.receivedAt > now).map(x => `입고 ${i.name} ${x.receivedAt.toISOString().slice(0,10)}`)),
  ...items.flatMap(i => i.outbounds.filter(x => x.usedAt > now).map(x => `출고 ${i.name} ${x.usedAt.toISOString().slice(0,10)}`)),
];
console.log(`   미래 날짜 이력 ${future.length}건`);
for (const f of future.slice(0, 8)) console.log(`     ${f}`);

const allDates = [
  ...items.flatMap(i => i.inbounds.map(x => x.receivedAt)),
  ...items.flatMap(i => i.outbounds.map(x => x.usedAt)),
].sort((a, b) => a - b);
if (allDates.length) console.log(`   기간 ${allDates[0].toISOString().slice(0,10)} ~ ${allDates[allDates.length-1].toISOString().slice(0,10)}`);

await p.$disconnect();

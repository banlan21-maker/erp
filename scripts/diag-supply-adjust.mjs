/**
 * 조정성 이력(초기재고·재고조정·자동보정)이 월별 통계를 얼마나 부풀리는지 (읽기 전용).
 *
 * 코드 리뷰에서 나온 지적:
 *   · 품목 등록 시 초기재고를 SupplyInbound 로 기록한다 (items/route.ts)
 *   · 재고를 손으로 고치면 SupplyInbound/Outbound 로 기록한다 (items/[id]/route.ts)
 *   · 재고 컬럼과 이력이 어긋나면 재계산이 '자동 보정' 레코드를 만든다 (lib/recalc-supply-stock.ts)
 * 이것들이 월별 통계에서 실제 매입·사용과 구분 없이 합산된다.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const p = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const ins  = await p.supplyInbound.findMany({ include: { item: { select: { name: true, category: true } } } });
const outs = await p.supplyOutbound.findMany({ include: { item: { select: { name: true, category: true } } } });

console.log("■ 입고 담당자(receivedBy) 값 분포 — 조정성 이력이 섞여 있나");
const byRecv = {};
for (const x of ins) byRecv[x.receivedBy ?? "(빈값)"] = (byRecv[x.receivedBy ?? "(빈값)"] ?? 0) + 1;
for (const [k, v] of Object.entries(byRecv).sort((a, b) => b[1] - a[1]))
  console.log(`   ${k.padEnd(16)} ${v}건`);

console.log("\n■ 출고 사용자(usedBy) 값 분포");
const byUsed = {};
for (const x of outs) byUsed[x.usedBy ?? "(빈값)"] = (byUsed[x.usedBy ?? "(빈값)"] ?? 0) + 1;
for (const [k, v] of Object.entries(byUsed).sort((a, b) => b[1] - a[1]).slice(0, 15))
  console.log(`   ${k.padEnd(16)} ${v}건`);

// 조정성으로 보이는 키워드
const ADJ = ["초기재고", "재고조정", "자동", "보정", "초기"];
const isAdj = (s) => ADJ.some(k => (s ?? "").includes(k));
const adjIn  = ins.filter(x => isAdj(x.receivedBy) || isAdj(x.memo));
const adjOut = outs.filter(x => isAdj(x.usedBy) || isAdj(x.memo));

console.log(`\n■ 조정성 이력 — 입고 ${adjIn.length}/${ins.length}건 · 출고 ${adjOut.length}/${outs.length}건`);
for (const x of adjIn.slice(0, 12))
  console.log(`   입고 #${x.id} ${x.item.name.padEnd(16)} ${String(x.qty).padStart(5)} · ${x.receivedBy} · ${x.receivedAt.toISOString().slice(0,10)}${x.memo ? " · " + x.memo : ""}`);
for (const x of adjOut.slice(0, 12))
  console.log(`   출고 #${x.id} ${x.item.name.padEnd(16)} ${String(x.qty).padStart(5)} · ${x.usedBy} · ${x.usedAt.toISOString().slice(0,10)}${x.memo ? " · " + x.memo : ""}`);

console.log("\n■ 월별 통계에서 조정성이 차지하는 비중 (소모품 기준 — 통계 화면과 같은 조건)");
const ym = (d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
const acc = new Map();
const bump = (k, m, field, qty) => {
  const key = `${m}`;
  const cur = acc.get(key) ?? { inAll: 0, inAdj: 0, outAll: 0, outAdj: 0 };
  cur[field] += qty;
  acc.set(key, cur);
};
for (const x of ins) {
  if (x.item.category !== "CONSUMABLE") continue;
  bump(null, ym(x.receivedAt), "inAll", x.qty);
  if (isAdj(x.receivedBy) || isAdj(x.memo)) bump(null, ym(x.receivedAt), "inAdj", x.qty);
}
for (const x of outs) {
  if (x.item.category !== "CONSUMABLE") continue;
  bump(null, ym(x.usedAt), "outAll", x.qty);
  if (isAdj(x.usedBy) || isAdj(x.memo)) bump(null, ym(x.usedAt), "outAdj", x.qty);
}
console.log("   월       입고합   그중조정   출고합   그중조정");
for (const [m, v] of [...acc.entries()].sort()) {
  const pi = v.inAll ? (v.inAdj / v.inAll * 100).toFixed(0) : "0";
  const po = v.outAll ? (v.outAdj / v.outAll * 100).toFixed(0) : "0";
  console.log(`   ${m}  ${String(v.inAll).padStart(6)} ${String(v.inAdj).padStart(6)}(${pi.padStart(3)}%) ${String(v.outAll).padStart(7)} ${String(v.outAdj).padStart(6)}(${po.padStart(3)}%)`);
}

console.log("\n■ 거래처 없는 입고 12건의 정체");
for (const x of ins.filter(x => x.vendorId == null).slice(0, 15))
  console.log(`   #${x.id} ${x.item.name.padEnd(16)} ${String(x.qty).padStart(5)} · ${x.receivedBy} · ${x.receivedAt.toISOString().slice(0,10)}${x.memo ? " · " + x.memo : ""}`);

await p.$disconnect();

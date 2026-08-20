/**
 * 용차 자동계산 검증 (읽기 전용).
 * 등록된 단가표로 과거 출고 송장의 금액을 계산해, 사람이 적은 대장 금액과 대조한다.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const p = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const last4 = (s) => (s ?? "").replace(/[^0-9]/g, "").slice(-4);
const ymd = (d) => new Date(d).toISOString().slice(0, 10);

const rates = new Map((await p.charterRate.findMany()).map(r => [r.deliveryName, r.baseCost]));
const bands = await p.charterSurcharge.findMany({ orderBy: { minWidth: "desc" } });
const calc = (name, maxW) => {
  const base = rates.get((name ?? "").trim());
  const band = bands.find(b => maxW >= b.minWidth && (b.maxWidth == null || maxW <= b.maxWidth));
  return base == null ? null : base + (band?.amount ?? 0);
};

const vehicles = await p.shipmentVehicle.findMany({
  where: { shipment: { status: "ACTIVE" } },
  select: {
    vehicleNo: true, supplierSnapshot: true, deliverySnapshot: true,
    shipment: { select: { shippedAt: true } },
    items: { select: { width: true } },
  },
});
const usages = await p.charterUsage.findMany({ where: { departure: "진교" }, select: { date: true, vehicleNo: true, cost: true } });
const umap = new Map();
for (const u of usages) {
  const k = `${ymd(u.date)}|${last4(u.vehicleNo)}`;
  if (!umap.has(k)) umap.set(k, []);
  umap.get(k).push(u.cost);
}

let ok = 0, ng = 0, noRate = 0, noMatch = 0, notJingyo = 0;
const wrong = [];
for (const v of vehicles) {
  const sup = v.supplierSnapshot;
  const supName = sup && typeof sup === "object" && "name" in sup ? String(sup.name) : "";
  if (!supName.includes("진교")) { notJingyo++; continue; }
  const del = v.deliverySnapshot;
  const name = del && typeof del === "object" && "name" in del ? String(del.name) : null;
  const maxW = Math.max(0, ...v.items.map(i => i.width ?? 0));
  const guess = calc(name, maxW);
  if (guess == null) { noRate++; continue; }
  const k = `${ymd(v.shipment.shippedAt)}|${last4(v.vehicleNo)}`;
  const actuals = umap.get(k);
  if (!actuals || actuals.length !== 1) { noMatch++; continue; }
  if (actuals[0] === guess) ok++;
  else { ng++; if (wrong.length < 15) wrong.push({ name, maxW, guess, actual: actuals[0], d: ymd(v.shipment.shippedAt), car: v.vehicleNo }); }
}

console.log(`■ 진교 출발 송장 ${vehicles.length - notJingyo}대 (다른 출발지 ${notJingyo}대 제외)`);
console.log(`   대장과 1:1 대조 가능 ${ok + ng}건`);
console.log(`     금액 일치   ${ok}건`);
console.log(`     금액 다름   ${ng}건`);
console.log(`   단가 미등록 납품처 ${noRate}건 · 대장 매칭 실패 ${noMatch}건`);
if (ok + ng > 0) console.log(`   → 자동계산 정확도 ${(ok / (ok + ng) * 100).toFixed(1)}%`);
for (const w of wrong)
  console.log(`     ${w.d} ${String(w.car).padEnd(12)} ${String(w.name).padEnd(14)} 폭${String(w.maxW).padStart(5)} · 계산 ${w.guess.toLocaleString().padStart(9)} · 실제 ${String(w.actual?.toLocaleString() ?? "-").padStart(9)}`);
await p.$disconnect();

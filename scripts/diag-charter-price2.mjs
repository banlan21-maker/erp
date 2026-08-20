/**
 * 용차비용 자동계산 — 납품처↔구간 매핑과 할증 규칙 검증 (읽기 전용).
 * 과거 대장 실적을 단가표로 역산해 규칙이 맞는지 확인한다.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const p = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const RATE = { "영도": 450000, "고성": 270000, "통영": 320000, "거제": 370000, "진동": 300000, "진주": 280000 };
const SUR = [40000, 100000, 120000, 150000];
const JOIN = [50000, 30000];

console.log("■ 납품처 마스터 (DeliveryVendor) — 주소로 구간을 알 수 있나");
const dv = await p.deliveryVendor.findMany({ select: { name: true, address: true, vendorType: true, isActive: true } });
console.log(`   ${dv.length}곳`);
for (const d of dv) {
  const region = Object.keys(RATE).find(k => (d.address ?? "").includes(k)) ?? null;
  console.log(`   ${(d.name ?? "").padEnd(14)} ${(d.address ?? "-").slice(0, 30).padEnd(32)} ${d.vendorType} ${region ? "→ " + region : "→ (주소로 판정 불가)"}`);
}

console.log("\n■ 출고에 실제로 쓰인 납품처 (스냅샷 기준)");
const snaps = await p.shipmentVehicle.findMany({
  where: { shipment: { status: "ACTIVE" } },
  select: { deliverySnapshot: true },
});
const use = new Map();
for (const v of snaps) {
  const s = v.deliverySnapshot;
  if (s && typeof s === "object" && "name" in s) {
    const k = String(s.name);
    use.set(k, { addr: s.address ?? null, n: (use.get(k)?.n ?? 0) + 1 });
  }
}
for (const [n, v] of [...use.entries()].sort((a, b) => b[1].n - a[1].n)) {
  const region = Object.keys(RATE).find(k => (v.addr ?? "").includes(k)) ?? null;
  console.log(`   ${n.padEnd(14)} ${String(v.n).padStart(3)}회  ${String(v.addr ?? "-").slice(0, 30).padEnd(32)} ${region ? "→ " + region : "→ (주소로 판정 불가)"}`);
}

console.log("\n■ 대장 금액을 '기본단가 + 할증' 으로 분해할 수 있나");
console.log("   (도착지별로 가장 흔한 금액을 기본으로 보고, 나머지가 할증표 금액만큼 차이나는지)");
const rows = await p.charterUsage.findMany({ where: { departure: "진교" }, select: { destination: true, cost: true } });
const byDest = new Map();
for (const r of rows) {
  const d = (r.destination ?? "(공란)").trim();
  if (!byDest.has(d)) byDest.set(d, []);
  byDest.get(d).push(r.cost ?? 0);
}
for (const [d, costs] of [...byDest.entries()].sort((a, b) => b[1].length - a[1].length)) {
  const freq = new Map();
  for (const c of costs) freq.set(c, (freq.get(c) ?? 0) + 1);
  const base = [...freq.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const others = [...freq.entries()].filter(([c]) => c !== base);
  const explained = others.filter(([c]) => SUR.includes(c - base) || JOIN.includes(c - base) || SUR.some(s => JOIN.some(j => c - base === s + j)));
  const table = Object.entries(RATE).find(([, v]) => v === base);
  console.log(`   ${d.padEnd(14)} 기본 ${base.toLocaleString().padStart(9)}원 (${freq.get(base)}/${costs.length})${table ? "  = 표의 " + table[0] : "  ← 표에 없는 금액"}`);
  for (const [c, n] of others) {
    const diff = c - base;
    const why = SUR.includes(diff) ? "할증표 일치"
      : JOIN.includes(diff) ? "합짐 일치"
      : SUR.some(s => JOIN.some(j => diff === s + j)) ? "할증+합짐"
      : "설명 안 됨";
    console.log(`      ${c.toLocaleString().padStart(9)}원 ×${String(n).padStart(3)}  차액 ${(diff > 0 ? "+" : "") + diff.toLocaleString()}  ${why}`);
  }
  void explained;
}
await p.$disconnect();

/**
 * 용차비용 자동계산 가능성 점검 (읽기 전용).
 *
 * 받은 단가표(에스로지스):
 *   구간 진교→ 영도 450,000 / 고성 270,000 / 통영 320,000 / 거제 370,000 / 진동 300,000 / 진주 280,000
 *   할증  폭 3101-3400 · 길이 15001-  → 40,000
 *         폭 3401-4000 · 길이 17001-  → 100,000
 *         폭 4001-     · 길이 20001-  → 120,000
 *         가변기·슬라이드(혼합)        → 150,000
 *   합짐  동지역 50,000 / 타지역 30,000
 *
 * 확인할 것
 *   ① 대장의 출발지·도착지 실제 값이 표의 구간과 맞아떨어지나
 *   ② 도착지별 금액 분포가 표 단가와 일치하나 (일치하면 규칙이 살아있다는 뜻)
 *   ③ 납품처 마스터 주소로 지역을 뽑아낼 수 있나 (출고 → 구간 자동 판정)
 *   ④ 출고 품목의 폭·길이로 할증을 계산할 수 있나
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const p = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const RATE = { "영도": 450000, "고성": 270000, "통영": 320000, "거제": 370000, "진동": 300000, "진주": 280000 };

console.log("■ ① 대장의 출발지 값");
const rows = await p.charterUsage.findMany({ select: { date: true, departure: true, destination: true, cost: true, items: true, memo: true, vehicleNo: true } });
const dep = {};
for (const r of rows) dep[r.departure ?? "(공란)"] = (dep[r.departure ?? "(공란)"] ?? 0) + 1;
console.log("   " + Object.entries(dep).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(" · "));

console.log("\n■ ② 도착지별 금액 분포 — 표 단가와 대조");
const byDest = new Map();
for (const r of rows) {
  const d = (r.destination ?? "(공란)").trim();
  if (!byDest.has(d)) byDest.set(d, []);
  byDest.get(d).push(r.cost ?? 0);
}
const sorted = [...byDest.entries()].sort((a, b) => b[1].length - a[1].length);
for (const [d, costs] of sorted) {
  const uniq = [...new Set(costs)].sort((a, b) => a - b);
  const table = RATE[d];
  const hitBase = table ? costs.filter(c => c === table).length : 0;
  const mark = table ? `표 ${table.toLocaleString()} · 정확일치 ${hitBase}/${costs.length}` : "표에 없는 도착지";
  console.log(`   ${d.padEnd(10)} ${String(costs.length).padStart(3)}건 · 금액종류 ${uniq.length}개  ${mark}`);
  if (uniq.length <= 8) console.log(`      ${uniq.map(c => c.toLocaleString()).join(" · ")}`);
  else console.log(`      ${uniq.slice(0, 8).map(c => c.toLocaleString()).join(" · ")} … 외 ${uniq.length - 8}`);
}

console.log("\n■ ③ 납품처 마스터 — 주소로 지역을 뽑을 수 있나");
const dels = await p.deliveryPlace.findMany({ select: { name: true, address: true } }).catch(() => null);
if (dels) {
  for (const d of dels) {
    const region = Object.keys(RATE).find(k => (d.address ?? "").includes(k)) ?? null;
    console.log(`   ${(d.name ?? "").padEnd(12)} ${(d.address ?? "-").slice(0, 34).padEnd(36)} → ${region ?? "(주소로 판정 불가)"}`);
  }
} else {
  console.log("   DeliveryPlace 모델 없음 — 스냅샷으로 확인");
  const snaps = await p.shipmentVehicle.findMany({
    where: { shipment: { status: "ACTIVE" }, NOT: { deliverySnapshot: null } },
    select: { deliverySnapshot: true },
  });
  const seen = new Map();
  for (const v of snaps) {
    const s = v.deliverySnapshot;
    if (s && typeof s === "object" && "name" in s) seen.set(s.name, s.address ?? null);
  }
  for (const [n, a] of seen) {
    const region = Object.keys(RATE).find(k => (a ?? "").includes(k)) ?? null;
    console.log(`   ${String(n).padEnd(12)} ${String(a ?? "-").slice(0, 34).padEnd(36)} → ${region ?? "(주소로 판정 불가)"}`);
  }
}

console.log("\n■ ④ 출고 품목의 폭·길이 최대값 — 할증 계산 근거");
const vs = await p.shipmentVehicle.findMany({
  where: { shipment: { status: "ACTIVE" } },
  select: { invoiceNo: true, items: { select: { width: true, length: true } } },
  take: 400,
});
let over = { w3101: 0, w3401: 0, w4001: 0, l15001: 0, l17001: 0, l20001: 0, none: 0 };
for (const v of vs) {
  const mw = Math.max(0, ...v.items.map(i => i.width ?? 0));
  const ml = Math.max(0, ...v.items.map(i => i.length ?? 0));
  let hit = false;
  if (mw >= 4001) { over.w4001++; hit = true; } else if (mw >= 3401) { over.w3401++; hit = true; } else if (mw >= 3101) { over.w3101++; hit = true; }
  if (ml >= 20001) { over.l20001++; hit = true; } else if (ml >= 17001) { over.l17001++; hit = true; } else if (ml >= 15001) { over.l15001++; hit = true; }
  if (!hit) over.none++;
}
console.log(`   차량 ${vs.length}대 중`);
console.log(`     폭 3101~3400 ${over.w3101} · 3401~4000 ${over.w3401} · 4001~ ${over.w4001}`);
console.log(`     길이 15001~17000 ${over.l15001} · 17001~20000 ${over.l17001} · 20001~ ${over.l20001}`);
console.log(`     할증 대상 아님 ${over.none}`);

console.log("\n■ ⑤ 같은 날 같은 차량이 여러 번 — 합짐 판별 가능성");
const key = (r) => `${r.date.toISOString().slice(0, 10)}|${(r.vehicleNo ?? "").trim()}`;
const cnt = new Map();
for (const r of rows) cnt.set(key(r), (cnt.get(key(r)) ?? 0) + 1);
const dup = [...cnt.entries()].filter(([, n]) => n > 1);
console.log(`   같은 날·같은 차량이 2건 이상: ${dup.length}쌍 (합짐으로 기록됐을 가능성)`);
for (const [k, n] of dup.slice(0, 6)) console.log(`     ${k} → ${n}건`);

await p.$disconnect();

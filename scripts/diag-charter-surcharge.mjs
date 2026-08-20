/**
 * 할증 발동 조건 역산 (읽기 전용).
 *
 * 단가표의 할증은 '폭' 과 '길이' 두 칸이 같이 적혀 있는데, 둘 다 만족해야 하는지
 * 하나만 걸려도 되는지가 표만 봐서는 불명확하다. 과거 실적으로 확인한다.
 *
 * 방법: 용차대장 ↔ 출고 송장을 (날짜 + 차량번호 뒤 4자리)로 맞춘 뒤,
 *       그 송장에 실린 철판의 최대 폭·길이와 실제 청구액의 할증분을 대조한다.
 *       (대장은 차량번호를 '2158' 처럼 뒤 4자리로, 출고는 '광주99사2158' 로 적는다)
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const p = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const last4 = (s) => (s ?? "").replace(/[^0-9]/g, "").slice(-4);
const ymd = (d) => new Date(d).toISOString().slice(0, 10);

// 도착지별 기본단가 — 앞선 분해에서 확인된 값
const BASE = {
  "월드테크(밀양)": 370000, "태금": 270000, "덕광": 270000, "세림": 370000,
  "비씨워터젯": 370000, "월드테크": 370000, "한국야나세": 300000, "통영조선소": 320000,
  "경원(김해장유)": 370000, "광도": 370000, "삼강에스앤씨": 270000, "코리아조선": 320000,
};

const usages = await p.charterUsage.findMany({
  where: { departure: "진교" },
  select: { date: true, vehicleNo: true, destination: true, cost: true, items: true },
});
const vehicles = await p.shipmentVehicle.findMany({
  where: { shipment: { status: "ACTIVE" } },
  select: {
    vehicleNo: true, invoiceNo: true, deliverySnapshot: true,
    shipment: { select: { shippedAt: true } },
    items: { select: { width: true, length: true, weight: true } },
  },
});

const vkey = new Map();
for (const v of vehicles) {
  const k = `${ymd(v.shipment.shippedAt)}|${last4(v.vehicleNo)}`;
  if (!vkey.has(k)) vkey.set(k, []);
  vkey.get(k).push(v);
}

let matched = 0, unmatched = 0;
const buckets = new Map();   // 할증액 → [{ maxW, maxL }]
for (const u of usages) {
  const k = `${ymd(u.date)}|${last4(u.vehicleNo)}`;
  const cands = vkey.get(k);
  if (!cands || cands.length !== 1) { unmatched++; continue; }
  const v = cands[0];
  matched++;
  const base = BASE[(u.destination ?? "").trim()];
  if (base == null || u.cost == null) continue;
  const sur = u.cost - base;
  const mw = Math.max(0, ...v.items.map(i => i.width ?? 0));
  const ml = Math.max(0, ...v.items.map(i => i.length ?? 0));
  if (!buckets.has(sur)) buckets.set(sur, []);
  buckets.get(sur).push({ mw, ml, inv: v.invoiceNo });
}

console.log(`■ 대장 ${usages.length}건 중 송장과 1:1 매칭 ${matched}건 · 매칭 실패 ${unmatched}건`);
console.log("   (매칭 실패 = 같은 날 같은 차가 여러 번이거나, 출고장 없이 나간 건 — 부재출고 등)\n");

console.log("■ 할증액별 실린 철판의 최대 폭·길이");
for (const [sur, rows] of [...buckets.entries()].sort((a, b) => a[0] - b[0])) {
  const ws = rows.map(r => r.mw).sort((a, b) => a - b);
  const ls = rows.map(r => r.ml).sort((a, b) => a - b);
  const med = (arr) => arr[Math.floor(arr.length / 2)];
  console.log(`   할증 ${String(sur.toLocaleString()).padStart(9)}원 · ${String(rows.length).padStart(3)}건`);
  console.log(`      최대폭   최소 ${ws[0]} · 중앙 ${med(ws)} · 최대 ${ws[ws.length - 1]}`);
  console.log(`      최대길이 최소 ${ls[0]} · 중앙 ${med(ls)} · 최대 ${ls[ls.length - 1]}`);
}

console.log("\n■ 규칙 검증 — '폭 기준만' 으로 보면 어떤가");
const rule = (mw) => {
  if (mw >= 4001) return 120000;
  if (mw >= 3401) return 100000;
  if (mw >= 3101) return 40000;
  return 0;
};
let ok = 0, ng = 0;
const wrong = [];
for (const [sur, rows] of buckets) {
  for (const r of rows) {
    if (rule(r.mw) === sur) ok++;
    else { ng++; if (wrong.length < 12) wrong.push({ ...r, sur, guess: rule(r.mw) }); }
  }
}
console.log(`   맞음 ${ok} · 틀림 ${ng}  (정확도 ${(ok / (ok + ng) * 100).toFixed(1)}%)`);
for (const w of wrong)
  console.log(`      ${w.inv ?? "-"} 폭${w.mw} 길이${w.ml} · 실제할증 ${w.sur.toLocaleString()} · 규칙예상 ${w.guess.toLocaleString()}`);

await p.$disconnect();

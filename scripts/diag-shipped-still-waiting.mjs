/**
 * "외부출고됐는데 판번호리스트에는 아직 대기(WAITING)로 남은 것" 조사 (읽기 전용).
 *
 * 왜 생기나 — 출고 확정에서 판번호를 소진하는 경로가 갈래마다 다르다:
 *   · 원판(정규강재) 출고 : 판번호를 적었으면 그 판을, 안 적었으면 같은 규격 대기 판 1장을
 *                          FIFO 로 SHIPPED 처리한다. 사양이 안 맞으면 아무것도 안 줄어든다.
 *   · 여유원재 출고       : 2026-08-20 이전에는 판번호를 전혀 안 건드렸다(그날 수정).
 *                          그 전에 나간 여유원재의 판번호는 대기로 남아 있다.
 *   · 등록잔재/현장잔재   : 자투리라 판번호 재고 1장에 대응하지 않는다 — 대상 아님(정상).
 *
 * 왜 문제인가 — 남은 대기 판번호는 나중에 절단완료·다른 출고에서 다시 소진될 수 있다(유령).
 *
 * ⚠ 같은 판번호(heatNo)를 여러 철판이 공유할 수 있다(수입재). 그래서 "번호가 존재하나" 가
 *   아니라 "수량이 맞나" 로 판단한다 — 오탐을 줄이기 위함.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const p = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const up = (x) => (x ?? "").trim().toUpperCase();

// ── A) 출고 명세에 적힌 판번호 vs 실제로 출고 처리된 판번호 수량 대조 ────────
console.log("■ A) 출고 명세의 판번호가 판번호리스트에서 안 없어진 것 (수량 기준)");
const items = await p.shipmentItem.findMany({
  where: { vehicle: { shipment: { status: "ACTIVE" } } },
  select: {
    id: true, heatNo: true, steelPlanId: true, remnantId: true, steelPlanHeatId: true,
    vesselCode: true, material: true, thickness: true, width: true, length: true, remnantNo: true,
    vehicle: { select: { shipment: { select: { shipmentNo: true, shippedAt: true } } } },
  },
});
console.log(`   활성 출고 명세 ${items.length}건 (원판 ${items.filter(i => i.steelPlanId).length} · 잔재 ${items.filter(i => i.remnantId).length})`);

// 출고 명세가 주장하는 판번호별 건수
const claimed = new Map();
for (const it of items) {
  const hn = up(it.heatNo);
  if (!hn) continue;
  if (!claimed.has(hn)) claimed.set(hn, []);
  claimed.get(hn).push(it);
}
console.log(`   그중 판번호가 적힌 것: ${[...claimed.values()].reduce((s, a) => s + a.length, 0)}건 / 서로 다른 번호 ${claimed.size}개`);

const suspects = [];
for (const [hn, its] of claimed) {
  const heats = await p.steelPlanHeat.findMany({
    where: { heatNo: { equals: hn, mode: "insensitive" } },
    select: { id: true, status: true, vesselCode: true, thickness: true, width: true, length: true },
  });
  const shipped = heats.filter(h => h.status === "SHIPPED").length;
  const waiting = heats.filter(h => h.status === "WAITING").length;
  // 명세가 N건 나갔다는데 SHIPPED 가 N보다 적고, 대기가 남아 있으면 그만큼 안 없어진 것
  const gap = its.length - shipped;
  if (gap > 0 && waiting > 0) {
    suspects.push({ hn, claimed: its.length, shipped, waiting, gap: Math.min(gap, waiting), its, heats });
  }
}
console.log(`\n   → 안 없어진 것으로 보이는 판번호: ${suspects.length}개 (총 ${suspects.reduce((s, x) => s + x.gap, 0)}장)`);
for (const s of suspects.slice(0, 25)) {
  const it = s.its[0];
  const kind = it.remnantId ? `잔재(${it.remnantNo ?? "-"})` : "원판";
  console.log(`     ${s.hn.padEnd(14)} 명세 ${s.claimed}건 · 출고처리 ${s.shipped} · 대기 ${s.waiting} → ${s.gap}장 남음  [${kind}] ${it.vehicle?.shipment?.shipmentNo ?? ""} ${it.vehicle?.shipment?.shippedAt?.toISOString().slice(0,10) ?? ""}`);
}
if (suspects.length > 25) console.log(`     … 외 ${suspects.length - 25}개`);

// ── B) 여유원재 — 소진(출고 포함)됐는데 그 판번호가 아직 대기 ────────────────
console.log("\n■ B) 여유원재가 소진됐는데 그 판번호가 아직 대기");
const surExhausted = await p.remnant.findMany({
  where: { type: "SURPLUS", status: "EXHAUSTED", NOT: { heatNo: null } },
  select: { remnantNo: true, heatNo: true, material: true, thickness: true, width1: true, length1: true },
});
let surBad = 0;
for (const r of surExhausted) {
  const w = await p.steelPlanHeat.count({ where: { heatNo: { equals: up(r.heatNo), mode: "insensitive" }, status: "WAITING" } });
  if (w > 0) { surBad++; console.log(`     ${r.remnantNo} 판번호 ${r.heatNo} → 대기 ${w}건`); }
}
console.log(`   소진 여유원재 ${surExhausted.length}건 중 판번호가 대기로 남은 것: ${surBad}건`);

// ── C) 사양별 수량 대조 — 외부출고 강재 수 vs 출고 판번호 수 ────────────────
console.log("\n■ C) 사양별 대조 — 외부출고된 강재 장수 vs 출고 처리된 판번호 건수");
const plans = await p.steelPlan.groupBy({
  by: ["vesselCode", "material", "thickness", "width", "length"],
  where: { status: "SHIPPED_OUT" },
  _count: { _all: true },
});
const heatsG = await p.steelPlanHeat.groupBy({
  by: ["vesselCode", "material", "thickness", "width", "length"],
  where: { status: "SHIPPED" },
  _count: { _all: true },
});
const key = (x) => `${(x.vesselCode ?? "").trim()}|${up(x.material)}|${x.thickness}|${x.width}|${x.length}`;
const hMap = new Map(heatsG.map(h => [key(h), h._count._all]));
const gaps = [];
for (const pl of plans) {
  const k = key(pl);
  const h = hMap.get(k) ?? 0;
  if (pl._count._all > h) gaps.push({ k, plan: pl._count._all, heat: h, gap: pl._count._all - h, spec: pl });
}
gaps.sort((a, b) => b.gap - a.gap);
console.log(`   강재가 판번호보다 많은 사양: ${gaps.length}개 (합계 ${gaps.reduce((s, x) => s + x.gap, 0)}장 — 판번호가 안 따라간 만큼)`);
for (const g of gaps.slice(0, 15)) {
  const s = g.spec;
  const waiting = await p.steelPlanHeat.count({
    where: { vesselCode: s.vesselCode, material: s.material, thickness: s.thickness, width: s.width, length: s.length, status: "WAITING" },
  });
  console.log(`     ${(s.vesselCode ?? "").padEnd(11)} ${up(s.material).padEnd(6)} ${String(s.thickness).padStart(5)}t ${String(s.width).padStart(5)}x${String(s.length).padStart(6)} · 출고강재 ${String(g.plan).padStart(4)} · 출고판번호 ${String(g.heat).padStart(4)} · 차이 ${String(g.gap).padStart(3)} · 같은사양 대기판 ${waiting}`);
}

// 반대 방향도 (판번호가 더 많은 경우 — 참고용)
const pMap = new Map(plans.map(x => [key(x), x._count._all]));
const rev = heatsG.filter(h => (h._count._all > (pMap.get(key(h)) ?? 0)));
console.log(`   (참고) 판번호가 강재보다 많은 사양: ${rev.length}개 — 합계 ${rev.reduce((s, x) => s + (x._count._all - (pMap.get(key(x)) ?? 0)), 0)}건`);

console.log("\n■ 전체 판번호 상태 분포");
for (const r of await p.steelPlanHeat.groupBy({ by: ["status"], _count: { _all: true } }))
  console.log(`   ${r.status.padEnd(9)} ${r._count._all}`);

await p.$disconnect();

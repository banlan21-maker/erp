// 출고 정합성 스캔 — 강재 SHIPPED_OUT ↔ 판번호 SHIPPED ↔ 잔재 EXHAUSTED ↔ 거래명세서(ShipmentItem) 대조 (읽기 전용).
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

async function main() {
  const [plans, heats, remnants, items] = await Promise.all([
    prisma.steelPlan.findMany({ select: { id: true, vesselCode: true, material: true, thickness: true, width: true, length: true, status: true, reservedFor: true, shipoutMarkedAt: true, shipoutHeatNo: true } }),
    prisma.steelPlanHeat.findMany({ select: { id: true, vesselCode: true, material: true, thickness: true, width: true, length: true, heatNo: true, status: true, autoCreatedFromShipment: true } }),
    prisma.remnant.findMany({ select: { id: true, remnantNo: true, status: true, reservedFor: true, shipoutMarkedAt: true, type: true } }),
    prisma.shipmentItem.findMany({ select: { id: true, steelPlanId: true, remnantId: true, steelPlanHeatId: true, heatNo: true, remnantNo: true,
      vehicle: { select: { shipment: { select: { status: true, shipmentNo: true } } } } } }),
  ]);
  const planById = new Map(plans.map((p) => [p.id, p]));
  const remById = new Map(remnants.map((r) => [r.id, r]));
  const activeItems = items.filter((it) => it.vehicle?.shipment?.status === "ACTIVE");
  const activePlateIds = new Set(activeItems.filter((it) => it.steelPlanId).map((it) => it.steelPlanId));
  const activeRemIds = new Set(activeItems.filter((it) => it.remnantId).map((it) => it.remnantId));
  const activeHeatIds = new Set(activeItems.map((it) => it.steelPlanHeatId).filter(Boolean));

  const L = "─".repeat(76);
  console.log(`총계: 강재 ${plans.length} · 판번호 ${heats.length} · 잔재 ${remnants.length} · 출고품목 ${items.length}(활성 ${activeItems.length})`);
  console.log(L);

  // A. XOR 위반: ShipmentItem 이 원판·잔재 둘 다거나 둘 다 아님
  const xor = items.filter((it) => (!!it.steelPlanId) === (!!it.remnantId));
  console.log(`A. XOR 위반(원판·잔재 둘다/둘다아님) : ${xor.length}`);
  xor.slice(0, 10).forEach((it) => console.log(`   item=${it.id} steelPlan=${it.steelPlanId ?? "-"} remnant=${it.remnantId ?? "-"} shipment=${it.vehicle?.shipment?.shipmentNo}`));

  // B. 상호배제 위반: 강재가 선별(shipoutMarkedAt)+절단확정(reservedFor) 동시
  const mutexPlan = plans.filter((p) => p.shipoutMarkedAt && p.reservedFor);
  console.log(`B. 상호배제 위반 강재(선별+절단확정 동시) : ${mutexPlan.length}`);
  mutexPlan.slice(0, 10).forEach((p) => console.log(`   ${p.vesselCode} | ${p.status} | 확정=${p.reservedFor} | 선별=Y`));

  // C. 상호배제 위반: 잔재가 선별+절단확정 동시
  const mutexRem = remnants.filter((r) => r.shipoutMarkedAt && r.reservedFor);
  console.log(`C. 상호배제 위반 잔재(선별+절단확정 동시) : ${mutexRem.length}`);
  mutexRem.slice(0, 10).forEach((r) => console.log(`   ${r.remnantNo} | ${r.status} | 확정=${r.reservedFor} | 선별=Y`));

  // D. 활성 출고 품목의 강재가 SHIPPED_OUT 아님
  const dBad = [...activePlateIds].map((id) => planById.get(id)).filter((p) => p && p.status !== "SHIPPED_OUT");
  console.log(`D. 활성출고인데 강재가 SHIPPED_OUT 아님 : ${dBad.length}`);
  dBad.slice(0, 10).forEach((p) => console.log(`   ${p.vesselCode} | ${p.material} ${p.thickness}×${p.width}×${p.length} | 현재상태=${p.status}`));

  // E. 활성 출고 품목의 잔재가 EXHAUSTED 아님
  const eBad = [...activeRemIds].map((id) => remById.get(id)).filter((r) => r && r.status !== "EXHAUSTED");
  console.log(`E. 활성출고인데 잔재가 EXHAUSTED 아님 : ${eBad.length}`);
  eBad.slice(0, 10).forEach((r) => console.log(`   ${r.remnantNo} | 현재상태=${r.status}`));

  // F. SHIPPED_OUT 강재인데 활성 출고 품목이 참조 안 함(고아 출고)
  const fBad = plans.filter((p) => p.status === "SHIPPED_OUT" && !activePlateIds.has(p.id));
  console.log(`F. SHIPPED_OUT 강재인데 활성 출고장 참조 없음 : ${fBad.length}`);
  fBad.slice(0, 10).forEach((p) => console.log(`   ${p.vesselCode} | ${p.material} ${p.thickness}×${p.width}×${p.length}`));

  // G. SHIPPED 판번호인데 활성 출고 참조 없음
  const gBad = heats.filter((h) => h.status === "SHIPPED" && !activeHeatIds.has(h.id));
  console.log(`G. SHIPPED 판번호인데 활성 출고장(heatId) 참조 없음 : ${gBad.length}`);
  gBad.slice(0, 12).forEach((h) => console.log(`   ${h.vesselCode} | ${h.material} ${h.thickness}×${h.width}×${h.length} | 판번호 ${h.heatNo}${h.autoCreatedFromShipment ? " (출고자동생성)" : ""}`));

  // H. 사양별 강재 SHIPPED_OUT 수 vs 판번호 SHIPPED 수 불일치
  const key = (v, m, t, w, l) => `${(v ?? "").trim()}|${(m ?? "").trim().toUpperCase()}|${t}|${w}|${l}`;
  const spOut = new Map(), hpShip = new Map();
  plans.forEach((p) => { if (p.status === "SHIPPED_OUT") { const k = key(p.vesselCode, p.material, p.thickness, p.width, p.length); spOut.set(k, (spOut.get(k) ?? 0) + 1); } });
  heats.forEach((h) => { if (h.status === "SHIPPED") { const k = key(h.vesselCode, h.material, h.thickness, h.width, h.length); hpShip.set(k, (hpShip.get(k) ?? 0) + 1); } });
  const allK = new Set([...spOut.keys(), ...hpShip.keys()]);
  const hMis = [...allK].map((k) => ({ k, out: spOut.get(k) ?? 0, ship: hpShip.get(k) ?? 0 })).filter((x) => x.out !== x.ship);
  console.log(`H. 사양별 강재외부(SHIPPED_OUT) vs 판번호외부(SHIPPED) 수 불일치 : ${hMis.length} 사양`);
  hMis.slice(0, 15).forEach((x) => console.log(`   ${x.k.replace(/\|/g, " ")} | 강재외부 ${x.out} / 판번호외부 ${x.ship} (${x.out - x.ship >= 0 ? "+" : ""}${x.out - x.ship})`));

  await prisma.$disconnect();
}
main().catch(async (e) => { console.error("오류:", e.message); await prisma.$disconnect(); process.exit(1); });

/**
 * "외부출고된 철판의 판번호가 대기로 남아 있나" 최종 확인 (읽기 전용).
 * 총량 1:1 대조 + 잔재 갈래(여유원재 포함) 개별 확인.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const p = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const up = (x) => (x ?? "").trim().toUpperCase();

console.log("■ 1) 총량 대조 — 원판 출고 건수 vs 출고 처리된 판번호 건수");
const platesOut = await p.shipmentItem.count({ where: { steelPlanId: { not: null }, vehicle: { shipment: { status: "ACTIVE" } } } });
const plansOut  = await p.steelPlan.count({ where: { status: "SHIPPED_OUT" } });
const heatsOut  = await p.steelPlanHeat.count({ where: { status: "SHIPPED" } });
console.log(`   원판 출고 명세 ${platesOut}건 · 외부출고 강재 ${plansOut}장 · 출고 판번호 ${heatsOut}건`);
console.log(`   → ${platesOut === heatsOut ? "1:1 로 정확히 맞는다 (판번호가 빠짐없이 같이 나갔다)" : "어긋남 " + (platesOut - heatsOut) + "건"}`);

console.log("\n■ 2) 명세에 판번호가 연결(steelPlanHeatId)된 비율");
const linked = await p.shipmentItem.count({ where: { steelPlanId: { not: null }, steelPlanHeatId: { not: null }, vehicle: { shipment: { status: "ACTIVE" } } } });
console.log(`   ${linked}/${platesOut}건 (${(linked / platesOut * 100).toFixed(1)}%) — 연결 없는 ${platesOut - linked}건은 판번호 미상 출고`);

console.log("\n■ 3) 잔재로 나간 출고 36건의 종류별 내역 (여유원재가 위험군)");
const remItems = await p.shipmentItem.findMany({
  where: { remnantId: { not: null }, vehicle: { shipment: { status: "ACTIVE" } } },
  select: { heatNo: true, remnantNo: true, steelPlanHeatId: true,
            remnant: { select: { type: true, status: true, heatNo: true, remnantNo: true } },
            vehicle: { select: { shipment: { select: { shipmentNo: true, shippedAt: true } } } } },
});
const byType = {};
for (const r of remItems) { const t = r.remnant?.type ?? "(삭제됨)"; byType[t] = (byType[t] ?? 0) + 1; }
console.log(`   ${JSON.stringify(byType)}`);

let risk = 0;
for (const r of remItems) {
  if (r.remnant?.type !== "SURPLUS") continue;          // 등록잔재·현장잔재는 판번호 재고 대상 아님
  const hn = up(r.heatNo || r.remnant?.heatNo);
  if (!hn) { console.log(`     ${r.remnant.remnantNo}: 판번호 없음 — 확인 불가`); continue; }
  const w = await p.steelPlanHeat.count({ where: { heatNo: { equals: hn, mode: "insensitive" }, status: "WAITING" } });
  const s = await p.steelPlanHeat.count({ where: { heatNo: { equals: hn, mode: "insensitive" }, status: "SHIPPED" } });
  console.log(`     여유원재 ${r.remnant.remnantNo} 판번호 ${hn} → 대기 ${w} · 출고 ${s} ${w > 0 ? "← 대기로 남음" : ""}`);
  if (w > 0) risk++;
}
console.log(`   → 여유원재 출고분 중 판번호가 대기로 남은 것: ${risk}건`);

console.log("\n■ 4) 잔재 3종이 실제로 외부출고된 이력이 언제부터인지");
const first = remItems.map(r => r.vehicle?.shipment?.shippedAt).filter(Boolean).sort((a, b) => a - b);
if (first.length) console.log(`   첫 출고 ${first[0].toISOString().slice(0,10)} · 최근 ${first[first.length-1].toISOString().slice(0,10)} · 총 ${first.length}건`);

console.log("\n■ 5) 그래도 남는 대기 판번호 2,812건은 무엇인가 (표본)");
const waitSample = await p.steelPlanHeat.findMany({
  where: { status: "WAITING" }, take: 8, orderBy: { createdAt: "desc" },
  select: { heatNo: true, vesselCode: true, material: true, thickness: true, width: true, length: true, createdAt: true },
});
for (const w of waitSample)
  console.log(`   ${w.heatNo.padEnd(14)} ${w.vesselCode} ${w.material} ${w.thickness}t ${w.width}x${w.length} (등록 ${w.createdAt.toISOString().slice(0,10)})`);
const stockPlans = await p.steelPlan.count({ where: { status: { in: ["REGISTERED", "RECEIVED", "ISSUED"] } } });
console.log(`   참고: 아직 재고(등록/입고/투입) 상태인 강재 ${stockPlans}장 — 대기 판번호는 이들의 짝이다`);

await p.$disconnect();

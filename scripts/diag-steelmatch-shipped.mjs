/**
 * 강재매칭 — 실제로 나가지도 않은 사양이 '출고'로 잡히는 원인 확인 (읽기 전용).
 *
 * 판정 로직(lib/steel-match-select.ts computeCoverage) 재현:
 *   출고 = ① 강재: status=SHIPPED_OUT 이고 shipoutLabel = 이 매칭이름   ← 이 작업에 귀속
 *          ② 잔재: ACTIVE 출고장의 ShipmentItem(remnantId)             ← 전역(작업 무관)
 *   ②의 잔재 매칭은 재질·두께·폭·길이만 본다 — **호선을 아예 안 본다.**
 * 따라서 다른 호선·다른 작업에서 내보낸 잔재라도 치수가 같으면 이 목록의 사양을 '출고'로 덮는다.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const p = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const fmtT = (v) => parseFloat(Number(v).toFixed(1));
const fmtL = (v) => Math.round(Number(v));
const up = (x) => (x ?? "").trim().toUpperCase();

const NAME = process.argv[2] || "Steellist-1023-S30P(월드-SK)";
const job = await p.steelMatchJob.findFirst({ where: { name: { contains: NAME.slice(0, 20) } } });
if (!job) {
  console.log("매칭작업을 못 찾음. 등록된 목록:");
  for (const j of await p.steelMatchJob.findMany({ select: { name: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 20 }))
    console.log(`   ${j.name}  (${j.createdAt.toISOString().slice(0, 10)})`);
  await p.$disconnect(); process.exit(0);
}
const specs = Array.isArray(job.specs) ? job.specs : [];
console.log(`■ 매칭작업 "${job.name}" · 사양 ${specs.length}건 · 대상상태 ${job.statuses} · 확정필터 ${job.reservedFilter}`);

console.log("\n■ ① 이 작업에 귀속된 출고 강재 (shipoutLabel = 매칭이름, SHIPPED_OUT)");
const shippedPlates = await p.steelPlan.findMany({
  where: { status: "SHIPPED_OUT", shipoutLabel: job.name },
  select: { vesselCode: true, material: true, thickness: true, width: true, length: true },
});
console.log(`   ${shippedPlates.length}장 ${shippedPlates.length === 0 ? "← 이 목록에서 나간 강재는 없다" : ""}`);
for (const s of shippedPlates.slice(0, 10)) console.log(`     ${s.vesselCode} ${s.material} ${s.thickness}x${s.width}x${s.length}`);

console.log("\n■ ② 전역 출고 잔재 (ACTIVE 출고장의 잔재 — 작업·호선 무관)");
const shipRems = await p.shipmentItem.findMany({
  where: { remnantId: { not: null }, vehicle: { shipment: { status: "ACTIVE" } } },
  select: {
    remnantNo: true,
    remnant: { select: { remnantNo: true, type: true, material: true, thickness: true, width1: true, length1: true,
                         sourceProject: { select: { projectCode: true } }, sourceVesselName: true, sourceBlock: true } },
    vehicle: { select: { shipment: { select: { shipmentNo: true, shippedAt: true } } } },
  },
});
console.log(`   ${shipRems.length}건`);

console.log("\n■ 사양별 판정 — 어떤 근거로 '출고'가 되는지");
let hitPlate = 0, hitRem = 0;
const usedPlate = new Set(), usedRem = new Set();
for (const [i, s] of specs.entries()) {
  const pl = shippedPlates.find((x, xi) => !usedPlate.has(xi)
    && (!s.vesselCode || x.vesselCode === s.vesselCode)
    && up(x.material) === up(s.material)
    && fmtT(x.thickness) === fmtT(s.thickness)
    && fmtL(x.width) === fmtL(s.width) && fmtL(x.length) === fmtL(s.length));
  if (pl) { hitPlate++; usedPlate.add(shippedPlates.indexOf(pl)); continue; }

  const ri = shipRems.findIndex((x, xi) => {
    const r = x.remnant; if (!r || usedRem.has(xi)) return false;
    return up(r.material) === up(s.material)
      && fmtT(r.thickness) === fmtT(s.thickness)
      && fmtL(r.width1 ?? -1) === fmtL(s.width)
      && fmtL(r.length1 ?? -1) === fmtL(s.length);
  });
  if (ri >= 0) {
    usedRem.add(ri); hitRem++;
    const x = shipRems[ri], r = x.remnant;
    console.log(`   [출고] ${String(i + 1).padStart(3)}행  ${s.vesselCode} ${s.material} ${s.thickness} ${s.width} ${s.length}`);
    console.log(`          ← 잔재 ${r.remnantNo} (${r.type}) ${r.material} ${r.thickness}x${r.width1}x${r.length1}`);
    console.log(`            발생 ${r.sourceProject?.projectCode ?? r.sourceVesselName ?? "-"}/${r.sourceBlock ?? "-"} · 출고장 ${x.vehicle?.shipment?.shipmentNo ?? "-"} ${x.vehicle?.shipment?.shippedAt?.toISOString().slice(0,10) ?? ""}`);
  }
}
console.log(`\n   '출고' 판정: 강재근거 ${hitPlate}건 · 잔재근거 ${hitRem}건`);
if (hitRem > 0) console.log("   → 잔재근거 건은 이 목록과 무관한 잔재가 치수만 같아서 덮어쓴 것이다(호선 미비교).");

console.log("\n■ 참고 — 전역 '선별' 잔재도 같은 방식으로 덮는다");
const markedRems = await p.remnant.count({ where: { shipoutMarkedAt: { not: null }, status: { not: "EXHAUSTED" }, reservedFor: null } });
console.log(`   선별 마킹된 잔재 ${markedRems}건 (이것도 호선 무관 전역 풀)`);

await p.$disconnect();

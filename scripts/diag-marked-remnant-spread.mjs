/**
 * 선별 마킹된 잔재 4건이 몇 개의 매칭작업에 동시에 잡히고 있었는지 (읽기 전용).
 *
 * 옛 규칙에서는 잔재가 전역 풀이라 같은 잔재 하나가 여러 작업의 사양을 동시에 덮을 수 있었다.
 * 한 잔재가 N개 작업에 잡혔다면 그건 '실제 선별'이 아니라 '중복 계상'이라는 뜻이다.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const p = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const fmtT = (v) => parseFloat(Number(v).toFixed(1));
const fmtL = (v) => Math.round(Number(v));
const up = (x) => (x ?? "").trim().toUpperCase();
const matchRem = (s, r) =>
  up(r.material) === up(s.material) && fmtT(r.thickness) === fmtT(s.thickness) &&
  fmtL(r.width1 ?? -1) === fmtL(s.width) && fmtL(r.length1 ?? -1) === fmtL(s.length);

const jobs = await p.steelMatchJob.findMany({ orderBy: { createdAt: "desc" } });

console.log("■ 선별 마킹된 잔재 (선별목록에 올라와 있는 것)");
const marked = await p.remnant.findMany({
  where: { shipoutMarkedAt: { not: null }, status: { not: "EXHAUSTED" }, reservedFor: null },
  select: { remnantNo: true, type: true, material: true, thickness: true, width1: true, length1: true,
            shipoutMarkedAt: true, sourceProject: { select: { projectCode: true } }, sourceVesselName: true, sourceBlock: true },
});
for (const r of marked) {
  const hits = jobs.filter(j => (Array.isArray(j.specs) ? j.specs : []).some(s => matchRem(s, r)));
  const src = r.sourceProject?.projectCode ?? r.sourceVesselName ?? "-";
  console.log(`\n   ${r.remnantNo} (${r.type}) ${r.material} ${r.thickness}x${r.width1}x${r.length1}`);
  console.log(`     발생 ${src}/${r.sourceBlock ?? "-"} · 선별 ${r.shipoutMarkedAt.toISOString().slice(0,10)}`);
  console.log(`     ← 옛 규칙에서 이 잔재가 잡히던 작업: ${hits.length}개  ${hits.map(j => j.name).join(", ") || "(없음)"}`);
}

console.log("\n■ 외부출고된 잔재 36건 — 몇 개 작업에 동시에 잡히고 있었나");
const shipped = (await p.shipmentItem.findMany({
  where: { remnantId: { not: null }, vehicle: { shipment: { status: "ACTIVE" } } },
  select: { remnant: { select: { remnantNo: true, material: true, thickness: true, width1: true, length1: true,
                                 sourceProject: { select: { projectCode: true } }, sourceVesselName: true } } },
})).map(x => x.remnant).filter(Boolean);
let multi = 0;
for (const r of shipped) {
  const hits = jobs.filter(j => (Array.isArray(j.specs) ? j.specs : []).some(s => matchRem(s, r)));
  if (hits.length === 0) continue;
  multi++;
  const src = r.sourceProject?.projectCode ?? r.sourceVesselName ?? "-";
  console.log(`   ${r.remnantNo} (발생 ${src}) ${r.material} ${r.thickness}x${r.width1}x${r.length1} → ${hits.length}개 작업: ${hits.map(j => j.name).join(", ")}`);
}
console.log(`   → 어느 작업 사양과도 안 맞는 잔재: ${shipped.length - multi}건 (원래 영향 없던 것)`);
await p.$disconnect();

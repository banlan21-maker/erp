import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const p = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

console.log("■ A) sync 갈래 A 에 issuedAt 가드를 그대로 붙이면 어떻게 되나");
const comp = await p.steelPlan.count({ where: { status: "COMPLETED" } });
const compNoIssued = await p.steelPlan.count({ where: { status: "COMPLETED", issuedAt: null } });
console.log(`   절단완료 강재 ${comp}장 중 issuedAt 이 빈 것 ${compNoIssued}장`);
console.log(`   → issuedAt 가드를 A 에 붙이면 ${comp - compNoIssued}장이 규칙 대상에서 빠진다 (사실상 무력화)`);

console.log("\n■ B) 여유원재 — 같은 실물이 강재전체목록에도 재고로 남아 있는가");
const sur = await p.remnant.findMany({
  where: { type: "SURPLUS", status: "IN_STOCK" },
  select: { remnantNo: true, heatNo: true, material: true, thickness: true, width1: true, length1: true },
});
console.log(`   여유원재 재고 ${sur.length}건 (판번호 기재 ${sur.filter(s => s.heatNo?.trim()).length}건)`);
let dup = 0, dupHeat = 0;
const samples = [];
for (const s of sur) {
  const hn = s.heatNo?.trim();
  if (hn) {
    const h = await p.steelPlanHeat.count({ where: { heatNo: hn, status: "WAITING" } });
    if (h > 0) { dupHeat++; if (samples.length < 8) samples.push(`판번호 ${hn} → 판번호리스트에 대기 ${h}건`); }
  }
  const n = await p.steelPlan.count({
    where: { material: s.material, thickness: s.thickness, width: s.width1 ?? -1, length: s.length1 ?? -1,
             status: { in: ["REGISTERED", "RECEIVED"] }, archivedAt: null },
  });
  if (n > 0) dup++;
}
console.log(`   같은 사양의 강재가 아직 재고(등록/입고)로 있는 여유원재: ${dup}건`);
console.log(`   기재된 판번호가 판번호리스트에 '대기'로 남아있는 여유원재: ${dupHeat}건  ← 같은 실물 이중계상`);
for (const x of samples) console.log(`     ${x}`);

console.log("\n■ C) 잔재가 도면에 확정돼 있는데 잔재 쪽이 소진/삭제된 어긋남");
const bad = await p.drawingList.findMany({
  where: { status: { in: ["WAITING", "REGISTERED", "CAUTION"] }, NOT: { assignedRemnantId: null },
           assignedRemnant: { status: "EXHAUSTED" } },
  select: { block: true, drawingNo: true, status: true, assignedRemnant: { select: { remnantNo: true } }, project: { select: { projectCode: true } } },
});
console.log(`   도면은 미절단인데 잔재는 이미 소진: ${bad.length}건`);
for (const b of bad.slice(0, 10)) console.log(`     ${b.project?.projectCode}/${b.block} ${b.drawingNo} [${b.status}] ← ${b.assignedRemnant?.remnantNo}`);

console.log("\n■ D) sync 되돌림이 finishedAt 을 안 지워 남은 것");
const stale = await p.steelPlan.count({ where: { status: { in: ["REGISTERED", "RECEIVED", "ISSUED"] }, NOT: { finishedAt: null } } });
console.log(`   재고 상태인데 종료일(finishedAt)이 박혀 있는 강재: ${stale}장`);
await p.$disconnect();

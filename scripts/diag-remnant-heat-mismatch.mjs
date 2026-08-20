import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const p = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const logs = await p.cuttingLog.findMany({
  where: { status: "COMPLETED", consumedHeatId: { not: null }, drawingListId: { not: null } },
  select: { heatNo: true, drawingListId: true, consumedHeatId: true },
});
console.log(`■ consumedHeatId 가 있는 완료 작업일보 ${logs.length}건`);
let n = 0, fixable = [];
for (const l of logs) {
  const real = (await p.steelPlanHeat.findUnique({ where: { id: l.consumedHeatId }, select: { heatNo: true } }))?.heatNo?.trim();
  if (!real || !l.drawingListId) continue;
  const rems = await p.remnant.findMany({
    where: { drawingListId: l.drawingListId, type: "REGISTERED" },
    select: { id: true, remnantNo: true, heatNo: true },
  });
  for (const r of rems) {
    const cur = r.heatNo?.trim() ?? "";
    if (cur !== real) { n++; if (fixable.length < 12) fixable.push(`${r.remnantNo.padEnd(22)} 현재='${cur || "(공란)"}'  실제소진='${real}'  (일보기재='${l.heatNo ?? ""}')`); }
  }
}
console.log(`   등록잔재 판번호가 '실제 소진한 판'과 다른 것: ${n}건`);
for (const f of fixable) console.log(`     ${f}`);
await p.$disconnect();

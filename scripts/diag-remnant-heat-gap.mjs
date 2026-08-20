import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const p = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const reg = await p.remnant.findMany({
  where: { type: "REGISTERED", heatNo: null, drawingList: { status: "CUT", NOT: { heatNo: null } } },
  select: { remnantNo: true, createdAt: true, drawingListId: true, drawingList: { select: { heatNo: true } } },
});
console.log(`판번호 없는 등록잔재(원판은 절단·판번호 있음): ${reg.length}건`);
const ids = reg.map(r => r.drawingListId);
const logs = await p.cuttingLog.findMany({ where: { drawingListId: { in: ids }, status: "COMPLETED" }, select: { drawingListId: true, endAt: true, heatNo: true } });
const byDl = new Map(); for (const l of logs) { const q = byDl.get(l.drawingListId); if (!q || (l.endAt && q.endAt && l.endAt > q.endAt)) byDl.set(l.drawingListId, l); }
const CUTOFF = new Date("2026-06-15T00:00:00+09:00");
let before = 0, after = 0, nolog = 0, logNoHeat = 0;
const late = [];
for (const r of reg) {
  const l = byDl.get(r.drawingListId);
  if (!l) { nolog++; continue; }
  if (!l.heatNo?.trim()) logNoHeat++;
  if (l.endAt && l.endAt >= CUTOFF) { after++; late.push({ no: r.remnantNo, end: l.endAt.toISOString().slice(0,10), logHeat: l.heatNo ?? "(공란)", dlHeat: r.drawingList.heatNo }); }
  else before++;
}
console.log(`  절단일 2026-06-15 이전(전파 기능 도입 전): ${before}건  ← 소급 미적용`);
console.log(`  절단일 그 이후                          : ${after}건  ← 지금도 안 붙는다면 살아있는 결함`);
console.log(`  작업일보 자체가 없음                    : ${nolog}건`);
console.log(`  작업일보의 판번호가 공란                : ${logNoHeat}건  ← 잔재로 자른 도면(원판 판번호가 애초에 없음)`);
for (const x of late.slice(0, 12)) console.log(`     ${x.no.padEnd(22)} 절단 ${x.end}  일보판번호=${x.logHeat}  도면판번호=${x.dlHeat}`);
await p.$disconnect();

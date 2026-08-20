/**
 * 새 중복완료 가드가 의도대로 판정하는지 읽기 전용 시뮬레이션.
 * 가드 조건: 같은 drawingListId 에 COMPLETED 로그가 있으면 거절 (행 정확 일치).
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const p = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const would = async (id) => !!(await p.cuttingLog.findFirst({ where: { drawingListId: id, status: "COMPLETED" }, select: { id: true } }));

console.log("■ 1) 이미 절단완료된 도면 → 막혀야 한다");
const cut = await p.drawingList.findMany({ where: { status: "CUT" }, take: 5, select: { id: true, block: true, drawingNo: true, project: { select: { projectCode: true } } } });
for (const d of cut) console.log(`   ${d.project?.projectCode}/${d.block} ${d.drawingNo} → ${await would(d.id) ? "차단 ✔" : "통과 ✗"}`);

console.log("\n■ 2) 아직 확정만 된 도면(WAITING) → 통과해야 한다");
const wait = await p.drawingList.findMany({ where: { status: "WAITING" }, take: 5, select: { id: true, block: true, drawingNo: true, project: { select: { projectCode: true } } } });
for (const d of wait) console.log(`   ${d.project?.projectCode}/${d.block} ${d.drawingNo} → ${await would(d.id) ? "차단 ✗" : "통과 ✔"}`);

console.log("\n■ 3) 같은 도면번호가 2행인 경우 — 행마다 따로 판정돼야 한다 (정상 2장 절단 보호)");
const rows = await p.drawingList.findMany({ where: { drawingNo: "a36-20-2304", block: "후행", project: { projectCode: "LB4506" } }, select: { id: true, heatNo: true } });
for (const r of rows) console.log(`   행 ${r.id.slice(-6)} 판번호 ${r.heatNo} → ${await would(r.id) ? "차단" : "통과"}`);
console.log("   (두 행 모두 이미 완료라 둘 다 차단 — 정상. 셋째 등록만 막힌다)");

console.log("\n■ 4) 이번에 만든 -1 행 — 각자 1건씩이라 서로 영향 없어야 한다");
for (const no of ["CNR001", "CNR001-1", "CNX002", "CNX002-1", "A11CNCP13", "A11CNCP13-1"]) {
  const d = await p.drawingList.findFirst({ where: { drawingNo: no }, select: { id: true, block: true, project: { select: { projectCode: true } } } });
  if (!d) { console.log(`   ${no} — 없음`); continue; }
  const n = await p.cuttingLog.count({ where: { drawingListId: d.id, status: "COMPLETED" } });
  console.log(`   ${no.padEnd(12)} 완료 ${n}건 → 추가 등록 시 ${await would(d.id) ? "차단 ✔" : "통과"}`);
}
await p.$disconnect();

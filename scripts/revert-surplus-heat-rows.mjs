/**
 * 여유원재 절단이 프로젝트 강재 판번호 목록(SteelPlanHeat)에 만들어 넣었던 행을 되돌린다 (2026-09-22).
 *
 * 정책 변경: 여유원재는 프로젝트 강재와 따로 관리한다. 판번호는 여유원재 자체에 남기고
 * 프로젝트 판번호 목록으로 옮기지 않는다. 옮기던 코드(lib/cutting-complete.ts SURPLUS 블록)는 제거했고,
 * 그 코드가 이미 만들어 둔 행(autoCreatedFromSurplusCut=true)을 여기서 지운다.
 *
 * 그 행들은 도면 치수로 만들어져 "옮겨지고 나니 판번호 사양이 바뀌었다"는 혼선을 낳았다
 * (REM-2026-053: 잔재 10550 ↔ 행 11830). 삭제 전 CuttingLog(consumedHeatId/selectedHeatId)·
 * ShipmentItem(steelPlanHeatId) 참조가 없는지 확인한다 — 참조가 있으면 지우지 않고 보고만 한다.
 *
 * 실행: node scripts/revert-surplus-heat-rows.mjs           (미리보기)
 *       node scripts/revert-surplus-heat-rows.mjs --apply   (삭제 + undo JSON)
 * 되돌리기: scripts/revert-surplus-heat-rows-undo.json 의 rows 를 그대로 create.
 */
import "dotenv/config";
import { writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const APPLY = process.argv.includes("--apply");

const rows = await prisma.steelPlanHeat.findMany({ where: { autoCreatedFromSurplusCut: true } });
console.log(`여유원재 절단이 만든 판번호 행 ${rows.length}건`);

const deletable = [];
for (const h of rows) {
  const logRefs  = await prisma.cuttingLog.count({ where: { OR: [{ consumedHeatId: h.id }, { selectedHeatId: h.id }] } });
  const itemRefs = await prisma.shipmentItem.count({ where: { steelPlanHeatId: h.id } });
  const ok = logRefs === 0 && itemRefs === 0;
  console.log(`   ${h.vesselCode} ${h.heatNo} ${[h.material, h.thickness, h.width, h.length].join("×")} [${h.status}]  참조 로그 ${logRefs} · 명세 ${itemRefs}  → ${ok ? "삭제 대상" : "참조 있음 — 건너뜀"}`);
  if (ok) deletable.push(h);
}

if (!APPLY) { console.log(`\n미리보기입니다. 반영하려면 --apply`); await prisma.$disconnect(); process.exit(0); }

if (deletable.length) {
  writeFileSync("scripts/revert-surplus-heat-rows-undo.json", JSON.stringify({ deletedAt: new Date().toISOString(), rows: deletable }, null, 2), "utf-8");
  const r = await prisma.steelPlanHeat.deleteMany({ where: { id: { in: deletable.map(h => h.id) } } });
  console.log(`\n삭제 ${r.count}건 — undo: scripts/revert-surplus-heat-rows-undo.json`);
} else {
  console.log("\n삭제할 행이 없습니다.");
}
await prisma.$disconnect();

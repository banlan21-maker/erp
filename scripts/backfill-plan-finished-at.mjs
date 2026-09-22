/**
 * 절단완료(COMPLETED) 강재인데 종료일(finishedAt)이 비어 있는 행을 절단로그로 메운다 (2026-09-22).
 *
 * finishedAt 은 아카이브 판정축이다. 비어 있으면 그 강재는 아카이브 대상에서 조용히 빠져 영원히
 * 활성 목록에 남는다(실측 1장: KYTS-1022 A 12×2920×8890, 2026-08-19 절단). 완료 처리 코드는
 * finishedAt 을 항상 찍으므로(lib/cutting-complete.ts) 이 컬럼이 생기기 전에 완료된 잔여분이다.
 *
 * 매칭: 같은 호선·사양의 COMPLETED 절단로그 중 판번호(actualHeatNo)가 같은 것 → 그 endAt.
 *       판번호가 없거나 로그가 여럿이면 가장 이른 endAt 하나. 로그가 없으면 건드리지 않고 보고만.
 *
 * 실행: node scripts/backfill-plan-finished-at.mjs           (미리보기)
 *       node scripts/backfill-plan-finished-at.mjs --apply   (반영 + undo JSON)
 */
import "dotenv/config";
import { writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const APPLY = process.argv.includes("--apply");
const kst = d => d ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(d) : "-";

const plans = await prisma.steelPlan.findMany({
  where: { status: "COMPLETED", finishedAt: null },
  select: { id: true, vesselCode: true, material: true, thickness: true, width: true, length: true, actualHeatNo: true, issuedAt: true },
});
console.log(`절단완료인데 종료일이 없는 강재 ${plans.length}장`);

const fixes = [];
for (const sp of plans) {
  const spec = { material: { equals: sp.material, mode: "insensitive" }, thickness: sp.thickness, width: sp.width, length: sp.length, status: "COMPLETED", endAt: { not: null } };
  const byHeat = sp.actualHeatNo
    ? await prisma.cuttingLog.findFirst({ where: { ...spec, heatNo: { equals: sp.actualHeatNo, mode: "insensitive" }, project: { projectCode: sp.vesselCode } }, orderBy: { endAt: "asc" }, select: { id: true, endAt: true, drawingNo: true } })
    : null;
  const log = byHeat ?? await prisma.cuttingLog.findFirst({ where: { ...spec, project: { projectCode: sp.vesselCode } }, orderBy: { endAt: "asc" }, select: { id: true, endAt: true, drawingNo: true } });
  const label = `${sp.vesselCode} ${[sp.material, sp.thickness, sp.width, sp.length].join("×")} 판번호 ${sp.actualHeatNo ?? "-"}`;
  if (!log) { console.log(`   ${label} → 절단로그 없음 (건너뜀)`); continue; }
  console.log(`   ${label} → ${log.drawingNo ?? "?"} 종료 ${kst(log.endAt)}${byHeat ? "" : "  (판번호 매칭 없음 — 사양·호선으로)"}`);
  fixes.push({ id: sp.id, before: null, after: log.endAt.toISOString(), logId: log.id, label });
}

if (!APPLY) { console.log(`\n미리보기입니다. 반영하려면 --apply`); await prisma.$disconnect(); process.exit(0); }
if (fixes.length) {
  writeFileSync("scripts/backfill-plan-finished-at-undo.json", JSON.stringify({ appliedAt: new Date().toISOString(), fixes }, null, 2), "utf-8");
  for (const f of fixes) await prisma.steelPlan.update({ where: { id: f.id }, data: { finishedAt: new Date(f.after) } });
  console.log(`\n반영 ${fixes.length}건 — undo: scripts/backfill-plan-finished-at-undo.json (before 값으로 update)`);
} else {
  console.log("\n반영할 것이 없습니다.");
}
await prisma.$disconnect();

/**
 * 현장 팝업에서 중량을 손으로 넣다 잘못 저장된 잔재를 치수 계산값으로 바로잡는다 (2026-10-02).
 *
 * 원인: 돌발 완료 후 "남은 잔재가 있나요?" 팝업이 중량을 손 입력으로만 받고 검사가 없었다.
 *       서버도 받은 값을 그대로 넣었다. → 코드에서 자동계산·검사 추가(lib/remnant-area remnantWeightProblem).
 *
 * 대상: 사각형(RECTANGLE) 이면서 폭·길이·두께가 있고, 저장 중량이 0 이하이거나 계산값의 0.5~2배 밖인 행 중
 *       **현장 팝업 경로로 만든 것**(type=REMNANT, drawingListId·parentRemnantId 없음, 2026-09 이후)만.
 *       그 외 이상치(옛 수기 등록·비정형·치수 오타 의심)는 무엇이 맞는지 몰라 건드리지 않고 목록만 보여준다.
 *
 * 실행: node scripts/fix-remnant-weight.mjs           (미리보기)
 *       node scripts/fix-remnant-weight.mjs --apply   (반영 + undo JSON)
 */
import "dotenv/config";
import { writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const APPLY = process.argv.includes("--apply");
const calc = r => Math.round(r.thickness * r.width1 * r.length1 * 7.85 / 1e6 * 10) / 10;

const rows = await prisma.remnant.findMany({
  where: { shape: "RECTANGLE", NOT: [{ width1: null }, { length1: null }] },
  select: { id: true, remnantNo: true, type: true, status: true, thickness: true, width1: true, length1: true, weight: true,
            drawingListId: true, parentRemnantId: true, registeredBy: true, createdAt: true },
});
const bad = rows.filter(r => { const c = calc(r); return !(r.weight > 0) || r.weight < c * 0.5 || r.weight > c * 2; });
const target = bad.filter(r => r.type === "REMNANT" && !r.drawingListId && !r.parentRemnantId && r.createdAt >= new Date("2026-09-01T00:00:00+09:00"));

console.log(`사각형 잔재 중 중량 이상 ${bad.length}건 — 이 스크립트가 고치는 것 ${target.length}건`);
for (const r of bad) {
  const fix = target.includes(r);
  console.log(`   ${fix ? "고침" : "보류"}  ${r.remnantNo.padEnd(20)} ${r.status.padEnd(9)} ${r.thickness}×${r.width1}×${r.length1}  ${r.weight.toLocaleString()}kg → ${calc(r)}kg  (${r.registeredBy})`);
}
if (!APPLY) { console.log("\n미리보기입니다. 반영하려면 --apply"); await prisma.$disconnect(); process.exit(0); }
const undo = [];
for (const r of target) {
  await prisma.remnant.update({ where: { id: r.id }, data: { weight: calc(r) } });
  undo.push({ id: r.id, remnantNo: r.remnantNo, before: r.weight, after: calc(r) });
}
writeFileSync("scripts/fix-remnant-weight-undo.json", JSON.stringify({ appliedAt: new Date().toISOString(), undo }, null, 2), "utf-8");
console.log(`\n반영 ${undo.length}건 — undo: scripts/fix-remnant-weight-undo.json`);
await prisma.$disconnect();

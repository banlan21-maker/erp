/**
 * 선별 잔재의 매칭작업 라벨 소급 (2026-08-20).
 *
 * 배경
 *   Remnant.shipoutLabel 을 새로 만들기 전에 선별한 잔재는 라벨이 없다.
 *   라벨이 없으면 어느 매칭 목록에도 안 잡히므로, 실제로 그 작업에서 선별한 것까지
 *   '미선별' 로 되돌아간다.
 *
 * 무엇을 채우나 — 판단이 명확한 것만
 *   선별목록에 올라와 있는(shipoutMarkedAt 마킹 + 미소진 + 절단 미확정) 잔재 중,
 *   **사양이 정확히 한 매칭작업에만 걸리는 것**. 두 작업 이상에 걸리면 어느 쪽인지
 *   알 수 없으므로 건드리지 않는다.
 *
 * 무엇을 안 채우나
 *   이미 외부출고된 잔재(ShipmentItem). 출고는 매칭작업을 거치지 않고도 나갈 수 있어
 *   "치수가 맞는다"가 곧 "그 작업에서 내보냈다"를 뜻하지 않는다.
 *   실측된 오판 2건(1022 잔재가 1023-S30P 목록을 덮던 것)이 정확히 그 경우다.
 *
 * 실행:  node scripts/fix-remnant-shipout-label.mjs          (미리보기)
 *        node scripts/fix-remnant-shipout-label.mjs --apply  (반영 + undo JSON)
 */
import "dotenv/config";
import fs from "node:fs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const APPLY = process.argv.includes("--apply");

const fmtT = (v) => parseFloat(Number(v).toFixed(1));
const fmtL = (v) => Math.round(Number(v));
const up = (x) => (x ?? "").trim().toUpperCase();
const matchRem = (s, r) =>
  up(r.material) === up(s.material) && fmtT(r.thickness) === fmtT(s.thickness) &&
  fmtL(r.width1 ?? -1) === fmtL(s.width) && fmtL(r.length1 ?? -1) === fmtL(s.length);

const jobs = await prisma.steelMatchJob.findMany({ orderBy: { createdAt: "desc" } });
const marked = await prisma.remnant.findMany({
  where: { shipoutMarkedAt: { not: null }, status: { not: "EXHAUSTED" }, reservedFor: null, shipoutLabel: null },
  select: { id: true, remnantNo: true, type: true, material: true, thickness: true, width1: true, length1: true,
            shipoutMarkedAt: true, sourceProject: { select: { projectCode: true } }, sourceVesselName: true, sourceBlock: true },
});

console.log(`■ 라벨 없는 선별 잔재: ${marked.length}건`);
const plan = [], skipped = [];
for (const r of marked) {
  const hits = jobs.filter(j => (Array.isArray(j.specs) ? j.specs : []).some(s => matchRem(s, r)));
  const src = r.sourceProject?.projectCode ?? r.sourceVesselName ?? "(미상)";
  if (hits.length === 1) {
    plan.push({ r, job: hits[0] });
    console.log(`   ✔ ${r.remnantNo.padEnd(22)} ${r.material} ${r.thickness}x${r.width1}x${r.length1} · 발생 ${src}`);
    console.log(`        → ${hits[0].name}`);
  } else {
    skipped.push({ r, hits });
    console.log(`   – ${r.remnantNo.padEnd(22)} 걸리는 작업 ${hits.length}개 — 판단 불가, 건드리지 않음`);
  }
}
console.log(`\n■ 채울 것 ${plan.length}건 · 건너뜀 ${skipped.length}건`);

if (!APPLY) { console.log("\n(미리보기만 — 반영하려면 --apply)"); await prisma.$disconnect(); process.exit(0); }
if (plan.length === 0) { await prisma.$disconnect(); process.exit(0); }

fs.writeFileSync("scripts/fix-remnant-shipout-label-undo.json", JSON.stringify({
  purpose: "잔재 shipoutLabel 소급 되돌리기 — 아래 id 들의 shipoutLabel 을 NULL 로",
  appliedAt: new Date().toISOString(),
  count: plan.length,
  items: plan.map(x => ({ id: x.r.id, remnantNo: x.r.remnantNo, before: null, after: x.job.name })),
}, null, 2), "utf8");

let n = 0;
for (const x of plan) {
  const res = await prisma.remnant.updateMany({
    where: { id: x.r.id, shipoutLabel: null },   // 그 사이 값이 생겼으면 덮지 않는다
    data: { shipoutLabel: x.job.name },
  });
  n += res.count;
}
console.log(`\n✔ ${n}건 라벨 기록 (undo: scripts/fix-remnant-shipout-label-undo.json)`);

const left = await prisma.remnant.count({ where: { shipoutMarkedAt: { not: null }, status: { not: "EXHAUSTED" }, reservedFor: null, shipoutLabel: null } });
console.log(`   라벨 없는 선별 잔재 남음: ${left}건`);
await prisma.$disconnect();

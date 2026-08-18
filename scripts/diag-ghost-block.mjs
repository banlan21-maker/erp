/**
 * 새 진단 후보 검증 — "완료된 블록에 남은 확정 재고" (S60PS 유형 유령 확정)
 *
 * 기존 진단이 왜 놓쳤나:
 *   G(ghostReserved) = reservedFor 블록의 '도면이 존재하는지' 만 봄 → 도면은 있으니 통과
 *   D(specStatusMismatch) = 사양 단위 총량 비교 → 다른 블록 잔여와 상쇄되면 diff 0
 * 이 스크립트는 **블록 단위**로 본다: 그 블록 도면이 전부 CUT 인데
 * 그 블록에 확정(reservedFor)된 철판이 아직 재고(REGISTERED/RECEIVED/ISSUED)로 남아 있으면 유령.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const STOCK = ["REGISTERED", "RECEIVED", "ISSUED"];

const draws = await prisma.drawingList.findMany({
  select: { block: true, status: true, project: { select: { projectCode: true } } },
});
// 블록별 도면 상태 집계 (프로젝트/블록 키)
const byBlock = new Map();
for (const d of draws) {
  const b = (d.block ?? "").trim();
  if (!b) continue;
  const code = d.project?.projectCode ?? "";
  const k = `${code}/${b}`;
  const e = byBlock.get(k) ?? { code, block: b, total: 0, cut: 0, other: {} };
  e.total++;
  if (d.status === "CUT") e.cut++;
  else e.other[d.status] = (e.other[d.status] ?? 0) + 1;
  byBlock.set(k, e);
}
const doneBlocks = new Map();   // 전부 CUT 인 블록
for (const [k, e] of byBlock) if (e.total > 0 && e.cut === e.total) doneBlocks.set(k, e);
console.log(`■ 블록 ${byBlock.size}개 중 도면이 전부 절단(CUT)된 블록: ${doneBlocks.size}개`);

const plans = await prisma.steelPlan.findMany({
  where: { status: { in: STOCK }, NOT: { reservedFor: null }, archivedAt: null },
  select: { id: true, vesselCode: true, material: true, thickness: true, width: true, length: true, status: true, reservedFor: true },
});
console.log(`■ 확정(reservedFor) 있고 아직 재고인 철판: ${plans.length}장`);

// reservedFor 는 "블록" 또는 "호선/블록" 두 형태
const hits = [];
for (const p of plans) {
  const rf = (p.reservedFor ?? "").trim();
  if (!rf) continue;
  const keys = rf.includes("/") ? [rf] : [...doneBlocks.keys()].filter(k => k.endsWith(`/${rf}`));
  for (const k of keys) {
    if (doneBlocks.has(k)) { hits.push({ ...p, blockKey: k, done: doneBlocks.get(k) }); break; }
  }
}
console.log(`\n■ ★ 완료된 블록에 남은 확정 재고 = ${hits.length}장`);
const byBlk = new Map();
for (const h of hits) {
  const a = byBlk.get(h.blockKey) ?? [];
  a.push(h); byBlk.set(h.blockKey, a);
}
console.log(`   블록 ${byBlk.size}개`);
for (const [k, arr] of [...byBlk.entries()].sort((a, b) => b[1].length - a[1].length)) {
  const st = {};
  for (const x of arr) st[x.status] = (st[x.status] ?? 0) + 1;
  console.log(`   · ${k}  ${arr.length}장  ${JSON.stringify(st)}  (도면 ${byBlock.get(k).total}행 전부 CUT)`);
  for (const x of arr.slice(0, 3)) console.log(`       ${x.material} ${x.thickness}×${x.width}×${x.length} [${x.status}] 확정=${x.reservedFor}`);
  if (arr.length > 3) console.log(`       … 외 ${arr.length - 3}장`);
}

// 기존 진단이 이 건들을 잡는가? — G(도면 존재) / D(사양 총량) 대조
console.log("\n■ 기존 진단이 이걸 잡는가?");
const validReserved = new Set();
for (const d of draws) {
  const b = (d.block ?? "").trim(); if (!b) continue;
  validReserved.add(b);
  if (d.project?.projectCode) validReserved.add(`${d.project.projectCode}/${b}`);
}
const caughtByG = hits.filter(h => !validReserved.has((h.reservedFor ?? "").trim())).length;
console.log(`   G(유령 확정 — 도면 미존재): ${caughtByG}/${hits.length}장 포착  ← 0 이면 완전히 놓친다`);

await prisma.$disconnect();

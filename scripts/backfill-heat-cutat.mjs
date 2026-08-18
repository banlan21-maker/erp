/**
 * 판번호 절단일(cutAt) 백필 — 아카이브 판정의 updatedAt 폴백을 없애기 위한 선행 작업.
 *
 * 배경 (2026-08-18 아카이브 전면 리뷰):
 *   아카이브 대상 판정이 cutAt 결측 시 updatedAt 을 폴백으로 썼는데, 아카이브/복원 자체가
 *   @updatedAt 을 갱신해 폴백 대상이 판정에서 이탈했다. cutAt 을 채워 폴백 자체를 없앤다.
 *   실측: cutAt 결측 CUT 판번호 361건 전부가 작업일보(COMPLETED CuttingLog)에 실제 절단일 보유.
 *
 * ★ raw SQL 로 쓴다 — Prisma update 를 쓰면 updatedAt 이 '지금'으로 밀려
 *   원본 수정이력이 훼손되고, 백필 자체가 또 한 번의 오염이 된다.
 *
 * 실행:  node scripts/backfill-heat-cutat.mjs          (미리보기)
 *        node scripts/backfill-heat-cutat.mjs --apply  (반영 + undo JSON)
 */
import "dotenv/config";
import fs from "node:fs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const APPLY = process.argv.includes("--apply");
const d = (x) => (x ? new Date(x).toISOString().slice(0, 16).replace("T", " ") : "-");

// ── 대상 ────────────────────────────────────────────────────────────────
const orphans = await prisma.steelPlanHeat.findMany({
  where: { status: "CUT", cutAt: null },
  select: { id: true, heatNo: true, vesselCode: true, material: true, thickness: true, width: true, length: true, updatedAt: true },
});
console.log(`■ cutAt 결측 CUT 판번호: ${orphans.length}건`);
if (orphans.length === 0) { console.log("  대상 없음 — 종료"); await prisma.$disconnect(); process.exit(0); }

// ── 근거 수집: ① consumedHeatId 정확매칭 우선 ② heatNo 최초 완료로그 폴백 ──
const byConsumed = await prisma.cuttingLog.findMany({
  where: { status: "COMPLETED", consumedHeatId: { in: orphans.map(o => o.id) }, endAt: { not: null } },
  select: { consumedHeatId: true, endAt: true },
});
const exact = new Map();
for (const l of byConsumed) if (l.consumedHeatId && l.endAt) exact.set(l.consumedHeatId, l.endAt);

const logs = await prisma.cuttingLog.findMany({
  where: { status: "COMPLETED", heatNo: { in: [...new Set(orphans.map(o => o.heatNo))] }, endAt: { not: null } },
  select: { heatNo: true, endAt: true, thickness: true, width: true, length: true },
  orderBy: { endAt: "asc" },
});
// 동명 판번호(수입재 등) 대비 — heatNo+사양 키를 우선 쓰고, 없으면 heatNo 만
const specKey = (h) => `${h.heatNo}|${h.thickness}|${h.width}|${h.length}`;
const bySpec = new Map(), byNo = new Map();
for (const l of logs) {
  if (!byNo.has(l.heatNo)) byNo.set(l.heatNo, l.endAt);
  const k = specKey(l);
  if (!bySpec.has(k)) bySpec.set(k, l.endAt);
}

const plan = [];
const skipped = [];
for (const o of orphans) {
  const k = specKey(o);
  const src = exact.has(o.id) ? "consumedHeatId" : bySpec.has(k) ? "heatNo+사양" : byNo.has(o.heatNo) ? "heatNo" : null;
  const cutAt = exact.get(o.id) ?? bySpec.get(k) ?? byNo.get(o.heatNo) ?? null;
  if (!cutAt) { skipped.push(o); continue; }
  plan.push({ id: o.id, heatNo: o.heatNo, vesselCode: o.vesselCode, cutAt, src });
}
console.log(`   근거 확보 ${plan.length}건 (정확매칭 ${plan.filter(p => p.src === "consumedHeatId").length} / heatNo+사양 ${plan.filter(p => p.src === "heatNo+사양").length} / heatNo만 ${plan.filter(p => p.src === "heatNo").length})`);
console.log(`   근거 없음 ${skipped.length}건 — 건드리지 않는다`);
if (plan.length) {
  const ds = plan.map(p => p.cutAt).sort((a, b) => a - b);
  console.log(`   절단일 범위 ${d(ds[0])} ~ ${d(ds[ds.length - 1])}`);
  console.log("   샘플 3건:");
  for (const p of plan.slice(0, 3)) console.log(`     · ${p.heatNo} ${p.vesselCode} → ${d(p.cutAt)} (${p.src})`);
}

if (!APPLY) { console.log("\n(미리보기만 — 반영하려면 --apply)"); await prisma.$disconnect(); process.exit(0); }

// ── 반영 (raw SQL, updatedAt 보존) ──────────────────────────────────────
fs.writeFileSync("scripts/backfill-heat-cutat-undo.json", JSON.stringify({
  purpose: "판번호 cutAt 백필 되돌리기 (전부 원래 null 이었음)",
  appliedAt: new Date().toISOString(),
  note: "되돌리려면 아래 id 들의 cutAt 을 NULL 로. raw SQL 로 썼으므로 updatedAt 은 백필 전 값 그대로다.",
  items: plan.map(p => ({ id: p.id, heatNo: p.heatNo, before: { cutAt: null }, after: { cutAt: p.cutAt.toISOString() }, src: p.src })),
}, null, 2), "utf8");

let n = 0;
for (const p of plan) {
  // updatedAt 을 건드리지 않도록 raw SQL. 이미 값이 있으면 덮지 않음(재실행 안전).
  n += await prisma.$executeRaw`UPDATE "SteelPlanHeat" SET "cutAt" = ${p.cutAt} WHERE "id" = ${p.id} AND "cutAt" IS NULL AND "status" = 'CUT'`;
}
console.log(`\n✔ ${n}건 반영 (undo: scripts/backfill-heat-cutat-undo.json)`);

// ── 사후 검증 ──────────────────────────────────────────────────────────
const left = await prisma.steelPlanHeat.count({ where: { status: "CUT", cutAt: null } });
console.log(`   남은 cutAt 결측 CUT: ${left}건`);
const cutoff = new Date(); cutoff.setMonth(cutoff.getMonth() - 1);
const h = await prisma.steelPlanHeat.count({ where: { archivedAt: null, OR: [
  { status: "CUT", cutAt: { lte: cutoff } }, { status: "SHIPPED", shippedAt: { lte: cutoff } },
]}});
const pl = await prisma.steelPlan.count({ where: { archivedAt: null, status: { in: ["COMPLETED", "SHIPPED_OUT"] }, issuedAt: { lte: cutoff } } });
console.log(`   폴백 없는 새 규칙(1개월): 판번호 ${h} / 강재 ${pl} → 차이 ${pl - h}`);

// updatedAt 이 안 밀렸는지 표본 확인
const sample = await prisma.steelPlanHeat.findMany({ where: { id: { in: plan.slice(0, 3).map(p => p.id) } }, select: { heatNo: true, cutAt: true, updatedAt: true } });
console.log("   updatedAt 보존 확인:");
for (const s of sample) console.log(`     · ${s.heatNo} cutAt=${d(s.cutAt)} updatedAt=${d(s.updatedAt)} (백필 전 그대로여야 정상)`);

await prisma.$disconnect();

/**
 * finishedAt 백필 재작업 (v2) — v1 의 오류 교정. (2026-08-19)
 *
 * v1 오류: COMPLETED 강재의 근거를 (호선|사양|도면번호) 키의 **가장 이른** 작업일보 endAt 으로 잡았다.
 *   같은 도면을 여러 번 절단하면(철판 여러 장) 전부 최초 절단일을 받아, 실제보다 이른 날짜가 박혔다.
 *   결과 600장이 `finishedAt < issuedAt`(완료가 투입보다 이름 = 물리적으로 불가능).
 *
 * v2 규칙:
 *   SHIPPED_OUT → 활성 출고장 shippedAt (권위 있는 값, 그대로 유지)
 *   COMPLETED   → 후보 로그를 정밀도 순으로 좁히고, **불변식 finishedAt >= issuedAt 을 만족하는 것 중 가장 이른 것**
 *                 ① (호선·사양·도면번호·판번호)  ② (호선·사양·도면번호)  ③ (호선·사양)
 *                 만족하는 후보가 없으면 → issuedAt 그대로 (그 철판 자신의 기록. 새 날짜를 지어내지 않는다)
 *
 * 실행:  node scripts/backfill-finished-at2.mjs          (미리보기)
 *        node scripts/backfill-finished-at2.mjs --apply  (반영)
 */
import "dotenv/config";
import fs from "node:fs";
import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const APPLY = process.argv.includes("--apply");
const up = (x) => (x ?? "").trim().toUpperCase();
const sk = (v, m, t, w, l) => `${(v ?? "").trim()}|${up(m)}|${t}|${w}|${l}`;
const d = (x) => (x ? new Date(x).toISOString().slice(0, 10) : "-");

const plans = await prisma.steelPlan.findMany({
  where: { status: "COMPLETED" },
  select: { id: true, vesselCode: true, material: true, thickness: true, width: true, length: true,
            issuedAt: true, finishedAt: true, actualVesselCode: true, actualDrawingNo: true, actualHeatNo: true },
});
console.log(`■ 재계산 대상(COMPLETED): ${plans.length}장`);

const logs = await prisma.cuttingLog.findMany({
  where: { status: "COMPLETED", endAt: { not: null } },
  select: { heatNo: true, drawingNo: true, endAt: true, material: true, thickness: true, width: true, length: true,
            project: { select: { projectCode: true } }, drawingList: { select: { drawingNo: true, alternateVesselCode: true } } },
});
// 키별로 후보 endAt 배열을 모은다(최소값 하나만 남기면 v1 과 같은 오류가 난다)
const K1 = new Map(), K2 = new Map(), K3 = new Map();
const push = (m, k, v) => { (m.get(k) ?? m.set(k, []).get(k)).push(v); };
for (const l of logs) {
  const v = l.drawingList?.alternateVesselCode?.trim() || l.project?.projectCode || "";
  const s = sk(v, l.material, l.thickness, l.width, l.length);
  const dn = (l.drawingNo || l.drawingList?.drawingNo || "").trim();
  const hn = up(l.heatNo);
  if (dn && hn) push(K1, `${s}|${dn}|${hn}`, l.endAt);
  if (dn) push(K2, `${s}|${dn}`, l.endAt);
  push(K3, s, l.endAt);
}
const pick = (arr, floor) => {
  if (!arr || arr.length === 0) return null;
  const ok = floor ? arr.filter(x => x >= floor) : arr.slice();
  if (ok.length === 0) return null;
  ok.sort((a, b) => a - b);
  return ok[0];
};

const changes = [], stat = { k1: 0, k2: 0, k3: 0, issued: 0, same: 0 };
for (const p of plans) {
  const vv = p.actualVesselCode ?? p.vesselCode;
  const s = sk(vv, p.material, p.thickness, p.width, p.length);
  const dn = (p.actualDrawingNo ?? "").trim();
  const hn = up(p.actualHeatNo);
  const floor = p.issuedAt ?? null;
  let v = null, src = null;
  if (dn && hn) { v = pick(K1.get(`${s}|${dn}|${hn}`), floor); if (v) src = "k1"; }
  if (!v && dn) { v = pick(K2.get(`${s}|${dn}`), floor); if (v) src = "k2"; }
  if (!v)       { v = pick(K3.get(s), floor); if (v) src = "k3"; }
  if (!v)       { v = p.issuedAt ?? null; if (v) src = "issued"; }
  if (!v) continue;
  stat[src]++;
  if (p.finishedAt && Math.abs(p.finishedAt - v) < 1000) { stat.same++; continue; }
  changes.push({ id: p.id, v, before: p.finishedAt });
}
console.log(`   근거 출처: ${JSON.stringify(stat)}`);
console.log(`   값이 바뀌는 것: ${changes.length}장`);
const stillBad = plans.filter(p => {
  const vv = p.actualVesselCode ?? p.vesselCode, s = sk(vv, p.material, p.thickness, p.width, p.length);
  const dn = (p.actualDrawingNo ?? "").trim(), hn = up(p.actualHeatNo), floor = p.issuedAt ?? null;
  let v = (dn && hn && pick(K1.get(`${s}|${dn}|${hn}`), floor)) || (dn && pick(K2.get(`${s}|${dn}`), floor)) || pick(K3.get(s), floor) || p.issuedAt;
  return v && p.issuedAt && v < p.issuedAt;
}).length;
console.log(`   재계산 후 '완료 < 투입' 위반: ${stillBad}장 (0 이어야 정상)`);

if (!APPLY) { console.log("\n(미리보기만 — 반영하려면 --apply)"); await prisma.$disconnect(); process.exit(0); }

fs.writeFileSync("scripts/backfill-finished-at2-undo.json", JSON.stringify({
  purpose: "finishedAt 재계산(v2) 되돌리기", appliedAt: new Date().toISOString(), count: changes.length,
  items: changes.map(c => ({ id: c.id, before: c.before?.toISOString() ?? null, after: c.v.toISOString() })),
}, null, 2), "utf8");

const groups = new Map();
for (const c of changes) { const k = c.v.toISOString(); (groups.get(k) ?? groups.set(k, []).get(k)).push(c.id); }
console.log(`   ${groups.size}개 시각 그룹 전송`);
let n = 0, g = 0;
for (const [iso, ids] of groups) {
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    for (let a = 1; ; a++) {
      try { n += await prisma.$executeRaw`UPDATE "SteelPlan" SET "finishedAt" = ${new Date(iso)} WHERE "id" IN (${Prisma.join(chunk)})`; break; }
      catch (e) { if (a >= 5) throw e; await new Promise(r => setTimeout(r, 1500 * a)); }
    }
  }
  if (++g % 300 === 0) console.log(`     … ${g}/${groups.size}`);
}
console.log(`\n✔ ${n}장 갱신`);

const bad = await prisma.$queryRaw`SELECT COUNT(*)::int AS c FROM "SteelPlan" WHERE "status"='COMPLETED' AND "finishedAt" IS NOT NULL AND "issuedAt" IS NOT NULL AND "finishedAt" < "issuedAt"`;
console.log(`   사후 '완료 < 투입' 위반: ${bad[0].c}장`);
const nul = await prisma.steelPlan.count({ where: { status: { in: ["COMPLETED", "SHIPPED_OUT"] }, finishedAt: null } });
console.log(`   finishedAt 미기록: ${nul}장`);

console.log("\n■ 개월수별 판번호 vs 강재 (미아카이브 기준)");
function cutoffOf(m) { const now = new Date(), dt = new Date(now); dt.setDate(1); dt.setMonth(dt.getMonth() - m);
  const last = new Date(dt.getFullYear(), dt.getMonth() + 1, 0).getDate(); dt.setDate(Math.min(now.getDate(), last));
  dt.setHours(now.getHours(), now.getMinutes(), 0, 0); return dt; }
for (const m of [1, 2, 3, 6]) {
  const c = cutoffOf(m);
  const h = await prisma.steelPlanHeat.count({ where: { archivedAt: null, OR: [
    { status: "CUT", cutAt: { not: null, lte: c } }, { status: "SHIPPED", shippedAt: { not: null, lte: c } } ] } });
  const pn = await prisma.steelPlan.count({ where: { archivedAt: null, status: { in: ["COMPLETED", "SHIPPED_OUT"] }, finishedAt: { not: null, lte: c } } });
  console.log(`   ${String(m).padStart(2)}개월: 판번호 ${String(h).padStart(4)} | 강재 ${String(pn).padStart(4)} | 격차 ${pn - h}`);
}
await prisma.$disconnect();

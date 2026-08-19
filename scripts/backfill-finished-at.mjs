/**
 * 강재 `finishedAt`(실제 종료일) 백필 v1 — 아카이브 판정축 통일. (2026-08-19)
 *
 * ⚠ **이 v1 은 오류가 있었다. 반드시 `backfill-finished-at2.mjs`(v2)까지 실행해야 한다.**
 *   COMPLETED 근거를 (호선|사양|도면번호) 키의 **가장 이른** 작업일보 endAt 으로 잡아,
 *   같은 도면을 여러 번 절단한 경우 전부 최초 절단일을 받았다 → 600장이 `finishedAt < issuedAt`
 *   (완료가 투입보다 이름 = 물리적 불가능). v2 가 판번호까지 포함한 정밀 키 + 불변식 가드로 교정한다.
 *
 * 왜: 판번호는 절단완료일(cutAt), 강재는 투입일(issuedAt)로 판정해 두 목록이 어긋났다
 *     (실측 2개월 66건·3개월 106건). issuedAt 은 절단완료 시 이미 값이 있으면 덮어쓰지 않아
 *     투입된 철판에는 투입일이 남는다. 전용 컬럼 finishedAt 을 두고 판번호와 같은 축으로 맞춘다.
 *
 * 근거 우선순위 (실측 확보율 100%):
 *   SHIPPED_OUT → 활성 출고장의 shippedAt
 *   COMPLETED   → ① actualDrawingNo + (대체)호선 + 사양 이 맞는 완료 작업일보의 endAt
 *                 ② 같은 사양 CUT 판번호의 가장 이른 cutAt
 *                 ③ 같은 사양 완료 작업일보의 가장 이른 endAt
 *   근거가 없으면 **건드리지 않는다**(추정치 금지 — issuedAt 폴백은 원래 문제의 원인이었다).
 *
 * ★ raw SQL 로 쓴다 — Prisma update 는 updatedAt 을 밀어 원본 수정이력을 훼손한다.
 * 이미 아카이브된 행도 포함해 채운다(향후 판정 일관성).
 *
 * 실행:  node scripts/backfill-finished-at.mjs          (미리보기)
 *        node scripts/backfill-finished-at.mjs --apply  (반영 + undo JSON)
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
  where: { status: { in: ["COMPLETED", "SHIPPED_OUT"] }, finishedAt: null },
  select: { id: true, status: true, vesselCode: true, material: true, thickness: true, width: true, length: true,
            issuedAt: true, actualVesselCode: true, actualDrawingNo: true },
});
console.log(`■ finishedAt 미기록 강재(절단완료+외부출고): ${plans.length}장`);
if (plans.length === 0) { console.log("  대상 없음"); await prisma.$disconnect(); process.exit(0); }

const logs = await prisma.cuttingLog.findMany({
  where: { status: "COMPLETED", endAt: { not: null } },
  select: { drawingNo: true, endAt: true, material: true, thickness: true, width: true, length: true,
            project: { select: { projectCode: true } }, drawingList: { select: { drawingNo: true, alternateVesselCode: true } } },
});
const byDraw = new Map(), byLogSpec = new Map();
for (const l of logs) {
  const v = l.drawingList?.alternateVesselCode?.trim() || l.project?.projectCode || "";
  const s = sk(v, l.material, l.thickness, l.width, l.length);
  const dn = (l.drawingNo || l.drawingList?.drawingNo || "").trim();
  if (dn) { const k = `${s}|${dn}`; const q = byDraw.get(k); if (!q || l.endAt < q) byDraw.set(k, l.endAt); }
  const q2 = byLogSpec.get(s); if (!q2 || l.endAt < q2) byLogSpec.set(s, l.endAt);
}
const heats = await prisma.steelPlanHeat.findMany({
  where: { status: "CUT", cutAt: { not: null } },
  select: { vesselCode: true, material: true, thickness: true, width: true, length: true, cutAt: true },
});
const byHeatSpec = new Map();
for (const h of heats) { const s = sk(h.vesselCode, h.material, h.thickness, h.width, h.length); const q = byHeatSpec.get(s); if (!q || h.cutAt < q) byHeatSpec.set(s, h.cutAt); }
const items = await prisma.shipmentItem.findMany({
  where: { steelPlanId: { not: null }, vehicle: { shipment: { status: "ACTIVE" } } },
  select: { steelPlanId: true, vehicle: { select: { shipment: { select: { shippedAt: true } } } } },
});
const shipByPlan = new Map();
for (const it of items) {
  const v = it.vehicle?.shipment?.shippedAt;
  if (!it.steelPlanId || !v) continue;
  const q = shipByPlan.get(it.steelPlanId); if (!q || v < q) shipByPlan.set(it.steelPlanId, v);
}

const plan = [], skipped = [];
const srcCount = {};
for (const p of plans) {
  const s = sk(p.vesselCode, p.material, p.thickness, p.width, p.length);
  let v = null, from = null;
  if (p.status === "SHIPPED_OUT") { v = shipByPlan.get(p.id) ?? null; if (v) from = "출고일"; }
  if (!v && p.actualDrawingNo) {
    const k = `${sk(p.actualVesselCode ?? p.vesselCode, p.material, p.thickness, p.width, p.length)}|${p.actualDrawingNo.trim()}`;
    v = byDraw.get(k) ?? null; if (v) from = "도면매칭 작업일보";
  }
  if (!v) { v = byHeatSpec.get(s) ?? null; if (v) from = "같은사양 판번호 절단일"; }
  if (!v) { v = byLogSpec.get(s) ?? null; if (v) from = "같은사양 작업일보"; }
  if (!v) { skipped.push(p); continue; }
  srcCount[from] = (srcCount[from] ?? 0) + 1;
  plan.push({ id: p.id, v, from, issuedAt: p.issuedAt });
}
console.log(`   근거 확보 ${plan.length}장 / 근거 없음 ${skipped.length}장 (건드리지 않음)`);
console.log(`   출처: ${JSON.stringify(srcCount, null, 0)}`);
const moved = plan.filter(x => x.issuedAt && Math.abs(x.v - x.issuedAt) > 86400000);
console.log(`   issuedAt 과 1일 넘게 다른 것: ${moved.length}장 (이만큼이 기존 판정 오차)`);

if (!APPLY) { console.log("\n(미리보기만 — 반영하려면 --apply)"); await prisma.$disconnect(); process.exit(0); }

fs.writeFileSync("scripts/backfill-finished-at-undo.json", JSON.stringify({
  purpose: "SteelPlan.finishedAt 백필 되돌리기 (전부 원래 null)",
  appliedAt: new Date().toISOString(),
  note: "되돌리려면 아래 id 들의 finishedAt 을 NULL 로. raw SQL 로 썼으므로 updatedAt 은 백필 전 값 그대로다.",
  count: plan.length,
  items: plan.map(x => ({ id: x.id, after: x.v.toISOString(), src: x.from })),
}, null, 2), "utf8");

// 같은 시각끼리 묶어 일괄 UPDATE — 5천 건을 한 건씩 보내면 원격 DB 왕복에서 타임아웃난다.
const groups = new Map();
for (const x of plan) { const k = x.v.toISOString(); (groups.get(k) ?? groups.set(k, []).get(k)).push(x.id); }
console.log(`   ${groups.size}개 시각 그룹으로 묶어 전송`);
let n = 0, g = 0;
for (const [iso, ids] of groups) {
  for (let i = 0; i < ids.length; i += 200) {          // 파라미터 수 제한 대비 청크
    const chunk = ids.slice(i, i + 200);
    // 원격(NAS) DB 라 연결이 간헐적으로 끊긴다 → 재시도. WHERE finishedAt IS NULL 이라 중복 실행 안전.
    for (let attempt = 1; ; attempt++) {
      try {
        n += await prisma.$executeRaw`UPDATE "SteelPlan" SET "finishedAt" = ${new Date(iso)} WHERE "finishedAt" IS NULL AND "id" IN (${Prisma.join(chunk)})`;
        break;
      } catch (e) {
        if (attempt >= 5) throw e;
        console.log(`     (재시도 ${attempt} — ${String(e.message || e).split("\n")[0].slice(0, 60)})`);
        await new Promise(r => setTimeout(r, 1500 * attempt));
      }
    }
  }
  if (++g % 200 === 0) console.log(`     … ${g}/${groups.size} 그룹, 누적 ${n}장`);
}
console.log(`\n✔ ${n}장 반영 (undo: scripts/backfill-finished-at-undo.json)`);

const left = await prisma.steelPlan.count({ where: { status: { in: ["COMPLETED", "SHIPPED_OUT"] }, finishedAt: null } });
console.log(`   남은 미기록: ${left}장`);

console.log("\n■ 사후 — 개월수별 판번호 vs 강재 (아카이브 대상)");
function cutoffOf(months) { const now = new Date(), dt = new Date(now); dt.setDate(1); dt.setMonth(dt.getMonth() - months);
  const last = new Date(dt.getFullYear(), dt.getMonth() + 1, 0).getDate(); dt.setDate(Math.min(now.getDate(), last));
  dt.setHours(now.getHours(), now.getMinutes(), 0, 0); return dt; }
for (const m of [1, 2, 3, 6]) {
  const c = cutoffOf(m);
  const h = await prisma.steelPlanHeat.count({ where: { archivedAt: null, OR: [
    { status: "CUT", cutAt: { not: null, lte: c } }, { status: "SHIPPED", shippedAt: { not: null, lte: c } } ] } });
  const pNew = await prisma.steelPlan.count({ where: { archivedAt: null, status: { in: ["COMPLETED", "SHIPPED_OUT"] }, finishedAt: { not: null, lte: c } } });
  const pOld = await prisma.steelPlan.count({ where: { archivedAt: null, status: { in: ["COMPLETED", "SHIPPED_OUT"] }, issuedAt: { not: null, lte: c } } });
  console.log(`   ${String(m).padStart(2)}개월: 판번호 ${String(h).padStart(5)} | 강재 구축(issuedAt) ${String(pOld).padStart(5)} 격차 ${String(pOld - h).padStart(4)} → 신축(finishedAt) ${String(pNew).padStart(5)} 격차 ${pNew - h}`);
}
await prisma.$disconnect();

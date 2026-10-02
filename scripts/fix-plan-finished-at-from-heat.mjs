// 강재(SteelPlan) finishedAt 을 같은 철판 판번호(SteelPlanHeat) cutAt 으로 맞춘다 — 2026-10-03
//
// 증상: 아카이브 '출고된지 N개월 이상' 에서 1~2개월은 판번호·강재 수가 맞는데 3개월부터 어긋남(3개월 49 · 4개월 180).
// 원인: finishedAt 은 운영 중에 생긴 칸이라 옛 절단분(주로 4~5월)은 나중에 채웠는데, 일부가 실제 절단일이 아닌
//       투입일 등으로 들어갔다. 날짜 다른 쌍 339 중 337 은 판번호 cutAt 이 작업일보 완료일과 일치(강재 쪽이 틀림).
// 대상: COMPLETED 강재 중 actualHeatNo·사양이 같은 CUT 판번호가 '딱 하나'이고, 날짜가 1일 이상 다르며,
//       그 판번호 cutAt 이 작업일보(COMPLETED, 같은 판번호) 완료일과 1일 안으로 일치하는 것만.
// 실행: node scripts/fix-plan-finished-at-from-heat.mjs            (미리보기)
//       node scripts/fix-plan-finished-at-from-heat.mjs --apply    (적용 + 되돌리기 파일)
//       node scripts/fix-plan-finished-at-from-heat.mjs --undo     (되돌리기)
import pg from "pg"; import fs from "fs";
const env = fs.readFileSync(".env", "utf8").match(/DATABASE_URL="?([^"\n]+)/)[1];
const UNDO = "scripts/fix-plan-finished-at-from-heat-undo.json";
const c = new pg.Client({ connectionString: env }); await c.connect();
const q = async (s, p) => (await c.query(s, p)).rows;
const DAY = 86400000;

if (process.argv.includes("--undo")) {
  const rows = JSON.parse(fs.readFileSync(UNDO, "utf8"));
  await c.query("begin");
  let n = 0;
  for (const r of rows) n += (await c.query(`update "SteelPlan" set "finishedAt"=$1 where id=$2 and "finishedAt"=$3`, [r.old, r.id, r.new])).rowCount;
  await c.query("commit");
  console.log(`되돌림 ${n}/${rows.length}`); await c.end(); process.exit(0);
}

const pairs = await q(`
  select p.id pid, p."actualHeatNo" hn, p."finishedAt" pf, h."cutAt" hc,
         count(*) over (partition by p.id) cands,
         (select max(l."endAt") from "CuttingLog" l where l.status='COMPLETED' and upper(l."heatNo")=upper(p."actualHeatNo")) logend
  from "SteelPlan" p
  join "SteelPlanHeat" h on upper(h."heatNo")=upper(p."actualHeatNo") and h.material=p.material
       and h.thickness=p.thickness and h.width=p.width and h.length=p.length and h.status='CUT' and h."cutAt" is not null
  where p.status='COMPLETED' and p."finishedAt" is not null`);
const targets = pairs.filter(r => Number(r.cands) === 1 && Math.abs(r.pf - r.hc) >= DAY && r.logend && Math.abs(r.logend - r.hc) < DAY);
const skippedMulti = new Set(pairs.filter(r => Number(r.cands) > 1).map(r => r.pid)).size;
console.log(`대상 ${targets.length} (짝이 둘 이상이라 건너뜀 ${skippedMulti})`);
const mv = {}; for (const r of targets) { const k = `${r.pf.toISOString().slice(0, 7)} → ${r.hc.toISOString().slice(0, 7)}`; mv[k] = (mv[k] ?? 0) + 1; }
console.log("완료월 이동(지금 → 수정):", mv);

if (process.argv.includes("--apply")) {
  if (fs.existsSync(UNDO)) { console.log(`${UNDO} 가 이미 있습니다 — 중복 적용 방지. 확인 후 지우고 다시.`); await c.end(); process.exit(1); }
  const undo = targets.map(r => ({ id: r.pid, heatNo: r.hn, old: r.pf.toISOString(), new: r.hc.toISOString() }));
  fs.writeFileSync(UNDO, JSON.stringify(undo, null, 1));
  await c.query("begin");
  let n = 0;
  for (const r of targets) n += (await c.query(`update "SteelPlan" set "finishedAt"=$1 where id=$2 and "finishedAt"=$3 and status='COMPLETED'`, [r.hc, r.pid, r.pf])).rowCount;
  if (n !== targets.length) { await c.query("rollback"); console.log(`예상 ${targets.length} 과 다른 ${n}건 — 되돌림(그사이 바뀐 행 있음). 다시 실행.`); fs.unlinkSync(UNDO); await c.end(); process.exit(1); }
  await c.query("commit");
  console.log(`적용 ${n}건 · 되돌리기 파일 ${UNDO}`);
}
await c.end();

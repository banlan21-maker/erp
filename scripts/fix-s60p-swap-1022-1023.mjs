// 1022 S60PS ↔ 1023 S60P 판 맞바꿈 11장 정리 — 2026-10-03
//
// 배경: 아카이브 3·4개월에서 판번호·강재가 11장 어긋남. 종이 작업일보(19K-1022.xlsx S60PS · 19K-1023.xlsx S60P) 확인 결과
//   1022 S60PS 를 6/1 에 자를 때 1023 판(B59109403 …)을 썼고, 1023 S60P 를 7/9~10 에 자를 때는 1022 계열 판(B56828004 …,
//   ERP 판번호리스트에 없음)을 썼다 — 판번호는 양쪽 다 종이와 ERP 가 같다(실제 맞바꿈).
//   ERP 에서 틀린 것: ① 1022 기록은 6/3 에 몰아서 입력돼 날짜·시각·장비가 입력 시점(가동 0분·가스1호기)
//   ② 1023 강재가 7/10 절단(등록 안 된 1022 계열 판)에 소모로 붙음 — 실제로 그 1023 판이 잘린 건 6/1 1022 절단.
// 정리: ① 1022 작업일보 시작·종료·장비 ← 종이, 그 판번호 cutAt ← 종료 시각
//       ② 1023 강재 actualHeatNo ← 1022 절단 판번호, actualVesselCode ← KYTS-1022, finishedAt ← 그 종료 시각
//       7/10 1023 작업일보는 그대로(등록 안 된 판이라 소모할 강재·판번호 없음).
// 입력: scripts/s60ps-paper-1022.json (19K-1022.xlsx S60PS 에서 11행 추출)
// 실행: node scripts/fix-s60p-swap-1022-1023.mjs [--apply | --undo]
import pg from "pg"; import fs from "fs";
const env = fs.readFileSync(".env", "utf8").match(/DATABASE_URL="?([^"\n]+)/)[1];
const UNDO = "scripts/fix-s60p-swap-1022-1023-undo.json";
const EQ = { 1: "eq-plasma-01", 2: "eq-plasma-02", 3: "eq-plasma-03", 4: "eq-plasma-04" };
const c = new pg.Client({ connectionString: env }); await c.connect();
const q = async (s, p) => (await c.query(s, p)).rows;

// KST "YYYY-MM-DD" + "HH:MM" → DB 저장값(UTC, timestamp without tz) 문자열
const utc = (ymd, hm, addDay = 0) => {
  const d = new Date(`${ymd}T${hm}:00+09:00`); d.setUTCDate(d.getUTCDate() + addDay);
  return d.toISOString().replace("T", " ").replace("Z", "").slice(0, 19);
};

if (process.argv.includes("--undo")) {
  const u = JSON.parse(fs.readFileSync(UNDO, "utf8"));
  await c.query("begin");
  for (const r of u) {
    await c.query(`update "CuttingLog" set "startAt"=$2::timestamp, "endAt"=$3::timestamp, "equipmentId"=$4 where id=$1`, [r.logId, r.old.start, r.old.end, r.old.eq]);
    await c.query(`update "SteelPlanHeat" set "cutAt"=$2::timestamp where id=$1`, [r.heatId, r.old.cutAt]);
    await c.query(`update "SteelPlan" set "actualHeatNo"=$2, "actualVesselCode"=$3, "finishedAt"=$4::timestamp where id=$1`, [r.planId, r.old.planHeat, r.old.planVessel, r.old.planFin]);
  }
  await c.query("commit"); console.log(`되돌림 ${u.length}건`); await c.end(); process.exit(0);
}

const paper = JSON.parse(fs.readFileSync("scripts/s60ps-paper-1022.json", "utf8"));
const plan = [];
for (const p of paper) {
  const [log] = await q(`select l.id, l."startAt"::text s, l."endAt"::text e, l."equipmentId" eq, l.material, l.thickness, l.width, l.length
    from "CuttingLog" l join "Project" pr on pr.id=l."projectId"
    where pr."projectCode"='KYTS-1022' and pr."projectName"='S60PS' and l."drawingNo"=$1 and upper(l."heatNo")=$2 and l.status='COMPLETED'`, [p.dno, p.heat]);
  const [heat] = await q(`select id, "cutAt"::text cut from "SteelPlanHeat" where upper("heatNo")=$1 and status='CUT' and "vesselCode"='KYTS-1023'`, [p.heat]);
  const [l23] = await q(`select upper(l."heatNo") hn from "CuttingLog" l join "Project" pr on pr.id=l."projectId"
    where pr."projectCode"='KYTS-1023' and pr."projectName"='S60P' and l."drawingNo"=$1 and l.status='COMPLETED'`, [p.dno]);
  const pl = log && l23 ? (await q(`select id, "actualHeatNo" ah, "actualVesselCode" av, "finishedAt"::text f from "SteelPlan"
    where "vesselCode"='KYTS-1023' and status='COMPLETED' and material=$1 and thickness=$2 and width=$3 and length=$4 and upper("actualHeatNo")=$5`,
    [log.material, log.thickness, log.width, log.length, l23.hn]))[0] : null;
  if (!log || !heat || !pl) { console.log("✖ 짝을 못 찾음 — 건드리지 않음:", p.dno, { log: !!log, heat: !!heat, l23: l23?.hn, plan: !!pl }); continue; }
  const start = utc(p.date, p.start), end = utc(p.date, p.end, p.end < p.start ? 1 : 0);
  plan.push({ dno: p.dno, heat: p.heat, logId: log.id, heatId: heat.id, planId: pl.id,
    old: { start: log.s, end: log.e, eq: log.eq, cutAt: heat.cut, planHeat: pl.ah, planVessel: pl.av, planFin: pl.f },
    new: { start, end, eq: EQ[p.eq] } });
}
for (const r of plan) console.log(`${r.dno} ${r.heat}: 작업일보 ${r.old.start.slice(5, 16)}→${r.new.start.slice(5, 16)}(UTC) ${r.old.eq}→${r.new.eq} · 1023강재 ${r.old.planHeat}/${r.old.planFin.slice(5, 10)} → ${r.heat}/${r.new.end.slice(5, 10)}`);
console.log(`대상 ${plan.length}/${paper.length}`);

if (process.argv.includes("--apply")) {
  if (fs.existsSync(UNDO)) { console.log("되돌리기 파일이 이미 있음 — 중복 적용 방지"); await c.end(); process.exit(1); }
  fs.writeFileSync(UNDO, JSON.stringify(plan, null, 1));
  await c.query("begin");
  let n = 0;
  for (const r of plan) {
    n += (await c.query(`update "CuttingLog" set "startAt"=$2::timestamp, "endAt"=$3::timestamp, "equipmentId"=$4
      where id=$1 and "startAt"=$5::timestamp and "endAt"=$6::timestamp`, [r.logId, r.new.start, r.new.end, r.new.eq, r.old.start, r.old.end])).rowCount;
    n += (await c.query(`update "SteelPlanHeat" set "cutAt"=$2::timestamp where id=$1 and "cutAt"=$3::timestamp`, [r.heatId, r.new.end, r.old.cutAt])).rowCount;
    n += (await c.query(`update "SteelPlan" set "actualHeatNo"=$2, "actualVesselCode"='KYTS-1022', "finishedAt"=$3::timestamp
      where id=$1 and "actualHeatNo"=$4 and "finishedAt"=$5::timestamp`, [r.planId, r.heat, r.new.end, r.old.planHeat, r.old.planFin])).rowCount;
  }
  if (n !== plan.length * 3) { await c.query("rollback"); fs.unlinkSync(UNDO); console.log(`예상 ${plan.length * 3} ≠ ${n} — 전체 되돌림`); }
  else { await c.query("commit"); console.log(`적용 ${plan.length}건(행 ${n}) · 되돌리기 ${UNDO}`); }
}
await c.end();

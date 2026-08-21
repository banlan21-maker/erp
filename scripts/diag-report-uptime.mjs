/**
 * 절단보고서 통계 검증 (읽기 전용).
 *   가동률 = 실가동 ÷ 총가동
 *     총가동 = (종료 - 시작) - 퇴근/야간이월
 *     실가동 = 총가동 - 중단(장비고장·도면변경·소모품교체·기타)
 *   미가동 원인 집계에서 퇴근/야간이월은 뺀다.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const p = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const NIGHT = "WORK_EXTENSION";
const hhmm = (ms) => {
  if (ms <= 0) return "00:00";
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};
const eqShort = (n) => {
  const a = n.match(/플라즈마\s*(\d+)호기/); if (a) return `P${a[1]}`;
  const b = n.match(/가스\s*절단기\s*(\d+)호기/); if (b) return `G${b[1]}`;
  return n;
};

// 최근 30일
const to = new Date();
const from = new Date(to.getTime() - 30 * 86400000);
const logs = await p.cuttingLog.findMany({
  where: { status: "COMPLETED", startAt: { gte: from, lte: to } },
  select: {
    startAt: true, endAt: true, thickness: true, width: true, length: true,
    drawingList: { select: { steelWeight: true } },
    equipment: { select: { name: true } },
    pauses: { select: { reason: true, pausedAt: true, resumedAt: true } },
  },
});
console.log(`■ 최근 30일 완료 작업일보 ${logs.length}건 (${from.toISOString().slice(0,10)} ~ ${to.toISOString().slice(0,10)})`);

// 보고서와 같은 방식 — 강재리스트 중량이 있으면 그 값, 없으면 치수로 계산
const wOf = (l) => l.drawingList?.steelWeight
  ?? (l.thickness && l.width && l.length ? l.thickness * l.width * l.length * 7.85 / 1e6 : 0);
const span = (x) => (x.resumedAt ? new Date(x.resumedAt) - new Date(x.pausedAt) : 0);
const per = new Map();
let allT = 0, allA = 0, allP = 0, allNight = 0;
const byDate = new Map();
const byReason = new Map();

for (const l of logs) {
  if (!l.endAt) continue;
  const night = l.pauses.filter(x => x.reason === NIGHT).reduce((s, x) => s + span(x), 0);
  const pause = l.pauses.filter(x => x.reason !== NIGHT).reduce((s, x) => s + span(x), 0);
  const total = Math.max(0, new Date(l.endAt) - new Date(l.startAt) - night);
  const active = Math.max(0, total - pause);
  const eq = eqShort(l.equipment.name);
  const cur = per.get(eq) ?? { t: 0, a: 0, p: 0 };
  cur.t += total; cur.a += active; cur.p += pause; per.set(eq, cur);
  allT += total; allA += active; allP += pause; allNight += night;

  const d = l.startAt.toISOString().slice(0, 10);
  const dd = byDate.get(d) ?? { w: 0, n: 0 };
  dd.w += wOf(l); dd.n += 1; byDate.set(d, dd);

  for (const x of l.pauses) {
    if (x.reason === NIGHT) continue;
    byReason.set(x.reason, (byReason.get(x.reason) ?? 0) + span(x));
  }
}

console.log("\n■ 장비별 가동률");
for (const [eq, v] of [...per.entries()].sort())
  console.log(`   ${eq.padEnd(4)} 총가동 ${hhmm(v.t)} · 중단 ${hhmm(v.p)} · 실가동 ${hhmm(v.a)} · 가동률 ${(v.t ? v.a / v.t * 100 : 0).toFixed(1)}%`);
console.log(`   ${"전체".padEnd(4)} 총가동 ${hhmm(allT)} · 중단 ${hhmm(allP)} · 실가동 ${hhmm(allA)} · 가동률 ${(allT ? allA / allT * 100 : 0).toFixed(1)}%`);
console.log(`   (총가동에서 빠진 퇴근/야간이월: ${hhmm(allNight)})`);

console.log("\n■ 일 capa (일자별 전체 절단중량)");
const ds = [...byDate.entries()].sort();
for (const [d, v] of ds.slice(-10)) console.log(`   ${d}  ${Math.round(v.w).toLocaleString().padStart(9)} kg · ${v.n}매`);
const tw = ds.reduce((s, [, v]) => s + v.w, 0);
const tn = ds.reduce((s, [, v]) => s + v.n, 0);
const best = ds.reduce((b, [d, v]) => (!b || v.w > b.w ? { d, w: v.w } : b), null);
console.log(`   ─ 합계 ${Math.round(tw).toLocaleString()} kg · ${tn}매 · 작업일 ${ds.length}일 · 일평균 ${ds.length ? Math.round(tw / ds.length).toLocaleString() : 0} kg`);
if (best) console.log(`   ─ 최다 ${best.d} ${Math.round(best.w).toLocaleString()} kg`);

console.log("\n■ 미가동 원인 (퇴근/야간이월 제외)");
const LBL = { EQUIPMENT_FAILURE: "장비고장", DRAWING_CHANGE: "도면변경", CONSUMABLE: "소모품교체", OTHER: "기타" };
for (const [r, ms] of [...byReason.entries()].sort((a, b) => b[1] - a[1]))
  console.log(`   ${(LBL[r] ?? r).padEnd(8)} ${hhmm(ms)} (${Math.round(ms / 60000)}분)`);
await p.$disconnect();

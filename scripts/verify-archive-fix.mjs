/** 아카이브 수정 검증 — 새 규칙(폴백 없음)이 왕복에 안정적인가 (읽기 전용) */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const d = (x) => (x ? new Date(x).toISOString().slice(0, 16).replace("T", " ") : "-");

// route.ts 와 동일한 월말 보정 cutoff
function cutoffOf(months) {
  const now = new Date(); const dt = new Date(now);
  dt.setDate(1); dt.setMonth(dt.getMonth() - months);
  const last = new Date(dt.getFullYear(), dt.getMonth() + 1, 0).getDate();
  dt.setDate(Math.min(now.getDate(), last));
  dt.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
  return dt;
}

console.log("■ 1) 새 규칙 — 판정에 쓰는 값이 아카이브/복원으로 바뀌는가?");
console.log("   heatWhere  : cutAt / shippedAt  (업무일자 — 아카이브·복원이 건드리지 않음)");
console.log("   planWhere  : issuedAt           (동일)");
console.log("   ⇒ archivedAt 만 바뀌므로 왕복해도 대상 집합은 불변. 구조적으로 멱등.\n");

console.log("■ 2) 개월수별 대상 — 강재 vs 판번호 격차");
for (const m of [1, 2, 3, 6, 12]) {
  const c = cutoffOf(m);
  const h = await prisma.steelPlanHeat.count({ where: { archivedAt: null, OR: [
    { status: "CUT", cutAt: { not: null, lte: c } },
    { status: "SHIPPED", shippedAt: { not: null, lte: c } },
  ]}});
  const p = await prisma.steelPlan.count({ where: { archivedAt: null, status: { in: ["COMPLETED", "SHIPPED_OUT"] }, issuedAt: { not: null, lte: c } } });
  console.log(`   ${String(m).padStart(2)}개월 (${d(c)}) → 판번호 ${String(h).padStart(5)} / 강재 ${String(p).padStart(5)}  격차 ${p - h}`);
}

console.log("\n■ 3) 터미널 날짜 결측 — 이제 대상에서 빠지는 건(폴백 제거 부작용 점검)");
const noCut  = await prisma.steelPlanHeat.count({ where: { archivedAt: null, status: "CUT", cutAt: null } });
const noShip = await prisma.steelPlanHeat.count({ where: { archivedAt: null, status: "SHIPPED", shippedAt: null } });
const noIss  = await prisma.steelPlan.count({ where: { archivedAt: null, status: { in: ["COMPLETED", "SHIPPED_OUT"] }, issuedAt: null } });
console.log(`   판번호 cutAt 결측 ${noCut} / shippedAt 결측 ${noShip} / 강재 issuedAt 결측 ${noIss}  (0 이어야 손실 없음)`);

console.log("\n■ 4) 유령 — 상태는 재고인데 숨김이 남은 행 (run 이 자동 청소하는 대상)");
console.log(`   판번호(WAITING 인데 아카이브): ${await prisma.steelPlanHeat.count({ where: { archivedAt: { not: null }, status: { notIn: ["CUT", "SHIPPED"] } } })}건`);
console.log(`   강재(재고인데 아카이브)      : ${await prisma.steelPlan.count({ where: { archivedAt: { not: null }, status: { notIn: ["COMPLETED", "SHIPPED_OUT"] } } })}장`);

console.log("\n■ 5) 월말 보정 확인 — 31일에 1개월 전을 구하면?");
const t = new Date("2026-03-31T10:00:00Z");
const naive = new Date(t); naive.setMonth(naive.getMonth() - 1);
console.log(`   기준 ${d(t)}`);
console.log(`   보정 전(setMonth): ${d(naive)}  ← 2/31 이 없어 3/3 으로 튄다(아직 1개월 안 된 것까지 대상)`);
const fixed = (() => { const dt = new Date(t); dt.setDate(1); dt.setMonth(dt.getMonth() - 1);
  const last = new Date(dt.getFullYear(), dt.getMonth() + 1, 0).getDate();
  dt.setDate(Math.min(t.getDate(), last)); dt.setHours(t.getHours(), t.getMinutes(), 0, 0); return dt; })();
console.log(`   보정 후          : ${d(fixed)}  ← 2월 말일로 클램프`);

await prisma.$disconnect();

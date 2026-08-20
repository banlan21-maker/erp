/**
 * 4종 강재 절단 흐름 점검 (읽기 전용) — 확정 선점 → 작업일보 노출 → 절단완료 소진이
 * 정규강재·여유원재·등록잔재·현장잔재 모두에서 성립하는지 코드 경로별로 대조한다.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const p = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

console.log("■ 1) 현재 도면행의 사용강재 구성");
const rows = await p.drawingList.findMany({ select: { status: true, assignedRemnant: { select: { type: true } } } });
const m = {};
for (const r of rows) {
  const k = r.assignedRemnant?.type ?? "정규강재";
  m[k] = m[k] ?? {}; m[k][r.status] = (m[k][r.status] ?? 0) + 1;
}
for (const [k, v] of Object.entries(m)) console.log(`   ${String(k).padEnd(11)} ${JSON.stringify(v)}`);

console.log("\n■ 2) 확정(WAITING) 시 선점 상태 — 잔재는 reservedFor, 정규는 SteelPlan.reservedFor");
const wait = await p.drawingList.findMany({
  where: { status: "WAITING", NOT: { assignedRemnantId: null } },
  select: { block: true, assignedRemnant: { select: { remnantNo: true, type: true, reservedFor: true, status: true } }, project: { select: { projectCode: true } } },
});
console.log(`   확정된 잔재사용 도면 ${wait.length}행`);
const noRes = wait.filter(w => !w.assignedRemnant?.reservedFor);
console.log(`   그중 잔재에 확정표시(reservedFor)가 없는 것: ${noRes.length}행 ${noRes.length ? "← 선점 누락 의심" : "(정상)"}`);

console.log("\n■ 3) 절단완료(CUT) 도면의 잔재 소진 상태");
const cut = await p.drawingList.findMany({
  where: { status: "CUT", NOT: { assignedRemnantId: null } },
  select: { assignedRemnant: { select: { remnantNo: true, type: true, status: true } } },
});
const byT = {};
for (const c of cut) {
  const t = c.assignedRemnant?.type ?? "?";
  byT[t] = byT[t] ?? { 소진: 0, 재고: 0 };
  if (c.assignedRemnant?.status === "EXHAUSTED") byT[t].소진++; else byT[t].재고++;
}
for (const [t, v] of Object.entries(byT)) console.log(`   ${t.padEnd(11)} 소진 ${v.소진} · 재고 ${v.재고} ${v.재고 ? "← 절단됐는데 재고로 남음(확인 필요)" : ""}`);

console.log("\n■ 4) 4종별 사용 가능 재고 (지금 고를 수 있는 것)");
for (const t of ["SURPLUS", "REGISTERED", "REMNANT"]) {
  const n = await p.remnant.count({ where: { type: t, status: "IN_STOCK", reservedFor: null, shipoutMarkedAt: null } });
  console.log(`   ${t.padEnd(11)} ${n}건`);
}
const plan = await p.steelPlan.count({ where: { status: "RECEIVED", reservedFor: null, shipoutMarkedAt: null, archivedAt: null } });
console.log(`   정규강재      ${plan}장`);

console.log("\n■ 5) 돌발작업의 잔재 사용 (정규강재는 미지원 — 사용자 결정)");
const uw = await p.urgentWork.groupBy({ by: ["status"], _count: { _all: true } });
console.log(`   돌발작업 ${uw.reduce((s, x) => s + x._count._all, 0)}건 ${JSON.stringify(Object.fromEntries(uw.map(x => [x.status, x._count._all])))}`);
console.log(`   그중 잔재 지정: ${await p.urgentWork.count({ where: { NOT: { remnantId: null } } })}건`);

await p.$disconnect();

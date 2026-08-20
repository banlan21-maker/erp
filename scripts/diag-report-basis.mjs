/**
 * 절단보고서 집계 근거 점검 (읽기 전용).
 *
 * 보고서 조건: CuttingLog.status = "COMPLETED" AND startAt 이 기간 안
 *   (app/(main)/cutpart/reports/page.tsx)
 * → "완료된 작업일보"가 곧 통계다. 도면 상태(CUT)를 보지 않는다.
 *   둘이 어긋나는 경우가 실제로 있는지, 있다면 어느 쪽으로 새는지 센다.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const p = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

console.log("■ 1) 작업일보 상태 분포 — 보고서는 COMPLETED 만 센다");
for (const r of await p.cuttingLog.groupBy({ by: ["status"], _count: { _all: true } }))
  console.log(`   ${r.status.padEnd(11)} ${r._count._all}`);

console.log("\n■ 2) 완료 작업일보의 종류");
const done = await p.cuttingLog.count({ where: { status: "COMPLETED" } });
const urgent = await p.cuttingLog.count({ where: { status: "COMPLETED", isUrgent: true } });
const noDraw = await p.cuttingLog.count({ where: { status: "COMPLETED", isUrgent: false, drawingListId: null } });
console.log(`   총 ${done}건 · 돌발 ${urgent}건 · 정규인데 도면 연결 없음 ${noDraw}건 ${noDraw ? "← 도면 없이 집계됨" : ""}`);

console.log("\n■ 3) 완료 작업일보인데 그 도면이 절단완료(CUT)가 아닌 것 — 보고서엔 잡히고 도면엔 안 잡힘");
const bad = await p.cuttingLog.findMany({
  where: { status: "COMPLETED", drawingListId: { not: null }, drawingList: { status: { not: "CUT" } } },
  select: { heatNo: true, drawingNo: true, startAt: true,
            drawingList: { select: { status: true, block: true, drawingNo: true, project: { select: { projectCode: true } } } } },
  take: 15,
});
const badCount = await p.cuttingLog.count({
  where: { status: "COMPLETED", drawingListId: { not: null }, drawingList: { status: { not: "CUT" } } },
});
console.log(`   ${badCount}건`);
for (const b of bad) console.log(`     ${b.drawingList?.project?.projectCode}/${b.drawingList?.block} ${b.drawingList?.drawingNo ?? b.drawingNo} · 도면상태=${b.drawingList?.status} · 판번호=${b.heatNo || "(공란)"} · ${b.startAt.toISOString().slice(0,10)}`);

console.log("\n■ 4) 반대 — 도면은 절단완료(CUT)인데 완료 작업일보가 없는 것 (보고서에서 누락)");
const cutDrawings = await p.drawingList.count({ where: { status: "CUT" } });
const withLog = await p.drawingList.count({ where: { status: "CUT", cuttingLogs: { some: { status: "COMPLETED" } } } });
console.log(`   절단완료 도면 ${cutDrawings}행 중 완료 작업일보가 있는 것 ${withLog}행 · 없는 것 ${cutDrawings - withLog}행`);

console.log("\n■ 5) 같은 도면에 완료 작업일보가 2건 이상 (중복 집계 가능)");
const grouped = await p.cuttingLog.groupBy({
  by: ["drawingListId"],
  where: { status: "COMPLETED", drawingListId: { not: null } },
  _count: { _all: true },
});
const dups = grouped.filter(g => g._count._all > 1);
console.log(`   ${dups.length}개 도면이 완료 작업일보를 2건 이상 갖고 있다 (총 ${dups.reduce((s, g) => s + g._count._all, 0)}건)`);
for (const d of dups.slice(0, 8)) {
  const dl = await p.drawingList.findUnique({ where: { id: d.drawingListId }, select: { block: true, drawingNo: true, qty: true, project: { select: { projectCode: true } } } });
  console.log(`     ${dl?.project?.projectCode}/${dl?.block} ${dl?.drawingNo} — ${d._count._all}건 (수량 ${dl?.qty})`);
}

console.log("\n■ 6) 기간 기준이 startAt 이라 달을 넘기는 작업");
const cross = await p.cuttingLog.findMany({
  where: { status: "COMPLETED", endAt: { not: null } },
  select: { startAt: true, endAt: true, heatNo: true },
});
const crossMonth = cross.filter(l => l.endAt && (l.startAt.getMonth() !== l.endAt.getMonth() || l.startAt.getFullYear() !== l.endAt.getFullYear()));
console.log(`   시작월 ≠ 종료월인 완료 작업: ${crossMonth.length}건 (시작월로 잡힌다)`);
for (const c of crossMonth.slice(0, 6))
  console.log(`     ${c.heatNo || "(공란)"} ${c.startAt.toISOString().slice(0,10)} → ${c.endAt.toISOString().slice(0,10)}`);

await p.$disconnect();

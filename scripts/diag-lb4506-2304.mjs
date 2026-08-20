/**
 * LB4506/후행 a36-20-2304 재판정 (읽기 전용).
 * 같은 도면번호 행이 2행인데 완료 작업일보가 총 3건이다.
 * 판번호가 실제로 몇 장인지 확인해 '두 장 절단' 인지 '한 장을 두 번 등록' 인지 가른다.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const p = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const rows = await p.drawingList.findMany({
  where: { drawingNo: "a36-20-2304", block: "후행", project: { projectCode: "LB4506" } },
  select: { id: true, status: true, heatNo: true, createdAt: true },
  orderBy: { createdAt: "asc" },
});
console.log(`■ 도면행 ${rows.length}행`);
for (const r of rows) {
  const logs = await p.cuttingLog.findMany({
    where: { drawingListId: r.id, status: "COMPLETED" },
    orderBy: { createdAt: "asc" },
    select: { id: true, heatNo: true, startAt: true, endAt: true, operator: true, memo: true,
              consumedHeatId: true, equipment: { select: { name: true } }, _count: { select: { pauses: true } } },
  });
  console.log(`\n   행 ${r.id.slice(-6)} 상태=${r.status} 도면판번호=${r.heatNo ?? "-"} · 완료 작업일보 ${logs.length}건`);
  for (const l of logs)
    console.log(`     · ${l.startAt.toISOString().slice(0,16)} ~ ${l.endAt?.toISOString().slice(0,16)} | ${l.equipment?.name} | ${l.operator} | 판번호 ${l.heatNo || "(공란)"}${l.memo ? " | 메모 " + l.memo : ""} | 중단 ${l._count.pauses}건`);
}

console.log("\n■ 관련 판번호가 판번호리스트에 몇 건씩 있나 (같은 번호의 철판이 여러 장일 수 있다)");
for (const hn of ["PP80518202", "PP80518203", "PP80518205"]) {
  const hs = await p.steelPlanHeat.findMany({
    where: { heatNo: hn },
    select: { status: true, vesselCode: true, thickness: true, width: true, length: true, cutAt: true },
  });
  console.log(`   ${hn}: ${hs.length}건 ${JSON.stringify(hs.reduce((a,x)=>(a[x.status]=(a[x.status]??0)+1,a),{}))}`);
}

console.log("\n■ LB4506/후행 에 확정된 AH36 20t 2350x10000 강재");
const plans = await p.steelPlan.findMany({
  where: { vesselCode: "LB4506", material: "AH36", thickness: 20, width: 2350, length: 10000, reservedFor: "LB4506/후행" },
  select: { status: true, actualHeatNo: true, actualDrawingNo: true },
});
for (const pl of plans) console.log(`   ${pl.status.padEnd(11)} 판번호=${pl.actualHeatNo ?? "-"} 도면=${pl.actualDrawingNo ?? "-"}`);
await p.$disconnect();

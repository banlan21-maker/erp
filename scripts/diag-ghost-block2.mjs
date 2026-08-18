import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const d = (x) => (x ? new Date(x).toISOString().slice(0, 16).replace("T", " ") : "-");

console.log("■ KYTS-1022 / S70PS 블록 — AH32 17.5×2590×10690 정황");
const draws = await prisma.drawingList.findMany({
  where: { project: { projectCode: "KYTS-1022" }, block: "S70PS" },
  select: { drawingNo: true, material: true, thickness: true, width: true, length: true, qty: true, status: true },
  orderBy: { drawingNo: "asc" },
});
console.log(`  도면 ${draws.length}행, 상태분포 ${JSON.stringify(draws.reduce((a, x) => (a[x.status] = (a[x.status] ?? 0) + 1, a), {}))}`);
const same = draws.filter(x => x.thickness === 17.5 && x.width === 2590 && x.length === 10690);
console.log(`  같은 사양 도면: ${same.length}행`);
for (const x of same) console.log(`   · [${x.status}] ${x.drawingNo} ${x.material} ${x.thickness}×${x.width}×${x.length} 수량=${x.qty}`);

console.log("\n■ 같은 사양 철판(SteelPlan) 전체");
const plans = await prisma.steelPlan.findMany({
  where: { vesselCode: "KYTS-1022", thickness: 17.5, width: 2590, length: 10690 },
  select: { id: true, material: true, status: true, reservedFor: true, receivedAt: true, issuedAt: true, actualHeatNo: true, updatedAt: true },
  orderBy: { createdAt: "asc" },
});
for (const p of plans) console.log(`   · [${p.status}] ${p.material} 확정=${p.reservedFor ?? "-"} 입고=${d(p.receivedAt)} 출고=${d(p.issuedAt)} 판번호=${p.actualHeatNo ?? "-"} 수정=${d(p.updatedAt)}`);

console.log("\n■ 같은 사양 판번호(SteelPlanHeat)");
const heats = await prisma.steelPlanHeat.findMany({
  where: { vesselCode: "KYTS-1022", thickness: 17.5, width: 2590, length: 10690 },
  select: { heatNo: true, status: true, cutAt: true },
});
for (const h of heats) console.log(`   · ${h.heatNo} [${h.status}] 절단=${d(h.cutAt)}`);

console.log("\n■ 같은 사양 작업일보");
const logs = await prisma.cuttingLog.findMany({
  where: { thickness: 17.5, width: 2590, length: 10690, project: { projectCode: "KYTS-1022" } },
  select: { status: true, heatNo: true, endAt: true, drawingList: { select: { block: true, drawingNo: true } } },
  orderBy: { startAt: "asc" },
});
for (const l of logs) console.log(`   · [${l.status}] ${d(l.endAt)} ${l.drawingList?.block ?? "-"} ${l.drawingList?.drawingNo ?? ""} heatNo=${l.heatNo}`);

console.log("\n■ 판정: 블록에 이 사양 도면이 있는가? → 있으면 '소진 누락', 없으면 '확정 오배정'");
console.log(`   같은 사양 도면 ${same.length}행 / 철판 ${plans.length}장(재고 ${plans.filter(p => ["REGISTERED","RECEIVED","ISSUED"].includes(p.status)).length}) / 작업일보 ${logs.length}건`);

await prisma.$disconnect();

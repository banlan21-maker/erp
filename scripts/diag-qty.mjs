import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const p = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const g = await p.drawingList.groupBy({ by: ["qty"], _count: { _all: true }, orderBy: { qty: "asc" } });
console.log("■ 도면행 수량(qty) 분포");
for (const r of g) console.log(`   수량 ${String(r.qty).padStart(3)} : ${r._count._all}행`);
const over = await p.drawingList.count({ where: { qty: { gt: 1 } } });
console.log(`\n   수량 2 이상인 행: ${over}행  (매칭은 이걸 무시하고 1행=1장으로 센다)`);
if (over) {
  const s = await p.drawingList.findMany({ where: { qty: { gt: 1 } }, take: 10,
    select: { qty: true, block: true, drawingNo: true, status: true, thickness: true, width: true, length: true, project: { select: { projectCode: true } } } });
  for (const x of s) console.log(`     ${x.project?.projectCode}/${x.block} ${x.drawingNo} 수량${x.qty} ${x.thickness}t ${x.width}x${x.length} [${x.status}]`);
}
await p.$disconnect();

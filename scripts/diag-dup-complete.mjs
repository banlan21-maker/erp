/**
 * 한 도면에 완료 작업일보가 2건 이상인 건의 상세 (읽기 전용).
 * 재작업(정상)인지, 오등록(중복)인지 판단할 근거를 모은다.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const p = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const grouped = await p.cuttingLog.groupBy({
  by: ["drawingListId"],
  where: { status: "COMPLETED", drawingListId: { not: null } },
  _count: { _all: true },
});
const dups = grouped.filter(g => g._count._all > 1);
console.log(`■ 완료 작업일보가 2건 이상인 도면: ${dups.length}개\n`);

const iso = (d) => (d ? new Date(d).toISOString().replace("T", " ").slice(0, 19) : "-");

for (const g of dups) {
  const dl = await p.drawingList.findUnique({
    where: { id: g.drawingListId },
    select: {
      block: true, drawingNo: true, qty: true, status: true, heatNo: true,
      material: true, thickness: true, width: true, length: true,
      assignedRemnantId: true, alternateVesselCode: true,
      project: { select: { projectCode: true } },
    },
  });
  const logs = await p.cuttingLog.findMany({
    where: { drawingListId: g.drawingListId, status: "COMPLETED" },
    orderBy: { createdAt: "asc" },
    select: {
      id: true, createdAt: true, startAt: true, endAt: true, operator: true,
      heatNo: true, consumedHeatId: true, isUrgent: true, memo: true,
      drawingNo: true, material: true, thickness: true, width: true, length: true,
      equipment: { select: { name: true } },
    },
  });
  console.log("=".repeat(78));
  console.log(`${dl?.project?.projectCode}/${dl?.block} ${dl?.drawingNo}  [${dl?.status}] 수량=${dl?.qty} 도면판번호=${dl?.heatNo ?? "-"}`);
  console.log(`   사양 ${dl?.material} ${dl?.thickness}t ${dl?.width}x${dl?.length}${dl?.assignedRemnantId ? " · 잔재사용" : ""}${dl?.alternateVesselCode ? " · 대체호선 " + dl.alternateVesselCode : ""}`);
  for (const l of logs) {
    console.log(`   - 등록 ${iso(l.createdAt)} | 작업 ${iso(l.startAt)} ~ ${iso(l.endAt)} | ${l.equipment?.name ?? "-"} | ${l.operator}`);
    console.log(`     판번호=${l.heatNo || "(공란)"} 소진판=${l.consumedHeatId ? "있음" : "없음"} 사양=${l.material ?? "-"} ${l.thickness ?? "-"}t ${l.width ?? "-"}x${l.length ?? "-"}${l.memo ? " | 메모: " + l.memo : ""}`);
  }
  // 두 로그가 완전히 같은 시간대면 오등록 의심, 다르면 재작업 가능성
  if (logs.length === 2) {
    const [a, b] = logs;
    const sameTime = a.startAt.getTime() === b.startAt.getTime();
    const gapMin = Math.round((b.createdAt - a.createdAt) / 60000);
    console.log(`   → 시작시각 ${sameTime ? "동일" : "다름"} · 등록 간격 ${gapMin}분 · 판번호 ${a.heatNo === b.heatNo ? "동일" : "다름"}`);
  }
}
await p.$disconnect();

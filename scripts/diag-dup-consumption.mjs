/**
 * 중복 완료 6건이 실제로 '강재를 두 장 먹었는지' 확인 (읽기 전용).
 *
 * 완료 처리 1회 = 강재(SteelPlan) 1장 소진 + 판번호(SteelPlanHeat) 1건 CUT.
 * 따라서 한 도면에 완료가 2건이면 그 사양에서 2장이 나갔다.
 * 실제로 두 장을 자른 것이면 정상이고, 오등록이면 1장이 헛되이 소진된 것이다.
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

for (const g of dups) {
  const dl = await p.drawingList.findUnique({
    where: { id: g.drawingListId },
    select: { block: true, drawingNo: true, qty: true, status: true, heatNo: true,
              material: true, thickness: true, width: true, length: true,
              assignedRemnantId: true, alternateVesselCode: true,
              project: { select: { projectCode: true } } },
  });
  const logs = await p.cuttingLog.findMany({
    where: { drawingListId: g.drawingListId, status: "COMPLETED" },
    orderBy: { createdAt: "asc" },
    select: { id: true, heatNo: true, startAt: true, endAt: true, operator: true, equipment: { select: { name: true } } },
  });
  const vessel = dl?.alternateVesselCode?.trim() || dl?.project?.projectCode || "";
  console.log("=".repeat(76));
  console.log(`${dl?.project?.projectCode}/${dl?.block} ${dl?.drawingNo} · ${dl?.material} ${dl?.thickness}t ${dl?.width}x${dl?.length}${dl?.assignedRemnantId ? " · 잔재사용" : ""}`);

  // 이 도면이 쓴 것으로 기록된 판번호들이 실제로 CUT 인지
  for (const l of logs) {
    if (!l.heatNo?.trim()) { console.log(`   판번호 공란 (잔재 절단) — ${l.equipment?.name} ${l.operator}`); continue; }
    const h = await p.steelPlanHeat.findMany({
      where: { heatNo: l.heatNo.trim() },
      select: { status: true, vesselCode: true, cutAt: true },
    });
    const cut = h.filter(x => x.status === "CUT").length;
    console.log(`   판번호 ${l.heatNo} → 리스트에 ${h.length}건 (CUT ${cut}) · ${l.equipment?.name} ${l.operator}`);
  }

  // 그 사양의 강재가 이 호선/블록으로 몇 장 확정·소진됐나
  const resv = `${dl?.project?.projectCode}/${dl?.block}`;
  const plans = await p.steelPlan.findMany({
    where: { vesselCode: vessel, material: dl?.material, thickness: dl?.thickness, width: dl?.width, length: dl?.length,
             reservedFor: resv },
    select: { status: true, actualHeatNo: true, actualDrawingNo: true },
  });
  const byStatus = plans.reduce((a, x) => (a[x.status] = (a[x.status] ?? 0) + 1, a), {});
  const mine = plans.filter(x => (x.actualDrawingNo ?? "").trim() === (dl?.drawingNo ?? "").trim());
  console.log(`   확정 '${resv}' 강재 ${plans.length}장 ${JSON.stringify(byStatus)}`);
  console.log(`   그중 이 도면번호로 소진 기록된 것: ${mine.length}장  ${mine.map(x => x.actualHeatNo ?? "(공란)").join(", ")}`);

  // 같은 블록·같은 사양의 도면이 몇 행인지 (여러 행이면 원래 여러 장 필요)
  const sameSpecRows = await p.drawingList.count({
    where: { projectId: undefined, block: dl?.block, material: dl?.material, thickness: dl?.thickness,
             width: dl?.width, length: dl?.length,
             project: { projectCode: dl?.project?.projectCode } },
  });
  console.log(`   같은 블록·같은 사양 도면행 수: ${sameSpecRows}행 (수량칸=${dl?.qty})`);
}
await p.$disconnect();

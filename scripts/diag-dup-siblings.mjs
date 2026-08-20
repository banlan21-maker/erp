/**
 * 완료 작업일보가 2건 남은 4개 도면의 '옆 행' 상황 (읽기 전용).
 *
 * 두 번째 로그를 어떻게 정리할지 판단할 근거:
 *   (가) 같은 블록에 같은 도면번호 행이 하나 더 있고 비어 있다 → 그 행으로 옮기면 된다
 *   (나) 같은 도면번호는 1행뿐이다 → 그 도면을 실제로 두 장 잘랐다는 뜻.
 *        도면번호에 -1 을 붙인 행을 새로 만들어 나누는 것이 맞다.
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
    select: { id: true, block: true, drawingNo: true, qty: true, status: true, heatNo: true,
              material: true, thickness: true, width: true, length: true,
              steelWeight: true, useWeight: true, alternateVesselCode: true, assignedRemnantId: true,
              projectId: true, project: { select: { projectCode: true } } },
  });
  console.log("=".repeat(78));
  console.log(`${dl.project?.projectCode}/${dl.block} ${dl.drawingNo} · ${dl.material} ${dl.thickness}t ${dl.width}x${dl.length}`);
  console.log(`   상태=${dl.status} 수량=${dl.qty} 도면판번호=${dl.heatNo ?? "-"} 강재중량=${dl.steelWeight ?? "-"} 사용중량=${dl.useWeight ?? "-"}`);

  // ① 같은 블록에 같은 도면번호 행이 또 있는가
  const sameNo = await p.drawingList.findMany({
    where: { projectId: dl.projectId, block: dl.block, drawingNo: dl.drawingNo },
    select: { id: true, status: true, heatNo: true, _count: { select: { cuttingLogs: true } } },
  });
  console.log(`   ① 같은 도면번호 행: ${sameNo.length}행`);
  for (const r of sameNo) console.log(`        ${r.id === dl.id ? "(이 행)" : "(다른행)"} 상태=${r.status} 판번호=${r.heatNo ?? "-"} 작업일보 ${r._count.cuttingLogs}건`);

  // ② 같은 블록·같은 사양의 다른 도면행 중 작업일보가 없는 것 (옮길 자리 후보)
  const empty = await p.drawingList.findMany({
    where: {
      projectId: dl.projectId, block: dl.block,
      material: dl.material, thickness: dl.thickness, width: dl.width, length: dl.length,
      id: { not: dl.id },
      cuttingLogs: { none: {} },
    },
    select: { drawingNo: true, status: true, heatNo: true },
  });
  console.log(`   ② 같은 사양 · 작업일보 없는 옆 행: ${empty.length}행`);
  for (const r of empty.slice(0, 6)) console.log(`        ${r.drawingNo} 상태=${r.status} 판번호=${r.heatNo ?? "-"}`);

  // ③ 그 도면번호에 -1 같은 접미가 이미 쓰이고 있는지 (충돌 확인)
  const suffixed = await p.drawingList.count({
    where: { projectId: dl.projectId, block: dl.block, drawingNo: { startsWith: `${dl.drawingNo}-` } },
  });
  console.log(`   ③ '${dl.drawingNo}-' 로 시작하는 행: ${suffixed}행 ${suffixed ? "← 접미 방식이 이미 쓰이고 있음" : ""}`);
}

// 전체적으로 '도면번호-숫자' 관례가 이미 있는지
const dashRows = await p.drawingList.count({ where: { drawingNo: { contains: "-" } } });
const total = await p.drawingList.count();
console.log(`\n■ 참고 — 도면번호에 '-' 가 들어간 행: ${dashRows}/${total} (도면번호 자체에 하이픈이 흔한지 확인용)`);
await p.$disconnect();

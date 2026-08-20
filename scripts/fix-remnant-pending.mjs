/**
 * 등록잔재 '발생예정' 소급 정리 (2026-08-20).
 *
 * 배경: 엑셀 업로드로 도면과 함께 등록되는 등록잔재가 그동안 곧바로 재고(IN_STOCK)로
 *   들어갔다. 원판이 아직 안 잘렸는데 자투리가 창고에 있는 것처럼 보여, 같은 철판이
 *   전산상 두 줄(원판 + 자투리)로 잡혔다. 이제 생성 시 PENDING(발생예정) 으로 넣고
 *   원판 절단완료 시 재고로 승격한다.
 *
 * 이 스크립트는 그 규칙을 기존 데이터에 소급한다 — 원판 도면이 아직 CUT 이 아닌
 * 등록잔재만 PENDING 으로 되돌린다.
 *
 * 안전장치 — 아래는 건드리지 않는다(되돌리면 그쪽 작업이 근거를 잃는다):
 *   · 이미 소진(EXHAUSTED)  · 다른 곳에 확정(reservedFor)  · 외부출고 선별(shipoutMarkedAt)
 *   · 자식 잔재가 달린 것(parentRemnantId 로 참조됨)
 *
 * 실행:  node scripts/fix-remnant-pending.mjs          (미리보기)
 *        node scripts/fix-remnant-pending.mjs --apply  (반영 + undo JSON)
 */
import "dotenv/config";
import fs from "node:fs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const APPLY = process.argv.includes("--apply");

const cand = await prisma.remnant.findMany({
  where: {
    type: "REGISTERED",
    status: "IN_STOCK",
    reservedFor: null,
    shipoutMarkedAt: null,
    childRemnants: { none: {} },
    drawingList: { status: { not: "CUT" } },
  },
  select: {
    id: true, remnantNo: true, weight: true, heatNo: true,
    drawingList: { select: { status: true, block: true, drawingNo: true, project: { select: { projectCode: true } } } },
  },
  orderBy: { remnantNo: "asc" },
});

console.log(`■ 발생예정으로 되돌릴 등록잔재: ${cand.length}건`);
for (const r of cand) {
  const d = r.drawingList;
  console.log(`   ${r.remnantNo.padEnd(22)} ${String(r.weight).padStart(7)}kg  원판=${d?.project?.projectCode}/${d?.block ?? "-"} ${d?.drawingNo ?? ""} (${d?.status})`);
}
console.log(`   중량 합계 ${cand.reduce((s, r) => s + (r.weight ?? 0), 0).toFixed(0)}kg — 지금 재고 집계에 잘못 들어가 있는 양`);

const excluded = await prisma.remnant.count({
  where: { type: "REGISTERED", status: "IN_STOCK", drawingList: { status: { not: "CUT" } },
           OR: [{ NOT: { reservedFor: null } }, { NOT: { shipoutMarkedAt: null } }, { childRemnants: { some: {} } }] },
});
console.log(`   (안전장치로 제외한 것: ${excluded}건 — 이미 확정·선별·자식잔재 보유)`);

if (!APPLY) { console.log("\n(미리보기만 — 반영하려면 --apply)"); await prisma.$disconnect(); process.exit(0); }
if (cand.length === 0) { console.log("대상 없음"); await prisma.$disconnect(); process.exit(0); }

fs.writeFileSync("scripts/fix-remnant-pending-undo.json", JSON.stringify({
  purpose: "등록잔재 IN_STOCK → PENDING 소급 되돌리기 (전부 IN_STOCK 으로 복구)",
  appliedAt: new Date().toISOString(),
  count: cand.length,
  items: cand.map(r => ({ id: r.id, remnantNo: r.remnantNo, before: "IN_STOCK", after: "PENDING", heatNo: r.heatNo })),
}, null, 2), "utf8");

const res = await prisma.remnant.updateMany({
  where: { id: { in: cand.map(r => r.id) }, status: "IN_STOCK" },
  data: { status: "PENDING" },
});
console.log(`\n✔ ${res.count}건 발생예정으로 변경 (undo: scripts/fix-remnant-pending-undo.json)`);

const left = await prisma.remnant.groupBy({ by: ["status"], where: { type: "REGISTERED" }, _count: { _all: true } });
console.log(`   사후 등록잔재 상태: ${JSON.stringify(Object.fromEntries(left.map(x => [x.status, x._count._all])))}`);
await prisma.$disconnect();

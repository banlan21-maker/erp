/**
 * 한 도면행에 완료 작업일보가 2건 붙은 것을 '-1' 행으로 나눈다 (2026-08-20).
 *
 * 배경
 *   아래 3개 도면은 같은 도면번호 행이 1행뿐인데 완료 작업일보가 2건이고,
 *   두 로그가 서로 다른 판번호를 쓰며 강재도 실제로 나갔다.
 *   같은 사양의 빈 옆 행도 없다 → 그 도면을 실제로 두 장 잘랐다는 뜻이다.
 *   한 행에 두 건이 붙어 있으면 "어느 도면이 몇 장 잘렸나" 대조가 안 되므로,
 *   두 번째 절단을 '<도면번호>-1' 행으로 떼어 낸다.
 *
 * 무엇을 바꾸는가
 *   · 원본 행을 복제해 '<도면번호>-1' 행을 새로 만든다 (같은 사양·블록·호선, 상태 CUT)
 *   · 새 행의 판번호 = 두 번째 로그의 판번호
 *   · 두 번째 작업일보의 연결(drawingListId)을 새 행으로 옮긴다
 *
 * 무엇을 안 바꾸는가
 *   강재(SteelPlan)·판번호(SteelPlanHeat)·잔재는 손대지 않는다.
 *   이미 두 장이 소진된 상태가 맞고, 로그를 옮기는 것뿐이라 재고가 흔들릴 이유가 없다.
 *   절단보고서는 작업일보를 세므로 물량도 변하지 않는다(2건 그대로).
 *
 * 제외
 *   LB4506/후행 a36-20-2304 — 두 로그가 같은 판(PP80518205)을 쓰고 그 판은 1장뿐이라
 *   나눠 작업이 아니라 중복이다. 다만 메모에 PP80518202(아직 대기)가 적혀 있어
 *   판번호 오타일 가능성이 있다 → 현장 확인 후 별도 처리(사용자 결정, 2026-08-20).
 *
 * 실행:  node scripts/fix-split-dup-drawings.mjs          (미리보기)
 *        node scripts/fix-split-dup-drawings.mjs --apply  (반영 + undo JSON)
 */
import "dotenv/config";
import fs from "node:fs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const APPLY = process.argv.includes("--apply");

const TARGETS = [
  { vessel: "KYTS-1022", block: "B40PS",            drawingNo: "CNR001" },
  { vessel: "KYTS-1022", block: "D70P(CORR_JIG)",   drawingNo: "CNX002" },
  { vessel: "TUGBOAT",   block: "A11C",             drawingNo: "A11CNCP13" },
];

const iso = (d) => (d ? new Date(d).toISOString().replace("T", " ").slice(0, 19) : "-");
const plan = [];

for (const t of TARGETS) {
  const dl = await prisma.drawingList.findFirst({
    where: { drawingNo: t.drawingNo, block: t.block, project: { projectCode: t.vessel } },
    include: { project: { select: { projectCode: true } } },
  });
  if (!dl) { console.log(`⚠ 도면을 못 찾음: ${t.vessel}/${t.block} ${t.drawingNo}`); continue; }

  const logs = await prisma.cuttingLog.findMany({
    where: { drawingListId: dl.id, status: "COMPLETED" },
    orderBy: { createdAt: "asc" },
    select: { id: true, createdAt: true, startAt: true, endAt: true, operator: true, heatNo: true,
              equipment: { select: { name: true } } },
  });
  if (logs.length < 2) { console.log(`✓ 이미 정리됨: ${t.vessel}/${t.block} ${t.drawingNo} (완료 ${logs.length}건)`); continue; }
  if (logs.length > 2) { console.log(`⚠ 완료가 3건 이상 — 손으로 확인 필요: ${t.vessel}/${t.block} ${t.drawingNo}`); continue; }

  const [keep, move] = logs;                 // 먼저 등록된 쪽을 원본 행에 남기고 뒤 건을 새 행으로
  const newNo = `${dl.drawingNo}-1`;

  const clash = await prisma.drawingList.findFirst({
    where: { projectId: dl.projectId, block: dl.block, drawingNo: newNo },
    select: { id: true },
  });
  if (clash) { console.log(`⚠ '${newNo}' 행이 이미 있음 — 건너뜀`); continue; }

  console.log("=".repeat(76));
  console.log(`${dl.project?.projectCode}/${dl.block} ${dl.drawingNo} · ${dl.material} ${dl.thickness}t ${dl.width}x${dl.length}`);
  console.log(`   원본 유지 : ${iso(keep.createdAt)} ${keep.equipment?.name} ${keep.operator} 판번호=${keep.heatNo || "(공란)"}`);
  console.log(`   새 행 이동: ${iso(move.createdAt)} ${move.equipment?.name} ${move.operator} 판번호=${move.heatNo || "(공란)"}  →  ${newNo}`);
  plan.push({ dl, keep, move, newNo });
}

console.log(`\n■ 분리 대상: ${plan.length}건`);
if (!APPLY) { console.log("\n(미리보기만 — 반영하려면 --apply)"); await prisma.$disconnect(); process.exit(0); }
if (plan.length === 0) { await prisma.$disconnect(); process.exit(0); }

const undo = [];
for (const p of plan) {
  // 원본 행을 그대로 복제 — id/createdAt/updatedAt 만 새로 받는다
  const { id: _id, createdAt: _c, updatedAt: _u, project: _p, ...rest } = p.dl;
  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.drawingList.create({
      data: {
        ...rest,
        drawingNo: p.newNo,
        status: "CUT",
        heatNo: p.move.heatNo || null,
      },
    });
    await tx.cuttingLog.update({ where: { id: p.move.id }, data: { drawingListId: row.id } });
    return row;
  }, { maxWait: 5000, timeout: 20000 });

  undo.push({
    drawing: `${p.dl.project?.projectCode}/${p.dl.block} ${p.dl.drawingNo}`,
    newRowId: created.id,
    newDrawingNo: p.newNo,
    movedLogId: p.move.id,
    originalDrawingListId: p.dl.id,
  });
  console.log(`   ✔ ${p.newNo} 생성 (${created.id.slice(-6)}) · 작업일보 1건 이동`);
}

fs.writeFileSync("scripts/fix-split-dup-drawings-undo.json", JSON.stringify({
  purpose: "'-1' 분리 되돌리기 — movedLogId 의 drawingListId 를 originalDrawingListId 로 되돌리고 newRowId 행을 삭제한다",
  appliedAt: new Date().toISOString(),
  note: "강재·판번호·잔재는 건드리지 않았다. 되돌려도 재고에 영향 없음.",
  count: undo.length,
  items: undo,
}, null, 2), "utf8");
console.log(`\n(undo: scripts/fix-split-dup-drawings-undo.json)`);

// 사후 확인
const grouped = await prisma.cuttingLog.groupBy({
  by: ["drawingListId"],
  where: { status: "COMPLETED", drawingListId: { not: null } },
  _count: { _all: true },
});
const left = grouped.filter(g => g._count._all > 1);
console.log(`\n■ 남은 '완료 2건 이상' 도면: ${left.length}개`);
for (const g of left) {
  const d = await prisma.drawingList.findUnique({
    where: { id: g.drawingListId },
    select: { block: true, drawingNo: true, project: { select: { projectCode: true } } },
  });
  console.log(`   ${d?.project?.projectCode}/${d?.block} ${d?.drawingNo} — ${g._count._all}건`);
}
const done = await prisma.cuttingLog.count({ where: { status: "COMPLETED" } });
console.log(`\n■ 완료 작업일보 총계: ${done}건 (보고서 집계 — 로그를 옮긴 것뿐이라 변하지 않아야 한다)`);
await prisma.$disconnect();

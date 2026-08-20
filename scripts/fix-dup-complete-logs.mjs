/**
 * 한 도면에 완료 작업일보가 2건 남은 것 중 '진짜 중복' 만 정리 (2026-08-20).
 *
 * 배경
 *   2026-06-08 ~ 06-25 사이 6개 도면에 완료 작업일보가 2건씩 남았다(총 12건, 이후 신규 0건).
 *   그중 4건은 판번호가 서로 다르고 강재도 실제로 2장 나갔다 — 같은 블록·같은 사양의
 *   옆 도면행 작업을 이 행에 잘못 붙인 것으로, 지우면 진짜 절단 기록과 물량이 사라진다.
 *   나머지 2건만 '실물 1장인데 기록만 2건' 이다:
 *     · KYTS-1037/B23P CNX09 — 두 로그가 같은 판번호(PP81130404). 그 판은 리스트에 1건뿐이고
 *       강재도 이 도면번호로 1장만 소진됐다. 같은 철판이 두 장비에 동시에 오를 수 없다.
 *     · KYTS-1022/S40PS CNX042 — 잔재 사용(판번호 공란), 강재 소진 0장.
 *       같은 작업자가 두 장비에서 시간 겹치게 등록.
 *
 * 왜 화면 [삭제] 를 쓰지 않는가
 *   작업일보 삭제는 절단취소를 같이 실행한다(applyCuttingRestore) — 도면을 WAITING 으로,
 *   판번호를 대기로, 강재를 입고로 되돌린다. 그런데 이 두 건은 강재·판번호가 이미
 *   '1장 절단' 상태로 정확히 맞아 있다. 화면에서 지우면 남은 로그가 쓰던 판까지 풀려
 *   지금보다 더 어긋난다(두 로그 모두 consumedHeatId 가 비어 있어 구분이 안 된다).
 *   → 부작용 없이 로그 행만 제거한다.
 *
 * 남길 로그 판정: 먼저 등록된 것(createdAt 이 이른 쪽)을 남긴다.
 *   현장에서 먼저 시작한 사람이 실제 작업자일 가능성이 높고, 뒤 건은 같은 도면을
 *   다시 골라 등록한 것으로 본다. 중단이력(CuttingPause)이 붙은 쪽이 있으면 그쪽을 남긴다.
 *
 * 실행:  node scripts/fix-dup-complete-logs.mjs          (미리보기)
 *        node scripts/fix-dup-complete-logs.mjs --apply  (반영 + undo JSON)
 */
import "dotenv/config";
import fs from "node:fs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const APPLY = process.argv.includes("--apply");

// 대상은 손으로 특정한다 — 자동 판정으로 넓히면 진짜 절단 기록까지 지울 위험이 있다.
const TARGETS = [
  { vessel: "KYTS-1037", block: "B23P",  drawingNo: "CNX09",  reason: "두 로그가 같은 판번호(PP81130404) — 판은 1건뿐, 강재도 1장만 소진" },
  { vessel: "KYTS-1022", block: "S40PS", drawingNo: "CNX042", reason: "잔재 사용(판번호 공란) · 강재 소진 0장 · 같은 작업자가 두 장비에서 동시" },
];

const iso = (d) => (d ? new Date(d).toISOString().replace("T", " ").slice(0, 19) : "-");

const plan = [];
for (const t of TARGETS) {
  const dl = await prisma.drawingList.findFirst({
    where: { drawingNo: t.drawingNo, block: t.block, project: { projectCode: t.vessel } },
    select: { id: true, status: true, heatNo: true, block: true, drawingNo: true, project: { select: { projectCode: true } } },
  });
  if (!dl) { console.log(`⚠ 도면을 못 찾음: ${t.vessel}/${t.block} ${t.drawingNo}`); continue; }

  const logs = await prisma.cuttingLog.findMany({
    where: { drawingListId: dl.id, status: "COMPLETED" },
    orderBy: { createdAt: "asc" },
    select: {
      id: true, createdAt: true, startAt: true, endAt: true, operator: true, heatNo: true,
      consumedHeatId: true, memo: true, equipmentId: true, equipment: { select: { name: true } },
      _count: { select: { pauses: true } },
    },
  });
  if (logs.length < 2) { console.log(`✓ 이미 정리됨: ${t.vessel}/${t.block} ${t.drawingNo} (완료 ${logs.length}건)`); continue; }
  if (logs.length > 2) { console.log(`⚠ 완료가 3건 이상 — 손으로 확인 필요: ${t.vessel}/${t.block} ${t.drawingNo}`); continue; }

  // 중단이력이 있는 쪽을 우선 남기고, 없으면 먼저 등록된 쪽을 남긴다
  const withPause = logs.filter(l => l._count.pauses > 0);
  const keep = withPause.length === 1 ? withPause[0] : logs[0];
  const drop = logs.find(l => l.id !== keep.id);

  // 안전장치 — 지울 쪽에 소진판 기록(consumedHeatId)이 있으면 진짜 절단 근거다. 건드리지 않는다.
  if (drop.consumedHeatId) {
    console.log(`⚠ 건너뜀: ${t.vessel}/${t.block} ${t.drawingNo} — 지울 로그에 소진판 기록이 있어 진짜 절단으로 판단`);
    continue;
  }

  console.log("=".repeat(76));
  console.log(`${dl.project?.projectCode}/${dl.block} ${dl.drawingNo}  [${dl.status}]`);
  console.log(`   사유: ${t.reason}`);
  console.log(`   남김: ${iso(keep.createdAt)} ${keep.equipment?.name} ${keep.operator} 판번호=${keep.heatNo || "(공란)"} 중단이력 ${keep._count.pauses}건`);
  console.log(`   삭제: ${iso(drop.createdAt)} ${drop.equipment?.name} ${drop.operator} 판번호=${drop.heatNo || "(공란)"} 중단이력 ${drop._count.pauses}건`);
  plan.push({ dl, keep, drop, reason: t.reason });
}

console.log(`\n■ 삭제 대상 작업일보: ${plan.length}건`);
if (!APPLY) { console.log("\n(미리보기만 — 반영하려면 --apply)"); await prisma.$disconnect(); process.exit(0); }
if (plan.length === 0) { await prisma.$disconnect(); process.exit(0); }

// 되돌리기용 전체 스냅샷 — raw 로 지우므로 원본 필드를 그대로 남긴다
const undo = [];
for (const p of plan) {
  const full = await prisma.cuttingLog.findUnique({ where: { id: p.drop.id } });
  const pauses = await prisma.cuttingPause.findMany({ where: { cuttingLogId: p.drop.id } });
  undo.push({
    drawing: `${p.dl.project?.projectCode}/${p.dl.block} ${p.dl.drawingNo}`,
    reason: p.reason,
    log: full,
    pauses,
  });
}
fs.writeFileSync("scripts/fix-dup-complete-logs-undo.json", JSON.stringify({
  purpose: "중복 완료 작업일보 삭제 되돌리기 — log 객체를 그대로 다시 create 하면 복구된다",
  appliedAt: new Date().toISOString(),
  note: "부작용 없이 로그 행만 지웠다. 강재·판번호·도면 상태는 건드리지 않았으므로 복구도 로그만 되살리면 된다.",
  count: undo.length,
  items: undo,
}, null, 2), "utf8");

let n = 0;
for (const p of plan) {
  await prisma.$transaction(async (tx) => {
    await tx.cuttingPause.deleteMany({ where: { cuttingLogId: p.drop.id } });
    await tx.cuttingLog.delete({ where: { id: p.drop.id } });
  });
  n++;
}
console.log(`\n✔ ${n}건 삭제 (undo: scripts/fix-dup-complete-logs-undo.json)`);

// 사후 확인 — 강재·판번호·도면 상태가 그대로인지, 남은 중복이 몇 건인지
for (const p of plan) {
  const left = await prisma.cuttingLog.count({ where: { drawingListId: p.dl.id, status: "COMPLETED" } });
  const dl = await prisma.drawingList.findUnique({ where: { id: p.dl.id }, select: { status: true, heatNo: true } });
  console.log(`   ${p.dl.project?.projectCode}/${p.dl.block} ${p.dl.drawingNo} → 완료 ${left}건 · 도면상태 ${dl?.status} · 판번호 ${dl?.heatNo ?? "-"}`);
}
const grouped = await prisma.cuttingLog.groupBy({
  by: ["drawingListId"],
  where: { status: "COMPLETED", drawingListId: { not: null } },
  _count: { _all: true },
});
console.log(`\n   남은 '완료 2건 이상' 도면: ${grouped.filter(g => g._count._all > 1).length}개 (판번호가 달라 진짜 절단으로 판단한 건)`);
await prisma.$disconnect();

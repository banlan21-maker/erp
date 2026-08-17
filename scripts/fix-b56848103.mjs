/**
 * 교정 — KYTS-1022 / A / 12×2450×11600 / 판번호 B56848103 을 WAITING → CUT.
 *
 * 배경 (2026-08-17 진단):
 *   S50PS 블록 이 사양은 도면 6장(CNX034~039)·철판 6장·판번호 6개로 1:1:1.
 *   도면 6장 CUT, 철판 6장 COMPLETED, 작업일보 6건 COMPLETED 인데 판번호는 5개만 CUT.
 *   원인 = CNX039 작업일보가 판번호를 'PP79328103'(KYTS-1023 소속·이미 SHIPPED)으로
 *   손입력한 오기. 그 작업일보 5건은 2026-06-09 00:32 에 소급 일괄 입력됐고
 *   selectedHeatId 가 없다(목록 선택이 아닌 타이핑). 게다가 그 시점엔 B56848102/103 이
 *   아직 업로드조차 안 돼 있었다(2026-08-17 02:49 batch 20260817-03 로 뒤늦게 등록).
 *
 * 사용자 지시: **판번호만 CUT 으로.** 작업일보(heatNo="PP79328103")는 손대지 않는다.
 *   → KYTS-1023 쪽 PP79328103 은 SHIPPED 그대로라 이 교정의 영향을 받지 않는다.
 *   → 같은 패턴 6종(8/13~8/15)은 지시에 따라 건드리지 않는다.
 *
 * 절단일은 실제 그 블록을 자른 CNX039 작업일보의 endAt 을 쓴다(형제 판 4개와 동일 시각).
 *
 * 실행:  node scripts/fix-b56848103.mjs          (미리보기만)
 *        node scripts/fix-b56848103.mjs --apply  (실제 반영 + undo JSON 생성)
 */
import "dotenv/config";
import fs from "node:fs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const APPLY = process.argv.includes("--apply");
const HEAT_NO = "B56848103";
const LOG_ID = "cmq5wocuy000601p7laeyaooz"; // CNX039 작업일보 (절단일 출처)
const d = (x) => (x ? new Date(x).toISOString().slice(0, 16).replace("T", " ") : "-");

// ── 1) 대상 판번호 특정 (사양까지 완전일치하는 1건이어야 한다) ────────────────
const heats = await prisma.steelPlanHeat.findMany({
  where: { heatNo: HEAT_NO, vesselCode: "KYTS-1022", material: "A", thickness: 12, width: 2450, length: 11600 },
});
if (heats.length !== 1) {
  console.error(`✖ 대상이 1건이 아니다 (${heats.length}건) — 중단`);
  await prisma.$disconnect(); process.exit(1);
}
const heat = heats[0];
if (heat.status !== "WAITING") {
  console.error(`✖ 이미 ${heat.status} 다 — 중단 (이 스크립트는 WAITING 만 바꾼다)`);
  await prisma.$disconnect(); process.exit(1);
}

// ── 2) 절단일 출처 확인 ────────────────────────────────────────────────────
const log = await prisma.cuttingLog.findUnique({
  where: { id: LOG_ID },
  include: { drawingList: { select: { block: true, drawingNo: true } }, project: { select: { projectCode: true } } },
});
if (!log?.endAt) {
  console.error("✖ CNX039 작업일보의 종료시각을 찾을 수 없다 — 중단");
  await prisma.$disconnect(); process.exit(1);
}
const cutAt = log.endAt;

console.log("■ 대상");
console.log(`   ${heat.heatNo}  ${heat.vesselCode} ${heat.material} ${heat.thickness}×${heat.width}×${heat.length}`);
console.log(`   현재 [${heat.status}] 절단일=${d(heat.cutAt)}   id=${heat.id}`);
console.log("■ 변경");
console.log(`   status  WAITING → CUT`);
console.log(`   cutAt   -       → ${d(cutAt)}  (출처: ${log.project?.projectCode}/${log.drawingList?.block} ${log.drawingList?.drawingNo} 작업일보 종료시각)`);
console.log(`   ※ 작업일보 heatNo="${log.heatNo}" 는 지시대로 그대로 둔다`);

if (!APPLY) {
  console.log("\n(미리보기만 — 실제 반영하려면 --apply)");
  await prisma.$disconnect(); process.exit(0);
}

// ── 3) 반영 + undo 스냅샷 ──────────────────────────────────────────────────
const undo = {
  purpose: "B56848103 WAITING→CUT 교정 되돌리기",
  appliedAt: new Date().toISOString(),
  before: { id: heat.id, heatNo: heat.heatNo, status: heat.status, cutAt: heat.cutAt },
  after: { status: "CUT", cutAt: cutAt.toISOString() },
  note: "되돌리려면 before 값으로 steelPlanHeat.update. 작업일보는 변경하지 않았음.",
};
fs.writeFileSync("scripts/fix-b56848103-undo.json", JSON.stringify(undo, null, 2), "utf8");

const updated = await prisma.steelPlanHeat.update({
  where: { id: heat.id },
  data: { status: "CUT", cutAt },
});
console.log(`\n✔ 반영 완료 — [${updated.status}] 절단일=${d(updated.cutAt)}`);
console.log("  undo: scripts/fix-b56848103-undo.json");

// ── 4) 사후 검증 ──────────────────────────────────────────────────────────
const after = await prisma.steelPlanHeat.findMany({
  where: { vesselCode: "KYTS-1022", material: "A", thickness: 12, width: 2450, length: 11600 },
  orderBy: { heatNo: "asc" },
});
console.log("\n■ 사후 — 같은 사양 판번호 전체");
for (const h of after) console.log(`   · ${h.heatNo} [${h.status}] 절단=${d(h.cutAt)}`);
const plans = await prisma.steelPlan.count({ where: { vesselCode: "KYTS-1022", material: "A", thickness: 12, width: 2450, length: 11600, status: "COMPLETED" } });
console.log(`   철판 절단완료 ${plans}장 / 판번호 CUT ${after.filter(h => h.status === "CUT").length}개  → ${plans === after.filter(h => h.status === "CUT").length ? "일치 ✔" : "여전히 불일치 ✖"}`);

await prisma.$disconnect();

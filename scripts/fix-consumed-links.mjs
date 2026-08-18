/**
 * 교정 — 손 교정이 sync 에 취소되지 않도록 `consumedHeatId` 로 정확히 연결한다. (2026-08-18)
 *
 * 배경:
 *   sync 는 작업일보의 heatNo **문자열**로만 소진 근거를 찾았다. 그 문자열은 현장 손입력이라
 *   틀릴 수 있는데(옆 호선 판번호 오기), 틀리면 진짜 소진된 판이 근거 없음으로 판정돼
 *   [새로고침] 한 번에 대기로 되돌아가고 절단일까지 지워졌다.
 *   실제로 오늘 교정한 B56848103 이 몇 시간 만에 그렇게 취소됐다.
 *   → sync 가 consumedHeatId 를 존중하도록 고쳤고(이 커밋), 여기서 그 연결을 실제로 채운다.
 *
 * 원칙: **작업일보의 heatNo 문자열은 건드리지 않는다**(사용자 지시). 실제 소진 판만 기록한다.
 *   consumedHeatId 는 스키마 주석 그대로 "절단완료 시 '실제로' 소진한 판번호 id" 이고
 *   heatNo(손입력 의도)와 달라도 되는 필드다.
 *
 * 대상 2건:
 *   ① KYTS-1022 / S50PS / CNX039 — 로그 heatNo="PP79328103"(KYTS-1023 의 SHIPPED 판, 오기)
 *      실제 소진 = B56848103 (같은 사양 KYTS-1022 A 12×2450×11600)
 *   ② KYTS-1022 / S70PS / CNK001 — 로그 heatNo="B56927905"(CNK002 와 중복 기록)
 *      실제 소진 = B56918601 (같은 사양 AH32 17.5×2590×10690) + 철판 1장 절단완료
 *
 * 실행:  node scripts/fix-consumed-links.mjs          (미리보기)
 *        node scripts/fix-consumed-links.mjs --apply  (반영 + undo JSON)
 */
import "dotenv/config";
import fs from "node:fs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const APPLY = process.argv.includes("--apply");
const d = (x) => (x ? new Date(x).toISOString().slice(0, 16).replace("T", " ") : "-");

const CASES = [
  { name: "S50PS / CNX039", logId: "cmq5wocuy000601p7laeyaooz", heatNo: "B56848103",
    spec: { vesselCode: "KYTS-1022", material: "A", thickness: 12, width: 2450, length: 11600 }, plan: false },
  { name: "S70PS / CNK001", logId: null, drawingNo: "CNK001", heatNo: "B56918601",
    spec: { vesselCode: "KYTS-1022", material: "AH32", thickness: 17.5, width: 2590, length: 10690 }, plan: true },
];

const undo = { purpose: "consumedHeatId 연결 + 판번호/철판 절단완료 교정 되돌리기", appliedAt: new Date().toISOString(), items: [] };
let ok = true;

for (const c of CASES) {
  console.log("=".repeat(70));
  console.log(`■ ${c.name}`);

  // 작업일보 특정
  const log = c.logId
    ? await prisma.cuttingLog.findUnique({ where: { id: c.logId }, include: { drawingList: { select: { block: true, drawingNo: true } } } })
    : await prisma.cuttingLog.findFirst({
        where: { status: "COMPLETED", drawingList: { drawingNo: c.drawingNo, block: "S70PS" },
                 thickness: c.spec.thickness, width: c.spec.width, length: c.spec.length },
        include: { drawingList: { select: { block: true, drawingNo: true } } },
      });
  if (!log) { console.log("   ✖ 작업일보 못 찾음 — 건너뜀"); ok = false; continue; }
  console.log(`   작업일보 ${log.drawingList?.block}/${log.drawingList?.drawingNo}  heatNo="${log.heatNo}" (그대로 둠)  consumed=${log.consumedHeatId ?? "없음"}  종료=${d(log.endAt)}`);

  // 판번호 특정 (사양 완전일치 1건이어야 함)
  const heats = await prisma.steelPlanHeat.findMany({ where: { heatNo: c.heatNo, ...c.spec } });
  if (heats.length !== 1) { console.log(`   ✖ 판번호 ${c.heatNo} 가 ${heats.length}건 — 건너뜀`); ok = false; continue; }
  const heat = heats[0];
  console.log(`   판번호 ${heat.heatNo} [${heat.status}] 절단일=${d(heat.cutAt)}`);

  // 철판 (S70PS 만)
  let plan = null;
  if (c.plan) {
    const cands = await prisma.steelPlan.findMany({ where: { ...c.spec, status: { in: ["REGISTERED", "RECEIVED", "ISSUED"] } } });
    if (cands.length !== 1) { console.log(`   ✖ 재고 철판이 ${cands.length}장 — 건너뜀`); ok = false; continue; }
    plan = cands[0];
    console.log(`   철판 [${plan.status}] 확정=${plan.reservedFor ?? "-"} 출고일=${d(plan.issuedAt)} actualHeatNo=${plan.actualHeatNo ?? "-"}`);
  }

  console.log("   변경:");
  console.log(`     · 작업일보.consumedHeatId  ${log.consumedHeatId ?? "없음"} → ${heat.id}`);
  if (heat.status !== "CUT") console.log(`     · 판번호 ${heat.status} → CUT (절단일 ${d(log.endAt)})`);
  if (plan) console.log(`     · 철판 ${plan.status} → COMPLETED (actualHeatNo=${heat.heatNo}, issuedAt 유지 ${d(plan.issuedAt)})`);

  if (!APPLY) continue;

  undo.items.push({
    case: c.name,
    log: { id: log.id, before: { consumedHeatId: log.consumedHeatId } },
    heat: { id: heat.id, heatNo: heat.heatNo, before: { status: heat.status, cutAt: heat.cutAt } },
    ...(plan ? { plan: { id: plan.id, before: { status: plan.status, actualHeatNo: plan.actualHeatNo, issuedAt: plan.issuedAt } } } : {}),
  });

  await prisma.$transaction(async (tx) => {
    await tx.cuttingLog.update({ where: { id: log.id }, data: { consumedHeatId: heat.id } });
    if (heat.status !== "CUT") {
      await tx.steelPlanHeat.update({ where: { id: heat.id }, data: { status: "CUT", cutAt: log.endAt ?? new Date() } });
    }
    if (plan) {
      await tx.steelPlan.update({
        where: { id: plan.id },
        data: { status: "COMPLETED", actualHeatNo: heat.heatNo, actualVesselCode: c.spec.vesselCode,
                actualDrawingNo: log.drawingList?.drawingNo ?? null,
                issuedAt: plan.issuedAt ?? log.endAt ?? new Date() },
      });
    }
  });
  console.log("   ✔ 반영");
}

if (APPLY) {
  fs.writeFileSync("scripts/fix-consumed-links-undo.json", JSON.stringify(undo, null, 2), "utf8");
  console.log("\nundo: scripts/fix-consumed-links-undo.json");

  console.log("\n■ 사후 검증 — sync 가 다시 되돌리는가?");
  const activeLogs = await prisma.cuttingLog.findMany({ where: { status: "COMPLETED" }, select: { heatNo: true, consumedHeatId: true } });
  const nos = new Set(activeLogs.map(l => (l.heatNo ?? "").trim()).filter(Boolean));
  const ids = new Set(activeLogs.map(l => l.consumedHeatId).filter(Boolean));
  for (const c of CASES) {
    const h = await prisma.steelPlanHeat.findFirst({ where: { heatNo: c.heatNo, ...c.spec } });
    if (!h) continue;
    const safe = ids.has(h.id) || nos.has(h.heatNo.trim());
    console.log(`   ${c.heatNo} [${h.status}] 절단일=${d(h.cutAt)} → 새 sync 기준 ${safe ? "보호됨 ✔" : "여전히 되돌려짐 ✖"} (구 sync 기준 ${nos.has(h.heatNo.trim()) ? "보호" : "되돌려짐"})`);
  }
} else {
  console.log("\n(미리보기만 — 반영하려면 --apply)");
}
if (!ok) console.log("\n⚠ 일부 건을 건너뛰었다 — 위 ✖ 확인");

await prisma.$disconnect();

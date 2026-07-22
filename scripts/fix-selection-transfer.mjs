/**
 * fix-crossvessel-plan.mjs 최초 실행(2026-07-22 12:21)의 사후 교정.
 *
 * 무슨 일이 있었나:
 *   호선 유용 교정 스크립트가 "실제 잘린 타호선 강재" 를 고를 때 출고 선별(shipoutMarkedAt)
 *   가드가 없었다. 하필 정렬이 reservedFor nulls-first 라 선별강재를 1순위로 집었고
 *   (선별강재는 정의상 reservedFor=null), 그 결과 Steellist-1023-F10C(태금-1) 선별분 3장이
 *   COMPLETED 로 넘어가 "절단완료인데 선별 마킹이 살아 있는" R1(절단↔출고 상호배제) 위반이 됐다.
 *
 * 무엇이 맞는 상태인가:
 *   이 사양들은 야드에 실물이 딱 1장씩 남아 있고, 그 실물은 교정으로 되살린 작업호선(1022) 강재다.
 *   사무실이 07-14 에 선별한 것도 물리적으로는 그 1장이다(당시엔 1023 행으로 보였을 뿐).
 *   따라서 선별 마킹을 절단완료된 1023 행에서 → 입고로 살아있는 1022 행으로 옮긴다.
 *   선별 장수(3장)는 그대로 유지되고, 현장은 그 판번호로 출고담기에서 조회할 수 있게 된다.
 *
 * 사용:
 *   node scripts/fix-selection-transfer.mjs          # 조회만 (dry-run)
 *   node scripts/fix-selection-transfer.mjs --apply  # 적용 + 되돌리기 파일 생성
 */
import "dotenv/config";
import fs from "node:fs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const APPLY = process.argv.includes("--apply");
const SRC  = "scripts/fix-crossvessel-plan-undo.json";
const UNDO = "scripts/fix-selection-transfer-undo.json";

const F = (p) => `${p.vesselCode} ${p.material} ${p.thickness}×${p.width}×${p.length}`;

async function main() {
  const src = JSON.parse(fs.readFileSync(SRC, "utf8"));
  const sel = {
    id: true, vesselCode: true, material: true, thickness: true, width: true, length: true,
    status: true, reservedFor: true, shipoutMarkedAt: true, shipoutLabel: true, shipoutHeatNo: true,
  };

  const targets = [];
  const skipped = [];
  for (const it of src.items) {
    const [from, to] = await Promise.all([
      prisma.steelPlan.findUnique({ where: { id: it.rightPlan.id }, select: sel }),  // 절단완료 처리된 쪽
      prisma.steelPlan.findUnique({ where: { id: it.wrongPlan.id }, select: sel }),  // 되살린 쪽(실물)
    ]);
    if (!from || !to) { skipped.push(`${it.heatNo}: 강재 행을 못 찾음`); continue; }
    if (!from.shipoutMarkedAt) continue;                       // 마킹 없음 = 교정 대상 아님
    if (from.status === "RECEIVED") { skipped.push(`${it.heatNo}: 원본이 아직 입고 상태 — 손대지 않음`); continue; }

    // 실물(되살린 강재)이 이미 외부출고됐으면 그 선별은 목적을 달성한 것 —
    // 남은 마킹은 옮길 데가 아니라 지울 대상이다.
    if (to.status === "SHIPPED_OUT") {
      const shipped = await prisma.shipmentItem.findFirst({
        where: { steelPlanId: to.id, vehicle: { shipment: { status: "ACTIVE" } } },
        select: { heatNo: true, vehicle: { select: { shipment: { select: { shipmentNo: true } } } } },
      });
      if (!shipped) { skipped.push(`${it.heatNo}: 출고 상태인데 활성 출고장이 없음 — 손대지 않음`); continue; }
      targets.push({ heatNo: it.heatNo, from, to, mode: "clear", shipmentNo: shipped.vehicle?.shipment?.shipmentNo, shippedHeatNo: shipped.heatNo });
      continue;
    }

    if (to.status !== "RECEIVED")   { skipped.push(`${it.heatNo}: 옮길 대상이 입고 상태가 아님(${to.status})`); continue; }
    if (to.shipoutMarkedAt)         { skipped.push(`${it.heatNo}: 옮길 대상에 이미 선별 마킹 있음`); continue; }
    if (to.reservedFor)             { skipped.push(`${it.heatNo}: 옮길 대상이 블록확정 상태(${to.reservedFor})`); continue; }
    targets.push({ heatNo: it.heatNo, from, to, mode: "transfer" });
  }

  console.log(`■ 선별 마킹 교정 대상 ${targets.length}건${APPLY ? " — 적용 모드" : " — 조회만(dry-run)"}\n`);
  for (const t of targets) {
    console.log(`· ${t.heatNo}  [${t.from.shipoutLabel}] (마킹 ${t.from.shipoutMarkedAt.toISOString().slice(0, 10)})`);
    if (t.mode === "clear") {
      console.log(`    실물 ${F(t.to)} 는 이미 출고됨 — ${t.shipmentNo} (판번호 ${t.shippedHeatNo})`);
      console.log(`    → 선별 목적 달성. ${F(t.from)} ${t.from.status} 의 잔여 마킹만 해제`);
    } else {
      console.log(`    에서  ${F(t.from)}  ${t.from.status}  ← 절단완료. 마킹 해제`);
      console.log(`    으로  ${F(t.to)}  ${t.to.status}  ← 야드 실물. 마킹 부여`);
    }
  }
  if (skipped.length) {
    console.log(`\n건너뜀 ${skipped.length}건:`);
    skipped.forEach(s => console.log(`  · ${s}`));
  }
  if (!targets.length) { await prisma.$disconnect(); return; }

  if (!APPLY) {
    console.log(`\n실제 적용하려면: node scripts/fix-selection-transfer.mjs --apply`);
    await prisma.$disconnect();
    return;
  }

  const undo = {
    at: new Date().toISOString(),
    note: "fix-crossvessel-plan 최초 실행의 R1 위반 교정 — 선별 마킹 이관 또는 해제",
    items: targets.map(t => ({
      heatNo: t.heatNo, mode: t.mode, shipmentNo: t.shipmentNo ?? null,
      from: { id: t.from.id, shipoutMarkedAt: t.from.shipoutMarkedAt, shipoutLabel: t.from.shipoutLabel, shipoutHeatNo: t.from.shipoutHeatNo },
      to:   { id: t.to.id,   shipoutMarkedAt: t.to.shipoutMarkedAt,   shipoutLabel: t.to.shipoutLabel,   shipoutHeatNo: t.to.shipoutHeatNo },
    })),
  };
  fs.writeFileSync(UNDO, JSON.stringify(undo, null, 2), "utf8");
  console.log(`\n되돌리기 파일 저장: ${UNDO}`);

  await prisma.$transaction(async (tx) => {
    for (const t of targets) {
      // 실물이 아직 재고면 마킹을 그쪽으로 옮긴다. 이미 출고됐으면 옮길 필요 없이 해제만.
      if (t.mode === "transfer") {
        await tx.steelPlan.update({
          where: { id: t.to.id },
          data: {
            shipoutMarkedAt: t.from.shipoutMarkedAt,
            shipoutLabel:    t.from.shipoutLabel,
            shipoutHeatNo:   t.from.shipoutHeatNo,
          },
        });
      }
      await tx.steelPlan.update({
        where: { id: t.from.id },
        data: { shipoutMarkedAt: null, shipoutLabel: null, shipoutHeatNo: null },
      });
    }
  }, { timeout: 60_000 });

  console.log(`✔ ${targets.length}건 이관 완료`);
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error("오류:", e.message, "\n", e.stack); await prisma.$disconnect(); process.exit(1); });

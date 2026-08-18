/**
 * steel-plan/sync 가 [새로고침] 때마다 무엇을 되돌리는지 시뮬레이션 (읽기 전용).
 *
 * sync 규칙:
 *   ① SteelPlan  COMPLETED + actualHeatNo 가 활성 완료로그의 heatNo 집합에 없음  → RECEIVED
 *   ② SteelPlan  COMPLETED + actualHeatNo = null                                → RECEIVED  (신규: issuedAt 있으면 제외)
 *   ③ SteelPlanHeat  CUT + heatNo 가 활성 완료로그 집합에 없음                   → WAITING + cutAt=null
 *
 * 오늘 고친 B56848103 은 어느 작업일보에도 그 heatNo 가 없다 → ③ 에 걸리는지 확인이 목적.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const activeLogs = await prisma.cuttingLog.findMany({
  where: { status: "COMPLETED", heatNo: { not: "" } }, select: { heatNo: true },
});
const activeHeatNos = new Set(activeLogs.map(l => l.heatNo.trim()).filter(Boolean));
console.log(`활성 완료 작업일보 heatNo 종류: ${activeHeatNos.size}`);

// ①
const planA = await prisma.steelPlan.findMany({
  where: { status: "COMPLETED", actualHeatNo: { not: null } },
  select: { id: true, vesselCode: true, material: true, thickness: true, width: true, length: true, actualHeatNo: true, reservedFor: true, issuedAt: true },
});
const revertA = planA.filter(p => p.actualHeatNo && !activeHeatNos.has(p.actualHeatNo.trim()));
console.log(`\n■ ① COMPLETED + actualHeatNo 근거없음 → RECEIVED : ${revertA.length}장`);
for (const p of revertA.slice(0, 5)) console.log(`   · ${p.vesselCode} ${p.material} ${p.thickness}×${p.width}×${p.length} 확정=${p.reservedFor ?? "-"} actual=${p.actualHeatNo}`);
if (revertA.length > 5) console.log(`   … 외 ${revertA.length - 5}장`);

// ② (구 규칙 / 신 규칙 비교)
const oldB = await prisma.steelPlan.count({ where: { status: "COMPLETED", actualHeatNo: null } });
const newB = await prisma.steelPlan.count({ where: { status: "COMPLETED", actualHeatNo: null, issuedAt: null } });
console.log(`\n■ ② COMPLETED + actualHeatNo 없음 → RECEIVED`);
console.log(`   구 규칙: ${oldB}장   신 규칙(issuedAt 있으면 보호): ${newB}장   → ${oldB - newB}장 보호됨`);

// ③ ★ 핵심
const cutHeats = await prisma.steelPlanHeat.findMany({
  where: { status: "CUT" },
  select: { id: true, heatNo: true, vesselCode: true, material: true, thickness: true, width: true, length: true, cutAt: true },
});
const logsWithConsumed = await prisma.cuttingLog.findMany({ where: { status: "COMPLETED" }, select: { consumedHeatId: true } });
const consumedIds = new Set(logsWithConsumed.map(l => l.consumedHeatId).filter(Boolean));
const revertC    = cutHeats.filter(h => !activeHeatNos.has(h.heatNo.trim()));                        // 구 규칙(현재 배포본)
const revertCNew = cutHeats.filter(h => !consumedIds.has(h.id) && !activeHeatNos.has(h.heatNo.trim())); // 신 규칙
console.log(`\n■ ③ CUT 판번호 + 근거 작업일보 없음 → WAITING + 절단일 삭제 : ${revertC.length}건 / 전체 CUT ${cutHeats.length}건`);
for (const h of revertC.slice(0, 8)) console.log(`   · ${h.heatNo} ${h.vesselCode} ${h.thickness}×${h.width}×${h.length} 절단일=${h.cutAt ? h.cutAt.toISOString().slice(0,10) : "-"}`);
if (revertC.length > 8) console.log(`   … 외 ${revertC.length - 8}건`);

console.log(`   신 규칙(consumedHeatId 존중) 기준: ${revertCNew.length}건 → ${revertC.length - revertCNew.length}건 보호됨`);

const oldHit = revertC.find(h => h.heatNo === "B56848103");
const newHit = revertCNew.find(h => h.heatNo === "B56848103");
console.log(`
★ B56848103 — 구 규칙(현재 배포본): ${oldHit ? "되돌려짐 ✖" : "안전"} / 신 규칙: ${newHit ? "되돌려짐 ✖" : "보호됨 ✔"}`);

// ③ 이 되돌리면 아카이브 판정에도 영향 (cutAt 이 지워지므로)
const withCutAt = revertC.filter(h => h.cutAt != null).length;
console.log(`   그중 절단일이 있는 것: ${withCutAt}건 → 되돌려지면 절단일이 지워져 아카이브 판정축도 사라진다`);

await prisma.$disconnect();

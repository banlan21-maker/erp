// 유령/고아 데이터 스캔 — 어디에도 안 붙어 안전하게 정리 가능한 값 탐지 (읽기 전용).
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const up = (s) => (s ?? "").trim().toUpperCase();
const vk = (s) => (s ?? "").trim();
const specKey = (v, m, t, w, l) => `${vk(v)}|${up(m)}|${t}|${w}|${l}`;
const specStr = (m, t, w, l) => `${up(m)} ${t}×${w}×${l}`;

async function main() {
  const [plans, heats, draws] = await Promise.all([
    prisma.steelPlan.findMany({ select: { vesselCode: true, material: true, thickness: true, width: true, length: true, status: true, reservedFor: true } }),
    prisma.steelPlanHeat.findMany({ select: { id: true, vesselCode: true, material: true, thickness: true, width: true, length: true, heatNo: true, status: true } }),
    prisma.drawingList.findMany({ select: { block: true, project: { select: { projectCode: true } } } }),
  ]);

  // 강재 사양 집합
  const planSpecs = new Set(plans.map((p) => specKey(p.vesselCode, p.material, p.thickness, p.width, p.length)));

  // ── ① 유령 판번호: 강재목록에 대응 사양(호선+사양)이 아예 없는 판번호 행 ──────────
  const orphanHeats = heats.filter((h) => !planSpecs.has(specKey(h.vesselCode, h.material, h.thickness, h.width, h.length)));
  const ohByStatus = {};
  orphanHeats.forEach((h) => { ohByStatus[h.status] = (ohByStatus[h.status] ?? 0) + 1; });

  console.log(`${"═".repeat(72)}`);
  console.log(`① 유령 판번호 (강재목록에 대응 사양 없음) : 총 ${orphanHeats.length}행`);
  console.log(`   상태별: ${JSON.stringify(ohByStatus)}   ← 재고(WAITING)는 안전 삭제 가능, CUT/SHIPPED는 이력이라 확인 필요`);
  orphanHeats.slice(0, 20).forEach((h) => console.log(`   ${h.status.padEnd(8)} | ${h.vesselCode} | ${specStr(h.material, h.thickness, h.width, h.length)} | 판번호 ${h.heatNo}`));

  // ── ② 유령 확정: reservedFor 가 실제 존재하는 도면 블록과 안 맞음 ──────────────
  // 유효한 reservedFor 집합 = 모든 도면의 "projectCode/block" 및 "block"
  const validReserved = new Set();
  for (const d of draws) {
    const b = (d.block ?? "").trim();
    if (!b) continue;
    validReserved.add(b);
    if (d.project?.projectCode) validReserved.add(`${d.project.projectCode}/${b}`);
  }
  const ghostReserved = plans.filter((p) => p.reservedFor && !validReserved.has(p.reservedFor.trim()));
  const grByStatus = {};
  ghostReserved.forEach((p) => { grByStatus[p.status] = (grByStatus[p.status] ?? 0) + 1; });

  console.log(`\n${"═".repeat(72)}`);
  console.log(`② 유령 확정 (강재 reservedFor 인데 그 블록 도면이 존재 안 함) : 총 ${ghostReserved.length}장`);
  console.log(`   상태별: ${JSON.stringify(grByStatus)}   ← 재고/투입(RECEIVED/ISSUED)이면 확정만 안전 해제(reservedFor=null) 가능`);
  const grAgg = {};
  ghostReserved.forEach((p) => { const k = `${p.reservedFor} (${p.status})`; grAgg[k] = (grAgg[k] ?? 0) + 1; });
  Object.entries(grAgg).sort((a, b) => b[1] - a[1]).slice(0, 25).forEach(([k, c]) => console.log(`   ${k} × ${c}장`));

  // ── ③ 참고: reservedFor 분포 (전체) ─────────────────────────────────────────
  const allReserved = plans.filter((p) => p.reservedFor);
  console.log(`\n(참고) 전체 확정된 강재: ${allReserved.length}장 / 그중 유령확정: ${ghostReserved.length}장`);

  await prisma.$disconnect();
}
main().catch(async (e) => { console.error("오류:", e.message); await prisma.$disconnect(); process.exit(1); });

// 유령(과다 소진) 전체 스윕 — 같은 사양·호선에서 같은 판번호(actualHeatNo)가 강재 2장 이상에 붙은 것 탐지.
// (물리적으로 한 판번호=철판 1장 → 2장에 붙으면 하나는 유령). 되돌릴 대상은 '미확정+실물위치 있음' 우선.
// 읽기 전용(미리보기). 적용은 --apply.
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const APPLY = process.argv.includes("--apply");

const up = (s) => (s ?? "").trim().toUpperCase();
const specKey = (v, m, t, w, l) => `${(v ?? "").trim()}|${up(m)}|${t}|${w}|${l}`;
const specStr = (v, m, t, w, l) => `${(v ?? "").trim()} ${up(m)} ${t}×${w}×${l}`;

async function main() {
  console.log(`모드: ${APPLY ? "★ 적용(APPLY) ★" : "미리보기(dry-run)"}\n`);

  const [plans, heats, logs] = await Promise.all([
    prisma.steelPlan.findMany({ select: { id: true, vesselCode: true, material: true, thickness: true, width: true, length: true,
      status: true, actualHeatNo: true, reservedFor: true, storageLocation: true, uploadBatchNo: true, createdAt: true } }),
    prisma.steelPlanHeat.findMany({ select: { vesselCode: true, material: true, thickness: true, width: true, length: true, heatNo: true, status: true } }),
    prisma.cuttingLog.findMany({ where: { status: "COMPLETED", isUrgent: false, heatNo: { not: "" } },
      select: { heatNo: true, material: true, thickness: true, width: true, length: true,
        project: { select: { projectCode: true } }, drawingList: { select: { alternateVesselCode: true } } } }),
  ]);

  // 사양별 실제 절단 판번호(작업일보)
  const cutBySpec = new Map();
  for (const lg of logs) {
    const v = lg.drawingList?.alternateVesselCode?.trim() || lg.project?.projectCode || "";
    const k = specKey(v, lg.material, lg.thickness, lg.width, lg.length);
    (cutBySpec.get(k) ?? cutBySpec.set(k, new Set()).get(k)).add(up(lg.heatNo));
  }
  // 사양별 판번호 CUT 수
  const heatCutBySpec = new Map();
  for (const h of heats) if (h.status === "CUT") {
    const k = specKey(h.vesselCode, h.material, h.thickness, h.width, h.length);
    heatCutBySpec.set(k, (heatCutBySpec.get(k) ?? 0) + 1);
  }

  // 사양별 COMPLETED 강재를 actualHeatNo 로 그룹
  const complBySpec = new Map();
  for (const p of plans) if (p.status === "COMPLETED" && p.actualHeatNo) {
    const k = specKey(p.vesselCode, p.material, p.thickness, p.width, p.length);
    (complBySpec.get(k) ?? complBySpec.set(k, new Map()).get(k));
    const byHeat = complBySpec.get(k);
    const hk = up(p.actualHeatNo);
    (byHeat.get(hk) ?? byHeat.set(hk, []).get(hk)).push(p);
  }

  const revert = [];      // 되돌릴 유령(안전: 미확정)
  const ambiguous = [];   // 중복인데 되돌릴 후보가 확정됨 → 수동
  const orphanReview = []; // actualHeatNo 가 작업일보에 없음(중복 아님) → 검토

  for (const [k, byHeat] of complBySpec) {
    const cutSet = cutBySpec.get(k) ?? new Set();
    for (const [hk, arr] of byHeat) {
      if (arr.length >= 2) {
        // keepScore: 확정(+2), 위치없음=소진(+1) 높을수록 진짜 → 하나 남기고 나머지 유령
        arr.sort((a, b) => ((b.reservedFor ? 2 : 0) + (b.storageLocation ? 0 : 1)) - ((a.reservedFor ? 2 : 0) + (a.storageLocation ? 0 : 1)));
        for (const p of arr.slice(1)) {
          if (!p.reservedFor) revert.push({ k, hk, p });
          else ambiguous.push({ k, hk, p });
        }
      } else if (!cutSet.has(hk)) {
        // 중복은 아니지만 작업일보에 근거 없는 절단 → 검토(자동 아님)
        orphanReview.push({ k, hk, p: arr[0] });
      }
    }
  }

  const L = "─".repeat(76);
  console.log(L);
  console.log(`유령(과다 소진) 스윕 결과:`);
  console.log(`  ▶ 되돌릴 유령 강재(안전, 미확정 중복)  : ${revert.length} 장   ← 자동 복구 대상`);
  console.log(`  · 중복이나 되돌릴 쪽이 확정됨 — 수동    : ${ambiguous.length} 장`);
  console.log(`  · 근거없는 절단(중복 아님) — 검토       : ${orphanReview.length} 장`);
  console.log(L);

  // 사양별 집계
  const bySpecCount = new Map();
  for (const r of revert) bySpecCount.set(r.k, (bySpecCount.get(r.k) ?? 0) + 1);
  console.log(`\n[되돌릴 유령 — 사양별] ${bySpecCount.size}개 사양`);
  [...bySpecCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40).forEach(([k, c]) => {
    const p = revert.find((r) => r.k === k).p;
    console.log(`  ${specStr(p.vesselCode, p.material, p.thickness, p.width, p.length)} : ${c}장`);
  });

  console.log(`\n[되돌릴 유령 — 개별 상위 30]`);
  revert.slice(0, 30).forEach(({ hk, p }) => console.log(`  ${specStr(p.vesselCode, p.material, p.thickness, p.width, p.length)} | 판번호 ${hk} | 위치=${p.storageLocation ?? "-"} | 배치=${p.uploadBatchNo ?? "-"}`));

  if (ambiguous.length) {
    console.log(`\n[수동 검토 — 중복인데 되돌릴 쪽이 확정됨] 상위 15`);
    ambiguous.slice(0, 15).forEach(({ hk, p }) => console.log(`  ${specStr(p.vesselCode, p.material, p.thickness, p.width, p.length)} | 판번호 ${hk} | 확정=${p.reservedFor} | 위치=${p.storageLocation ?? "-"}`));
  }
  if (orphanReview.length) {
    console.log(`\n[검토 — 작업일보 근거없는 절단(중복 아님)] 상위 15`);
    orphanReview.slice(0, 15).forEach(({ hk, p }) => console.log(`  ${specStr(p.vesselCode, p.material, p.thickness, p.width, p.length)} | 판번호 ${hk} | 확정=${p.reservedFor ?? "-"} | 위치=${p.storageLocation ?? "-"}`));
  }

  if (APPLY) {
    console.log(`\n적용 중… (유령 ${revert.length}장 → 재고)`);
    await prisma.$transaction(async (tx) => {
      for (const { p } of revert) await tx.steelPlan.update({ where: { id: p.id }, data: { status: "RECEIVED", actualHeatNo: null, actualVesselCode: null, actualDrawingNo: null } });
    }, { timeout: 120000 });
    console.log(`✔ 완료.`);
  } else {
    console.log(`\n※ 미리보기입니다. 적용: node scripts/find-phantoms.mjs --apply`);
  }
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error("오류:", e.message); await prisma.$disconnect(); process.exit(1); });

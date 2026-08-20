/**
 * 강재매칭 커버리지 — 라벨 귀속 적용 후 판정 확인 (읽기 전용).
 * 새 규칙: 잔재도 shipoutLabel = 매칭이름 인 것만 그 작업에 잡힌다(원판과 대칭).
 * 전 규칙과 나란히 세어 무엇이 달라졌는지 보여준다.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const p = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const fmtT = (v) => parseFloat(Number(v).toFixed(1));
const fmtL = (v) => Math.round(Number(v));
const up = (x) => (x ?? "").trim().toUpperCase();

const matchPlate = (s, x) =>
  (!s.vesselCode || x.vesselCode === s.vesselCode) &&
  up(x.material) === up(s.material) &&
  fmtT(x.thickness) === fmtT(s.thickness) &&
  fmtL(x.width) === fmtL(s.width) && fmtL(x.length) === fmtL(s.length);

const matchRem = (s, r) =>
  up(r.material) === up(s.material) &&
  fmtT(r.thickness) === fmtT(s.thickness) &&
  fmtL(r.width1 ?? -1) === fmtL(s.width) && fmtL(r.length1 ?? -1) === fmtL(s.length);

// computeCoverage 재현 — 출고(강재→잔재) → 선별(강재→잔재) 순으로 소비
const coverage = (specs, src) => {
  const cov = new Array(specs.length).fill(null);
  const eat = (rows, state, fn) => {
    for (const r of rows) {
      const i = specs.findIndex((s, k) => cov[k] === null && fn(s, r));
      if (i >= 0) cov[i] = state;
    }
  };
  eat(src.shippedPlates, "출고", matchPlate);
  eat(src.shippedRemnants, "출고", matchRem);
  eat(src.markedPlates, "선별", matchPlate);
  eat(src.markedRemnants, "선별", matchRem);
  return cov;
};

const remSel = { material: true, thickness: true, width1: true, length1: true, shipoutLabel: true };
const specSel = { vesselCode: true, material: true, thickness: true, width: true, length: true };

const jobs = await p.steelMatchJob.findMany({ orderBy: { createdAt: "desc" } });
console.log(`■ 매칭작업 ${jobs.length}개 — 옛 규칙 vs 새 규칙\n`);
console.log("   작업이름".padEnd(38) + "사양   [옛] 선별 출고   [새] 선별 출고   변화");

let totalFixed = 0;
for (const job of jobs) {
  const specs = Array.isArray(job.specs) ? job.specs : [];
  const [shippedPlates, markedPlates, allMarkedRem, allShipRem] = await Promise.all([
    p.steelPlan.findMany({ where: { status: "SHIPPED_OUT", shipoutLabel: job.name }, select: specSel }),
    p.steelPlan.findMany({ where: { shipoutMarkedAt: { not: null }, shipoutLabel: job.name }, select: specSel }),
    p.remnant.findMany({ where: { shipoutMarkedAt: { not: null }, status: { not: "EXHAUSTED" }, reservedFor: null }, select: remSel }),
    p.shipmentItem.findMany({
      where: { remnantId: { not: null }, vehicle: { shipment: { status: "ACTIVE" } } },
      select: { remnant: { select: remSel } },
    }),
  ]);
  const shipRemAll = allShipRem.map(x => x.remnant).filter(Boolean);

  const old = coverage(specs, { shippedPlates, markedPlates, markedRemnants: allMarkedRem, shippedRemnants: shipRemAll });
  const neu = coverage(specs, {
    shippedPlates, markedPlates,
    markedRemnants: allMarkedRem.filter(r => r.shipoutLabel === job.name),
    shippedRemnants: shipRemAll.filter(r => r.shipoutLabel === job.name),
  });

  const c = (arr, v) => arr.filter(x => x === v).length;
  const oSel = c(old, "선별"), oShip = c(old, "출고");
  const nSel = c(neu, "선별"), nShip = c(neu, "출고");
  const diff = (oSel + oShip) - (nSel + nShip);
  totalFixed += diff;
  const mark = diff > 0 ? `  ← 오판 ${diff}건 해소` : "";
  console.log(`   ${job.name.padEnd(36)} ${String(specs.length).padStart(3)}    ${String(oSel).padStart(4)} ${String(oShip).padStart(4)}       ${String(nSel).padStart(4)} ${String(nShip).padStart(4)}${mark}`);
}
console.log(`\n■ 잘못 잡히던 것 합계: ${totalFixed}건`);
console.log("   (기존 출고·선별 잔재는 라벨이 없어 어느 목록에도 안 잡힌다 — 앞으로 강재매칭에서 선별하면 라벨이 붙는다)");
await p.$disconnect();

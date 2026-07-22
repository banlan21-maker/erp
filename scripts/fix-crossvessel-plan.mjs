/**
 * 호선 유용 절단으로 재고가 뒤바뀐 건 교정 — 실물 기준.
 *
 * 증상: 1022 블록을 1023 철판으로 자르면서 대체호선을 지정하지 않아
 *   · 강재 차감은 작업 호선(1022)에서 일어나고            → 야드에 있는 철판이 장부엔 없음
 *   · 판번호 소진은 호선 필터에 걸려 아예 안 일어남        → 유령 WAITING 잔존
 *   · 실제 잘린 철판(1023)은 장부에 입고로 살아 있음      → 장부에 있는 철판이 야드엔 없음
 *
 * 교정 (실물 기준):
 *   1. 잘못 차감된 작업호선 강재  COMPLETED → RECEIVED (확정/아카이브/절단흔적 해제)
 *   2. 실제 잘린 타호선 강재      RECEIVED  → COMPLETED (확정/절단흔적을 이관)
 *   3. 실제 잘린 타호선 판번호    WAITING   → CUT
 *   4. 작업일보에 consumedHeatId 기록 (절단취소 시 정확히 되돌아가도록)
 *
 * 사용:
 *   node scripts/fix-crossvessel-plan.mjs          # 조회만 (dry-run)
 *   node scripts/fix-crossvessel-plan.mjs --apply  # 실제 적용 + undo 파일 생성
 */
import "dotenv/config";
import fs from "node:fs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const APPLY = process.argv.includes("--apply");
const UNDO = "scripts/fix-crossvessel-plan-undo.json";

async function collect() {
  const logs = await prisma.cuttingLog.findMany({
    where: { status: "COMPLETED", isUrgent: false, consumedHeatId: null },
    select: {
      id: true, heatNo: true, drawingNo: true, endAt: true,
      material: true, thickness: true, width: true, length: true,
      project: { select: { projectCode: true } },
      drawingList: { select: { block: true, alternateVesselCode: true, assignedRemnantId: true } },
    },
  });

  const targets = [];
  for (const log of logs) {
    if (log.drawingList?.assignedRemnantId) continue;                 // 잔재 절단은 대상 아님
    if (!log.material || !log.thickness || !log.width || !log.length) continue;
    const hn = (log.heatNo ?? "").trim();
    if (!hn) continue;
    const ev = log.drawingList?.alternateVesselCode?.trim() || log.project?.projectCode;
    if (!ev) continue;
    const spec = { material: log.material, thickness: log.thickness, width: log.width, length: log.length };

    // 입력 판번호가 '작업 호선이 아닌 다른 호선' 소속이고 아직 WAITING 인가
    const heats = await prisma.steelPlanHeat.findMany({ where: { heatNo: hn, ...spec } });
    if (heats.some(h => h.vesselCode === ev)) continue;               // 작업호선에 있으면 유용 아님
    const heat = heats.find(h => h.status === "WAITING");
    if (!heat) continue;                                             // 이미 소진됐으면 교정 불필요

    // 잘못 차감된 작업호선 강재 — applyCuttingComplete 가 남긴 흔적으로 특정
    const wrong = await prisma.steelPlan.findFirst({
      where: { vesselCode: ev, ...spec, status: "COMPLETED", actualHeatNo: hn, actualDrawingNo: log.drawingNo },
      orderBy: { createdAt: "asc" },
    });
    if (!wrong) continue;

    // 실제 잘린 타호선 강재 — 그 판번호의 호선·사양으로 아직 입고로 남아 있는 것.
    // 미확정(reservedFor=null) 을 먼저 고른다 — 남의 호선 절단계획에 잡힌 강재를 빼앗지 않기 위함.
    const right = await prisma.steelPlan.findFirst({
      where: { vesselCode: heat.vesselCode, ...spec, status: "RECEIVED" },
      orderBy: [
        { reservedFor: { sort: "asc", nulls: "first" } },
        { receivedAt: "asc" },
        { createdAt: "asc" },
      ],
    });
    if (!right) continue;

    targets.push({ log, heat, wrong, right, ev });
  }
  return targets;
}

const f = (n) => (n == null ? "-" : String(n));

/**
 * lib/sync-drawing-spec.ts 의 syncDrawingListBySpec 를 그대로 옮긴 것.
 * 강재를 되살리고/차감했으므로 해당 (호선+규격) 도면 상태를 다시 계산해야 한다.
 * CUT 도면은 제외되므로 이미 절단완료된 도면이 되돌아가지는 않는다.
 */
async function syncDrawingListBySpec(tx, effectiveVessel, material, thickness, width, length) {
  const norm = material.trim().toUpperCase();
  const candidates = await tx.drawingList.findMany({
    where: {
      material: { equals: norm, mode: "insensitive" },
      thickness, width, length,
      assignedRemnantId: null,
      NOT: { status: "CUT" },
      OR: [
        { alternateVesselCode: effectiveVessel },
        { alternateVesselCode: null, project: { projectCode: effectiveVessel } },
      ],
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, block: true, status: true, project: { select: { projectCode: true } } },
  });
  if (candidates.length === 0) return;

  const plans = await tx.steelPlan.findMany({
    where: {
      vesselCode: effectiveVessel,
      material: { equals: norm, mode: "insensitive" },
      thickness, width, length,
      status: { in: ["REGISTERED", "RECEIVED", "ISSUED"] },
      shipoutMarkedAt: null,
    },
    select: { status: true, reservedFor: true },
  });

  if (plans.length === 0) {
    const ids = candidates.filter(r => r.status !== "CAUTION").map(r => r.id);
    if (ids.length) await tx.drawingList.updateMany({ where: { id: { in: ids } }, data: { status: "CAUTION" } });
    return;
  }

  const reservedPool = plans.filter(p =>
    (p.status === "RECEIVED" || p.status === "ISSUED") && p.reservedFor !== null);

  const byBlock = new Map();
  for (const row of candidates) {
    const key = `${row.project.projectCode}|${row.block ?? "UNKNOWN"}`;
    if (!byBlock.has(key)) byBlock.set(key, []);
    byBlock.get(key).push(row);
  }

  const toRegistered = [], toWaiting = [];
  for (const rows of byBlock.values()) {
    const newFmt = `${rows[0].project.projectCode}/${rows[0].block ?? "UNKNOWN"}`;
    const blockCode = rows[0].block ?? "UNKNOWN";
    const confirmedCount = reservedPool.filter(p => p.reservedFor === newFmt || p.reservedFor === blockCode).length;
    for (let i = 0; i < rows.length; i++) {
      const newStatus = i < confirmedCount ? "WAITING" : "REGISTERED";
      if (rows[i].status === newStatus) continue;
      (newStatus === "WAITING" ? toWaiting : toRegistered).push(rows[i].id);
    }
  }
  if (toWaiting.length)    await tx.drawingList.updateMany({ where: { id: { in: toWaiting } },    data: { status: "WAITING" } });
  if (toRegistered.length) await tx.drawingList.updateMany({ where: { id: { in: toRegistered } }, data: { status: "REGISTERED" } });
}

async function main() {
  const targets = await collect();
  console.log(`■ 교정 대상 ${targets.length}건${APPLY ? " — 적용 모드" : " — 조회만(dry-run)"}\n`);
  for (const t of targets) {
    console.log(`· 판번호 ${t.heat.heatNo}  (${t.log.material} ${t.log.thickness}×${t.log.width}×${t.log.length}, 도면 ${t.log.drawingNo}, 블록 ${t.log.drawingList?.block ?? "-"}, 절단 ${t.log.endAt?.toISOString().slice(0, 10) ?? "-"})`);
    console.log(`    되살림  ${t.wrong.vesselCode} 강재  ${t.wrong.status} → RECEIVED   (확정 ${f(t.wrong.reservedFor)} 해제, 아카이브 ${t.wrong.archivedAt ? "해제" : "없음"})`);
    console.log(`    차감    ${t.right.vesselCode} 강재  ${t.right.status} → COMPLETED  (확정 ${f(t.right.reservedFor)} → ${f(t.wrong.reservedFor)})`);
    console.log(`    소진    ${t.heat.vesselCode} 판번호 ${t.heat.status} → CUT`);
  }
  if (!targets.length) { await prisma.$disconnect(); return; }

  if (!APPLY) {
    console.log(`\n실제 적용하려면: node scripts/fix-crossvessel-plan.mjs --apply`);
    await prisma.$disconnect();
    return;
  }

  // 영향 받는 (호선+규격) 도면 상태도 미리 스냅샷 — sync 로 바뀔 수 있으므로
  const affectedSpecs = new Map();
  for (const t of targets) {
    for (const v of [t.wrong.vesselCode, t.right.vesselCode]) {
      const key = `${v}|${t.log.material}|${t.log.thickness}|${t.log.width}|${t.log.length}`;
      if (!affectedSpecs.has(key)) affectedSpecs.set(key, { v, m: t.log.material, th: t.log.thickness, w: t.log.width, l: t.log.length });
    }
  }
  const drawingSnapshot = [];
  for (const { v, m, th, w, l } of affectedSpecs.values()) {
    const rows = await prisma.drawingList.findMany({
      where: {
        material: { equals: m.trim().toUpperCase(), mode: "insensitive" },
        thickness: th, width: w, length: l,
        assignedRemnantId: null, NOT: { status: "CUT" },
        OR: [{ alternateVesselCode: v }, { alternateVesselCode: null, project: { projectCode: v } }],
      },
      select: { id: true, status: true },
    });
    drawingSnapshot.push(...rows);
  }

  // 되돌리기 스냅샷 — 바꾸기 전 원본 값 전체
  const undo = {
    drawings: drawingSnapshot,
    at: new Date().toISOString(),
    note: "호선 유용 절단으로 뒤바뀐 강재/판번호 실물기준 교정",
    items: targets.map(t => ({
      logId: t.log.id, heatNo: t.heat.heatNo,
      wrongPlan: { id: t.wrong.id, status: t.wrong.status, reservedFor: t.wrong.reservedFor, archivedAt: t.wrong.archivedAt, issuedAt: t.wrong.issuedAt, actualHeatNo: t.wrong.actualHeatNo, actualVesselCode: t.wrong.actualVesselCode, actualDrawingNo: t.wrong.actualDrawingNo },
      rightPlan: { id: t.right.id, status: t.right.status, reservedFor: t.right.reservedFor, archivedAt: t.right.archivedAt, issuedAt: t.right.issuedAt, actualHeatNo: t.right.actualHeatNo, actualVesselCode: t.right.actualVesselCode, actualDrawingNo: t.right.actualDrawingNo },
      heat: { id: t.heat.id, status: t.heat.status, cutAt: t.heat.cutAt },
      log: { id: t.log.id, consumedHeatId: null },
    })),
  };
  fs.writeFileSync(UNDO, JSON.stringify(undo, null, 2), "utf8");
  console.log(`\n되돌리기 파일 저장: ${UNDO}`);

  await prisma.$transaction(async (tx) => {
    for (const t of targets) {
      // 1. 잘못 차감된 강재 되살리기 — 확정/아카이브/절단흔적 전부 해제해 출고 가능 상태로
      await tx.steelPlan.update({
        where: { id: t.wrong.id },
        data: {
          status: "RECEIVED", reservedFor: null, archivedAt: null, issuedAt: null,
          actualHeatNo: null, actualVesselCode: null, actualDrawingNo: null,
        },
      });
      // 2. 실제 잘린 강재 차감 — 원래 강재가 갖고 있던 확정/절단 흔적을 이관
      await tx.steelPlan.update({
        where: { id: t.right.id },
        data: {
          status: "COMPLETED",
          reservedFor:      t.wrong.reservedFor,
          issuedAt:         t.wrong.issuedAt ?? t.log.endAt ?? new Date(),
          archivedAt:       t.wrong.archivedAt,
          actualHeatNo:     t.wrong.actualHeatNo,
          actualVesselCode: t.wrong.actualVesselCode,
          actualDrawingNo:  t.wrong.actualDrawingNo,
        },
      });
      // 3. 실제 잘린 판번호 소진
      await tx.steelPlanHeat.update({
        where: { id: t.heat.id },
        data: { status: "CUT", cutAt: t.log.endAt ?? new Date() },
      });
      // 4. 절단취소 시 정확히 이 판이 되돌아가도록 기록
      await tx.cuttingLog.update({ where: { id: t.log.id }, data: { consumedHeatId: t.heat.id } });
    }
    // 5. 강재 풀이 바뀐 (호선+규격) 도면 상태 재계산 — 중복 제거 후 1회씩
    const specs = new Map();
    for (const t of targets) {
      for (const v of [t.wrong.vesselCode, t.right.vesselCode]) {
        const key = `${v}|${t.log.material}|${t.log.thickness}|${t.log.width}|${t.log.length}`;
        if (!specs.has(key)) specs.set(key, [v, t.log.material, t.log.thickness, t.log.width, t.log.length]);
      }
    }
    for (const [v, m, th, w, l] of specs.values()) await syncDrawingListBySpec(tx, v, m, th, w, l);
  }, { timeout: 120_000 });

  console.log(`✔ ${targets.length}건 교정 완료`);
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error("오류:", e.message, "\n", e.stack); await prisma.$disconnect(); process.exit(1); });

// 강재 절단완료 보정 — 작업일보(진실) 기준으로 '멈춘 확정 철판'을 절단완료로 맞춘다.
// 기본은 dry-run(미리보기, 변경 없음). 실제 적용은 --apply 플래그. (트랜잭션)
// 대체호선(교차 호선)·유령(근거없는 절단)은 자동 대상에서 제외하고 목록만 보고한다.
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { writeFileSync } from "node:fs";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const APPLY = process.argv.includes("--apply");

const up = (s) => (s ?? "").trim().toUpperCase();
const vk = (s) => (s ?? "").trim();
const specKey = (v, m, t, w, l) => `${vk(v)}|${up(m)}|${t}|${w}|${l}`;
const hKey = (v, m, t, w, l, h) => `${specKey(v, m, t, w, l)}|${up(h)}`;
const specStr = (m, t, w, l) => `${up(m)} ${t}×${w}×${l}`;

async function main() {
  console.log(`모드: ${APPLY ? "★★★ 적용(APPLY) — 실제 DB 변경 ★★★" : "미리보기(dry-run) — 변경 없음"}\n`);

  const [plans, heats, logs] = await Promise.all([
    prisma.steelPlan.findMany({ select: { id: true, vesselCode: true, material: true, thickness: true, width: true, length: true,
      status: true, actualHeatNo: true, reservedFor: true, shipoutMarkedAt: true, createdAt: true } }),
    prisma.steelPlanHeat.findMany({ select: { id: true, vesselCode: true, material: true, thickness: true, width: true, length: true, heatNo: true, status: true } }),
    prisma.cuttingLog.findMany({ where: { status: "COMPLETED", isUrgent: false, heatNo: { not: "" } },
      select: { heatNo: true, material: true, thickness: true, width: true, length: true, drawingNo: true,
        project: { select: { projectCode: true } }, drawingList: { select: { alternateVesselCode: true, block: true } } } }),
  ]);

  // 인덱스
  const plansBySpec = new Map();
  for (const p of plans) { const k = specKey(p.vesselCode, p.material, p.thickness, p.width, p.length); (plansBySpec.get(k) ?? plansBySpec.set(k, []).get(k)).push(p); }
  const heatByHKey = new Map();
  const heatBySpecNoV = new Map(); // 사양(호선무시) → heats  (대체호선 탐지용)
  for (const h of heats) {
    (heatByHKey.get(hKey(h.vesselCode, h.material, h.thickness, h.width, h.length, h.heatNo)) ?? heatByHKey.set(hKey(h.vesselCode, h.material, h.thickness, h.width, h.length, h.heatNo), []).get(hKey(h.vesselCode, h.material, h.thickness, h.width, h.length, h.heatNo))).push(h);
    const snv = `${up(h.material)}|${h.thickness}|${h.width}|${h.length}|${up(h.heatNo)}`;
    (heatBySpecNoV.get(snv) ?? heatBySpecNoV.set(snv, []).get(snv)).push(h);
  }
  // 이미 강재쪽에 반영된 판번호 (COMPLETED/SHIPPED_OUT + actualHeatNo)
  const accounted = new Set();
  for (const p of plans) if ((p.status === "COMPLETED" || p.status === "SHIPPED_OUT") && p.actualHeatNo)
    accounted.add(hKey(p.vesselCode, p.material, p.thickness, p.width, p.length, p.actualHeatNo));

  // 작업일보 → 절단된 실물(판번호+사양+호선), 판번호별 1건으로 축약
  const cutByHKey = new Map();
  for (const lg of logs) {
    const v = lg.drawingList?.alternateVesselCode?.trim() || lg.project?.projectCode || "";
    const k = hKey(v, lg.material, lg.thickness, lg.width, lg.length, lg.heatNo);
    if (!cutByHKey.has(k)) cutByHKey.set(k, { v, m: up(lg.material), t: lg.thickness, w: lg.width, l: lg.length,
      heatNo: up(lg.heatNo), block: lg.drawingList?.block ?? null, drawingNo: lg.drawingNo });
  }

  const planFlips = [];        // 절단완료로 보정할 확정 철판
  const heatFlips = [];        // 판번호 WAITING→CUT (①)
  const vesselMismatch = [];   // 대체호선(교차 호선) — 제외
  const skipNoPlan = [];       // 소진할 강재 없음
  const usedPlanIds = new Set();

  for (const [k, r] of cutByHKey) {
    const poolHeats = heatByHKey.get(k) ?? [];
    // 판번호풀에 이 호선으로 행이 없으면 → 대체호선(다른 호선에 같은 판번호+사양) 탐지
    if (poolHeats.length === 0) {
      const snv = `${r.m}|${r.t}|${r.w}|${r.l}|${r.heatNo}`;
      const other = (heatBySpecNoV.get(snv) ?? []).filter((h) => vk(h.vesselCode) !== r.v);
      if (other.length) { vesselMismatch.push({ ...r, otherVessel: other.map((h) => h.vesselCode).join("/") }); continue; }
      skipNoPlan.push({ ...r, reason: "판번호풀에 행 없음(대체호선 아님)" }); continue;
    }
    // 판번호 WAITING → CUT 보정 (아직 CUT 없으면)
    if (!poolHeats.some((h) => h.status === "CUT") && poolHeats.some((h) => h.status === "WAITING"))
      heatFlips.push(poolHeats.find((h) => h.status === "WAITING"));

    // 강재쪽 이미 반영됨?
    if (accounted.has(k)) continue;
    // 소진할 확정 철판 후보 (재고/투입, 미사용, 미선별)
    const sk = specKey(r.v, r.m, r.t, r.w, r.l);
    const allowed = new Set([`${r.v}/${r.block ?? ""}`, r.block ?? ""]);
    const cands = (plansBySpec.get(sk) ?? []).filter((p) =>
      (p.status === "RECEIVED" || p.status === "ISSUED") && !p.actualHeatNo && !p.shipoutMarkedAt && !usedPlanIds.has(p.id));
    // 확정블록 일치 우선 → 그다음 확정 아무거나 → 미확정 / FIFO
    cands.sort((a, b) => {
      const sa = allowed.has(a.reservedFor ?? "") ? 2 : (a.reservedFor ? 1 : 0);
      const sb = allowed.has(b.reservedFor ?? "") ? 2 : (b.reservedFor ? 1 : 0);
      return sb - sa || (a.createdAt - b.createdAt);
    });
    const pick = cands[0];
    if (pick) { usedPlanIds.add(pick.id); planFlips.push({ pick, r }); }
    else skipNoPlan.push({ ...r, reason: "소진할 강재(재고/투입) 없음" });
  }

  const L = "─".repeat(72);
  console.log(L);
  console.log(`보정 대상 요약:`);
  console.log(`  ▶ 강재 절단완료 보정(확정 철판)  : ${planFlips.length} 장`);
  console.log(`  ▶ 판번호 WAITING→CUT 보정        : ${heatFlips.length} 건`);
  console.log(`  · 대체호선(교차 호선) — 제외/별도 : ${vesselMismatch.length} 건`);
  console.log(`  · 소진할 강재 없음 — 확인필요     : ${skipNoPlan.length} 건`);
  console.log(L);

  // 확정블록 일치 여부 통계 (사장님 우려: 엉뚱한 철판 방지)
  const matchStat = { blockMatch: 0, reservedOther: 0, unreserved: 0 };
  for (const { pick, r } of planFlips) {
    const allowed = new Set([`${r.v}/${r.block ?? ""}`, r.block ?? ""]);
    if (allowed.has(pick.reservedFor ?? "")) matchStat.blockMatch++;
    else if (pick.reservedFor) matchStat.reservedOther++;
    else matchStat.unreserved++;
  }
  console.log(`\n[확정 철판 사용 검증] 절단완료 보정 ${planFlips.length}장 중:`);
  console.log(`  · 확정블록 정확히 일치한 철판 사용 : ${matchStat.blockMatch}  ← 사장님 우려 없는 케이스`);
  console.log(`  · 같은사양 다른블록 확정 철판 사용 : ${matchStat.reservedOther}`);
  console.log(`  · 미확정 철판 사용                 : ${matchStat.unreserved}`);

  console.log(`\n[강재 절단완료 보정 — 상위 25]`);
  planFlips.slice(0, 25).forEach(({ pick, r }) => {
    const allowed = new Set([`${r.v}/${r.block ?? ""}`, r.block ?? ""]);
    const tag = allowed.has(pick.reservedFor ?? "") ? "확정일치" : (pick.reservedFor ? "타블록확정" : "미확정");
    console.log(`  ${r.v} | ${specStr(r.m, r.t, r.w, r.l)} | 판번호 ${r.heatNo} | 도면 ${r.drawingNo}/${r.block ?? "-"} → 강재(${pick.status}, reserved=${pick.reservedFor ?? "-"}) 절단완료 [${tag}]`);
  });

  if (vesselMismatch.length) {
    console.log(`\n[대체호선(교차 호선) — 자동 제외, 별도 처리] 상위 25`);
    vesselMismatch.slice(0, 25).forEach((r) => console.log(`  판번호 ${r.heatNo} | ${specStr(r.m, r.t, r.w, r.l)} | 작업일보=${r.v} ↔ 판번호리스트=${r.otherVessel}`));
  }
  if (skipNoPlan.length) {
    console.log(`\n[소진할 강재 없음 — 확인 필요] 상위 15`);
    skipNoPlan.slice(0, 15).forEach((r) => console.log(`  판번호 ${r.heatNo} | ${r.v} | ${specStr(r.m, r.t, r.w, r.l)} | ${r.reason}`));
  }

  if (APPLY) {
    // 되돌리기 로그 저장 (id + 이전 상태) — 만일을 위해
    const undo = planFlips.map(({ pick }) => ({ id: pick.id, prevStatus: pick.status }));
    writeFileSync("scripts/repair-cut-undo.json", JSON.stringify(undo, null, 2), "utf8");
    console.log(`\n${L}\n적용 실행 중… (되돌리기 로그: scripts/repair-cut-undo.json)`);
    const chunk = (arr, n) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };
    for (const batch of chunk(heatFlips, 25))
      await Promise.all(batch.map((h) => prisma.steelPlanHeat.update({ where: { id: h.id }, data: { status: "CUT" } })));
    let done = 0;
    for (const batch of chunk(planFlips, 25)) {
      await Promise.all(batch.map(({ pick, r }) => prisma.steelPlan.update({ where: { id: pick.id },
        data: { status: "COMPLETED", actualHeatNo: r.heatNo, actualVesselCode: r.v, actualDrawingNo: r.drawingNo } })));
      done += batch.length;
      process.stdout.write(`\r  진행 ${done}/${planFlips.length}`);
    }
    console.log(`\n완료: 강재 ${planFlips.length}장 절단완료, 판번호 ${heatFlips.length}건 CUT 보정.`);
  } else {
    console.log(`\n※ 미리보기입니다. 실제 적용하려면:  node scripts/repair-cut.mjs --apply`);
  }
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error("오류:", e.message); await prisma.$disconnect(); process.exit(1); });

// 남은 진단 항목(전환누락·유령절단·중복절단)을 대체호선/중복/진짜문제로 분류 (읽기 전용).
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const up = (s) => (s ?? "").trim().toUpperCase();
const vk = (s) => (s ?? "").trim();
const hKey = (v, m, t, w, l, h) => `${vk(v)}|${up(m)}|${t}|${w}|${l}|${up(h)}`;
const svKey = (m, t, w, l, h) => `${up(m)}|${t}|${w}|${l}|${up(h)}`; // 호선무시 (대체호선 탐지)
const specStr = (m, t, w, l) => `${up(m)} ${t}×${w}×${l}`;

async function main() {
  const [heats, cutLogs] = await Promise.all([
    prisma.steelPlanHeat.findMany({ select: { vesselCode: true, material: true, thickness: true, width: true, length: true, heatNo: true, status: true } }),
    prisma.cuttingLog.findMany({ where: { status: "COMPLETED", isUrgent: false, heatNo: { not: "" } },
      select: { heatNo: true, material: true, thickness: true, width: true, length: true, drawingNo: true, operator: true, endAt: true,
        project: { select: { projectCode: true } }, drawingList: { select: { alternateVesselCode: true } } } }),
  ]);

  const heatByHK = new Map(); const heatBySV = new Map();
  for (const h of heats) {
    (heatByHK.get(hKey(h.vesselCode, h.material, h.thickness, h.width, h.length, h.heatNo)) ?? heatByHK.set(hKey(h.vesselCode, h.material, h.thickness, h.width, h.length, h.heatNo), []).get(hKey(h.vesselCode, h.material, h.thickness, h.width, h.length, h.heatNo))).push(h);
    (heatBySV.get(svKey(h.material, h.thickness, h.width, h.length, h.heatNo)) ?? heatBySV.set(svKey(h.material, h.thickness, h.width, h.length, h.heatNo), []).get(svKey(h.material, h.thickness, h.width, h.length, h.heatNo))).push(h);
  }
  const logByHK = new Map(); const logBySV = new Map();
  for (const lg of cutLogs) {
    const v = lg.drawingList?.alternateVesselCode?.trim() || lg.project?.projectCode || "";
    const rec = { ...lg, _v: v };
    (logByHK.get(hKey(v, lg.material, lg.thickness, lg.width, lg.length, lg.heatNo)) ?? logByHK.set(hKey(v, lg.material, lg.thickness, lg.width, lg.length, lg.heatNo), []).get(hKey(v, lg.material, lg.thickness, lg.width, lg.length, lg.heatNo))).push(rec);
    (logBySV.get(svKey(lg.material, lg.thickness, lg.width, lg.length, lg.heatNo)) ?? logBySV.set(svKey(lg.material, lg.thickness, lg.width, lg.length, lg.heatNo), []).get(svKey(lg.material, lg.thickness, lg.width, lg.length, lg.heatNo))).push(rec);
  }

  // ① 전환누락: 작업일보 절단인데 그 호선+사양+판번호 heat 가 CUT 아님
  const missed = [];
  for (const [k, lgs] of logByHK) {
    const pool = heatByHK.get(k) ?? [];
    if (pool.some((h) => h.status === "CUT")) continue;
    const l = lgs[0];
    const sv = svKey(l.material, l.thickness, l.width, l.length, l.heatNo);
    const otherVesselHeat = (heatBySV.get(sv) ?? []).filter((h) => vk(h.vesselCode) !== l._v);
    missed.push({ heatNo: up(l.heatNo), v: l._v, spec: specStr(l.material, l.thickness, l.width, l.length),
      altVessel: otherVesselHeat.length ? [...new Set(otherVesselHeat.map((h) => h.vesselCode))].join("/") : null });
  }
  const missedAlt = missed.filter((m) => m.altVessel);
  const missedGenuine = missed.filter((m) => !m.altVessel);

  // ④ 유령절단: CUT heat 인데 그 호선+사양 작업일보 없음
  const stale = [];
  for (const h of heats.filter((x) => x.status === "CUT")) {
    const k = hKey(h.vesselCode, h.material, h.thickness, h.width, h.length, h.heatNo);
    if (logByHK.has(k)) continue;
    const sv = svKey(h.material, h.thickness, h.width, h.length, h.heatNo);
    const otherVesselLog = (logBySV.get(sv) ?? []).filter((lg) => lg._v !== vk(h.vesselCode));
    stale.push({ heatNo: up(h.heatNo), v: h.vesselCode, spec: specStr(h.material, h.thickness, h.width, h.length),
      altVessel: otherVesselLog.length ? [...new Set(otherVesselLog.map((lg) => lg._v))].join("/") : null });
  }
  const staleAlt = stale.filter((s) => s.altVessel);
  const staleGenuine = stale.filter((s) => !s.altVessel);

  // ③ 중복절단: 같은 호선+사양+판번호 완료로그 2건 이상
  const dups = [];
  for (const [, lgs] of logByHK) {
    if (lgs.length < 2) continue;
    const draws = new Set(lgs.map((l) => l.drawingNo));
    const ops = new Set(lgs.map((l) => l.operator));
    let type;
    if (draws.size === 1 && ops.size === 1) type = "완전중복(같은도면·같은작업자)";
    else if (draws.size === 1) type = "같은도면·다른작업자";
    else type = "다른도면(P/R 재절단 등)";
    dups.push({ heatNo: up(lgs[0].heatNo), v: lgs[0]._v, spec: specStr(lgs[0].material, lgs[0].thickness, lgs[0].width, lgs[0].length), count: lgs.length, type,
      detail: lgs.map((l) => `${l.drawingNo}/${l.operator}`).join(" , ") });
  }

  const L = "─".repeat(74);
  console.log(`${L}\n① 전환누락 총 ${missed.length}건`);
  console.log(`   ├ 대체호선(빌림, 정상 — 판번호가 다른 호선에 있음): ${missedAlt.length}건`);
  console.log(`   └ 진짜 누락(판번호가 어디에도 CUT 아님): ${missedGenuine.length}건`);
  missedGenuine.slice(0, 10).forEach((m) => console.log(`       ${m.heatNo} | ${m.v} | ${m.spec}`));

  console.log(`\n④ 유령절단 총 ${stale.length}건`);
  console.log(`   ├ 대체호선(작업일보가 다른 호선에 있음): ${staleAlt.length}건`);
  console.log(`   └ 진짜 유령(작업일보 근거 전혀 없음): ${staleGenuine.length}건`);
  staleGenuine.slice(0, 10).forEach((s) => console.log(`       ${s.heatNo} | ${s.v} | ${s.spec}`));

  console.log(`\n③ 중복절단 총 ${dups.length}건 (판번호 기준)`);
  const byType = {};
  dups.forEach((d) => { byType[d.type] = (byType[d.type] ?? 0) + 1; });
  Object.entries(byType).forEach(([t, c]) => console.log(`   · ${t}: ${c}건`));
  console.log(`   [상세]`);
  dups.slice(0, 20).forEach((d) => console.log(`     ${d.heatNo} | ${d.v} | ${d.spec} | ${d.type} | ${d.detail}`));

  await prisma.$disconnect();
}
main().catch(async (e) => { console.error("오류:", e.message); await prisma.$disconnect(); process.exit(1); });

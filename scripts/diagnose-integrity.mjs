// 절단파트 정합성 진단 — 로컬에서 회사 DB에 직접 접속해 실행 (읽기 전용, SELECT만).
// 실행: node scripts/diagnose-integrity.mjs
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const up = (s) => (s ?? "").trim().toUpperCase();
const vk = (s) => (s ?? "").trim();
const specOf = (m, t, w, l) => `${up(m)}|${t ?? ""}|${w ?? ""}|${l ?? ""}`;
const svKey = (v, m, t, w, l) => `${vk(v)}|${specOf(m, t, w, l)}`;
const heatKey = (v, m, t, w, l, h) => `${svKey(v, m, t, w, l)}|${up(h)}`;
const specStr = (m, t, w, l) => `${up(m)} ${t}×${w}×${l}`;

async function main() {
  console.log("DB 접속 시도:", (process.env.DATABASE_URL || "").replace(/(:\/\/[^:]+:)[^@]+@/, "$1***@"));

  const [plans, heats, cutLogs, shipItems] = await Promise.all([
    prisma.steelPlan.findMany({
      select: { id: true, vesselCode: true, material: true, thickness: true, width: true, length: true,
        status: true, actualHeatNo: true, reservedFor: true, shipoutMarkedAt: true },
    }),
    prisma.steelPlanHeat.findMany({
      select: { id: true, vesselCode: true, material: true, thickness: true, width: true, length: true,
        heatNo: true, status: true, autoCreatedFromShipment: true },
    }),
    prisma.cuttingLog.findMany({
      where: { status: "COMPLETED", isUrgent: false, heatNo: { not: "" } },
      select: { id: true, heatNo: true, material: true, thickness: true, width: true, length: true,
        drawingNo: true, operator: true, endAt: true, startAt: true,
        project: { select: { projectCode: true } },
        drawingList: { select: { alternateVesselCode: true } } },
    }),
    prisma.shipmentItem.findMany({
      where: { steelPlanId: { not: null }, heatNo: { not: null }, vehicle: { shipment: { status: "ACTIVE" } } },
      select: { id: true, vesselCode: true, material: true, thickness: true, width: true, length: true, heatNo: true },
    }),
  ]);

  console.log(`\n총계: 강재 ${plans.length} · 판번호 ${heats.length} · 절단완료 작업일보 ${cutLogs.length} · 활성출고 ${shipItems.length}\n`);

  // 작업일보 기준 절단 판번호
  const cutLogByHeatKey = new Map();
  for (const lg of cutLogs) {
    const v = lg.drawingList?.alternateVesselCode?.trim() || lg.project?.projectCode || "";
    const k = heatKey(v, lg.material, lg.thickness, lg.width, lg.length, lg.heatNo);
    (cutLogByHeatKey.get(k) ?? cutLogByHeatKey.set(k, []).get(k)).push({ ...lg, _v: v });
  }
  const shipByHeatKey = new Set(shipItems.map((it) => heatKey(it.vesselCode, it.material, it.thickness, it.width, it.length, it.heatNo)));

  const heatByKey = new Map();
  for (const h of heats) {
    const k = heatKey(h.vesselCode, h.material, h.thickness, h.width, h.length, h.heatNo);
    (heatByKey.get(k) ?? heatByKey.set(k, []).get(k)).push(h);
  }

  // A. 판번호 중복 절단
  const dupCut = [...cutLogByHeatKey.values()].filter((a) => a.length > 1)
    .map((a) => ({ heatNo: a[0].heatNo, v: a[0]._v, spec: specStr(a[0].material, a[0].thickness, a[0].width, a[0].length), count: a.length,
      logs: a.map((l) => `${l.drawingNo ?? "-"}/${l.operator}/${(l.endAt ?? l.startAt)?.toISOString().slice(0, 10) ?? "-"}`) }))
    .sort((x, y) => y.count - x.count);

  // B. 전환 누락 (작업일보=절단, 판번호=재고/없음)
  const missed = [];
  for (const [k, lgs] of cutLogByHeatKey) {
    if (shipByHeatKey.has(k)) continue;
    const pool = heatByKey.get(k) ?? [];
    if (!pool.some((h) => h.status === "CUT")) {
      const l = lgs[0];
      missed.push({ heatNo: l.heatNo, v: l._v, spec: specStr(l.material, l.thickness, l.width, l.length),
        logCount: lgs.length, pool: pool.length ? pool.map((h) => h.status).join(",") : "없음" });
    }
  }

  // C. 유령 절단/외부
  const stale = heats.filter((h) => {
    const k = heatKey(h.vesselCode, h.material, h.thickness, h.width, h.length, h.heatNo);
    if (h.status === "CUT") return !cutLogByHeatKey.has(k) && !shipByHeatKey.has(k);
    if (h.status === "SHIPPED") return !shipByHeatKey.has(k);
    return false;
  }).map((h) => ({ heatNo: h.heatNo, v: h.vesselCode, spec: specStr(h.material, h.thickness, h.width, h.length),
    status: h.status === "CUT" ? "절단" : "외부", auto: h.autoCreatedFromShipment }));

  // D. 사양 수량 불일치
  const bySpec = new Map();
  const ens = (v, m, t, w, l) => {
    const k = svKey(v, m, t, w, l);
    let b = bySpec.get(k);
    if (!b) { b = { v: vk(v), spec: specStr(m, t, w, l), received: 0, issued: 0, completed: 0, shippedOut: 0, waiting: 0, cut: 0, shipped: 0 }; bySpec.set(k, b); }
    return b;
  };
  for (const p of plans) { const b = ens(p.vesselCode, p.material, p.thickness, p.width, p.length);
    if (p.status === "RECEIVED") b.received++; else if (p.status === "ISSUED") b.issued++;
    else if (p.status === "COMPLETED") b.completed++; else if (p.status === "SHIPPED_OUT") b.shippedOut++; }
  for (const h of heats) { const b = ens(h.vesselCode, h.material, h.thickness, h.width, h.length);
    if (h.status === "WAITING") b.waiting++; else if (h.status === "CUT") b.cut++; else if (h.status === "SHIPPED") b.shipped++; }
  const specMis = [...bySpec.values()].map((b) => ({ ...b, cutD: b.completed - b.cut, shipD: b.shippedOut - b.shipped, stockD: (b.received + b.issued) - b.waiting }))
    .filter((b) => b.cutD || b.shipD || b.stockD).sort((x, y) => (Math.abs(y.cutD) + Math.abs(y.shipD)) - (Math.abs(x.cutD) + Math.abs(x.shipD)));

  // E. 재고 판번호 중복행
  const waitByKey = new Map();
  for (const h of heats) { if (h.status !== "WAITING") continue;
    const k = heatKey(h.vesselCode, h.material, h.thickness, h.width, h.length, h.heatNo);
    (waitByKey.get(k) ?? waitByKey.set(k, []).get(k)).push(h); }
  const dupWait = [...waitByKey.values()].filter((a) => a.length > 1)
    .map((a) => ({ heatNo: a[0].heatNo, v: a[0].vesselCode, spec: specStr(a[0].material, a[0].thickness, a[0].width, a[0].length), count: a.length }))
    .sort((x, y) => y.count - x.count);

  const line = "─".repeat(70);
  console.log(line);
  console.log("요약 (건수):");
  console.log(`  ① 판번호 전환누락(강재=절단·판번호=재고) : ${missed.length}`);
  console.log(`  ② 사양 수량 불일치                        : ${specMis.length}`);
  console.log(`  ③ 판번호 중복 절단(작업일보)              : ${dupCut.length}`);
  console.log(`  ④ 유령 절단/외부(근거없음)                : ${stale.length}`);
  console.log(`  ⑤ 재고 판번호 중복행                      : ${dupWait.length}`);
  console.log(line);

  const show = (title, arr, fmt, cap = 30) => {
    console.log(`\n■ ${title} — 총 ${arr.length}건${arr.length > cap ? ` (상위 ${cap} 표시)` : ""}`);
    if (!arr.length) { console.log("  (없음)"); return; }
    arr.slice(0, cap).forEach((r) => console.log("  " + fmt(r)));
  };

  show("① 판번호 전환누락", missed, (r) => `${r.heatNo} | ${r.v} | ${r.spec} | 절단로그 ${r.logCount}건 | 판번호풀=${r.pool}`);
  show("② 사양 수량 불일치 (강재/판번호)", specMis, (r) =>
    `${r.v} | ${r.spec} | 재고 ${r.received + r.issued}/${r.waiting}(${r.stockD >= 0 ? "+" : ""}${r.stockD}) | 절단 ${r.completed}/${r.cut}(${r.cutD >= 0 ? "+" : ""}${r.cutD}) | 외부 ${r.shippedOut}/${r.shipped}(${r.shipD >= 0 ? "+" : ""}${r.shipD})`);
  show("③ 판번호 중복 절단", dupCut, (r) => `${r.heatNo} | ${r.v} | ${r.spec} | ${r.count}건 | ${r.logs.join("  ,  ")}`);
  show("④ 유령 절단/외부", stale, (r) => `${r.heatNo} | ${r.v} | ${r.spec} | ${r.status}${r.auto ? " (출고자동생성)" : ""}`);
  show("⑤ 재고 판번호 중복행", dupWait, (r) => `${r.heatNo} | ${r.v} | ${r.spec} | ${r.count}행`);

  await prisma.$disconnect();
}

main().catch(async (e) => { console.error("오류:", e.message); await prisma.$disconnect(); process.exit(1); });

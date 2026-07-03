export const dynamic = "force-dynamic";

/**
 * GET /api/steel-plan/integrity
 *
 * 절단파트 정합성 진단 (읽기 전용 — 어떤 데이터도 변경하지 않음).
 *
 * 강재전체목록(SteelPlan)·판번호리스트(SteelPlanHeat)·작업일보(CuttingLog COMPLETED)·
 * 외부출고(ShipmentItem ACTIVE) 네 곳을 대조해, 상태가 어긋나거나 추적이 끊긴 자재를 유형별로 집계한다.
 *
 * "어디서부터 잘못됐는지" 를 규모와 함께 보여주는 목적. 여기서 나온 결과를 근거로 복구/수정 우선순위를 정한다.
 *
 * 매칭 규칙은 앱과 동일하게 맞춘다: 재질=대문자, 호선/치수=정확, 판번호=trim (실데이터가 전부 대문자라 사실상 정확).
 *
 * 반환 유형:
 *  A. dupCutLogs         작업일보에 같은 판번호가 2건 이상 절단완료 (판번호 중복 절단)
 *  B. heatMissedFlip     작업일보엔 절단인데 판번호리스트는 아직 재고(WAITING) — 판번호 상태 전환 누락 (강재만 절단으로 앞섬)
 *  C. heatStaleCut       판번호리스트는 절단/외부인데 근거 작업일보·출고가 없음 (유령 절단/출고)
 *  D. specStatusMismatch 사양 단위로 강재목록 vs 판번호리스트의 절단/외부/재고 "수량" 이 다름
 *  E. dupWaitingHeat     같은 판번호(사양)가 재고(WAITING) 상태로 2행 이상 (중복 등록)
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const SAMPLE_CAP = 200; // 유형별 최대 표본 수 (전체 건수는 별도 count 로 보고)

const up = (s: string | null | undefined) => (s ?? "").trim().toUpperCase();
const vk = (s: string | null | undefined) => (s ?? "").trim(); // 호선: 앱 매칭이 대소문자 민감 → trim 만
// 사양키 (호선 제외 — 호선은 별도 결합)
const specOf = (m: string | null, t: number | null, w: number | null, l: number | null) =>
  `${up(m)}|${t ?? ""}|${w ?? ""}|${l ?? ""}`;
// 사양+호선 키
const specVesselKey = (v: string | null, m: string | null, t: number | null, w: number | null, l: number | null) =>
  `${vk(v)}|${specOf(m, t, w, l)}`;
// 판번호 키 (판번호 + 사양 + 호선)
const heatKey = (v: string | null, m: string | null, t: number | null, w: number | null, l: number | null, h: string | null) =>
  `${specVesselKey(v, m, t, w, l)}|${up(h)}`;

export async function GET() {
  try {
    // ── 원천 데이터 로드 ──────────────────────────────────────────────────────
    const [plans, heats, cutLogs, shipItems, draws] = await Promise.all([
      prisma.steelPlan.findMany({
        select: {
          id: true, vesselCode: true, material: true, thickness: true, width: true, length: true,
          status: true, actualHeatNo: true, reservedFor: true, shipoutMarkedAt: true,
        },
      }),
      prisma.steelPlanHeat.findMany({
        select: {
          id: true, vesselCode: true, material: true, thickness: true, width: true, length: true,
          heatNo: true, status: true, autoCreatedFromShipment: true,
        },
      }),
      // 정규(비돌발) 절단완료 작업일보 — heatNo 있는 것만
      prisma.cuttingLog.findMany({
        where: { status: "COMPLETED", isUrgent: false, heatNo: { not: "" } },
        select: {
          id: true, heatNo: true, material: true, thickness: true, width: true, length: true,
          drawingNo: true, operator: true, endAt: true, startAt: true,
          project: { select: { projectCode: true } },
          drawingList: { select: { alternateVesselCode: true } },
        },
      }),
      // 활성 출고장의 원판 출고 품목 (판번호 있는 것)
      prisma.shipmentItem.findMany({
        where: {
          steelPlanId: { not: null },
          heatNo: { not: null },
          vehicle: { shipment: { status: "ACTIVE" } },
        },
        select: {
          id: true, vesselCode: true, material: true, thickness: true, width: true, length: true, heatNo: true,
        },
      }),
      // 도면 목록 (유령 확정 판정용) — 실존 블록 집합
      prisma.drawingList.findMany({ select: { block: true, project: { select: { projectCode: true } } } }),
    ]);

    // ── 작업일보 기준 "절단된 판번호" 집합 (진실의 근거) ────────────────────────
    // 호선은 대체호선 우선, 없으면 프로젝트 코드
    const cutLogByHeatKey = new Map<string, typeof cutLogs>();
    for (const lg of cutLogs) {
      const v = lg.drawingList?.alternateVesselCode?.trim() || lg.project?.projectCode || "";
      const k = heatKey(v, lg.material, lg.thickness, lg.width, lg.length, lg.heatNo);
      const arr = cutLogByHeatKey.get(k) ?? [];
      arr.push(lg);
      cutLogByHeatKey.set(k, arr);
    }
    // 출고된 판번호 집합
    const shipByHeatKey = new Set<string>();
    for (const it of shipItems) {
      shipByHeatKey.add(heatKey(it.vesselCode, it.material, it.thickness, it.width, it.length, it.heatNo));
    }

    // ── 판번호리스트 인덱스 ────────────────────────────────────────────────────
    const heatByKey = new Map<string, typeof heats>();
    for (const h of heats) {
      const k = heatKey(h.vesselCode, h.material, h.thickness, h.width, h.length, h.heatNo);
      const arr = heatByKey.get(k) ?? [];
      arr.push(h);
      heatByKey.set(k, arr);
    }

    // ── A. 판번호 중복 절단 (작업일보) ─────────────────────────────────────────
    const dupCutLogsAll = [...cutLogByHeatKey.entries()]
      .filter(([, arr]) => arr.length > 1)
      .map(([, arr]) => {
        const first = arr[0];
        const v = first.drawingList?.alternateVesselCode?.trim() || first.project?.projectCode || "";
        return {
          heatNo: first.heatNo, vesselCode: v,
          material: up(first.material), thickness: first.thickness, width: first.width, length: first.length,
          count: arr.length,
          logs: arr.map((l) => ({
            id: l.id, drawingNo: l.drawingNo, operator: l.operator,
            date: (l.endAt ?? l.startAt)?.toISOString() ?? null,
          })),
        };
      })
      .sort((a, b) => b.count - a.count);

    // ── B. 작업일보=절단 인데 판번호리스트=재고/없음 (전환 누락) ──────────────────
    const heatMissedFlipAll: {
      heatNo: string; vesselCode: string; material: string;
      thickness: number | null; width: number | null; length: number | null;
      logCount: number; poolStatus: string;
    }[] = [];
    for (const [k, logsForKey] of cutLogByHeatKey.entries()) {
      if (shipByHeatKey.has(k)) continue; // 출고된 건 아래 D/외부에서 다룸
      const pool = heatByKey.get(k) ?? [];
      const anyCut = pool.some((h) => h.status === "CUT");
      if (!anyCut) {
        const l = logsForKey[0];
        const v = l.drawingList?.alternateVesselCode?.trim() || l.project?.projectCode || "";
        heatMissedFlipAll.push({
          heatNo: l.heatNo, vesselCode: v, material: up(l.material),
          thickness: l.thickness, width: l.width, length: l.length,
          logCount: logsForKey.length,
          poolStatus: pool.length === 0 ? "없음" : pool.map((h) => h.status).join(","),
        });
      }
    }

    // ── C. 판번호리스트=절단/외부 인데 근거(작업일보/출고) 없음 (유령) ─────────────
    const heatStaleCutAll = heats
      .filter((h) => {
        const k = heatKey(h.vesselCode, h.material, h.thickness, h.width, h.length, h.heatNo);
        if (h.status === "CUT") return !cutLogByHeatKey.has(k) && !shipByHeatKey.has(k);
        if (h.status === "SHIPPED") return !shipByHeatKey.has(k);
        return false;
      })
      .map((h) => ({
        heatNo: h.heatNo, vesselCode: h.vesselCode, material: h.material,
        thickness: h.thickness, width: h.width, length: h.length,
        status: h.status, autoCreatedFromShipment: h.autoCreatedFromShipment,
      }));

    // ── D. 사양 단위 상태 수량 불일치 (강재목록 vs 판번호리스트) ───────────────────
    type Bucket = { received: number; issued: number; completed: number; shippedOut: number; waiting: number; cut: number; shipped: number };
    const bySpec = new Map<string, Bucket & { vesselCode: string; material: string; thickness: number | null; width: number | null; length: number | null }>();
    const ensure = (v: string | null, m: string | null, t: number | null, w: number | null, l: number | null) => {
      const k = specVesselKey(v, m, t, w, l);
      let b = bySpec.get(k);
      if (!b) {
        b = { vesselCode: vk(v), material: up(m), thickness: t, width: w, length: l,
              received: 0, issued: 0, completed: 0, shippedOut: 0, waiting: 0, cut: 0, shipped: 0 };
        bySpec.set(k, b);
      }
      return b;
    };
    for (const p of plans) {
      const b = ensure(p.vesselCode, p.material, p.thickness, p.width, p.length);
      if (p.status === "RECEIVED") b.received++;
      else if (p.status === "ISSUED") b.issued++;
      else if (p.status === "COMPLETED") b.completed++;
      else if (p.status === "SHIPPED_OUT") b.shippedOut++;
    }
    for (const h of heats) {
      const b = ensure(h.vesselCode, h.material, h.thickness, h.width, h.length);
      if (h.status === "WAITING") b.waiting++;
      else if (h.status === "CUT") b.cut++;
      else if (h.status === "SHIPPED") b.shipped++;
    }
    const specStatusMismatchAll = [...bySpec.values()]
      .map((b) => {
        const cutDiff = b.completed - b.cut;          // 강재 절단 - 판번호 절단
        const shipDiff = b.shippedOut - b.shipped;    // 강재 외부 - 판번호 외부
        const stockDiff = (b.received + b.issued) - b.waiting; // 강재 재고 - 판번호 재고
        return { ...b, cutDiff, shipDiff, stockDiff };
      })
      .filter((b) => b.cutDiff !== 0 || b.shipDiff !== 0 || b.stockDiff !== 0)
      .sort((a, b) => (Math.abs(b.cutDiff) + Math.abs(b.shipDiff)) - (Math.abs(a.cutDiff) + Math.abs(a.shipDiff)));

    // ── E. 재고(WAITING) 판번호 중복행 ─────────────────────────────────────────
    const waitingByKey = new Map<string, typeof heats>();
    for (const h of heats) {
      if (h.status !== "WAITING") continue;
      const k = heatKey(h.vesselCode, h.material, h.thickness, h.width, h.length, h.heatNo);
      const arr = waitingByKey.get(k) ?? [];
      arr.push(h);
      waitingByKey.set(k, arr);
    }
    const dupWaitingHeatAll = [...waitingByKey.values()]
      .filter((arr) => arr.length > 1)
      .map((arr) => ({
        heatNo: arr[0].heatNo, vesselCode: arr[0].vesselCode, material: arr[0].material,
        thickness: arr[0].thickness, width: arr[0].width, length: arr[0].length,
        count: arr.length,
      }))
      .sort((a, b) => b.count - a.count);

    // ── F. 유령 판번호 (강재목록에 대응 사양 없는 판번호) — 안전 정리 대상 ──────────
    const planSpecKeys = new Set(plans.map((p) => specVesselKey(p.vesselCode, p.material, p.thickness, p.width, p.length)));
    const orphanHeatsAll = heats
      .filter((h) => !planSpecKeys.has(specVesselKey(h.vesselCode, h.material, h.thickness, h.width, h.length)))
      .map((h) => ({
        heatNo: h.heatNo, vesselCode: h.vesselCode, material: up(h.material),
        thickness: h.thickness, width: h.width, length: h.length, status: h.status,
      }));

    // ── G. 유령 확정 (reservedFor 인데 그 블록 도면이 존재 안 함) — 안전 정리 대상 ────
    const validReserved = new Set<string>();
    for (const d of draws) {
      const b = (d.block ?? "").trim();
      if (!b) continue;
      validReserved.add(b);
      if (d.project?.projectCode) validReserved.add(`${d.project.projectCode}/${b}`);
    }
    const ghostReservedAll = plans
      .filter((p) => p.reservedFor && !validReserved.has(p.reservedFor.trim()))
      .map((p) => ({
        vesselCode: p.vesselCode, material: up(p.material),
        thickness: p.thickness, width: p.width, length: p.length,
        reservedFor: p.reservedFor, status: p.status,
      }));

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      totals: {
        steelPlans: plans.length,
        steelPlanHeats: heats.length,
        completedCutLogs: cutLogs.length,
        activeShipItems: shipItems.length,
      },
      summary: {
        dupCutLogs: dupCutLogsAll.length,
        heatMissedFlip: heatMissedFlipAll.length,
        heatStaleCut: heatStaleCutAll.length,
        specStatusMismatch: specStatusMismatchAll.length,
        dupWaitingHeat: dupWaitingHeatAll.length,
        orphanHeats: orphanHeatsAll.length,
        ghostReserved: ghostReservedAll.length,
      },
      dupCutLogs: dupCutLogsAll.slice(0, SAMPLE_CAP),
      heatMissedFlip: heatMissedFlipAll.slice(0, SAMPLE_CAP),
      heatStaleCut: heatStaleCutAll.slice(0, SAMPLE_CAP),
      specStatusMismatch: specStatusMismatchAll.slice(0, SAMPLE_CAP),
      dupWaitingHeat: dupWaitingHeatAll.slice(0, SAMPLE_CAP),
      orphanHeats: orphanHeatsAll.slice(0, SAMPLE_CAP),
      ghostReserved: ghostReservedAll.slice(0, SAMPLE_CAP),
    });
  } catch (error) {
    console.error("[GET /api/steel-plan/integrity]", error);
    return NextResponse.json({ error: "정합성 진단 중 오류가 발생했습니다." }, { status: 500 });
  }
}

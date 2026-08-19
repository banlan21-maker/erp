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
 *  F. orphanHeats         강재목록에 대응 사양이 없는 판번호
 *  G. ghostReserved       reservedFor 인데 그 블록 도면이 존재 안 함
 *  H. blockDoneReserved   ★ 블록 도면이 전부 절단(CUT)됐는데 그 블록에 확정된 철판이 아직 재고
 *                         — 2026-07 S60PS 11장·2026-08 S70PS 1장이 이 유형. G·D 로는 안 잡힌다:
 *                           G 는 '도면 존재 여부'만 보므로 도면이 있으면 통과하고,
 *                           D 는 사양 총량 비교라 다른 블록 잔여와 상쇄되면 차이가 0으로 나온다.
 *                         현장 표현 그대로의 판정이다 — "블록 절단이 끝났으면 그 블록 확정 철판은 남으면 안 된다".
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
          status: true, actualHeatNo: true, reservedFor: true, shipoutMarkedAt: true, archivedAt: true,
        },
      }),
      prisma.steelPlanHeat.findMany({
        select: {
          id: true, vesselCode: true, material: true, thickness: true, width: true, length: true,
          heatNo: true, status: true, autoCreatedFromShipment: true, archivedAt: true,
        },
      }),
      // 정규(비돌발) 절단완료 작업일보 — heatNo 있는 것만
      prisma.cuttingLog.findMany({
        where: { status: "COMPLETED", isUrgent: false, heatNo: { not: "" } },
        select: {
          id: true, heatNo: true, consumedHeatId: true, material: true, thickness: true, width: true, length: true,
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
      prisma.drawingList.findMany({ select: { block: true, status: true, material: true, thickness: true, width: true, length: true, project: { select: { projectCode: true } } } }),
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

    // 작업일보가 `consumedHeatId` 로 정확히 지목한 판번호 집합 — B·C 공통 근거.
    //   heatNo 문자열은 현장 손입력이라 틀릴 수 있고(옆 호선 판번호 오기 등), 그때 실제 소진 판은
    //   이 필드로 기록된다. 문자열만 보면 정상 처리분이 '전환 누락'·'유령'으로 오탐된다. (2026-08-19)
    const consumedIds = new Set(cutLogs.map((l) => l.consumedHeatId).filter((x): x is string => !!x));
    const consumedHeatById = new Map(heats.filter((h) => consumedIds.has(h.id)).map((h) => [h.id, h]));

    // ── B. 작업일보=절단 인데 판번호리스트=재고/없음 (전환 누락) ──────────────────
    const heatMissedFlipAll: {
      heatNo: string; vesselCode: string; material: string;
      thickness: number | null; width: number | null; length: number | null;
      logCount: number; poolStatus: string;
    }[] = [];
    for (const [k, logsForKey] of cutLogByHeatKey.entries()) {
      if (shipByHeatKey.has(k)) continue; // 출고된 건 아래 D/외부에서 다룸
      const pool = heatByKey.get(k) ?? [];
      // 이 키의 로그 중 하나라도 consumedHeatId 로 CUT 판을 지목했다면 전환은 이미 됐다(문자열만 다를 뿐)
      const consumedCut = logsForKey.some((l) => {
        const h = l.consumedHeatId ? consumedHeatById.get(l.consumedHeatId) : undefined;
        return h?.status === "CUT" || h?.status === "SHIPPED";
      });
      const anyCut = consumedCut || pool.some((h) => h.status === "CUT");
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
    //   ⚠ heatNo 문자열은 현장 손입력이라 틀릴 수 있다(옆 호선 판번호 오기 등). 그때 실제 소진 판은
    //     `consumedHeatId` 로 정확히 기록되므로, 그 링크가 있으면 '근거 있음'으로 인정한다.
    //     (안 그러면 손 교정한 판이 영구히 '유령 절단'으로 뜬다 — 2026-08-18)
    const heatStaleCutAll = heats
      .filter((h) => {
        if (consumedIds.has(h.id)) return false;
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

    // ── H. 블록 도면이 전부 절단됐는데 그 블록 확정 철판이 아직 재고 (S60PS/S70PS 유형) ──────
    //    "블록 절단이 끝났으면 그 블록에 확정된 철판은 남아 있으면 안 된다" 를 그대로 옮긴 판정.
    const STOCK_ST = new Set(["REGISTERED", "RECEIVED", "ISSUED"]);
    type BlkAgg = { total: number; cut: number; specs: Set<string> };
    const blkAgg = new Map<string, BlkAgg>();       // "호선/블록" → 집계
    const blkByName = new Map<string, string[]>();  // 블록명 → 해당 키들 (호선 없는 reservedFor 대응)
    for (const d of draws) {
      const b = (d.block ?? "").trim();
      if (!b) continue;
      const k = `${d.project?.projectCode ?? ""}/${b}`;
      const e = blkAgg.get(k) ?? { total: 0, cut: 0, specs: new Set<string>() };
      e.total++;
      if (d.status === "CUT") e.cut++;
      e.specs.add(specOf(d.material, d.thickness, d.width, d.length));
      blkAgg.set(k, e);
      const list = blkByName.get(b) ?? [];
      if (!list.includes(k)) { list.push(k); blkByName.set(b, list); }
    }
    const isDone = (k: string) => { const e = blkAgg.get(k); return !!e && e.total > 0 && e.cut === e.total; };

    const blockDoneReservedAll = plans
      .filter((p) => p.reservedFor && STOCK_ST.has(p.status))
      .map((p) => {
        const rf = (p.reservedFor ?? "").trim();
        // reservedFor 는 "호선/블록" 또는 "블록" 두 형태. 후자면 자기 호선 우선, 없으면 동명 블록 전체.
        let keys: string[];
        if (rf.includes("/")) keys = [rf];
        else {
          const own = `${vk(p.vesselCode)}/${rf}`;
          keys = blkAgg.has(own) ? [own] : (blkByName.get(rf) ?? []);
        }
        if (keys.length === 0) return null;                 // 도면 없음 = G 가 다룬다
        if (!keys.every(isDone)) return null;               // 하나라도 안 끝났으면 정상(보수적 판정)
        const spec = specOf(p.material, p.thickness, p.width, p.length);
        // 그 블록에 같은 사양 도면이 있으면 '소진 누락', 없으면 '확정 오배정' 쪽 의심
        const specInBlock = keys.some((k) => blkAgg.get(k)?.specs.has(spec));
        const agg = blkAgg.get(keys[0])!;
        return {
          vesselCode: p.vesselCode, material: up(p.material),
          thickness: p.thickness, width: p.width, length: p.length,
          status: p.status, reservedFor: p.reservedFor,
          blockKey: keys.join(","), drawingRows: agg.total,
          hint: specInBlock ? "소진 누락 의심 (같은 사양 도면 있음)" : "확정 오배정 의심 (같은 사양 도면 없음)",
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => a.blockKey.localeCompare(b.blockKey));

    // 아카이브(숨김) 분포 — 화면 목록은 아카이브를 제외하는데 이 진단은 전량을 세므로,
    // 숫자가 달라 보이는 이유를 함께 보고한다(§16-6 감수 항목).
    const archivedPlanCount = plans.filter((p) => p.archivedAt != null).length;
    const archivedHeatCount = heats.filter((h) => h.archivedAt != null).length;

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      totals: {
        steelPlans: plans.length,
        steelPlanHeats: heats.length,
        completedCutLogs: cutLogs.length,
        activeShipItems: shipItems.length,
        // 활성/아카이브 분리 — 화면(강재전체목록·판번호리스트)은 활성만 보여준다
        activeSteelPlans: plans.length - archivedPlanCount,
        activeSteelPlanHeats: heats.length - archivedHeatCount,
        archivedSteelPlans: archivedPlanCount,
        archivedSteelPlanHeats: archivedHeatCount,
      },
      summary: {
        dupCutLogs: dupCutLogsAll.length,
        heatMissedFlip: heatMissedFlipAll.length,
        heatStaleCut: heatStaleCutAll.length,
        specStatusMismatch: specStatusMismatchAll.length,
        dupWaitingHeat: dupWaitingHeatAll.length,
        orphanHeats: orphanHeatsAll.length,
        ghostReserved: ghostReservedAll.length,
        blockDoneReserved: blockDoneReservedAll.length,
      },
      dupCutLogs: dupCutLogsAll.slice(0, SAMPLE_CAP),
      heatMissedFlip: heatMissedFlipAll.slice(0, SAMPLE_CAP),
      heatStaleCut: heatStaleCutAll.slice(0, SAMPLE_CAP),
      specStatusMismatch: specStatusMismatchAll.slice(0, SAMPLE_CAP),
      dupWaitingHeat: dupWaitingHeatAll.slice(0, SAMPLE_CAP),
      orphanHeats: orphanHeatsAll.slice(0, SAMPLE_CAP),
      ghostReserved: ghostReservedAll.slice(0, SAMPLE_CAP),
      blockDoneReserved: blockDoneReservedAll.slice(0, SAMPLE_CAP),
    });
  } catch (error) {
    console.error("[GET /api/steel-plan/integrity]", error);
    return NextResponse.json({ error: "정합성 진단 중 오류가 발생했습니다." }, { status: 500 });
  }
}

/**
 * DrawingList 상태 동기화 — 단일 진실 함수
 *
 * ── 상태 모델 (사용자 확인된 규칙) ─────────────────────────────────────────
 *   CAUTION    : 매칭 SteelPlan 0장 (이 호선·이 규격 강재 자체 없음)
 *                매칭 풀 status: REGISTERED + RECEIVED + ISSUED (COMPLETED 제외)
 *   REGISTERED : 매칭 SteelPlan 있지만 사용 가능한 입고 강재 0장 (등록만 됨, 미입고)
 *                "사용 가능한 입고" = status RECEIVED 또는 ISSUED 이고
 *                                    (reservedFor=null OR reservedFor가 이 블록)
 *                ISSUED 도 가용에 포함하는 이유: 절단장에 투입됐지만 아직 절단 안 됨
 *   WAITING    : 이 블록에 사용 가능한 RECEIVED+ISSUED ≥ 1장 (입고됨)
 *   CUT        : 절단완료 (sync 대상 아님)
 *
 *   확정(reservedFor) 자체는 status 결정에 영향 X. 단, 매칭 풀에서
 *   "이 블록에 사용 가능"한 강재는 (reservedFor=null OR reservedFor가 이 블록) 인 것만.
 *   다른 블록에 예약된 강재는 이 블록의 매칭 풀에 들어가지 않음.
 *
 * ── 대체호선(alternateVesselCode) 처리 ───────────────────────────────────
 *   호출 인자는 "effectiveVessel" (강재 기준 호선).
 *   대상 DrawingList:
 *     - alternateVesselCode = effectiveVessel  (대체호선 명시)
 *     - OR alternateVesselCode = null AND project.projectCode = effectiveVessel
 *
 * ── 호출 시점 ────────────────────────────────────────────────────────────
 *   - 강재 등록 / 입고 / 입고취소 / 출고 / 출고취소 / 삭제 / spec 변경
 *   - 도면 업로드 / 행 수정 (스펙·블록·대체호선) / 행 삭제 / 행 강제 상태변경
 *   - 단건/일괄 확정 / 확정취소
 *   - 절단 완료 / 절단 취소
 */

import { prisma } from "@/lib/prisma";

interface Spec {
  vesselCode: string;
  material:   string;
  thickness:  number;
  width:      number;
  length:     number;
}

/**
 * 단일 (호선+규격) 동기화.
 * @param effectiveVessel 강재 기준 호선 (alt 또는 projectCode)
 */
export async function syncDrawingListBySpec(
  effectiveVessel: string,
  material:        string,
  thickness:       number,
  width:           number,
  length:          number,
) {
  const norm = material.trim().toUpperCase();

  // 1. 후보 DrawingList 행 — alt vessel reverse-lookup 포함
  const candidates = await prisma.drawingList.findMany({
    where: {
      material:          { equals: norm, mode: "insensitive" },
      thickness, width, length,
      assignedRemnantId: null,                      // 잔재사용 행 제외
      NOT:               { status: "CUT" },         // 절단완료 행 제외
      OR: [
        { alternateVesselCode: effectiveVessel },
        { alternateVesselCode: null,
          project:             { projectCode: effectiveVessel } },
      ],
    },
    orderBy: { createdAt: "asc" },
    select: {
      id:     true,
      block:  true,
      status: true,
      project: { select: { projectCode: true } },
    },
  });
  if (candidates.length === 0) return;

  // 2. 매칭 SteelPlan 풀 — COMPLETED 는 이미 절단된 강재라 매칭 대상 아님
  const plans = await prisma.steelPlan.findMany({
    where: {
      vesselCode: effectiveVessel,
      material:   { equals: norm, mode: "insensitive" },
      thickness, width, length,
      status:     { in: ["REGISTERED", "RECEIVED", "ISSUED"] },
    },
    select: { status: true, reservedFor: true },
  });

  // 3. 매칭 풀 0 → 모든 후보 CAUTION
  if (plans.length === 0) {
    const ids = candidates.filter(r => r.status !== "CAUTION").map(r => r.id);
    if (ids.length > 0) {
      await prisma.drawingList.updateMany({ where: { id: { in: ids } }, data: { status: "CAUTION" } });
    }
    return;
  }

  // 4. 각 행 status 결정 — 블록별로 "사용 가능" 카운트
  const receivedPool = plans.filter(p => p.status === "RECEIVED" || p.status === "ISSUED");

  const toRegistered: string[] = [];
  const toWaiting:    string[] = [];

  for (const row of candidates) {
    const projectCode = row.project.projectCode;
    const blockCode   = row.block ?? "UNKNOWN";
    const newFmt      = `${projectCode}/${blockCode}`;

    // 이 블록에 사용 가능한 입고 강재
    //   - reservedFor = null  → 미예약 (모든 블록 공유)
    //   - reservedFor = "호선/블록" 또는 "블록" → 이 블록 전용
    //   - reservedFor = 다른 블록 → 이 블록 매칭 불가 (제외)
    const usable = receivedPool.filter(p =>
      p.reservedFor === null
      || p.reservedFor === newFmt
      || p.reservedFor === blockCode
    ).length;

    const newStatus = usable >= 1 ? "WAITING" : "REGISTERED";
    if (row.status === newStatus) continue;
    if (newStatus === "WAITING") toWaiting.push(row.id);
    else                          toRegistered.push(row.id);
  }

  if (toWaiting.length > 0) {
    await prisma.drawingList.updateMany({ where: { id: { in: toWaiting } }, data: { status: "WAITING" } });
  }
  if (toRegistered.length > 0) {
    await prisma.drawingList.updateMany({ where: { id: { in: toRegistered } }, data: { status: "REGISTERED" } });
  }
}

/**
 * 여러 spec 일괄 동기화 — 중복 제거 후 순차 호출.
 */
export async function syncDrawingListBySpecs(specs: Spec[]) {
  const seen = new Map<string, Spec>();
  for (const s of specs) {
    const key = `${s.vesselCode}|${s.material.trim().toUpperCase()}|${s.thickness}|${s.width}|${s.length}`;
    if (!seen.has(key)) seen.set(key, s);
  }
  for (const s of seen.values()) {
    await syncDrawingListBySpec(s.vesselCode, s.material, s.thickness, s.width, s.length);
  }
}

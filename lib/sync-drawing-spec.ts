/**
 * DrawingList 상태 동기화 — 단일 진실 함수
 *
 * ── 상태 모델 (사용자 확정) ────────────────────────────────────────────────
 *   CAUTION    : 매칭 SteelPlan 0장 (이 호선·이 규격 강재 자체 없음)
 *                매칭 풀 status: REGISTERED + RECEIVED + ISSUED (COMPLETED 제외)
 *
 *   REGISTERED : SteelPlan 있지만 이 블록에 확정(reservedFor)된 강재 0장
 *                · 등록만 됐든, 입고만 됐든, 다른 블록에 예약됐든 모두 REGISTERED
 *                · 가용 입고 수량은 별도 availability API 가 계산해 UI 에 "N장 입고"
 *                  형태로 표시 (DrawingList.status 와 무관)
 *
 *   WAITING    : 이 블록에 reservedFor 매칭된 강재로 확정된 도면 (1:1 매칭)
 *                · 같은 블록 도면 N장 + reservedFor 매칭 강재 M장이면 createdAt asc
 *                  순서로 첫 M장만 WAITING. 나머지는 REGISTERED.
 *                · 사용자가 일괄확정 버튼을 눌렀을 때만 발생
 *                · reservedFor 형식: 신규 "호선/블록" 또는 구형 "블록"
 *
 *   CUT        : 절단완료 (sync 대상 아님)
 *
 * ── 운영 흐름 ────────────────────────────────────────────────────────────
 *   1. 강재 등록 → SteelPlan(REGISTERED) → DrawingList: CAUTION → REGISTERED
 *   2. 강재 입고처리 → SteelPlan(RECEIVED) → DrawingList: 여전히 REGISTERED
 *      (availability API 가 가용 카운트 늘려 UI 에 "N장 입고" 표시)
 *   3. 일괄확정 → SteelPlan.reservedFor 채움 → DrawingList: REGISTERED → WAITING
 *      ("확정" 표시 + 강재전체목록의 확정호선/블록 컬럼 채워짐)
 *   4. 절단완료 → SteelPlan(COMPLETED) → 매칭 풀에서 빠짐 → 다른 도면은 sync 영향
 *
 * ── 대체호선(alternateVesselCode) 처리 ───────────────────────────────────
 *   호출 인자 effectiveVessel 은 "강재 기준 호선".
 *   대상 DrawingList: alternateVesselCode = effectiveVessel
 *                    OR alternateVesselCode IS NULL AND project.projectCode = effectiveVessel
 *
 * ── 호출 시점 ────────────────────────────────────────────────────────────
 *   강재 등록/입고/입고취소/출고/출고취소/삭제/spec 변경
 *   도면 업로드/행 수정/행 삭제
 *   단건/일괄 확정/확정취소
 *   절단 완료/절단 취소
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
    // createdAt 동률(createMany 로 일괄 삽입된 경우 흔함) 시 비결정적 분배 방지 —
    // id 를 secondary tiebreaker 로 추가해 안정 정렬 보장 (sync 호출마다 동일 결과)
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
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

  // 4. 각 행 status 결정 — 블록별 카운트 분배 (도면 1장 : 강재 1장)
  //    한 블록에 확정된 강재 N장이면, 그 블록 도면 중 createdAt asc 첫 N장만 WAITING.
  //    over-count 방지: 강재 1장 확정인데 도면 5장 모두 WAITING 되는 결함 해결.
  const reservedPool = plans.filter(p =>
    (p.status === "RECEIVED" || p.status === "ISSUED") && p.reservedFor !== null
  );

  // (projectCode, blockCode) 키로 그룹화 — 다른 프로젝트의 동명 블록과 분리
  const byBlock = new Map<string, typeof candidates>();
  for (const row of candidates) {
    const key = `${row.project.projectCode}|${row.block ?? "UNKNOWN"}`;
    if (!byBlock.has(key)) byBlock.set(key, []);
    byBlock.get(key)!.push(row);
  }

  const toRegistered: string[] = [];
  const toWaiting:    string[] = [];

  for (const rows of byBlock.values()) {
    const projectCode = rows[0].project.projectCode;
    const blockCode   = rows[0].block ?? "UNKNOWN";
    const newFmt      = `${projectCode}/${blockCode}`;

    // 이 블록에 확정된 강재 수 (신규 "호선/블록" + 구형 "블록")
    const confirmedCount = reservedPool.filter(p =>
      p.reservedFor === newFmt || p.reservedFor === blockCode
    ).length;

    // createdAt asc 앞에서부터 confirmedCount 개만 WAITING, 나머지 REGISTERED
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const newStatus = i < confirmedCount ? "WAITING" : "REGISTERED";
      if (row.status === newStatus) continue;
      if (newStatus === "WAITING") toWaiting.push(row.id);
      else                          toRegistered.push(row.id);
    }
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

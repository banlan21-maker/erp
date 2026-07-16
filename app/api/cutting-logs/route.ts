/**
 * /api/cutting-logs
 *
 * 절단 작업일보 목록 조회 및 작업 시작 등록.
 *
 * ── 데이터 구조 ──────────────────────────────────────────────────────────────
 * CuttingLog
 *  ├─ isUrgent = false  → 정규작업: Project → DrawingList → SteelPlan(강재입고) 연동
 *  └─ isUrgent = true   → 돌발작업: UrgentWork → Remnant(잔재관리) 연동
 *
 * ── 상태 흐름 ─────────────────────────────────────────────────────────────────
 *  POST → status: STARTED
 *  PATCH action="complete" → status: COMPLETED
 *    └─ 정규작업 완료 시 자동 동기화:
 *       DrawingList: WAITING → CUT
 *       SteelPlan:   RECEIVED → COMPLETED (actualHeatNo 기록)
 *       SteelPlanHeat: WAITING → CUT (없으면 신규 생성)
 *       syncDrawingListBySpec() 호출로 DrawingList 전체 재계산
 *  DELETE → status 삭제, 강재 상태 복원:
 *       DrawingList: CUT → WAITING
 *       SteelPlan:   COMPLETED → RECEIVED (actualHeatNo 초기화)
 *       SteelPlanHeat: CUT → WAITING
 *       syncDrawingListBySpec() 호출로 DrawingList 전체 재계산
 *
 * ── stuck 레코드 처리 ─────────────────────────────────────────────────────────
 * 이전 날짜 미종료(STARTED) 또는 중단(PAUSED) 레코드는 날짜 무관 포함되어야 함.
 * GET에 includeStuck=true 또는 equipmentId 파라미터 포함 시 STARTED/PAUSED 레코드 포함.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { applyCuttingComplete } from "@/lib/cutting-complete";

// ─── GET ───────────────────────────────────────────────────────────────────────
// 쿼리 파라미터:
//   equipmentId   : 장비별 조회 (현장용). 지정 시 미종료 레코드 자동 포함.
//   projectId     : 프로젝트별 조회 (관리자용). 날짜 미지정 시 전체 기간.
//   date          : YYYY-MM-DD. 단일 날짜 (하위 호환용, 현장 뷰).
//   dateFrom      : YYYY-MM-DD. 범위 시작일 (관리자 뷰).
//   dateTo        : YYYY-MM-DD. 범위 종료일 (관리자 뷰).
//   includeStuck  : "true" → 날짜 필터와 관계없이 STARTED/PAUSED 레코드 포함.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const equipmentId  = searchParams.get("equipmentId");
    const projectId    = searchParams.get("projectId");
    const date         = searchParams.get("date");
    const dateFrom     = searchParams.get("dateFrom");
    const dateTo       = searchParams.get("dateTo");
    const includeStuck = searchParams.get("includeStuck") === "true";
    const all          = searchParams.get("all") === "true"; // 날짜 제한 없이 전체 조회

    // ── 날짜 필터 구성 ──────────────────────────────────────────────────────
    let dateFilter: Record<string, unknown> = {};
    if (!all) {
      if (dateFrom || dateTo) {
        // 관리자 범위 필터
        const rangeFilter: Record<string, Date> = {};
        if (dateFrom) {
          const d = new Date(dateFrom); d.setHours(0, 0, 0, 0);
          rangeFilter.gte = d;
        }
        if (dateTo) {
          const d = new Date(dateTo); d.setHours(23, 59, 59, 999);
          rangeFilter.lte = d;
        }
        dateFilter = { startAt: rangeFilter };
      } else if (date) {
        // 단일 날짜 (하위 호환 / 현장 뷰)
        const targetDate = new Date(date);
        const dayStart = new Date(targetDate); dayStart.setHours(0, 0, 0, 0);
        const dayEnd   = new Date(targetDate); dayEnd.setHours(23, 59, 59, 999);
        dateFilter = { startAt: { gte: dayStart, lte: dayEnd } };
      } else if (!projectId && !equipmentId) {
        // 아무 조건도 없고 all=false → 오늘로 제한 (현장 뷰 기본값)
        const today    = new Date();
        const dayStart = new Date(today); dayStart.setHours(0, 0, 0, 0);
        const dayEnd   = new Date(today); dayEnd.setHours(23, 59, 59, 999);
        dateFilter = { startAt: { gte: dayStart, lte: dayEnd } };
      }
    }

    // ── 미종료(stuck) 레코드 포함 여부 ──────────────────────────────────────
    // equipmentId 조회 시 or includeStuck=true: STARTED 레코드는 날짜 무관 포함
    // → 이전 날 종료 안 된 레코드가 UI에 표시되어야 작업자가 종료 처리 가능
    const needStuck = includeStuck || !!equipmentId;
    const whereCondition: Record<string, unknown> = {};

    if (equipmentId) whereCondition.equipmentId = equipmentId;
    if (projectId)   whereCondition.projectId   = projectId;

    if (Object.keys(dateFilter).length > 0) {
      if (needStuck) {
        // STARTED + 중단(PAUSED) 모두 stuck 으로 포함 — 야간이월 중단 작업이 다음날 사라지지 않게
        whereCondition.OR = [{ ...dateFilter }, { status: { in: ["STARTED", "PAUSED"] } }];
      } else {
        Object.assign(whereCondition, dateFilter);
      }
    }

    const logs = await prisma.cuttingLog.findMany({
      where: whereCondition,
      include: {
        equipment:   { select: { id: true, name: true, type: true } },
        project:     { select: { projectCode: true, projectName: true } },
        drawingList: { select: { drawingNo: true, block: true, useWeight: true } },
        pauses:      { select: { reason: true, reasonText: true, pausedAt: true, resumedAt: true }, orderBy: { pausedAt: "asc" } },
        urgentWork:  {
          select: {
            urgentNo:   true,
            title:      true,
            requester:  true,
            department: true,
            remnant:    { select: { remnantNo: true, width1: true, length1: true, width2: true, length2: true } },
          },
        },
      },
      orderBy: { startAt: "desc" },
    });

    return NextResponse.json({ success: true, data: logs });
  } catch (error) {
    console.error("[GET /api/cutting-logs]", error);
    return NextResponse.json(
      { success: false, error: "작업일보 조회 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

// ─── POST ──────────────────────────────────────────────────────────────────────
// 절단 시작 등록. status: STARTED 로 생성.
// 같은 장비에 STARTED 레코드가 있으면 409 반환 (stuckLog 정보 포함).
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      equipmentId, projectId, drawingListId,
      heatNo, material, thickness, width, length, qty, drawingNo,
      operator, memo, isUrgent, urgentWorkId, startAt, endAt, status,
    } = body;

    // 백필 완료: 사무실에서 종료일시까지 채운 과거 누락분 — STARTED 를 거치지 않고 곧장
    // COMPLETED 로 생성 + 완료 side-effect 를 한 트랜잭션으로 처리(아래). 과거기록이므로
    // '같은 장비 진행중' 가드는 건너뛴다(현장 라이브 작업과 무관).
    const isBackfillCompleted = status === "COMPLETED" && !!endAt;

    // ── 필수값 검증 ─────────────────────────────────────────────────────────
    if (!equipmentId) {
      return NextResponse.json({ success: false, error: "장비를 선택하세요." }, { status: 400 });
    }
    // heatNo: 정규작업은 필수, 돌발작업·등록잔재사용은 선택
    const isRemnantDraw = drawingListId
      ? !!(await prisma.drawingList.findFirst({ where: { id: drawingListId, NOT: { assignedRemnantId: null } }, select: { id: true } }))
      : false;
    if (!isUrgent && !isRemnantDraw && !heatNo?.trim()) {
      return NextResponse.json({ success: false, error: "Heat NO는 필수입니다." }, { status: 400 });
    }
    if (!operator?.trim()) {
      return NextResponse.json({ success: false, error: "작업자명은 필수입니다." }, { status: 400 });
    }

    // ── 판번호 재사용 가드 (B) ──────────────────────────────────────────────
    // 같은 판번호를 실제 남은 재고(판번호리스트 WAITING)보다 많이 자르는 것을 서버에서 차단.
    // 수입재 등 같은 heatNo 가 여러 철판에 올 수 있어 "번호 존재"가 아니라 "남은 재고 수량"으로만 판단(오탐 방지).
    //   남은재고 = WAITING 판번호 수 − 진행중(STARTED) 절단 수. 0 이하면 차단.
    //   방치된 PAUSED(야간이월 등)는 제외 — 장비 미종료 가드와 동일 정책. 스테일 PAUSED 로 정상절단이 막히는 오탐 방지.
    //   판번호가 풀에 없으면(미등록) 판단 불가 → 통과. 순차 중복(picker 재선택 등) 안전망이며, 진성 동시선택은 DB락 필요(미보장).
    if (!isUrgent && !isRemnantDraw && heatNo?.trim() && material && thickness != null && width != null && length != null) {
      const hn = heatNo.trim();
      const specWhere = {
        material:  { equals: String(material).trim(), mode: "insensitive" as const },
        thickness: Number(thickness), width: Number(width), length: Number(length),
      };
      const heatWhere = { ...specWhere, heatNo: { equals: hn, mode: "insensitive" as const } };
      const [totalHeats, waitingHeats, activeCuts] = await Promise.all([
        prisma.steelPlanHeat.count({ where: heatWhere }),
        prisma.steelPlanHeat.count({ where: { ...heatWhere, status: "WAITING" } }),
        prisma.cuttingLog.count({ where: { ...heatWhere, isUrgent: false, status: "STARTED" } }),
      ]);
      if (totalHeats > 0 && waitingHeats - activeCuts <= 0) {
        return NextResponse.json(
          { success: false, error: `판번호 ${hn} 는 남은 재고가 없습니다(이미 절단됐거나 진행 중). 재고 있는 판번호를 확인하세요.` },
          { status: 409 }
        );
      }
    }

    // ── 해당 장비에 미종료 작업 확인 ─────────────────────────────────────────
    // STARTED 만 차단. PAUSED(중단)된 옛 작업이 남아 있어도 새 작업 시작은 허용
    // (PAUSED 까지 막으면, 종료/재개 안 한 중단 기록 때문에 정상 도면 시작이 막히는 문제)
    // 백필 완료(과거기록)는 라이브 시작이 아니므로 이 가드를 건너뛴다.
    if (!isBackfillCompleted) {
      const ongoing = await prisma.cuttingLog.findFirst({
        where: { equipmentId, status: "STARTED" },
        include: { project: { select: { projectCode: true } } },
      });
      if (ongoing) {
        return NextResponse.json(
          {
            success: false,
            error:   "이미 진행중인 절단 작업이 있습니다. 먼저 종료 처리하세요.",
            stuckLog: {
              id:        ongoing.id,
              heatNo:    ongoing.heatNo,
              drawingNo: ongoing.drawingNo,
              operator:  ongoing.operator,
              startAt:   ongoing.startAt,
              project:   ongoing.project?.projectCode ?? null,
            },
          },
          { status: 409 }
        );
      }
    }

    // ── 같은 도면이 다른 장비에서 절단 진행중인지 확인 (중복 작업 방지) ───────────
    // 정규작업(drawingListId) 한정. 도면 status 는 완료 시에만 CUT 이라 진행중엔 막을 수 없으므로
    // 활성 작업일보(STARTED/PAUSED)로 검사.
    if (drawingListId && isUrgent !== true) {
      const dNo = drawingNo?.trim();
      const dupDraw = await prisma.cuttingLog.findFirst({
        where: {
          status: { in: ["STARTED", "PAUSED"] }, isUrgent: false,
          // 행 id 또는 같은 도면번호(projectId+drawingNo) — 동일 도면의 별개 행 중복도 차단
          OR: [{ drawingListId }, ...(dNo && projectId ? [{ projectId, drawingNo: dNo }] : [])],
        },
        include: { equipment: { select: { name: true } } },
      });
      if (dupDraw) {
        return NextResponse.json(
          { success: false, error: `이 도면은 이미 다른 장비(${dupDraw.equipment?.name ?? "?"})에서 절단 진행중입니다. 중복 작업할 수 없습니다.` },
          { status: 409 },
        );
      }
    }

    // ── 작업 생성 ─────────────────────────────────────────────────────────────
    const baseData = {
      equipmentId,
      projectId:     projectId     || null,
      drawingListId: drawingListId || null,
      urgentWorkId:  urgentWorkId  || null,
      heatNo:    heatNo?.trim().toUpperCase()    || "",   // N22: 저장 시 대문자 정규화
      material:  material?.trim()  || null,
      thickness: thickness != null ? Number(thickness) : null,
      width:     width     != null ? Number(width)     : null,
      length:    length    != null ? Number(length)    : null,
      qty:       qty       != null ? Number(qty)       : null,
      drawingNo: drawingNo?.trim() || null,
      operator:  operator.trim(),
      memo:      memo?.trim()      || null,
      isUrgent:  isUrgent === true,
      startAt:   startAt ? new Date(startAt) : new Date(),
    };

    // 백필 완료: COMPLETED 생성 + 완료 side-effect 를 한 트랜잭션으로 (2단계 비원자 고아 방지)
    if (isBackfillCompleted) {
      // 시간 정합 — 종료 < 시작 거부 (PATCH 일반 수정의 B-2 와 대칭)
      const effStart = startAt ? new Date(startAt) : new Date();
      if (new Date(endAt).getTime() < effStart.getTime()) {
        return NextResponse.json({ success: false, error: "종료 일시가 시작 일시보다 빠를 수 없습니다." }, { status: 400 });
      }
      const created = await prisma.$transaction(async (tx) => {
        const newLog = await tx.cuttingLog.create({
          data: { ...baseData, status: "COMPLETED", endAt: new Date(endAt) },
        });
        await applyCuttingComplete(tx, newLog);
        return newLog;
      }, { maxWait: 5000, timeout: 20000 });
      return NextResponse.json({ success: true, data: created }, { status: 201 });
    }

    // ── 일반 작업 시작 생성 (status: STARTED 기본값) ──────────────────────────
    const log = await prisma.cuttingLog.create({
      data: baseData,
      include: {
        equipment: { select: { name: true } },
        project:   { select: { projectCode: true, projectName: true } },
      },
    });

    return NextResponse.json({ success: true, data: log }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/cutting-logs]", error);
    return NextResponse.json(
      { success: false, error: "작업 시작 등록 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

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
 * 이전 날짜 미종료(STARTED) 레코드가 있을 경우 새 작업 시작 불가.
 * GET에 includeStuck=true 또는 equipmentId 파라미터 포함 시 날짜 무관 STARTED 레코드 포함.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// ─── GET ───────────────────────────────────────────────────────────────────────
// 쿼리 파라미터:
//   equipmentId   : 장비별 조회 (현장용). 지정 시 미종료 레코드 자동 포함.
//   projectId     : 프로젝트별 조회 (관리자용). 날짜 미지정 시 전체 기간.
//   date          : YYYY-MM-DD. 단일 날짜 (하위 호환용, 현장 뷰).
//   dateFrom      : YYYY-MM-DD. 범위 시작일 (관리자 뷰).
//   dateTo        : YYYY-MM-DD. 범위 종료일 (관리자 뷰).
//   includeStuck  : "true" → 날짜 필터와 관계없이 STARTED 레코드 포함.
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
        whereCondition.OR = [{ ...dateFilter }, { status: "STARTED" }];
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
      operator, memo, isUrgent, urgentWorkId, startAt,
    } = body;

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

    // ── 해당 장비에 미종료 작업 확인 ─────────────────────────────────────────
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

    // ── 작업 시작 생성 ───────────────────────────────────────────────────────
    const log = await prisma.cuttingLog.create({
      data: {
        equipmentId,
        projectId:     projectId     || null,
        drawingListId: drawingListId || null,
        urgentWorkId:  urgentWorkId  || null,
        heatNo:    heatNo?.trim()    || "",
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
      },
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

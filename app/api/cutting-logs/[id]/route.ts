/**
 * /api/cutting-logs/[id]
 *
 * 절단 작업일보 단건 수정 및 삭제.
 *
 * ── PATCH action="complete" (절단 종료) ────────────────────────────────────
 * 정규작업(isUrgent=false) 완료 시 아래 순서로 자동 동기화:
 *   1) CuttingLog.status → COMPLETED, endAt 기록
 *   2) DrawingList: 같은 프로젝트+도면번호의 WAITING 첫 항목 → CUT (heatNo 기록)
 *   3) SteelPlan:  vesselCode+스펙 일치하는 RECEIVED(actualHeatNo=null) 첫 항목
 *                  → COMPLETED, actualHeatNo·vesselCode·drawingNo 기록
 *   4) SteelPlanHeat: heatNo 기준 WAITING → CUT (없으면 신규 자동 생성)
 *   5) syncDrawingListBySpec(): 동일 스펙 DrawingList 전체 WAITING/REGISTERED 재계산
 *   6) syncProjectStatus(): 블록 완료 여부 동기화
 *
 * ── PATCH action="pause" (절단 중단) ──────────────────────────────────────
 *   CuttingLog.status → PAUSED, CuttingPause 레코드 생성 (pausedAt=now)
 *   body: { reason: PauseReason, reasonText?: string }
 *
 * ── PATCH action="resume" (절단 재개) ─────────────────────────────────────
 *   CuttingLog.status → STARTED, 최신 CuttingPause.resumedAt = now
 *
 * 돌발작업(isUrgent=true)은 DrawingList·SteelPlan 동기화 없음.
 *
 * ── PATCH (일반 수정) ──────────────────────────────────────────────────────
 * action 없음: 관리자 직접 필드 수정.
 *
 * ── DELETE (삭제 + 강재 상태 복원) ────────────────────────────────────────
 *   1) DrawingList: CUT → WAITING, heatNo 초기화
 *   2) SteelPlan:   COMPLETED → RECEIVED, actual* 필드 초기화
 *   3) SteelPlanHeat: CUT → WAITING
 *   4) CuttingLog 삭제 (CuttingPause는 CASCADE)
 *   5) syncDrawingListBySpec(): DrawingList 재계산
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { applyCuttingComplete, applyCuttingRestore } from "@/lib/cutting-complete";

// ─── PATCH ─────────────────────────────────────────────────────────────────────
// action="complete" → 절단 종료 (강재 상태 자동 동기화)
// action 없음       → 관리자 직접 수정 (강재 상태 수동 관리)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { action, memo, heatNo, material, thickness, operator } = body;

    // ── 절단 중단 ────────────────────────────────────────────────────────────
    if (action === "pause") {
      const { reason, reasonText } = body;
      if (!reason) {
        return NextResponse.json({ success: false, error: "중단 사유를 선택하세요." }, { status: 400 });
      }
      await prisma.cuttingLog.update({ where: { id }, data: { status: "PAUSED" } });
      await prisma.cuttingPause.create({
        data: { cuttingLogId: id, reason, reasonText: reasonText?.trim() || null },
      });
      return NextResponse.json({ success: true });
    }

    // ── 절단 재개 ────────────────────────────────────────────────────────────
    if (action === "resume") {
      // PAUSED 일 때만 재개 (COMPLETED 를 STARTED 로 되살리는 것 방지)
      const cur = await prisma.cuttingLog.findUnique({ where: { id }, select: { status: true, equipmentId: true } });
      if (!cur) return NextResponse.json({ success: false, error: "기록을 찾을 수 없습니다." }, { status: 404 });
      if (cur.status !== "PAUSED") {
        return NextResponse.json({ success: false, error: "중단 상태가 아니어서 재개할 수 없습니다. 새로고침 후 확인하세요." }, { status: 409 });
      }
      // 같은 장비에 이미 진행중(STARTED) 작업이 있으면 재개 불가 (한 장비 2건 STARTED 방지)
      const otherStarted = await prisma.cuttingLog.findFirst({
        where: { equipmentId: cur.equipmentId, status: "STARTED", NOT: { id } },
        select: { id: true },
      });
      if (otherStarted) {
        return NextResponse.json({ success: false, error: "이 장비에 이미 진행중인 절단이 있습니다. 먼저 종료 처리하세요." }, { status: 409 });
      }
      // 열려있는(resumedAt=null) 가장 최근 중단 기록에 재개 시각 기록
      const openPause = await prisma.cuttingPause.findFirst({
        where:   { cuttingLogId: id, resumedAt: null },
        orderBy: { pausedAt: "desc" },
      });
      if (openPause) {
        await prisma.cuttingPause.update({
          where: { id: openPause.id },
          data:  { resumedAt: new Date() },
        });
      }
      await prisma.cuttingLog.update({ where: { id }, data: { status: "STARTED" } });
      return NextResponse.json({ success: true });
    }

    if (action === "complete") {
      // ── 멱등성 가드 (CAS) ─────────────────────────────────────────────
      // 더블탭 / 빠른 재호출 / 동시 더블탭 모두 SteelPlan 추가 소비 (재고 영구
      // 손실) 방지. findUnique+update 비원자(TOCTOU) 대신 updateMany 의
      // where-기반 compare-and-swap 으로 atomic 보호.
      // (CAS + 후속 동기화 전체를 아래 $transaction 으로 묶어 부분실패 시 전부 롤백)
      const { endAt: completeEndAt, startAt: completeStartAt } = body;
      // 완료 부작용 전체(CAS + DrawingList/SteelPlan/Heat/Remnant + sync)를 한 트랜잭션으로 —
      // 중간 실패 시 CAS 포함 전부 롤백되어 half-synced + 재시도 차단 상태를 방지.
      const outcome = await prisma.$transaction(async (tx) => {
      const casResult = await tx.cuttingLog.updateMany({
        where: { id, status: { not: "COMPLETED" } },
        data: {
          status: "COMPLETED",
          endAt: completeEndAt ? new Date(completeEndAt) : new Date(),
          ...(completeStartAt ? { startAt: new Date(completeStartAt) } : {}),
          ...(memo !== undefined ? { memo: memo?.trim() || null } : {}),
        },
      });
      if (casResult.count === 0) {
        // 이미 COMPLETED 거나 ID 없음 — 부작용 모두 스킵 (롤백 불필요, 변경 없음)
        const found = await tx.cuttingLog.findUnique({ where: { id }, select: { status: true } });
        return found ? { kind: "already" as const } : { kind: "notfound" as const };
      }

      // 혹시 PAUSED 상태에서 완료 누른 경우 열린 pause 자동 닫기
      await tx.cuttingPause.updateMany({
        where: { cuttingLogId: id, resumedAt: null },
        data:  { resumedAt: new Date() },
      });

      // CAS 로 status 가 이미 COMPLETED 됐으므로 후속 조회로 데이터 확보
      const log = await tx.cuttingLog.findUnique({
        where: { id },
        include: { equipment: { select: { name: true } } },
      });
      if (!log) throw new Error("기록 조회 실패");   // throw → 트랜잭션 롤백

      // 완료 부작용(도면 CUT / 강재 소진 / 판번호 / 잔재 EXHAUSTED / sync) — 공용 헬퍼로 위임
      await applyCuttingComplete(tx, log);

      return { kind: "done" as const, log };
      // 원격 NAS DB 라운드트립 + 락 경합 대비 기본 5s timeout 상향 (P2028 회귀 방지)
      }, { maxWait: 5000, timeout: 20000 }); // ── 트랜잭션 끝 ─────────────────

      if (outcome.kind === "notfound") {
        return NextResponse.json({ success: false, error: "기록을 찾을 수 없습니다." }, { status: 404 });
      }
      if (outcome.kind === "already") {
        return NextResponse.json({ success: true, data: { id, status: "COMPLETED", alreadyCompleted: true } });
      }
      return NextResponse.json({ success: true, data: outcome.log });
    }

    // 일반 수정 (관리자 직접 필드 수정) — 재고 정합성 안전 가드
    const { startAt, endAt, status, equipmentId,
            width, length, qty, drawingNo } = body;

    // 현재 로그 조회 (상태 전환·재고키 변경 차단 판단용)
    const cur = await prisma.cuttingLog.findUnique({
      where: { id },
      select: {
        status: true, equipmentId: true, heatNo: true, material: true,
        thickness: true, width: true, length: true, drawingNo: true,
        startAt: true, endAt: true,
      },
    });
    if (!cur) {
      return NextResponse.json({ success: false, error: "기록을 찾을 수 없습니다." }, { status: 404 });
    }

    // (A-1) 진행↔완료 상태 전환 차단 — 일반 수정은 완료 side-effect(도면 CUT/강재 소진)나
    //   복원을 수행하지 않으므로 status 만 바뀌면 재고와 어긋난다.
    //   완료: 현장 '절단 종료' 또는 미등록 행 '추가'. 완료취소: '삭제 후 재등록'.
    if (status !== undefined && status !== cur.status) {
      return NextResponse.json({
        success: false,
        error: "이 화면에서는 진행/완료 상태를 바꿀 수 없습니다. 완료는 현장 절단종료나 '추가' 등록을, 완료 취소는 삭제 후 재등록을 이용하세요.",
      }, { status: 409 });
    }

    // (A-1b) 미완료 로그에 종료일시만 채워 '완료처럼' 만드는 것 차단 — status=STARTED+endAt 모순 +
    //   완료 side-effect(도면 CUT/강재 소진) 누락 방지. 완료는 현장 절단종료 또는 '추가' 등록으로.
    if (cur.status !== "COMPLETED" && endAt) {
      return NextResponse.json({
        success: false,
        error: "진행중 작업은 이 화면에서 완료할 수 없습니다. 완료는 현장 절단종료나 미등록 행 '추가' 등록을 이용하세요.",
      }, { status: 409 });
    }

    // (A-2) 완료 로그의 재고 식별값(판번호·재질·치수·도면번호) 변경 차단 — 강재/판번호 desync 방지.
    if (cur.status === "COMPLETED") {
      const sEq = (a: unknown, b: unknown) =>
        (a == null ? "" : String(a).trim().toUpperCase()) === (b == null ? "" : String(b).trim().toUpperCase());
      const nEq = (a: unknown, b: number | null) => {
        const n = (a === undefined || a === null || a === "" ? null : Number(a));
        return n === b;
      };
      const changed: string[] = [];
      if (heatNo    !== undefined && !sEq(heatNo,    cur.heatNo))    changed.push("판번호");
      if (material  !== undefined && !sEq(material,  cur.material))  changed.push("재질");
      if (thickness !== undefined && !nEq(thickness, cur.thickness)) changed.push("두께");
      if (width     !== undefined && !nEq(width,     cur.width))     changed.push("폭");
      if (length    !== undefined && !nEq(length,    cur.length))    changed.push("길이");
      if (drawingNo !== undefined && !sEq(drawingNo, cur.drawingNo)) changed.push("도면번호");
      if (changed.length > 0) {
        return NextResponse.json({
          success: false,
          error: `완료된 작업의 ${changed.join("·")}은(는) 수정할 수 없습니다(강재 재고와 어긋남). 변경하려면 삭제 후 다시 등록하세요. (작업자·시간·비고는 수정 가능)`,
        }, { status: 409 });
      }
      // (A-3) 완료 로그의 종료일시 비우기 차단 — endAt 만 지워 '진행중'처럼 만들면 재고는 소진된 채 모순.
      if (endAt !== undefined && !endAt) {
        return NextResponse.json({
          success: false,
          error: "완료된 작업의 종료일시는 비울 수 없습니다. 진행중으로 되돌리려면 삭제 후 재등록하세요.",
        }, { status: 409 });
      }
    }

    // (B-1) 진행중(STARTED) 로그를 다른 장비로 옮길 때, 대상 장비에 이미 STARTED 가 있으면 차단(한 장비 2건 방지).
    if (cur.status === "STARTED" && equipmentId !== undefined && equipmentId !== cur.equipmentId) {
      const other = await prisma.cuttingLog.findFirst({
        where: { equipmentId, status: "STARTED", NOT: { id } },
        select: { id: true },
      });
      if (other) {
        return NextResponse.json({
          success: false,
          error: "대상 장비에 이미 진행중인 절단이 있어 옮길 수 없습니다. 먼저 종료 처리하세요.",
        }, { status: 409 });
      }
    }

    // (B-2) 시간 정합 — 종료 < 시작 거부.
    {
      const effStart = startAt !== undefined ? (startAt ? new Date(startAt) : null) : cur.startAt;
      const effEnd   = endAt   !== undefined ? (endAt   ? new Date(endAt)   : null) : cur.endAt;
      if (effStart && effEnd && effEnd.getTime() < effStart.getTime()) {
        return NextResponse.json({
          success: false,
          error: "종료 일시가 시작 일시보다 빠를 수 없습니다.",
        }, { status: 400 });
      }
    }

    const log = await prisma.cuttingLog.update({
      where: { id },
      data: {
        ...(equipmentId !== undefined ? { equipmentId } : {}),
        ...(heatNo    !== undefined ? { heatNo:    heatNo?.trim()    || null } : {}),
        ...(material  !== undefined ? { material:  material?.trim()  || null } : {}),
        ...(thickness !== undefined ? { thickness: thickness ? Number(thickness) : null } : {}),
        ...(width     !== undefined ? { width:     width     ? Number(width)     : null } : {}),
        ...(length    !== undefined ? { length:    length    ? Number(length)    : null } : {}),
        ...(qty       !== undefined ? { qty:       qty       ? Number(qty)       : null } : {}),
        ...(drawingNo !== undefined ? { drawingNo: drawingNo?.trim() || null } : {}),
        ...(operator  !== undefined ? { operator:  operator?.trim()  || ""   } : {}),
        ...(memo      !== undefined ? { memo:      memo?.trim()      || null } : {}),
        ...(startAt   !== undefined ? { startAt:   new Date(startAt) } : {}),
        ...(endAt     !== undefined ? { endAt:     endAt ? new Date(endAt) : null } : {}),
        ...(status    !== undefined ? { status } : {}),
      },
      include: {
        equipment: { select: { id: true, name: true, type: true } },
        project:   { select: { projectCode: true, projectName: true } },
      },
    });
    return NextResponse.json({ success: true, data: log });
  } catch (error) {
    console.error("[PATCH /api/cutting-logs/[id]]", error);
    return NextResponse.json(
      { success: false, error: "작업일보 수정 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

// DELETE /api/cutting-logs/[id] - 작업 기록 삭제 (강재 상태 복원 포함)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // 삭제 전 로그 조회 (drawingListId 확인)
    const log = await prisma.cuttingLog.findUnique({ where: { id } });
    if (!log) {
      return NextResponse.json({ success: false, error: "기록을 찾을 수 없습니다." }, { status: 404 });
    }

    // 복원 부작용 전체(DrawingList/Remnant/SteelPlanHeat/SteelPlan + delete + sync)를 한
    // 트랜잭션으로 — 중간 실패 시 전부 롤백되어 비대칭 복원(half-restored) 상태를 방지.
    await prisma.$transaction(async (tx) => {
    // 복원 부작용(도면 CUT→WAITING / 강재 COMPLETED→RECEIVED / 판번호 / 잔재 IN_STOCK / sync)
    // — 공용 헬퍼로 위임. 헬퍼는 로그를 지우지 않으므로 복원 후 명시 삭제.
    await applyCuttingRestore(tx, log);
    await tx.cuttingLog.delete({ where: { id } });
    // 원격 NAS DB 라운드트립 + 락 경합 대비 기본 5s timeout 상향 (P2028 회귀 방지)
    }, { maxWait: 5000, timeout: 20000 }); // ── 트랜잭션 끝 ─────────────────

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/cutting-logs/[id]]", error);
    return NextResponse.json(
      { success: false, error: "삭제 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

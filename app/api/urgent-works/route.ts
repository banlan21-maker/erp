import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { remnantWeight, isInvalidLShape } from "@/lib/remnant-area";

export const dynamic = "force-dynamic";

/** 사용자에게 409 로 돌려줄 충돌 — 트랜잭션 안에서 던져 전체를 되돌린다. */
class ConflictError extends Error {}

// 돌발번호 자동채번: D-YYMMDD-NN (한국시간 기준 당일 순번, 예: D-260615-01)
type Db = typeof prisma | Prisma.TransactionClient;

async function generateUrgentNo(db: Db = prisma): Promise<string> {
  // Docker 컨테이너가 UTC 여도 한국 달력 날짜로 발번
  const kstFull = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());                       // "2026-06-15"
  const yymmdd = kstFull.slice(2).replace(/-/g, "");   // "260615"
  const prefix = `D-${yymmdd}-`;

  const rows = await db.urgentWork.findMany({
    where: { urgentNo: { startsWith: prefix } },
    select: { urgentNo: true },
  });
  let maxSeq = 0;
  for (const { urgentNo } of rows) {
    const seq = Number(urgentNo.split("-")[2]);
    if (Number.isFinite(seq) && seq > maxSeq) maxSeq = seq;
  }
  return `${prefix}${String(maxSeq + 1).padStart(2, "0")}`;
}

// GET /api/urgent-works
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status  = searchParams.get("status");
    const urgency = searchParams.get("urgency");

    const where: Prisma.UrgentWorkWhereInput = {};
    if (status)  where.status  = status as Prisma.UrgentWorkWhereInput["status"];
    if (urgency) where.urgency = urgency;

    const works = await prisma.urgentWork.findMany({
      where,
      include: {
        project: { select: { id: true, projectCode: true, projectName: true } },
        remnant: {
          select: {
            id: true, remnantNo: true, material: true, thickness: true, weight: true, needsConsult: true,
            heatNo: true,   // 현장 카드에 판번호를 띄워 돌발 절단의 판번호 추적을 잇는다
            width1: true, length1: true, width2: true, length2: true,
          },
        },
        // 작업일보관리에서 UrgentWork 한 행에 매칭된 CuttingLog 매핑용
        cuttingLogs: {
          select: {
            id: true, status: true, startAt: true, endAt: true, operator: true, memo: true, equipmentId: true,
            heatNo: true, material: true, thickness: true, width: true, length: true, qty: true, drawingNo: true,
            equipment: { select: { id: true, name: true, type: true } },
            pauses:    { select: { reason: true, reasonText: true, pausedAt: true, resumedAt: true }, orderBy: { pausedAt: "asc" } },
          },
          orderBy: { startAt: "desc" },
        },
      },
      orderBy: [
        { urgency: "asc" },   // URGENT 먼저
        { dueDate: "asc" },
        { createdAt: "desc" },
      ],
    });
    return NextResponse.json({ success: true, data: works });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

// POST /api/urgent-works
/**
 * 사용 잔재(여유원재/등록잔재)에서 발생하는 등록잔재 생성.
 * 블록자재등록의 '발생잔재'와 같은 개념 — 부모의 판번호를 그대로 이어받는다.
 * 현장잔재(REMNANT)는 자투리의 자투리라 대상이 아니다.
 */
async function createGeneratedRemnants(
  db: Db,
  remnantId: string,
  genList: Array<{ remnantNo?: string; shape?: string; width1?: number | string; length1?: number | string; width2?: number | string; length2?: number | string }>,
  registeredBy: string | null,
): Promise<{ created: number; failed: number }> {
  let created = 0, failed = 0;
  if (!remnantId || genList.length === 0) return { created, failed };
  const parent = await db.remnant.findUnique({
    where: { id: remnantId },
    select: {
      type: true, material: true, thickness: true, heatNo: true,
      sourceProjectId: true, sourceVesselName: true, sourceBlock: true,
    },
  });
  if (!parent || (parent.type !== "SURPLUS" && parent.type !== "REGISTERED")) return { created, failed };

  const year = new Date().getFullYear();
  const prefix = `REM-${year}-`;
  // 숫자 최댓값 기반 채번 (문자열 정렬은 100/1000 자리에서 깨짐) + 배치 내 중복 방지
  const existing = await db.remnant.findMany({
    where: { remnantNo: { startsWith: prefix } },
    select: { remnantNo: true },
  });
  let maxSeq = 0;
  for (const { remnantNo } of existing) {
    const n = parseInt(remnantNo.split("-")[2] ?? "", 10);
    if (Number.isFinite(n) && n > maxSeq) maxSeq = n;
  }
  const usedNos = new Set<string>();
  const nextAutoNo = () => {
    let no: string;
    do { no = `${prefix}${String(++maxSeq).padStart(3, "0")}`; } while (usedNos.has(no));
    return no;
  };

  for (const g of genList) {
    const w1 = Number(g.width1), l1 = Number(g.length1);
    if (!w1 || !l1) continue;   // 치수 없는 항목은 무시 (실패로 집계 안 함)
    // L자형인데 폭2/길이2 가 없으면 사각형으로 처리 (형태-치수 불일치 방지)
    let shape: "RECTANGLE" | "L_SHAPE" = g.shape === "L_SHAPE" ? "L_SHAPE" : "RECTANGLE";
    let w2 = g.width2 ? Number(g.width2) : null;
    let l2 = g.length2 ? Number(g.length2) : null;
    // L자형인데 잘려나간 폭2·길이2 가 비면 실패로 돌린다.
    // 전에는 조용히 사각형으로 바꿨는데, 잘려나간 부분을 빼지 않아 중량이 과대 계산됐다.
    if (shape === "L_SHAPE" && (!w2 || !l2)) { failed++; continue; }
    // 형상 불가(W2>W1 또는 L2>L1) 거부 + 면적식은 lib/remnant-area 단일 기준
    if (shape === "L_SHAPE" && isInvalidLShape(w1, l1, w2, l2)) { failed++; continue; }
    const weight = remnantWeight(shape, parent.thickness, w1, l1, w2, l2);
    if (weight == null || weight <= 0) { failed++; continue; }
    const customNo = g.remnantNo?.toString().trim();
    const remnantNo = customNo || nextAutoNo();
    if (usedNos.has(remnantNo)) { failed++; continue; }
    usedNos.add(remnantNo);
    try {
      await db.remnant.create({
        data: {
          remnantNo, type: "REGISTERED", shape,
          material: parent.material, thickness: parent.thickness, weight,
          width1: w1, length1: l1, width2: w2, length2: l2,
          sourceProjectId:  parent.sourceProjectId,
          sourceVesselName: parent.sourceVesselName,
          sourceBlock:      parent.sourceBlock,
          parentRemnantId:  remnantId,
          heatNo:           parent.heatNo,      // 부모(원재/등록잔재) 판번호 이어받음
          registeredBy:     registeredBy || "돌발",
          // 발생예정 — 사용 강재를 아직 안 잘랐으므로 실물이 없다. 절단완료 시 승격(lib/cutting-complete.ts).
          status: "PENDING",
        },
      });
      created++;
    } catch { failed++; }   // 잔재번호 중복(동시요청)·DB 오류 — 집계만, 돌발 등록은 유지
  }
  return { created, failed };
}

/**
 * 돌발작업 등록.
 *
 * 한 번의 요청에 도면이 여러 장일 수 있다(같은 부서가 한꺼번에 여러 개를 시키는 경우).
 * 공통 정보(작업명·긴급도·요청자·부서·납기·호선/블록·도착지·등록자)는 한 벌이고,
 * 사용 강재·도면번호·사용중량은 도면마다 다르다. 작업일보는 UrgentWork 1건 = 절단 1건으로
 * 다루므로 도면마다 행을 만들고, 같은 요청에서 나왔다는 사실은 batchNo 로 묶는다.
 *
 * body.items 가 있으면 다중 모드(각 항목에 remnantId 필수 — 실물 없는 돌발 절단 방지),
 * 없으면 기존 단건 모드(하위 호환 — components/urgent-main.tsx, urgent-register-button.tsx).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      title, urgency, requester, department,
      projectId, vesselName,
      requestDate, dueDate,
      materialMemo, destination,
      status, registeredBy, memo,
    } = body;

    if (!title?.trim()) {
      return NextResponse.json({ success: false, error: "작업명은 필수입니다." }, { status: 400 });
    }

    type Item = {
      remnantId?: string | null; drawingNo?: string | null; useWeight?: number | string | null;
      materialMemo?: string | null; generatedRemnants?: unknown;
    };
    const multi = Array.isArray(body.items);
    const items: Item[] = multi
      ? (body.items as Item[])
      : [{ remnantId: body.remnantId, drawingNo: body.drawingNo, useWeight: body.useWeight,
           generatedRemnants: body.generatedRemnants }];

    if (items.length === 0) {
      return NextResponse.json({ success: false, error: "등록할 작업이 없습니다. 사용 강재를 최소 1건 추가하세요." }, { status: 400 });
    }

    // 다중 모드에서는 사용 강재를 반드시 특정해야 한다 —
    // 잔재관리 목록에 실재하는 강재로만 돌발 절단이 이뤄지도록.
    if (multi) {
      const missing = items.findIndex(it => !it.remnantId);
      if (missing >= 0) {
        return NextResponse.json(
          { success: false, error: `${missing + 1}번째 작업에 사용 강재가 지정되지 않았습니다.` },
          { status: 400 },
        );
      }
      // 같은 잔재를 두 행에 넣으면 한쪽은 실물 없이 남는다
      const ids = items.map(it => it.remnantId).filter((x): x is string => !!x);
      const dup = ids.find((v, i) => ids.indexOf(v) !== i);
      if (dup) {
        return NextResponse.json({ success: false, error: "같은 강재를 두 번 선택했습니다. 한 강재는 한 작업에만 쓸 수 있습니다." }, { status: 400 });
      }
      // 선택 시점 이후 남이 가져갔을 수 있다 — 저장 직전에 재확인
      const rows = await prisma.remnant.findMany({
        where: { id: { in: ids } },
        select: { id: true, remnantNo: true, status: true, reservedFor: true, shipoutMarkedAt: true },
      });
      if (rows.length !== ids.length) {
        return NextResponse.json({ success: false, error: "선택한 강재 중 없어진 것이 있습니다. 목록을 새로고침하세요." }, { status: 409 });
      }
      const bad = rows.find(r => r.status !== "IN_STOCK" || r.reservedFor || r.shipoutMarkedAt);
      if (bad) {
        const why = bad.status !== "IN_STOCK" ? "재고 상태가 아닙니다"
                  : bad.reservedFor ? `다른 곳에 확정됐습니다(${bad.reservedFor})`
                  : "외부출고로 선별됐습니다";
        return NextResponse.json(
          { success: false, error: `${bad.remnantNo} 는 지금 쓸 수 없습니다 — ${why}.\n목록을 새로고침한 뒤 다시 선택하세요.` },
          { status: 409 },
        );
      }
    }

    // 여러 건을 한 트랜잭션으로 — 중간에 실패하면 전부 취소한다.
    //   전에는 건마다 따로 커밋해서, 3건 중 2건째가 깨지면 1건이 잔재 확정표시까지 찍은 채
    //   남았다. 화면에는 등록번호 없이 실패만 떠서 담당자가 다시 누르면, 이번엔 저장직전
    //   재확인이 "이미 다른 곳에 확정됐다"며 통째로 막는다 — 자기가 만든 유령이 재시도를
    //   막는 상황이라 손으로 지우기 전엔 영영 등록이 안 됐다.
    const result = await prisma.$transaction(async (tx) => {
      const works: Array<{ urgentNo: string; [k: string]: unknown }> = [];
      let batch: string | null = null;
      let gCreated = 0, gFailed = 0, gRequested = 0;

      for (const item of items) {
        const urgentNo = await generateUrgentNo(tx);
        if (!batch) batch = urgentNo;      // 묶음의 첫 건 번호를 묶음 키로 쓴다

        const work = await tx.urgentWork.create({
          data: {
            urgentNo,
            batchNo: batch,
            title:        title.trim(),
            urgency:      urgency      || "URGENT",
            requester:    requester    || null,
            department:   department   || null,
            projectId:    projectId    || null,
            vesselName:   vesselName   || null,
            requestDate:  requestDate  ? new Date(requestDate) : new Date(),
            dueDate:      dueDate      ? new Date(dueDate)     : null,
            materialMemo: item.materialMemo ?? materialMemo ?? null,
            drawingNo:    item.drawingNo || null,
            destination:  destination  || null,
            useWeight:    item.useWeight != null && item.useWeight !== "" ? Number(item.useWeight) : null,
            remnantId:    item.remnantId || null,
            status:       status       || "PENDING",
            registeredBy: registeredBy || null,
            memo:         memo         || null,
          },
          include: {
            project: { select: { id: true, projectCode: true, projectName: true } },
            remnant: { select: { id: true, remnantNo: true, material: true, thickness: true, needsConsult: true } },
          },
        });
        works.push(work as unknown as { urgentNo: string });

        // 사용 예정 잔재의 확정정보(reservedFor)에 돌발번호 기록 — 강재전체목록 확정정보와 동일 역할.
        //   where 에 reservedFor:null·shipoutMarkedAt:null 을 걸어 선점·출고선별을 보호하고,
        //   갱신이 0건이면(= 그 사이 남이 가져감) 거기서 멈춰 트랜잭션 전체를 되돌린다.
        //   단건 경로도 이 검사를 그대로 지난다 — 예전에는 무검증으로 통과해, 외부출고로
        //   선별해 둔 잔재가 돌발에 확정되면서 선별목록에서 소리 없이 사라졌다.
        if (item.remnantId) {
          const marked = await tx.remnant.updateMany({
            where: { id: item.remnantId, reservedFor: null, shipoutMarkedAt: null, status: "IN_STOCK" },
            data:  { reservedFor: urgentNo },
          });
          if (marked.count !== 1) {
            const r = await tx.remnant.findUnique({
              where: { id: item.remnantId },
              select: { remnantNo: true, status: true, reservedFor: true, shipoutMarkedAt: true },
            });
            const why = !r ? "없어진 강재입니다"
                      : r.status !== "IN_STOCK" ? "재고 상태가 아닙니다"
                      : r.reservedFor ? `다른 곳에 확정됐습니다(${r.reservedFor})`
                      : "외부출고로 선별됐습니다";
            throw new ConflictError(`${r?.remnantNo ?? item.remnantId} 는 지금 쓸 수 없습니다 — ${why}.\n목록을 새로고침한 뒤 다시 선택하세요.`);
          }
        }

        const genList = Array.isArray(item.generatedRemnants) ? item.generatedRemnants : [];
        gRequested += genList.length;
        if (item.remnantId && genList.length > 0) {
          const g = await createGeneratedRemnants(tx, item.remnantId, genList, registeredBy || null);
          gCreated += g.created;
          gFailed  += g.failed;
        }
      }
      return { works, batch, gCreated, gFailed, gRequested };
    }, { maxWait: 5000, timeout: 30000 });

    return NextResponse.json({
      success: true,
      data: multi ? result.works : result.works[0],
      count: result.works.length,
      batchNo: result.batch,
      generated: { requested: result.gRequested, created: result.gCreated, failed: result.gFailed },
    }, { status: 201 });
  } catch (error) {
    if (error instanceof ConflictError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 409 });
    }
    // 돌발번호 동시 채번 충돌 — 사용자에게는 영문 원문 대신 다시 시도하라고 안내한다
    if (typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002") {
      return NextResponse.json(
        { success: false, error: "돌발번호가 다른 등록과 겹쳤습니다. 잠시 후 다시 시도해 주세요." },
        { status: 409 },
      );
    }
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

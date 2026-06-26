import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// 돌발번호 자동채번: D-YYMMDD-NN (한국시간 기준 당일 순번, 예: D-260615-01)
async function generateUrgentNo(): Promise<string> {
  // Docker 컨테이너가 UTC 여도 한국 달력 날짜로 발번
  const kstFull = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());                       // "2026-06-15"
  const yymmdd = kstFull.slice(2).replace(/-/g, "");   // "260615"
  const prefix = `D-${yymmdd}-`;

  const rows = await prisma.urgentWork.findMany({
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
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      title, urgency, requester, department,
      projectId, vesselName,
      requestDate, dueDate,
      materialMemo, drawingNo, destination, useWeight,
      remnantId, status, registeredBy, memo,
      generatedRemnants,
    } = body;

    if (!title?.trim()) {
      return NextResponse.json({ success: false, error: "작업명은 필수입니다." }, { status: 400 });
    }

    const urgentNo = await generateUrgentNo();

    const work = await prisma.urgentWork.create({
      data: {
        urgentNo,
        title:        title.trim(),
        urgency:      urgency      || "URGENT",
        requester:    requester    || null,
        department:   department   || null,
        projectId:    projectId    || null,
        vesselName:   vesselName   || null,
        requestDate:  requestDate  ? new Date(requestDate) : new Date(),
        dueDate:      dueDate      ? new Date(dueDate)     : null,
        materialMemo: materialMemo || null,
        drawingNo:    drawingNo    || null,
        destination:  destination  || null,
        useWeight:    useWeight != null && useWeight !== "" ? Number(useWeight) : null,
        remnantId:    remnantId    || null,
        status:       status       || "PENDING",
        registeredBy: registeredBy || null,
        memo:         memo         || null,
      },
      include: {
        project: { select: { id: true, projectCode: true, projectName: true } },
        remnant: { select: { id: true, remnantNo: true, material: true, thickness: true, needsConsult: true } },
      },
    });

    // 사용 예정 잔재의 확정정보(reservedFor)에 돌발번호 기록 — 강재전체목록 확정정보와 동일 역할
    // 이미 다른 작업에 선점된 잔재는 덮어쓰지 않음 (선점 보호)
    if (remnantId) {
      await prisma.remnant.updateMany({
        where: { id: remnantId, reservedFor: null },
        data:  { reservedFor: urgentNo },
      });
    }

    // 사용 잔재(여유원재/등록잔재)에서 발생하는 등록잔재 생성 — 블록자재등록의 발생잔재와 동일 개념
    // 원재(여유원재)·등록잔재에서만 발생 가능, 부모(원재/등록잔재)의 판번호를 그대로 이어받음
    const genList: Array<{ remnantNo?: string; shape?: string; width1?: number | string; length1?: number | string; width2?: number | string; length2?: number | string }> =
      Array.isArray(generatedRemnants) ? generatedRemnants : [];
    let genCreated = 0, genFailed = 0;
    if (remnantId && genList.length > 0) {
      const parent = await prisma.remnant.findUnique({
        where: { id: remnantId },
        select: {
          type: true, material: true, thickness: true, heatNo: true,
          sourceProjectId: true, sourceVesselName: true, sourceBlock: true,
        },
      });
      if (parent && (parent.type === "SURPLUS" || parent.type === "REGISTERED")) {
        const year = new Date().getFullYear();
        const prefix = `REM-${year}-`;
        // 숫자 최댓값 기반 채번 (문자열 정렬은 100/1000 자리에서 깨짐) + 배치 내 중복 방지
        const existing = await prisma.remnant.findMany({
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
          if (shape === "L_SHAPE" && (!w2 || !l2)) { shape = "RECTANGLE"; w2 = null; l2 = null; }
          const area = shape === "L_SHAPE" ? (w1 * l1 - (w2 ?? 0) * (l2 ?? 0)) : (w1 * l1);
          if (area <= 0) { genFailed++; continue; }   // 잘못된 치수 (음수/0 면적) — 저장 거부
          const weight = Math.round(parent.thickness * area * 7.85 / 1_000_000 * 10) / 10;
          const customNo = g.remnantNo?.toString().trim();
          const remnantNo = customNo || nextAutoNo();
          if (usedNos.has(remnantNo)) { genFailed++; continue; }   // 배치 내 잔재번호 중복
          usedNos.add(remnantNo);
          try {
            await prisma.remnant.create({
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
                status: "IN_STOCK",
              },
            });
            genCreated++;
          } catch { genFailed++; }   // 잔재번호 중복(동시요청)·DB 오류 — 집계만, 돌발 등록은 유지
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: work,
      generated: { requested: genList.length, created: genCreated, failed: genFailed },
    }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

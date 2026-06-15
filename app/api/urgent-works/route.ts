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
            material: true, thickness: true, width: true, length: true, qty: true, drawingNo: true,
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

    return NextResponse.json({ success: true, data: work }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

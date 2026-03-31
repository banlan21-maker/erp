import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// 돌발번호 자동채번: URG-YYYY-NNN
async function generateUrgentNo(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `URG-${year}-`;
  const last = await prisma.urgentWork.findFirst({
    where: { urgentNo: { startsWith: prefix } },
    orderBy: { urgentNo: "desc" },
  });
  const seq = last ? parseInt(last.urgentNo.split("-")[2], 10) + 1 : 1;
  return `${prefix}${String(seq).padStart(3, "0")}`;
}

// GET /api/urgent-works
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status  = searchParams.get("status");
    const urgency = searchParams.get("urgency");

    const where: any = {};
    if (status)  where.status  = status;
    if (urgency) where.urgency = urgency;

    const works = await prisma.urgentWork.findMany({
      where,
      include: {
        project: { select: { id: true, projectCode: true, projectName: true } },
        remnant: { select: { id: true, remnantNo: true, material: true, thickness: true, weight: true, needsConsult: true } },
      },
      orderBy: [
        { urgency: "asc" },   // URGENT 먼저
        { dueDate: "asc" },
        { createdAt: "desc" },
      ],
    });
    return NextResponse.json({ success: true, data: works });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
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
      materialMemo, drawingNo, destination,
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

    return NextResponse.json({ success: true, data: work }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

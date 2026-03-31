import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/schedules?includeArchive=true
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const includeArchive = searchParams.get("includeArchive") === "true";

    const schedules = await prisma.cncSchedule.findMany({
      where: includeArchive
        ? {}
        : { status: { not: "CANCELLED" } },
      include: {
        project: {
          select: {
            id: true, projectCode: true, projectName: true,
            drawingLists: {
              select: { id: true, useWeight: true, steelWeight: true, status: true },
            },
          },
        },
      },
      orderBy: [{ priority: "asc" }, { plannedStart: "asc" }, { createdAt: "asc" }],
    });

    return NextResponse.json({ success: true, data: schedules });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// POST /api/schedules
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      projectId, vesselCode, blockName,
      plannedStart, plannedEnd, deliveryFactory, deliveryAssembly,
      workType, status, holdReason, priority, memo,
    } = body;

    if (!vesselCode?.trim() || !blockName?.trim()) {
      return NextResponse.json(
        { success: false, error: "호선 코드와 블록명은 필수입니다." },
        { status: 400 }
      );
    }

    const schedule = await prisma.cncSchedule.create({
      data: {
        projectId:        projectId    || null,
        vesselCode:       vesselCode.trim(),
        blockName:        blockName.trim(),
        plannedStart:     plannedStart  ? new Date(plannedStart)  : null,
        plannedEnd:       plannedEnd    ? new Date(plannedEnd)    : null,
        deliveryFactory:  deliveryFactory  ? new Date(deliveryFactory)  : null,
        deliveryAssembly: deliveryAssembly ? new Date(deliveryAssembly) : null,
        workType:         workType  || "NORMAL",
        status:           status    || "PLANNED",
        holdReason:       holdReason || null,
        priority:         priority != null ? Number(priority) : 0,
        memo:             memo       || null,
      },
      include: { project: { select: { id: true, projectCode: true, projectName: true } } },
    });

    return NextResponse.json({ success: true, data: schedule }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

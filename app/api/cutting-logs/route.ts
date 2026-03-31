import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/cutting-logs?equipmentId=xxx&date=YYYY-MM-DD
// GET /api/cutting-logs?projectId=xxx&date=YYYY-MM-DD  (관리자용: date 없으면 전체)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const equipmentId = searchParams.get("equipmentId");
    const projectId   = searchParams.get("projectId");
    const date        = searchParams.get("date");

    let dateFilter = {};
    if (date) {
      const targetDate = new Date(date);
      const dayStart = new Date(targetDate); dayStart.setHours(0, 0, 0, 0);
      const dayEnd   = new Date(targetDate); dayEnd.setHours(23, 59, 59, 999);
      dateFilter = { startAt: { gte: dayStart, lte: dayEnd } };
    } else if (!projectId) {
      // projectId 없이 date도 없으면 오늘로 제한 (기존 현장용 호환)
      const today = new Date();
      const dayStart = new Date(today); dayStart.setHours(0, 0, 0, 0);
      const dayEnd   = new Date(today); dayEnd.setHours(23, 59, 59, 999);
      dateFilter = { startAt: { gte: dayStart, lte: dayEnd } };
    }

    const logs = await prisma.cuttingLog.findMany({
      where: {
        ...(equipmentId ? { equipmentId } : {}),
        ...(projectId   ? { projectId }   : {}),
        ...dateFilter,
      },
      include: {
        equipment: { select: { id: true, name: true, type: true } },
        project:   { select: { projectCode: true, projectName: true } },
        drawingList: { select: { drawingNo: true, block: true } },
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

// POST /api/cutting-logs - 절단 시작
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      equipmentId, projectId, drawingListId,
      heatNo, material, thickness, width, length, qty, drawingNo,
      operator, memo,
    } = body;

    if (!equipmentId) {
      return NextResponse.json({ success: false, error: "장비를 선택하세요." }, { status: 400 });
    }
    if (!heatNo?.trim()) {
      return NextResponse.json({ success: false, error: "Heat NO는 필수입니다." }, { status: 400 });
    }
    if (!operator?.trim()) {
      return NextResponse.json({ success: false, error: "작업자명은 필수입니다." }, { status: 400 });
    }

    // 해당 장비에 진행중인 작업 확인
    const ongoing = await prisma.cuttingLog.findFirst({
      where: { equipmentId, status: "STARTED" },
    });
    if (ongoing) {
      return NextResponse.json(
        { success: false, error: "이미 진행중인 절단 작업이 있습니다. 먼저 종료 처리하세요." },
        { status: 409 }
      );
    }

    const log = await prisma.cuttingLog.create({
      data: {
        equipmentId,
        projectId: projectId || null,
        drawingListId: drawingListId || null,
        heatNo: heatNo.trim(),
        material: material?.trim() || null,
        thickness: thickness != null ? Number(thickness) : null,
        width: width != null ? Number(width) : null,
        length: length != null ? Number(length) : null,
        qty: qty != null ? Number(qty) : null,
        drawingNo: drawingNo?.trim() || null,
        operator: operator.trim(),
        memo: memo?.trim() || null,
        startAt: new Date(),
      },
      include: {
        equipment: { select: { name: true } },
        project: { select: { projectCode: true, projectName: true } },
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

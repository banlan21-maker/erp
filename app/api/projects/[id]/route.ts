import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ProjectStatus } from "@prisma/client";
import { syncDrawingListBySpecs } from "@/lib/sync-drawing-spec";

// GET /api/projects/[id] - 프로젝트 상세 조회
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        drawingLists: { orderBy: { createdAt: "asc" } },
        workOrders: {
          include: { equipment: true, drawingList: true },
          orderBy: { createdAt: "desc" },
        },
        _count: { select: { drawingLists: true, workOrders: true } },
      },
    });

    if (!project) {
      return NextResponse.json(
        { success: false, error: "프로젝트를 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: project });
  } catch (error) {
    console.error("[GET /api/projects/[id]]", error);
    return NextResponse.json(
      { success: false, error: "프로젝트 조회 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

// PATCH /api/projects/[id] - 프로젝트 수정
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { projectCode, projectName, client, status, memo, storageLocation } = body;

    const project = await prisma.project.update({
      where: { id },
      data: {
        ...(projectCode ? { projectCode: projectCode.trim() } : {}),
        ...(projectName ? { projectName: projectName.trim() } : {}),
        ...(client ? { client: client.trim() } : {}),
        ...(status ? { status: status as ProjectStatus } : {}),
        ...(memo !== undefined ? { memo: memo?.trim() || null } : {}),
        ...(storageLocation !== undefined ? { storageLocation: storageLocation?.trim() || null } : {}),
      },
    });

    // 호선코드(projectCode) 변경 시 도면↔강재 매칭 상태 재계산
    // (안 하면 코드를 맞게 바꿔도 옛 매칭 상태가 남아 연결이 안 보임)
    if (projectCode) {
      const drawings = await prisma.drawingList.findMany({
        where: { projectId: id },
        select: { material: true, thickness: true, width: true, length: true, alternateVesselCode: true },
      });
      const specMap = new Map<string, { vesselCode: string; material: string; thickness: number; width: number; length: number }>();
      for (const d of drawings) {
        const vessel = d.alternateVesselCode?.trim() || project.projectCode;
        const key = `${vessel}|${d.material}|${d.thickness}|${d.width}|${d.length}`;
        if (!specMap.has(key)) specMap.set(key, { vesselCode: vessel, material: d.material, thickness: d.thickness, width: d.width, length: d.length });
      }
      if (specMap.size > 0) await syncDrawingListBySpecs([...specMap.values()]);
    }

    return NextResponse.json({ success: true, data: project });
  } catch (error) {
    console.error("[PATCH /api/projects/[id]]", error);
    return NextResponse.json(
      { success: false, error: "프로젝트 수정 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

// DELETE /api/projects/[id] - 프로젝트 삭제
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.project.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/projects/[id]]", error);
    return NextResponse.json(
      { success: false, error: "프로젝트 삭제 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

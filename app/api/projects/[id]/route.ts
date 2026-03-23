import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ProjectStatus } from "@prisma/client";

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
    const { projectName, client, status, memo } = body;

    const project = await prisma.project.update({
      where: { id },
      data: {
        ...(projectName ? { projectName: projectName.trim() } : {}),
        ...(client ? { client: client.trim() } : {}),
        ...(status ? { status: status as ProjectStatus } : {}),
        ...(memo !== undefined ? { memo: memo?.trim() || null } : {}),
      },
    });

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

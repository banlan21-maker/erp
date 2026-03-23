import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ProjectType, ProjectStatus } from "@prisma/client";

// GET /api/projects - 프로젝트 목록 조회
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") as ProjectStatus | null;
    const type = searchParams.get("type") as ProjectType | null;

    const projects = await prisma.project.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(type ? { type } : {}),
      },
      include: {
        _count: {
          select: {
            drawingLists: true,
            workOrders: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, data: projects });
  } catch (error) {
    console.error("[GET /api/projects]", error);
    return NextResponse.json(
      { success: false, error: "프로젝트 목록 조회 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

// POST /api/projects - 프로젝트 등록
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { projectCode, projectName, type, client, memo } = body;

    if (!projectCode || !projectName || !type || !client) {
      return NextResponse.json(
        { success: false, error: "필수 항목(호선코드, 프로젝트명, 유형, 원청사)을 입력하세요." },
        { status: 400 }
      );
    }

    if (!["A", "B"].includes(type)) {
      return NextResponse.json(
        { success: false, error: "유형은 A 또는 B여야 합니다." },
        { status: 400 }
      );
    }

    const project = await prisma.project.create({
      data: {
        projectCode: projectCode.trim().toUpperCase(),
        projectName: projectName.trim(),
        type: type as ProjectType,
        client: client.trim(),
        memo: memo?.trim() || null,
      },
    });

    return NextResponse.json({ success: true, data: project }, { status: 201 });
  } catch (error: unknown) {
    console.error("[POST /api/projects]", error);
    if (
      error instanceof Error &&
      error.message.includes("Unique constraint")
    ) {
      return NextResponse.json(
        { success: false, error: "같은 호선코드 + 블록명이 이미 등록되어 있습니다." },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { success: false, error: "프로젝트 등록 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

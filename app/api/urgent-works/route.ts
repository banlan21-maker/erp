import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/urgent-works
export async function GET() {
  try {
    const works = await prisma.urgentWork.findMany({
      include: {
        project: { select: { id: true, projectCode: true, projectName: true } },
      },
      orderBy: [{ status: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }],
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
    const { title, projectId, requestDate, dueDate, material, thickness, weight, status, memo } = body;

    if (!title?.trim()) {
      return NextResponse.json({ success: false, error: "작업명은 필수입니다." }, { status: 400 });
    }

    const work = await prisma.urgentWork.create({
      data: {
        title:       title.trim(),
        projectId:   projectId  || null,
        requestDate: requestDate ? new Date(requestDate) : new Date(),
        dueDate:     dueDate     ? new Date(dueDate)     : null,
        material:    material    || null,
        thickness:   thickness   ? Number(thickness)     : null,
        weight:      weight      ? Number(weight)        : null,
        status:      status      || "PENDING",
        memo:        memo        || null,
      },
      include: {
        project: { select: { id: true, projectCode: true, projectName: true } },
      },
    });

    return NextResponse.json({ success: true, data: work }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

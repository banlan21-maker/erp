import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// PATCH /api/urgent-works/[id]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { title, projectId, requestDate, dueDate, material, thickness, weight, status, memo } = body;

    const updated = await prisma.urgentWork.update({
      where: { id },
      data: {
        ...(title       !== undefined ? { title:       title.trim() }                      : {}),
        ...(projectId   !== undefined ? { projectId:   projectId || null }                 : {}),
        ...(requestDate !== undefined ? { requestDate: new Date(requestDate) }             : {}),
        ...(dueDate     !== undefined ? { dueDate:     dueDate ? new Date(dueDate) : null } : {}),
        ...(material    !== undefined ? { material:    material  || null }                 : {}),
        ...(thickness   !== undefined ? { thickness:   thickness ? Number(thickness) : null } : {}),
        ...(weight      !== undefined ? { weight:      weight    ? Number(weight)    : null } : {}),
        ...(status      !== undefined ? { status }                                         : {}),
        ...(memo        !== undefined ? { memo:        memo || null }                      : {}),
      },
      include: {
        project: { select: { id: true, projectCode: true, projectName: true } },
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// DELETE /api/urgent-works/[id]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.urgentWork.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

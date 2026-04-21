export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// DELETE /api/steel-plan-heat/[id] — 판번호 행 단위 삭제
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    await prisma.steelPlanHeat.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, error: "삭제 실패" }, { status: 500 });
  }
}

// PATCH /api/steel-plan-heat/[id] — 판번호 수정
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const { heatNo } = body;
  if (!heatNo?.trim()) {
    return NextResponse.json({ success: false, error: "판번호를 입력하세요." }, { status: 400 });
  }
  try {
    const updated = await prisma.steelPlanHeat.update({
      where: { id },
      data: { heatNo: heatNo.trim() },
    });
    return NextResponse.json({ success: true, data: updated });
  } catch {
    return NextResponse.json({ success: false, error: "수정 실패" }, { status: 500 });
  }
}

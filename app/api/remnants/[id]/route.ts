import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// 잔재번호 자동채번 (잔여분 재등록용)
async function generateRemnantNo(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `REM-${year}-`;
  const last = await prisma.remnant.findFirst({
    where: { remnantNo: { startsWith: prefix } },
    orderBy: { remnantNo: "desc" },
  });
  const seq = last ? parseInt(last.remnantNo.split("-")[2], 10) + 1 : 1;
  return `${prefix}${String(seq).padStart(3, "0")}`;
}

// PATCH /api/remnants/[id]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body   = await request.json();
    const {
      type, shape, material, thickness, weight,
      width1, length1, width2, length2,
      sourceProjectId, sourceVesselName, location, status,
      registeredBy, originalVesselName, drawingNo, consultPerson, needsConsult,
    } = body;

    const updated = await prisma.remnant.update({
      where: { id },
      data: {
        ...(type     !== undefined ? { type }                                  : {}),
        ...(shape    !== undefined ? { shape }                                 : {}),
        ...(material !== undefined ? { material: material.trim() }             : {}),
        ...(thickness!== undefined ? { thickness: Number(thickness) }          : {}),
        ...(weight   !== undefined ? { weight:    Number(weight) }             : {}),
        ...(width1   !== undefined ? { width1:    width1  ? Number(width1)  : null } : {}),
        ...(length1  !== undefined ? { length1:   length1 ? Number(length1) : null } : {}),
        ...(width2   !== undefined ? { width2:    width2  ? Number(width2)  : null } : {}),
        ...(length2  !== undefined ? { length2:   length2 ? Number(length2) : null } : {}),
        ...(sourceProjectId  !== undefined ? { sourceProjectId: sourceProjectId || null }         : {}),
        ...(sourceVesselName !== undefined ? { sourceVesselName: sourceVesselName?.trim() || null } : {}),
        ...(location         !== undefined ? { location: location?.trim() || null }               : {}),
        ...(status           !== undefined ? { status }                                            : {}),
        ...(registeredBy     !== undefined ? { registeredBy: registeredBy.trim() }                : {}),
        ...(originalVesselName !== undefined ? { originalVesselName: originalVesselName?.trim() || null } : {}),
        ...(drawingNo        !== undefined ? { drawingNo: drawingNo?.trim() || null }             : {}),
        ...(consultPerson    !== undefined ? { consultPerson: consultPerson?.trim() || null }     : {}),
        ...(needsConsult     !== undefined ? { needsConsult }                                      : {}),
      },
      include: {
        sourceProject: { select: { id: true, projectCode: true, projectName: true } },
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// POST /api/remnants/[id]/reregister — 잔여분 재등록 (기존 소진 + 새 잔재 생성)
// 이 route는 PATCH로 처리: action = "exhaust_and_reregister"
// 실제로는 별도 action 파라미터로 분기

// DELETE /api/remnants/[id] — 상태를 EXHAUSTED로 변경 (물리 삭제 금지)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.remnant.update({
      where: { id },
      data: { status: "EXHAUSTED" },
    });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

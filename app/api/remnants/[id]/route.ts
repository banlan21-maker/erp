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
      sourceProjectId, sourceVesselName, sourceBlock, heatNo,
      location, status, registeredBy, memo,
    } = body;

    // 수정으로 소진 처리하는 것도 삭제와 같다 — 확정해 둔 도면이 있으면 막는다.
    // (치수·재질 변경까지 막지는 않는다. 그건 오기 교정이 잦아 막으면 실무가 더 곤란하다.)
    if (status === "EXHAUSTED") {
      const blocked = await assignedDrawingBlock(id);
      if (blocked) return NextResponse.json({ success: false, error: blocked }, { status: 409 });
    }

    const updated = await prisma.remnant.update({
      where: { id },
      data: {
        ...(type     !== undefined ? { type }                                  : {}),
        ...(shape    !== undefined ? { shape }                                 : {}),
        ...(material !== undefined ? { material: material.trim().toUpperCase() } : {}),
        ...(thickness!== undefined ? { thickness: Number(thickness) }          : {}),
        ...(weight   !== undefined ? { weight:    Number(weight) }             : {}),
        ...(width1   !== undefined ? { width1:    width1  ? Number(width1)  : null } : {}),
        ...(length1  !== undefined ? { length1:   length1 ? Number(length1) : null } : {}),
        ...(width2   !== undefined ? { width2:    width2  ? Number(width2)  : null } : {}),
        ...(length2  !== undefined ? { length2:   length2 ? Number(length2) : null } : {}),
        ...(sourceProjectId  !== undefined ? { sourceProjectId: sourceProjectId || null }           : {}),
        ...(sourceVesselName !== undefined ? { sourceVesselName: sourceVesselName?.trim() || null } : {}),
        ...(sourceBlock      !== undefined ? { sourceBlock: sourceBlock?.trim() || null }           : {}),
        ...(heatNo           !== undefined ? { heatNo: heatNo?.trim() || null }                     : {}),
        ...(location         !== undefined ? { location: location?.trim() || null }                 : {}),
        ...(status           !== undefined ? { status }                                              : {}),
        ...(registeredBy     !== undefined ? { registeredBy: registeredBy.trim() }                  : {}),
        ...(memo             !== undefined ? { memo: memo?.trim() || null }                         : {}),
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

/**
 * 이 잔재를 쓰기로 확정해 둔 도면이 있으면 그 안내 문구를, 없으면 null 을 돌려준다.
 *
 * 전에는 확인 없이 소진/삭제해서, 도면은 '확정'인 채 잔재만 사라졌다. 그 상태로 절단완료를
 * 찍으면 이미 소진된 잔재를 다시 소진 처리하고(조용히 통과) 실물 없이 장부만 돈다.
 * 물리삭제(force)는 더 나쁘다 — 도면의 잔재 연결이 null 로 끊겨 '확정된 정규강재 행'으로
 * 둔갑하는데 실제로 확정해 둔 철판이 없어 절단완료 때 아무것도 안 줄어든다.
 * 정규강재가 확정된 상태에서 보호받는 것과 같은 규칙을 잔재에도 건다.
 */
async function assignedDrawingBlock(id: string): Promise<string | null> {
  const rows = await prisma.drawingList.findMany({
    where: { assignedRemnantId: id, status: { not: "CUT" } },
    select: { block: true, drawingNo: true, status: true, project: { select: { projectCode: true } } },
    take: 5,
  });
  if (rows.length === 0) return null;
  const where = rows
    .map(r => `${r.project?.projectCode ?? "?"}/${r.block ?? "-"} ${r.drawingNo ?? ""}`.trim())
    .join(", ");
  return `이 잔재를 사용하기로 확정해 둔 도면이 있습니다 — ${where}${rows.length >= 5 ? " 외" : ""}.
` +
         `해당 도면에서 [확정취소] 하거나 다른 강재로 바꾼 뒤에 처리하세요.`;
}

// POST /api/remnants/[id]/reregister — 잔여분 재등록 (기존 소진 + 새 잔재 생성)
// 이 route는 PATCH로 처리: action = "exhaust_and_reregister"
// 실제로는 별도 action 파라미터로 분기

// DELETE /api/remnants/[id]
// ?force=true → 소진 상태인 잔재를 완전 물리 삭제
// 기본 → 상태를 EXHAUSTED로 변경
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const force = new URL(request.url).searchParams.get("force") === "true";

    const blocked = await assignedDrawingBlock(id);
    if (blocked) return NextResponse.json({ success: false, error: blocked }, { status: 409 });

    if (force) {
      await prisma.remnant.delete({ where: { id } });
    } else {
      await prisma.remnant.update({ where: { id }, data: { status: "EXHAUSTED" } });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

/**
 * 추출 결과 단건 수정/삭제 (Phase B-1)
 *
 * PATCH  /api/cutting-drawings/extractions/[id]
 *   body: { drawingNo?, partWeight?, markingLen?, cuttingLen?, notes? }
 *   → 사용자 수동 수정. method 는 "MANUAL" 로 갱신
 *
 * DELETE /api/cutting-drawings/extractions/[id]
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function toNullableNumber(v: unknown): number | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const updated = await prisma.cuttingDrawingExtraction.update({
      where: { id },
      data: {
        drawingNo:  body.drawingNo  === undefined ? undefined : (body.drawingNo  || null),
        partWeight: toNullableNumber(body.partWeight),
        markingLen: toNullableNumber(body.markingLen),
        cuttingLen: toNullableNumber(body.cuttingLen),
        notes:      body.notes === undefined ? undefined : (body.notes || null),
        method:     "MANUAL",
      },
    });
    return NextResponse.json({ success: true, data: updated });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "수정 실패";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await prisma.cuttingDrawingExtraction.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "삭제 실패";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

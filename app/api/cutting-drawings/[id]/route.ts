/**
 * 절단도면 PDF 단건 — Phase A
 *
 * DELETE /api/cutting-drawings/[id]   → 파일 + 레코드 동시 삭제
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { unlink } from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";

function sanitizeSegment(s: string): string {
  return s.replace(/[\\/:*?"<>|]/g, "_").trim() || "unassigned";
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const pdf = await prisma.cuttingDrawingPdf.findUnique({ where: { id } });
    if (!pdf) {
      return NextResponse.json({ success: false, error: "찾을 수 없습니다." }, { status: 404 });
    }

    const blockSeg = sanitizeSegment(pdf.block ?? "unassigned");
    const filepath = path.join(process.cwd(), "public", "uploads", "drawings", pdf.projectId, blockSeg, pdf.storedName);
    try { await unlink(filepath); } catch { /* 파일 없어도 레코드는 삭제 */ }

    await prisma.cuttingDrawingPdf.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "삭제 실패";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

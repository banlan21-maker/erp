/**
 * 절단도면 PDF 의 추출 결과 조회 (Phase B-1)
 *
 * GET /api/cutting-drawings/[id]/extractions
 *   → 해당 PDF 의 모든 페이지 추출 결과 (pageNumber 오름차순)
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const list = await prisma.cuttingDrawingExtraction.findMany({
      where:   { pdfId: id },
      orderBy: { pageNumber: "asc" },
    });
    return NextResponse.json({ success: true, data: list });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "조회 실패";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

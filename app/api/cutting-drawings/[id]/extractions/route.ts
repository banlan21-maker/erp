/**
 * 절단도면 PDF 의 추출 결과 조회 + 수동 upsert (Phase B-1 + B-3)
 *
 * GET  /api/cutting-drawings/[id]/extractions
 *   → 해당 PDF 의 모든 페이지 추출 결과 (pageNumber 오름차순)
 *
 * POST /api/cutting-drawings/[id]/extractions
 *   body: { pageNumber, drawingNo?, partWeight?, markingLen?, cuttingLen?, notes? }
 *   → upsert (pageNumber 기준) — 수동 입력 모달용. method="MANUAL"
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function toNumOrNull(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

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

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    if (typeof body.pageNumber !== "number" || body.pageNumber < 1) {
      return NextResponse.json({ success: false, error: "pageNumber 필수 (1 이상)" }, { status: 400 });
    }

    const pdf = await prisma.cuttingDrawingPdf.findUnique({ where: { id }, select: { id: true } });
    if (!pdf) return NextResponse.json({ success: false, error: "PDF not found" }, { status: 404 });

    const drawingNo = typeof body.drawingNo === "string" ? body.drawingNo.trim() || null : null;
    const partWeight = toNumOrNull(body.partWeight);
    const markingLen = toNumOrNull(body.markingLen);
    const cuttingLen = toNumOrNull(body.cuttingLen);
    const notes      = typeof body.notes === "string" ? body.notes.trim() || null : null;

    // 4개 다 비어있으면 — 기존 행 있으면 삭제, 없으면 무시
    const allEmpty = !drawingNo && partWeight === null && markingLen === null && cuttingLen === null;
    if (allEmpty) {
      await prisma.cuttingDrawingExtraction.deleteMany({
        where: { pdfId: id, pageNumber: body.pageNumber },
      });
      return NextResponse.json({ success: true, deleted: true });
    }

    const saved = await prisma.cuttingDrawingExtraction.upsert({
      where: { pdfId_pageNumber: { pdfId: id, pageNumber: body.pageNumber } },
      create: {
        pdfId:      id,
        pageNumber: body.pageNumber,
        drawingNo, partWeight, markingLen, cuttingLen, notes,
        method:     "MANUAL",
      },
      update: {
        drawingNo, partWeight, markingLen, cuttingLen, notes,
        method:     "MANUAL",
        presetId:   null, // 수동 입력은 프리셋 무관
      },
    });
    return NextResponse.json({ success: true, data: saved });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "저장 실패";
    console.error("[POST /api/cutting-drawings/[id]/extractions]", err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

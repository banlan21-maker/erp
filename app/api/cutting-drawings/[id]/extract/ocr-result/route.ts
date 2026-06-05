/**
 * 클라이언트 OCR 결과 저장 (Phase B-2)
 *
 * POST /api/cutting-drawings/[id]/extract/ocr-result
 *   body: { pageNumber, presetId, items: [{x,y,w,str}], confidence, fullText? }
 *
 * 클라이언트가 Tesseract.js 로 OCR 한 결과를 보내면 서버가:
 *   1) 프리셋 룰 로드
 *   2) lib/cutting-pdf-extract.ts 의 extractPage() 실행
 *   3) CuttingDrawingExtraction upsert (method="OCR", confidence 함께)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { extractPage, type PresetRules, type TextItem } from "@/lib/cutting-pdf-extract";

export const dynamic = "force-dynamic";

interface OcrRequestBody {
  pageNumber: number;
  presetId:   string;
  items:      TextItem[];
  confidence?: number;
  fullText?:   string;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json() as OcrRequestBody;

    if (typeof body.pageNumber !== "number" || !body.presetId || !Array.isArray(body.items)) {
      return NextResponse.json({ success: false, error: "pageNumber, presetId, items 필수" }, { status: 400 });
    }

    const pdf = await prisma.cuttingDrawingPdf.findUnique({ where: { id }, select: { id: true } });
    if (!pdf) return NextResponse.json({ success: false, error: "PDF not found" }, { status: 404 });

    const preset = await prisma.cuttingDrawingPreset.findUnique({ where: { id: body.presetId } });
    if (!preset) return NextResponse.json({ success: false, error: "Preset not found" }, { status: 404 });

    const result = extractPage(body.items, preset.rules as unknown as PresetRules);

    const saved = await prisma.cuttingDrawingExtraction.upsert({
      where: { pdfId_pageNumber: { pdfId: id, pageNumber: body.pageNumber } },
      create: {
        pdfId:      id,
        presetId:   preset.id,
        pageNumber: body.pageNumber,
        drawingNo:  result.drawingNo,
        partWeight: result.partWeight,
        markingLen: result.markingLen,
        cuttingLen: result.cuttingLen,
        method:     "OCR",
        confidence: typeof body.confidence === "number" ? body.confidence : null,
        rawText:    result.rawText,
      },
      update: {
        drawingNo:  result.drawingNo,
        partWeight: result.partWeight,
        markingLen: result.markingLen,
        cuttingLen: result.cuttingLen,
        method:     "OCR",
        confidence: typeof body.confidence === "number" ? body.confidence : null,
        rawText:    result.rawText,
        presetId:   preset.id,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        id:         saved.id,
        pageNumber: saved.pageNumber,
        drawingNo:  saved.drawingNo,
        partWeight: saved.partWeight,
        markingLen: saved.markingLen,
        cuttingLen: saved.cuttingLen,
        confidence: saved.confidence,
        matched:    result.matched,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "OCR 결과 저장 실패";
    console.error("[POST /api/cutting-drawings/[id]/extract/ocr-result]", err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

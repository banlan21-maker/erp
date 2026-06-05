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

    const rules = preset.rules as unknown as PresetRules;

    // detectKeywords 매칭 안 됨 → 저장 안 함 (양식과 무관한 페이지)
    const upper = (body.fullText ?? body.items.map(i => i.str).join(" ")).toUpperCase();
    const detectKws = (rules.detectKeywords ?? []).map(k => k.toUpperCase());
    const negKws    = (rules.negativeKeywords ?? []).map(k => k.toUpperCase());
    if (negKws.some(k => upper.includes(k))) {
      return NextResponse.json({ success: true, skipped: true, reason: "negative keyword matched" });
    }
    if (detectKws.length > 0 && !detectKws.some(k => upper.includes(k))) {
      return NextResponse.json({ success: true, skipped: true, reason: "detect keyword not found" });
    }

    const result = extractPage(body.items, rules);

    // 4개 필드 모두 null → 빈 행 만들지 않고 skip
    if (!result.drawingNo && result.partWeight === null && result.markingLen === null && result.cuttingLen === null) {
      return NextResponse.json({ success: true, skipped: true, reason: "no fields extracted" });
    }

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

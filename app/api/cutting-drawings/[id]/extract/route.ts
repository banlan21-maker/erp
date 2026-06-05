/**
 * 절단도면 PDF 추출 실행 (Phase B-1)
 *
 * POST /api/cutting-drawings/[id]/extract
 *   body: { presetId?: string, forceOverwrite?: boolean }
 *
 * 흐름:
 *   1) PDF 디스크 readFile
 *   2) presetId 명시 없으면 자동 매칭 (모든 페이지의 fullText 합쳐서 detectPreset)
 *   3) 페이지마다 pdfjs textContent → 라벨 룰 적용 → upsert
 *   4) textItems 없는 페이지는 method='OCR' 로 표시만 (클라이언트가 별도 endpoint 로 OCR 결과 POST 예정)
 *   5) detectKeywords 매칭 안 되는 페이지는 skip (저장 안 함)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readFile } from "fs/promises";
import path from "path";
import { extractPage, detectPreset, type PresetRules, type TextItem } from "@/lib/cutting-pdf-extract";
import { getServerPdfjs } from "@/lib/pdfjs-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function sanitizeSegment(s: string): string {
  return s.replace(/[\\/:*?"<>|]/g, "_").trim() || "unassigned";
}

interface PresetRow {
  id:    string;
  name:  string;
  method: string;
  rules: PresetRules;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const presetIdHint = typeof body.presetId === "string" ? body.presetId : null;

    const pdf = await prisma.cuttingDrawingPdf.findUnique({ where: { id } });
    if (!pdf) return NextResponse.json({ success: false, error: "PDF not found" }, { status: 404 });

    const blockSeg = sanitizeSegment(pdf.block ?? "unassigned");
    const filepath = path.join(process.cwd(), "public", "uploads", "drawings", pdf.projectId, blockSeg, pdf.storedName);

    const buf = await readFile(filepath).catch(() => null);
    if (!buf) return NextResponse.json({ success: false, error: "PDF file missing on disk" }, { status: 404 });

    // 프리셋 로드
    const presetsRaw = await prisma.cuttingDrawingPreset.findMany();
    const presets: PresetRow[] = presetsRaw.map(p => ({
      id: p.id, name: p.name, method: p.method, rules: p.rules as unknown as PresetRules,
    }));

    // PDF 열기 (worker 경로 설정된 헬퍼 사용)
    const pdfjs = await getServerPdfjs();
    const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), verbosity: 0 }).promise;

    // 페이지 textContent 모두 미리 수집
    type PageData = { pageNumber: number; items: TextItem[]; fullText: string };
    const pages: PageData[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const tc = await page.getTextContent();
      const items: TextItem[] = (tc.items as Array<{ str?: string; transform?: number[]; width?: number }>)
        .filter(it => typeof it.str === "string" && it.str.trim().length > 0 && Array.isArray(it.transform))
        .map(it => ({
          x:   Math.round(it.transform![4]),
          y:   Math.round(it.transform![5]),
          w:   Math.round(it.width ?? 0),
          str: it.str!,
        }));
      pages.push({
        pageNumber: i,
        items,
        fullText: items.map(it => it.str).join(" "),
      });
    }

    // 프리셋 자동 매칭 (모든 페이지 fullText 합쳐서)
    let presetId = presetIdHint;
    if (!presetId) {
      const totalText = pages.map(p => p.fullText).join("\n");
      presetId = detectPreset(totalText, presets);
    }
    const preset = presetId ? presets.find(p => p.id === presetId) : null;

    // 자동 매칭 실패 — 텍스트 PDF 가 거의 없는 경우 (OCR 필요 PDF) 발생.
    // OCR_NEEDED 페이지 목록 + 가용 프리셋만 반환 → 클라이언트가 사용자에게 프리셋 선택 받고 OCR 진행.
    if (!preset) {
      const ocrPages = pages.filter(p => p.items.length < 5).map(p => p.pageNumber);
      return NextResponse.json({
        success: true,
        preset: null,
        summary: { totalPages: doc.numPages, extracted: 0, skipped: 0, ocrNeeded: ocrPages.length },
        items: ocrPages.map(pn => ({
          pageNumber: pn,
          drawingNo:  null, partWeight: null, markingLen: null, cuttingLen: null,
          method:     "OCR_NEEDED" as const,
          matched:    { drawingNo: false, partWeight: false, markingLen: false, cuttingLen: false },
        })),
        availablePresets: presets.map(p => ({ id: p.id, name: p.name, method: p.method })),
      });
    }

    // 기존 추출 결과 클리어 (같은 PDF 재추출)
    await prisma.cuttingDrawingExtraction.deleteMany({ where: { pdfId: id } });

    const detectKws = (preset.rules.detectKeywords ?? []).map(k => k.toUpperCase());
    const items: Array<{
      pageNumber: number;
      drawingNo:  string | null;
      partWeight: number | null;
      markingLen: number | null;
      cuttingLen: number | null;
      method:     "TEXT" | "OCR_NEEDED" | "SKIPPED";
      matched:    { drawingNo: boolean; partWeight: boolean; markingLen: boolean; cuttingLen: boolean };
    }> = [];
    let extracted = 0, skipped = 0, ocrNeeded = 0;

    for (const p of pages) {
      // 텍스트 없음 → OCR 필요 (클라이언트 후처리)
      if (p.items.length < 5 && preset.method !== "OCR") {
        items.push({
          pageNumber: p.pageNumber,
          drawingNo: null, partWeight: null, markingLen: null, cuttingLen: null,
          method: "OCR_NEEDED",
          matched: { drawingNo: false, partWeight: false, markingLen: false, cuttingLen: false },
        });
        ocrNeeded++;
        continue;
      }
      // detectKeywords 매칭 — 1개라도 있으면 추출 시도
      const upper = p.fullText.toUpperCase();
      const kwHits = detectKws.filter(k => upper.includes(k)).length;
      if (detectKws.length > 0 && kwHits === 0) {
        skipped++;
        continue; // 다른 페이지 (예: SHELL TEMPLATE) — 저장 X
      }

      const r = extractPage(p.items, preset.rules);
      await prisma.cuttingDrawingExtraction.create({
        data: {
          pdfId:      id,
          presetId:   preset.id,
          pageNumber: p.pageNumber,
          drawingNo:  r.drawingNo,
          partWeight: r.partWeight,
          markingLen: r.markingLen,
          cuttingLen: r.cuttingLen,
          method:     "TEXT",
          rawText:    r.rawText,
        },
      });
      items.push({
        pageNumber: p.pageNumber,
        drawingNo:  r.drawingNo,
        partWeight: r.partWeight,
        markingLen: r.markingLen,
        cuttingLen: r.cuttingLen,
        method:     "TEXT",
        matched:    r.matched,
      });
      extracted++;
    }

    // pdf.presetId 갱신
    await prisma.cuttingDrawingPdf.update({
      where: { id },
      data: { presetId: preset.id },
    });

    return NextResponse.json({
      success: true,
      preset: { id: preset.id, name: preset.name, method: preset.method },
      summary: { totalPages: doc.numPages, extracted, skipped, ocrNeeded },
      items,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "추출 실패";
    console.error("[POST /api/cutting-drawings/[id]/extract]", err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

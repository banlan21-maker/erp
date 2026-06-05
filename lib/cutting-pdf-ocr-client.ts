/**
 * 절단도면 PDF 클라이언트 측 OCR (Phase B-2)
 *
 * Tesseract.js (영문 모드) + pdfjs-dist canvas 렌더링.
 * path-outlined PDF (1037, S40PS) 의 본문 페이지를 사용자 PC 브라우저에서 처리 → NAS 부담 0.
 *
 * 사용 흐름:
 *   const worker = await createOcrWorker(onLoggerMessage);
 *   const items  = await ocrPdfPage(worker, pdfUrl, pageNumber, scale, onProgress);
 *   // items 는 lib/cutting-pdf-extract.ts 의 TextItem 형태 (y 는 좌하단 기준으로 변환됨)
 *   await terminateOcrWorker(worker);
 */

import { createWorker, type Worker, PSM, type LoggerMessage } from "tesseract.js";
import type { TextItem } from "./cutting-pdf-extract";

export type OcrProgress = (info: { stage: string; progress: number }) => void;

export async function createOcrWorker(onLogger?: (m: LoggerMessage) => void): Promise<Worker> {
  const worker = await createWorker("eng", 1, {
    logger: m => { if (onLogger) onLogger(m); },
  });
  await worker.setParameters({
    tessedit_pageseg_mode: PSM.SPARSE_TEXT,
    preserve_interword_spaces: "1",
  });
  return worker;
}

export async function terminateOcrWorker(worker: Worker | null) {
  if (!worker) return;
  try { await worker.terminate(); } catch { /* noop */ }
}

// PDF 페이지를 canvas 로 렌더 (회전 정상화 + 흰색 배경 — OCR 인식률 향상)
async function renderPdfPageToCanvas(pdfUrl: string, pageNumber: number, scale: number): Promise<HTMLCanvasElement> {
  const pdfjs = await import("pdfjs-dist");
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
  }
  const loadingTask = pdfjs.getDocument({ url: pdfUrl });
  const doc = await loadingTask.promise;
  try {
    const page = await doc.getPage(pageNumber);
    const viewport = page.getViewport({ scale, rotation: 0 });
    const canvas = document.createElement("canvas");
    canvas.width  = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context 생성 실패");
    // 흰색 배경 — vector path 만 있는 PDF 의 transparent 배경 방지 (OCR 핵심)
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    return canvas;
  } finally {
    await (doc as unknown as { destroy?: () => Promise<void> }).destroy?.().catch(() => {});
  }
}

/**
 * 한 페이지 OCR 실행.
 * 반환되는 TextItem 의 y 좌표는 좌하단 기준 (PDF point 스타일) — extractPage() 알고리즘과 호환.
 */
export async function ocrPdfPage(
  worker:     Worker,
  pdfUrl:     string,
  pageNumber: number,
  scale:      number = 2,
  onProgress?: OcrProgress,
): Promise<{ items: TextItem[]; fullText: string; avgConfidence: number; canvasWidth: number; canvasHeight: number }> {
  onProgress?.({ stage: "rendering", progress: 0 });
  const canvas = await renderPdfPageToCanvas(pdfUrl, pageNumber, scale);
  onProgress?.({ stage: "rendering", progress: 1 });

  onProgress?.({ stage: "ocr", progress: 0 });
  // Tesseract.js v6+ 부터 lines/words 가 기본 출력에서 빠짐. output 옵션으로 명시 활성화.
  const { data } = await worker.recognize(
    canvas,
    {},
    { blocks: true } as unknown as Record<string, unknown>,
  );
  onProgress?.({ stage: "ocr", progress: 1 });

  // v6+ 의 lines 위치: data.blocks[].paragraphs[].lines[]  또는  data.lines (옵션에 따라)
  type LineLike = { text: string; bbox?: { x0: number; y0: number; x1: number; y1: number }; confidence?: number };
  const flatLines: LineLike[] = [];
  const root = data as unknown as {
    lines?:  LineLike[];
    blocks?: Array<{ paragraphs?: Array<{ lines?: LineLike[] }> }>;
  };
  if (Array.isArray(root.lines) && root.lines.length > 0) {
    flatLines.push(...root.lines);
  } else if (Array.isArray(root.blocks)) {
    for (const b of root.blocks) for (const p of b.paragraphs ?? []) for (const l of p.lines ?? []) flatLines.push(l);
  }

  const items: TextItem[] = flatLines
    .filter(l => l.text?.trim() && l.bbox)
    .map(l => {
      const bbox = l.bbox!;
      return {
        x: Math.round(bbox.x0),
        y: Math.round(canvas.height - bbox.y1),
        w: Math.round(bbox.x1 - bbox.x0),
        str: l.text.trim(),
      };
    });

  const confidences = flatLines.map(l => l.confidence ?? 0).filter(c => c > 0);
  const avgConfidence = confidences.length ? confidences.reduce((a, b) => a + b, 0) / confidences.length : 0;

  // 디버그용 콘솔 로그 (사용자가 F12 콘솔에서 OCR 결과 직접 확인)
  if (typeof window !== "undefined" && window.console) {
    console.log(`[OCR p${pageNumber}] text length=${(data.text ?? "").length}, lines=${flatLines.length}, conf=${avgConfidence.toFixed(0)}%`);
    if (flatLines.length === 0 || (data.text ?? "").length < 20) {
      console.warn(`[OCR p${pageNumber}] NEAR-EMPTY RESULT — canvas ${canvas.width}x${canvas.height}, text head:`, (data.text ?? "").slice(0, 200));
    }
  }

  return {
    items,
    fullText: data.text ?? "",
    avgConfidence: avgConfidence / 100,
    canvasWidth:  canvas.width,
    canvasHeight: canvas.height,
  };
}

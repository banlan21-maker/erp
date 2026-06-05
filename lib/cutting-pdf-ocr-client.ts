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

// PDF 페이지를 canvas 로 렌더 (회전 정상화)
async function renderPdfPageToCanvas(pdfUrl: string, pageNumber: number, scale: number): Promise<HTMLCanvasElement> {
  const pdfjs = await import("pdfjs-dist");
  // worker 는 cutting-pdf-viewer 와 동일 경로
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
  }
  const loadingTask = pdfjs.getDocument({ url: pdfUrl });
  const doc = await loadingTask.promise;
  try {
    const page = await doc.getPage(pageNumber);
    // rotation: 0 강제 → 회전된 페이지도 정방향 canvas 로
    const viewport = page.getViewport({ scale, rotation: 0 });
    const canvas = document.createElement("canvas");
    canvas.width  = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context 생성 실패");
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
  const { data } = await worker.recognize(canvas);
  onProgress?.({ stage: "ocr", progress: 1 });

  // line 단위로 TextItem 만들기 — 라벨+값 함께 들어있어 정규식 매칭이 더 안정적
  const lines = (data as unknown as { lines?: Array<{ text: string; bbox?: { x0: number; y0: number; x1: number; y1: number }; confidence?: number }> }).lines ?? [];
  const items: TextItem[] = lines
    .filter(l => l.text?.trim() && l.bbox)
    .map(l => {
      const bbox = l.bbox!;
      return {
        x: Math.round(bbox.x0),
        y: Math.round(canvas.height - bbox.y1), // 좌상단(canvas) → 좌하단(PDF point) 좌표 변환
        w: Math.round(bbox.x1 - bbox.x0),
        str: l.text.trim(),
      };
    });

  const wordsArr = (data as unknown as { words?: Array<{ confidence?: number }> }).words ?? [];
  const confidences = wordsArr.map(w => w.confidence ?? 0);
  const avgConfidence = confidences.length ? confidences.reduce((a, b) => a + b, 0) / confidences.length : 0;

  return {
    items,
    fullText: data.text ?? "",
    avgConfidence: avgConfidence / 100, // 0~1 로 정규화
    canvasWidth:  canvas.width,
    canvasHeight: canvas.height,
  };
}

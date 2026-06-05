/**
 * 서버측 pdfjs 로더 (Phase B 공용)
 *
 * Next.js standalone 모드에서 pdfjs 의 worker 파일을 못 찾는 문제 해결.
 * `outputFileTracingIncludes` 로 worker 파일을 standalone 빌드에 포함시킨 뒤,
 * 여기서 절대경로로 GlobalWorkerOptions.workerSrc 를 설정.
 */

import path from "path";
import { existsSync } from "fs";
import { pathToFileURL } from "url";

type Pdfjs = typeof import("pdfjs-dist/legacy/build/pdf.mjs");

let _pdfjs: Pdfjs | null = null;

export async function getServerPdfjs(): Promise<Pdfjs> {
  if (_pdfjs) return _pdfjs;
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

  // standalone build cwd = /app, dev cwd = 프로젝트 루트.
  // 후보 경로 순회 — 처음 발견되는 것 사용.
  const candidates = [
    path.join(process.cwd(), "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"),
    path.join(process.cwd(), "node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs"),
    path.join(process.cwd(), "node_modules/pdfjs-dist/build/pdf.worker.mjs"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) {
      pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(p).href;
      break;
    }
  }

  _pdfjs = pdfjs;
  return pdfjs;
}

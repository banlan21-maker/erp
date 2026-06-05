/**
 * pdfjs worker 파일을 node_modules → public/pdfjs/ 로 복사
 *
 * package.json 의 postinstall 에서 호출됨 — npm install 시 자동 동기화.
 * pdfjs-dist 버전 업데이트 시 worker 파일 버전 mismatch 방지.
 *
 * 클라이언트(react-pdf, tesseract OCR 렌더링) 는 /pdfjs/pdf.worker.min.mjs 를 fetch
 * 서버는 lib/pdfjs-server.ts 가 node_modules 의 worker 를 직접 사용
 */

import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const src = join(root, "node_modules", "pdfjs-dist", "build", "pdf.worker.min.mjs");
const dstDir = join(root, "public", "pdfjs");
const dst = join(dstDir, "pdf.worker.min.mjs");

if (!existsSync(src)) {
  console.warn(`[copy-pdfjs-worker] source not found: ${src} — skipping`);
  process.exit(0);
}

mkdirSync(dstDir, { recursive: true });
copyFileSync(src, dst);
console.log(`[copy-pdfjs-worker] ${src} → ${dst}`);

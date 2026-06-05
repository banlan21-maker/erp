"use client";

/**
 * 절단도면 PDF 뷰어 — react-pdf
 * 페이지 네비, 인쇄, 다운로드, 확대/축소
 *
 * 사용 시: next/dynamic 으로 ssr:false 임포트 권장
 *   const CuttingPdfViewer = dynamic(() => import("@/components/cutting-pdf-viewer"), { ssr: false });
 */

import { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { ChevronLeft, ChevronRight, Printer, Download, ZoomIn, ZoomOut, X } from "lucide-react";

// pdfjs worker — 빌드 시 /public/pdfjs/pdf.worker.min.mjs 정적 호스팅
pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";

interface Props {
  pdfId:    string;
  filename: string;
  onClose?: () => void;
}

export default function CuttingPdfViewer({ pdfId, filename, onClose }: Props) {
  const [numPages, setNumPages] = useState(0);
  const [page, setPage]         = useState(1);
  const [scale, setScale]       = useState(1.0);
  const [error, setError]       = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const fileUrl = `/api/cutting-drawings/${pdfId}/file`;

  // 페이지 변경 시 컨테이너 스크롤 상단으로
  useEffect(() => {
    containerRef.current?.scrollTo({ top: 0 });
  }, [page]);

  const handlePrint = () => {
    window.open(fileUrl, "_blank");
  };

  const handleDownload = () => {
    const a = document.createElement("a");
    a.href = `${fileUrl}?download=1`;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col">
        {/* 헤더 */}
        <div className="px-5 py-3 border-b flex items-center justify-between gap-3 bg-gray-50 rounded-t-xl">
          <h3 className="font-bold text-sm text-gray-800 truncate flex-1" title={filename}>{filename}</h3>
          <div className="flex items-center gap-1.5">
            {numPages > 0 && (
              <>
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                  className="p-1.5 border border-gray-200 rounded hover:bg-gray-100 disabled:opacity-30">
                  <ChevronLeft size={14} />
                </button>
                <span className="text-xs text-gray-600 font-mono px-1">{page} / {numPages}</span>
                <button onClick={() => setPage(p => Math.min(numPages, p + 1))} disabled={page >= numPages}
                  className="p-1.5 border border-gray-200 rounded hover:bg-gray-100 disabled:opacity-30">
                  <ChevronRight size={14} />
                </button>
                <div className="w-px h-5 bg-gray-300 mx-1" />
                <button onClick={() => setScale(s => Math.max(0.5, s - 0.2))}
                  className="p-1.5 border border-gray-200 rounded hover:bg-gray-100">
                  <ZoomOut size={14} />
                </button>
                <span className="text-xs text-gray-600 font-mono px-1">{Math.round(scale * 100)}%</span>
                <button onClick={() => setScale(s => Math.min(3, s + 0.2))}
                  className="p-1.5 border border-gray-200 rounded hover:bg-gray-100">
                  <ZoomIn size={14} />
                </button>
                <div className="w-px h-5 bg-gray-300 mx-1" />
              </>
            )}
            <button onClick={handlePrint} className="px-2.5 py-1.5 text-xs border border-gray-300 rounded hover:bg-gray-100 flex items-center gap-1">
              <Printer size={13} /> 인쇄
            </button>
            <button onClick={handleDownload} className="px-2.5 py-1.5 text-xs border border-gray-300 rounded hover:bg-gray-100 flex items-center gap-1">
              <Download size={13} /> 다운로드
            </button>
            {onClose && (
              <button onClick={onClose} className="p-1.5 ml-1 hover:bg-gray-200 rounded">
                <X size={16} />
              </button>
            )}
          </div>
        </div>

        {/* 본문 */}
        <div ref={containerRef} className="flex-1 overflow-auto bg-gray-200 flex justify-center items-start p-4">
          {error ? (
            <div className="text-red-600 text-sm p-8">
              PDF 로드 실패: {error}
            </div>
          ) : (
            <Document
              file={fileUrl}
              onLoadSuccess={({ numPages }) => { setNumPages(numPages); setError(null); }}
              onLoadError={(e) => setError(e.message)}
              loading={<div className="text-gray-500 text-sm p-8">PDF 로딩 중...</div>}
            >
              <Page
                pageNumber={page}
                scale={scale}
                renderTextLayer={false}
                renderAnnotationLayer={false}
              />
            </Document>
          )}
        </div>
      </div>
    </div>
  );
}

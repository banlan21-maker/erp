"use client";

/**
 * 절단도면 PDF 수동 입력 모달 (Phase B-3)
 *
 * 좌측: PDF 페이지 미리보기 (react-pdf, 60%)
 * 우측: 4 필드 입력 폼 (도면번호 / 부재중량 / 마킹길이 / 절단길이) (40%)
 * 페이지 네비 (이전/다음/점프) + 줌 + [저장+다음] / [건너뛰기]
 *
 * 페이지 진입 시 GET extractions 로 기존 데이터 prefill — 자동 추출 결과 보면서 검토/수정 가능
 * 저장 시 POST /api/cutting-drawings/[id]/extractions (upsert, method="MANUAL")
 */

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, X, Save, SkipForward, Loader2, RotateCw } from "lucide-react";

pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";

interface Props {
  pdfId:      string;
  filename:   string;
  pageCount:  number;
  startPage?: number;
  onClose:    () => void;
  onSaved?:   () => void;
}

interface FormState {
  drawingNo:  string;
  partWeight: string;
  markingLen: string;
  cuttingLen: string;
}

const emptyForm: FormState = { drawingNo: "", partWeight: "", markingLen: "", cuttingLen: "" };

export default function CuttingPdfManualInputModal({
  pdfId, filename, pageCount, startPage = 1, onClose, onSaved,
}: Props) {
  const [currentPage, setCurrentPage] = useState(startPage);
  const [numPages,    setNumPages]    = useState(pageCount);
  const [scale,       setScale]       = useState(1.2);
  const [rotation,    setRotation]    = useState(0);
  const [form,        setForm]        = useState<FormState>(emptyForm);
  const [loadingPage, setLoadingPage] = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [pdfError,    setPdfError]    = useState<string | null>(null);
  const pdfContainerRef = useRef<HTMLDivElement>(null);

  // file prop 을 useMemo 로 안정화 — 매 렌더 같은 object reference 가 react-pdf 의 재요청 트리거 안 함
  const pdfFile = useMemo(() => ({ url: `/api/cutting-drawings/${pdfId}/file` }), [pdfId]);

  // 페이지 진입 시 기존 추출 결과 prefill
  const loadCurrentPage = useCallback(async () => {
    setLoadingPage(true); setError(null);
    try {
      const r = await fetch(`/api/cutting-drawings/${pdfId}/extractions`);
      const d = await r.json();
      if (d.success) {
        const existing = (d.data as Array<{ pageNumber: number; drawingNo: string | null; partWeight: number | null; markingLen: number | null; cuttingLen: number | null }>)
          .find(row => row.pageNumber === currentPage);
        if (existing) {
          setForm({
            drawingNo:  existing.drawingNo  ?? "",
            partWeight: existing.partWeight !== null ? String(existing.partWeight) : "",
            markingLen: existing.markingLen !== null ? String(existing.markingLen) : "",
            cuttingLen: existing.cuttingLen !== null ? String(existing.cuttingLen) : "",
          });
        } else {
          setForm(emptyForm);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "조회 실패");
    } finally { setLoadingPage(false); }
    pdfContainerRef.current?.scrollTo({ top: 0, behavior: "auto" });
  }, [pdfId, currentPage]);

  useEffect(() => { loadCurrentPage(); }, [loadCurrentPage]);

  const saveAndNext = async () => {
    setSaving(true); setError(null);
    try {
      const r = await fetch(`/api/cutting-drawings/${pdfId}/extractions`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pageNumber: currentPage,
          drawingNo:  form.drawingNo,
          partWeight: form.partWeight,
          markingLen: form.markingLen,
          cuttingLen: form.cuttingLen,
        }),
      });
      const d = await r.json();
      if (!d.success) { setError(d.error || "저장 실패"); return; }
      onSaved?.();
      if (currentPage < numPages) setCurrentPage(p => p + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장 중 오류");
    } finally { setSaving(false); }
  };

  const skipPage = () => {
    if (currentPage < numPages) setCurrentPage(p => p + 1);
  };

  const goToPage = (n: number) => {
    if (n >= 1 && n <= numPages) setCurrentPage(n);
  };

  const updateField = (key: keyof FormState, value: string) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const handleClose = () => {
    if (saving) return;
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-3">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-[1500px] h-[94vh] flex flex-col">
        {/* 헤더 */}
        <div className="px-5 py-3 border-b flex items-center justify-between gap-3 bg-gray-50 rounded-t-xl">
          <div className="min-w-0 flex-1">
            <h3 className="font-bold text-sm text-gray-800 truncate" title={filename}>✏️ 수동 입력 — {filename}</h3>
            <div className="text-xs text-gray-500 mt-0.5">
              PDF 미리보기 보면서 직접 입력 · 자동 추출 결과 있으면 미리 채워짐 · 저장하면 자동으로 다음 페이지
            </div>
          </div>
          <button onClick={handleClose} disabled={saving} className="p-1.5 hover:bg-gray-200 rounded disabled:opacity-50">
            <X size={16} />
          </button>
        </div>

        {/* 본문 — split 레이아웃 */}
        <div className="flex-1 overflow-hidden flex">

          {/* 좌측: PDF 뷰어 */}
          <div className="flex-[6] flex flex-col border-r border-gray-200 bg-gray-100 min-w-0">
            <div className="px-3 py-2 border-b border-gray-200 bg-white flex items-center gap-2 flex-wrap">
              <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage <= 1}
                className="p-1.5 border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-30">
                <ChevronLeft size={14} />
              </button>
              <span className="text-xs text-gray-700 font-mono">
                <input type="number" value={currentPage}
                  onChange={e => goToPage(parseInt(e.target.value, 10) || 1)}
                  className="w-12 text-center border border-gray-200 rounded px-1 py-0.5 text-xs" />
                {" / "} <span className="text-gray-500">{numPages}</span>
              </span>
              <button onClick={() => setCurrentPage(p => Math.min(numPages, p + 1))} disabled={currentPage >= numPages}
                className="p-1.5 border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-30">
                <ChevronRight size={14} />
              </button>
              <div className="w-px h-5 bg-gray-300 mx-1" />
              <button onClick={() => setScale(s => Math.max(0.5, s - 0.2))}
                className="p-1.5 border border-gray-200 rounded hover:bg-gray-50"><ZoomOut size={14} /></button>
              <span className="text-xs text-gray-600 font-mono w-12 text-center">{Math.round(scale * 100)}%</span>
              <button onClick={() => setScale(s => Math.min(3, s + 0.2))}
                className="p-1.5 border border-gray-200 rounded hover:bg-gray-50"><ZoomIn size={14} /></button>
              <div className="w-px h-5 bg-gray-300 mx-1" />
              <button onClick={() => setRotation(r => (r + 90) % 360)} title="회전"
                className="p-1.5 border border-gray-200 rounded hover:bg-gray-50"><RotateCw size={14} /></button>
            </div>
            <div ref={pdfContainerRef} className="flex-1 overflow-auto flex justify-center items-start p-3">
              {pdfError ? (
                <div className="text-red-600 text-xs p-4 bg-red-50 rounded border border-red-200 max-w-md">
                  PDF 로드 실패: {pdfError}
                  <div className="text-gray-500 text-[10px] mt-2 break-all">URL: {pdfFile.url}</div>
                </div>
              ) : (
                <Document file={pdfFile}
                  onLoadSuccess={({ numPages }) => { setNumPages(numPages); setPdfError(null); }}
                  onLoadError={e => { setPdfError(e.message); console.error("[manual-input PDF error]", e); }}
                  loading={<div className="text-gray-500 text-sm p-8">PDF 로딩 중...</div>}>
                  <Page pageNumber={currentPage} scale={scale} rotate={rotation}
                    renderTextLayer={false} renderAnnotationLayer={false} />
                </Document>
              )}
            </div>
          </div>

          {/* 우측: 입력 폼 */}
          <div className="flex-[4] flex flex-col bg-white min-w-[360px]">
            <div className="px-5 py-3 border-b border-gray-200 bg-blue-50">
              <div className="text-xs text-blue-700 font-semibold mb-1">페이지 {currentPage} 입력</div>
              <div className="text-[11px] text-blue-600">
                PDF 의 도면번호 / 부재중량 / 마킹길이 / 절단길이 를 보고 직접 입력하세요.
              </div>
            </div>

            <div className="flex-1 overflow-auto p-5 space-y-4">
              {loadingPage && (
                <div className="text-center text-gray-400 text-xs py-2">
                  <Loader2 size={12} className="animate-spin inline mr-1" /> 기존 데이터 조회 중...
                </div>
              )}

              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">도면번호</label>
                <input type="text" value={form.drawingNo} onChange={e => updateField("drawingNo", e.target.value)}
                  placeholder="예: CNX01, NCP01, CNK001"
                  className="w-full h-10 px-3 border border-gray-300 rounded-md text-sm font-mono focus:outline-none focus:border-blue-500" />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">부재중량 (Kg)</label>
                <input type="number" step="0.1" value={form.partWeight} onChange={e => updateField("partWeight", e.target.value)}
                  placeholder="예: 1459.5"
                  className="w-full h-10 px-3 border border-gray-300 rounded-md text-sm font-mono text-right focus:outline-none focus:border-blue-500" />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">마킹길이 (M)</label>
                <input type="number" step="0.1" value={form.markingLen} onChange={e => updateField("markingLen", e.target.value)}
                  placeholder="예: 0.0"
                  className="w-full h-10 px-3 border border-gray-300 rounded-md text-sm font-mono text-right focus:outline-none focus:border-blue-500" />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">절단길이 (M)</label>
                <input type="number" step="0.1" value={form.cuttingLen} onChange={e => updateField("cuttingLen", e.target.value)}
                  placeholder="예: 267.9"
                  className="w-full h-10 px-3 border border-gray-300 rounded-md text-sm font-mono text-right focus:outline-none focus:border-blue-500" />
              </div>

              {error && (
                <div className="text-red-600 text-xs bg-red-50 border border-red-200 rounded p-2">
                  {error}
                </div>
              )}

              <div className="text-[11px] text-gray-500 bg-gray-50 border border-gray-200 rounded p-2 leading-relaxed">
                💡 4개 모두 비어있는 채로 저장하면 그 페이지의 추출 결과가 <b>삭제</b>됩니다 (관련 없는 페이지 제외용).
              </div>
            </div>

            {/* 하단 액션 버튼 */}
            <div className="border-t border-gray-200 p-3 bg-gray-50 rounded-br-xl space-y-2">
              <button onClick={saveAndNext} disabled={saving || loadingPage}
                className="w-full h-11 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-bold rounded-md flex items-center justify-center gap-2">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                {saving ? "저장 중..." : currentPage < numPages ? "저장 + 다음 페이지" : "저장 (마지막 페이지)"}
              </button>
              <div className="flex gap-2">
                <button onClick={skipPage} disabled={currentPage >= numPages || saving}
                  className="flex-1 h-9 border border-gray-300 hover:bg-gray-100 text-gray-700 text-xs font-semibold rounded-md flex items-center justify-center gap-1 disabled:opacity-50">
                  <SkipForward size={12} /> 건너뛰기 (저장 안 함)
                </button>
                <button onClick={handleClose} disabled={saving}
                  className="flex-1 h-9 border border-gray-300 hover:bg-gray-100 text-gray-700 text-xs font-semibold rounded-md disabled:opacity-50">
                  닫기
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

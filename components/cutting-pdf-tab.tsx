"use client";

/**
 * 절단도면 PDF 탭 — Phase A
 *
 * 호선/블록(=프로젝트) 선택 → PDF 업로드/목록/미리보기/인쇄/다운로드/삭제
 */

import { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import { Upload, Trash2, RefreshCw, FileText, Eye, Loader2, Download, FileSearch, Pencil, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";

// SSR 비활성화 — react-pdf 의 DOMMatrix 등 브라우저 API 의존
const CuttingPdfViewer = dynamic(() => import("@/components/cutting-pdf-viewer"), {
  ssr: false,
  loading: () => <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center text-white text-sm">뷰어 로딩 중...</div>,
});

const CuttingPdfExtractModal = dynamic(() => import("@/components/cutting-pdf-extract-modal"), { ssr: false });
const CuttingPdfManualInputModal = dynamic(() => import("@/components/cutting-pdf-manual-input-modal"), { ssr: false });
const CuttingPdfExcelUploadModal = dynamic(() => import("@/components/cutting-pdf-excel-upload-modal"), { ssr: false });

interface ProjectOption { id: string; projectCode: string; projectName: string }

interface PdfItem {
  id:         string;
  block:      string | null;
  filename:   string;
  storedName: string;
  pageCount:  number;
  fileSize:   number;
  uploadedBy: string | null;
  createdAt:  string;
}

interface ExtractionRow {
  id:           string;
  pdfId:        string;
  pdfFilename:  string;
  hosin:        string;
  block:        string;
  pageNumber:   number;
  drawingNo:    string | null;
  partWeight:   number | null;
  markingLen:   number | null;
  cuttingLen:   number | null;
  method:       string;
}

const formatBytes = (n: number) =>
  n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" });

export default function CuttingPdfTab({
  projectOptions,
  projectId,
}: {
  projectOptions: ProjectOption[];
  projectId:      string | null;
}) {
  const [selectedProjectId, setSelectedProjectId] = useState<string>(projectId ?? "");
  const [pdfs,              setPdfs]              = useState<PdfItem[]>([]);
  const [loading,           setLoading]           = useState(false);
  const [uploading,         setUploading]         = useState(false);
  const [viewer,            setViewer]            = useState<{ id: string; filename: string } | null>(null);
  const [extractor,         setExtractor]         = useState<{ id: string; filename: string } | null>(null);
  const [manualInput,       setManualInput]       = useState<{ id: string; filename: string; pageCount: number } | null>(null);
  const [excelUpload,       setExcelUpload]       = useState<{ id: string; filename: string } | null>(null);
  const [extractions,       setExtractions]       = useState<ExtractionRow[]>([]);
  const [loadingExtr,       setLoadingExtr]       = useState(false);

  // PDF 목록 로드 — 호선/블록(=프로젝트) 단위
  const loadPdfs = useCallback(async () => {
    if (!selectedProjectId) { setPdfs([]); return; }
    setLoading(true);
    try {
      const r = await fetch(`/api/cutting-drawings?projectId=${selectedProjectId}`);
      const d = await r.json();
      if (d.success) setPdfs(d.data);
    } finally { setLoading(false); }
  }, [selectedProjectId]);

  // 블록도면정보 리스트 로드 (해당 호선/블록의 모든 추출 결과)
  const loadExtractions = useCallback(async () => {
    if (!selectedProjectId) { setExtractions([]); return; }
    setLoadingExtr(true);
    try {
      const r = await fetch(`/api/cutting-drawings/extractions?projectId=${selectedProjectId}`);
      const d = await r.json();
      if (d.success) setExtractions(d.data);
    } finally { setLoadingExtr(false); }
  }, [selectedProjectId]);

  useEffect(() => { loadPdfs(); }, [loadPdfs]);
  useEffect(() => { loadExtractions(); }, [loadExtractions]);

  /* 업로드 */
  const handleUpload = async (file: File) => {
    if (!selectedProjectId) { alert("호선/블록을 먼저 선택하세요."); return; }
    if (file.type !== "application/pdf") { alert("PDF 파일만 업로드 가능합니다."); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("projectId", selectedProjectId);
      fd.append("file", file);
      const r = await fetch("/api/cutting-drawings", { method: "POST", body: fd });
      const d = await r.json();
      if (!d.success) { alert(d.error ?? "업로드 실패"); return; }
      loadPdfs();
    } catch { alert("업로드 중 오류가 발생했습니다."); }
    finally { setUploading(false); }
  };

  /* 삭제 */
  const handleDelete = async (id: string, filename: string) => {
    if (!confirm(`'${filename}' 을(를) 삭제하시겠습니까?`)) return;
    const r = await fetch(`/api/cutting-drawings/${id}`, { method: "DELETE" });
    const d = await r.json();
    if (!d.success) { alert(d.error ?? "삭제 실패"); return; }
    loadPdfs();
  };

  const totalSize = pdfs.reduce((s, p) => s + p.fileSize, 0);

  return (
    <div className="space-y-4">
      {/* 호선/블록 선택 + 업로드 */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-end">
          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">호선/블록</label>
            <select value={selectedProjectId} onChange={e => setSelectedProjectId(e.target.value)}
              className="w-full h-9 px-3 border border-gray-300 rounded-md text-sm bg-white">
              <option value="">호선/블록 선택...</option>
              {projectOptions.map(p => (
                <option key={p.id} value={p.id}>[{p.projectCode}] {p.projectName}</option>
              ))}
            </select>
          </div>
          {selectedProjectId && (
            <label className="cursor-pointer">
              <input type="file" accept="application/pdf"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ""; }}
                disabled={uploading} className="hidden" />
              <span className={`inline-flex items-center gap-2 h-9 px-4 rounded-md text-sm font-bold text-white ${uploading ? "bg-blue-400" : "bg-blue-600 hover:bg-blue-700"}`}>
                {uploading ? <><Loader2 size={14} className="animate-spin" /> 업로드 중...</> : <><Upload size={14} /> PDF 업로드</>}
              </span>
            </label>
          )}
        </div>
      </div>

      {/* 목록 */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 border-b border-gray-200 bg-gray-50 flex items-center justify-between text-xs">
          <span className="font-semibold text-gray-700">
            {pdfs.length}건 · 합계 {formatBytes(totalSize)}
          </span>
          <Button variant="outline" size="sm" onClick={loadPdfs} className="h-7 text-xs">
            <RefreshCw size={11} className="mr-1" /> 새로고침
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead className="bg-gray-50 border-b-2 border-gray-300">
              <tr>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-600 border-r border-gray-200">파일명</th>
                <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-600 border-r border-gray-200">페이지</th>
                <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-600 border-r border-gray-200">크기</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-600 border-r border-gray-200">업로드</th>
                <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-600">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={5} className="px-3 py-12 text-center text-gray-400 text-sm">
                  <RefreshCw size={14} className="animate-spin inline mr-2" /> 불러오는 중...
                </td></tr>
              ) : !selectedProjectId ? (
                <tr><td colSpan={5} className="px-3 py-12 text-center text-gray-400 text-sm">
                  호선/블록을 먼저 선택하세요.
                </td></tr>
              ) : pdfs.length === 0 ? (
                <tr><td colSpan={5} className="px-3 py-12 text-center text-gray-400 text-sm">
                  <FileText size={32} className="mx-auto mb-2 text-gray-300" />
                  업로드된 PDF가 없습니다.
                </td></tr>
              ) : pdfs.map(p => (
                <tr key={p.id} className="hover:bg-gray-50/70 transition-colors">
                  <td className="px-3 py-2 text-xs text-gray-800 font-medium border-r border-gray-100 max-w-[300px] truncate" title={p.filename}>
                    {p.filename}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-600 text-right border-r border-gray-100 font-mono">{p.pageCount}p</td>
                  <td className="px-3 py-2 text-xs text-gray-600 text-right border-r border-gray-100 font-mono">{formatBytes(p.fileSize)}</td>
                  <td className="px-3 py-2 text-xs text-gray-500 border-r border-gray-100">
                    {formatDate(p.createdAt)}
                    {p.uploadedBy && <span className="ml-1 text-gray-400">· {p.uploadedBy}</span>}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => setExtractor({ id: p.id, filename: p.filename })}
                        className="px-2 py-1 text-[11px] font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded flex items-center gap-1" title="자동 추출 (OCR/텍스트)">
                        <FileSearch size={11} /> 추출
                      </button>
                      <button onClick={() => setManualInput({ id: p.id, filename: p.filename, pageCount: p.pageCount })}
                        className="px-2 py-1 text-[11px] font-semibold text-white bg-violet-600 hover:bg-violet-700 rounded flex items-center gap-1" title="수동 입력 (PDF 보면서 직접 입력)">
                        <Pencil size={11} /> 수동
                      </button>
                      <button onClick={() => setExcelUpload({ id: p.id, filename: p.filename })}
                        className="px-2 py-1 text-[11px] font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded flex items-center gap-1" title="엑셀 일괄 업로드 (PC 변환 결과)">
                        <FileSpreadsheet size={11} /> 엑셀
                      </button>
                      <button onClick={() => setViewer({ id: p.id, filename: p.filename })}
                        className="p-1.5 text-gray-500 hover:text-blue-600 rounded" title="미리보기">
                        <Eye size={13} />
                      </button>
                      <a href={`/api/cutting-drawings/${p.id}/file?download=1`} download={p.filename}
                        className="p-1.5 text-gray-500 hover:text-emerald-600 rounded" title="다운로드">
                        <Download size={13} />
                      </a>
                      <button onClick={() => handleDelete(p.id, p.filename)}
                        className="p-1.5 text-gray-300 hover:text-red-500 rounded" title="삭제">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 블록도면정보 리스트 — 추출 결과 */}
      {selectedProjectId && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-200 bg-gray-50 flex items-center justify-between text-xs">
            <span className="font-semibold text-gray-700">
              📋 블록도면정보 — {extractions.length}건
            </span>
            <Button variant="outline" size="sm" onClick={loadExtractions} className="h-7 text-xs">
              <RefreshCw size={11} className="mr-1" /> 새로고침
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm whitespace-nowrap">
              <thead className="bg-gray-50 border-b-2 border-gray-300">
                <tr>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-600 border-r border-gray-200">호선</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-600 border-r border-gray-200">블록</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-600 border-r border-gray-200">도면번호</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-600 border-r border-gray-200">부재중량 (Kg)</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-600 border-r border-gray-200">마킹길이 (M)</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-600 border-r border-gray-200">절단길이 (M)</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-600">출처</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loadingExtr ? (
                  <tr><td colSpan={7} className="px-3 py-10 text-center text-gray-400 text-sm">
                    <RefreshCw size={12} className="animate-spin inline mr-2" /> 불러오는 중...
                  </td></tr>
                ) : extractions.length === 0 ? (
                  <tr><td colSpan={7} className="px-3 py-10 text-center text-gray-400 text-sm">
                    추출된 데이터가 없습니다. PDF 목록의 [추출] 버튼을 누르세요.
                  </td></tr>
                ) : extractions.map(e => (
                  <tr key={e.id} className="hover:bg-emerald-50/30">
                    <td className="px-3 py-1.5 text-xs text-gray-700 font-mono border-r border-gray-100">{e.hosin}</td>
                    <td className="px-3 py-1.5 text-xs text-gray-700 border-r border-gray-100">{e.block}</td>
                    <td className="px-3 py-1.5 text-xs text-gray-800 font-mono border-r border-gray-100">
                      {e.drawingNo || <span className="text-gray-300">-</span>}
                    </td>
                    <td className="px-3 py-1.5 text-xs text-gray-700 text-right font-mono border-r border-gray-100">
                      {e.partWeight !== null ? e.partWeight.toLocaleString() : <span className="text-gray-300">-</span>}
                    </td>
                    <td className="px-3 py-1.5 text-xs text-gray-700 text-right font-mono border-r border-gray-100">
                      {e.markingLen !== null ? e.markingLen.toLocaleString() : <span className="text-gray-300">-</span>}
                    </td>
                    <td className="px-3 py-1.5 text-xs text-gray-700 text-right font-mono border-r border-gray-100">
                      {e.cuttingLen !== null ? e.cuttingLen.toLocaleString() : <span className="text-gray-300">-</span>}
                    </td>
                    <td className="px-3 py-1.5 text-xs text-gray-400 truncate max-w-[250px]" title={`${e.pdfFilename} · p${e.pageNumber}`}>
                      {e.pdfFilename} · p{e.pageNumber}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 뷰어 모달 */}
      {viewer && (
        <CuttingPdfViewer pdfId={viewer.id} filename={viewer.filename} onClose={() => setViewer(null)} />
      )}

      {/* 추출 모달 */}
      {extractor && (
        <CuttingPdfExtractModal
          pdfId={extractor.id} filename={extractor.filename}
          onClose={() => { setExtractor(null); loadExtractions(); }}
          onSaved={loadExtractions}
        />
      )}

      {/* 수동 입력 모달 */}
      {manualInput && (
        <CuttingPdfManualInputModal
          pdfId={manualInput.id} filename={manualInput.filename} pageCount={manualInput.pageCount}
          onClose={() => { setManualInput(null); loadExtractions(); }}
          onSaved={loadExtractions}
        />
      )}

      {/* 엑셀 일괄 업로드 모달 */}
      {excelUpload && (
        <CuttingPdfExcelUploadModal
          pdfId={excelUpload.id} filename={excelUpload.filename}
          onClose={() => { setExcelUpload(null); loadExtractions(); }}
          onSaved={loadExtractions}
        />
      )}
    </div>
  );
}

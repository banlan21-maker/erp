"use client";

/**
 * 절단도면 PDF 탭 — Phase A
 *
 * 호선/블록(=프로젝트) 선택 → PDF 업로드/목록/미리보기/인쇄/다운로드/삭제
 */

import { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import { Upload, Trash2, RefreshCw, FileText, Eye, Loader2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";

// SSR 비활성화 — react-pdf 의 DOMMatrix 등 브라우저 API 의존
const CuttingPdfViewer = dynamic(() => import("@/components/cutting-pdf-viewer"), {
  ssr: false,
  loading: () => <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center text-white text-sm">뷰어 로딩 중...</div>,
});

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

  useEffect(() => { loadPdfs(); }, [loadPdfs]);

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

      {/* 뷰어 모달 */}
      {viewer && (
        <CuttingPdfViewer pdfId={viewer.id} filename={viewer.filename} onClose={() => setViewer(null)} />
      )}
    </div>
  );
}

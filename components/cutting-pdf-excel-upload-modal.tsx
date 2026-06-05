"use client";

/**
 * 절단도면 추출 결과 엑셀 일괄 업로드 모달 (Phase B-4)
 *
 * 흐름:
 *  1) 파일 선택 → 자동 preview (POST action=preview)
 *  2) 미리보기 표 (헤더 매핑 결과, 경고, 첫 50행)
 *  3) [업로드] (POST action=save) — (pdfId, pageNumber) upsert (method="EXCEL")
 *
 * 엑셀 컬럼 헤더 (한글/영문 자동 인식):
 *  페이지/page · 도면번호/drawing · 부재중량/weight · 마킹길이/marking · 절단길이/cutting
 */

import { useState } from "react";
import { Upload, X, Loader2, AlertTriangle, CheckCircle2, FileSpreadsheet } from "lucide-react";

interface PreviewRow {
  pageNumber: number;
  drawingNo:  string | null;
  partWeight: number | null;
  markingLen: number | null;
  cuttingLen: number | null;
  rowIndex:   number;
}

interface PreviewResult {
  pdf:      { id: string; filename: string; pageCount: number };
  warnings: string[];
  total:    number;
  rows:     PreviewRow[];
}

export default function CuttingPdfExcelUploadModal({
  pdfId, filename, onClose, onSaved,
}: {
  pdfId:    string;
  filename: string;
  onClose:  () => void;
  onSaved?: () => void;
}) {
  const [file,    setFile]    = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [saveResult, setSaveResult] = useState<{ saved: number; total: number } | null>(null);

  const handlePreview = async (f: File) => {
    setFile(f); setLoading(true); setError(null); setPreview(null); setSaveResult(null);
    try {
      const fd = new FormData();
      fd.append("file", f);
      fd.append("action", "preview");
      const r = await fetch(`/api/cutting-drawings/${pdfId}/extractions/upload-excel`, { method: "POST", body: fd });
      const d = await r.json();
      if (!d.success) { setError(d.error || "미리보기 실패"); return; }
      setPreview(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류");
    } finally { setLoading(false); }
  };

  const handleSave = async () => {
    if (!file) return;
    setSaving(true); setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("action", "save");
      const r = await fetch(`/api/cutting-drawings/${pdfId}/extractions/upload-excel`, { method: "POST", body: fd });
      const d = await r.json();
      if (!d.success) { setError(d.error || "저장 실패"); return; }
      setSaveResult({ saved: d.saved, total: d.total });
      onSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류");
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl h-[88vh] flex flex-col">
        {/* 헤더 */}
        <div className="px-5 py-3 border-b flex items-center justify-between gap-3 bg-gray-50 rounded-t-xl">
          <div className="min-w-0 flex-1">
            <h3 className="font-bold text-sm text-gray-800 truncate" title={filename}>
              <FileSpreadsheet size={14} className="inline mr-1.5 text-emerald-600" />
              엑셀 일괄 업로드 — {filename}
            </h3>
            <div className="text-xs text-gray-500 mt-0.5">
              컬럼: <span className="font-mono">페이지 / 도면번호 / 부재중량 / 마킹길이 / 절단길이</span> (헤더 이름 자동 인식)
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-200 rounded">
            <X size={16} />
          </button>
        </div>

        {/* 본문 */}
        <div className="flex-1 overflow-auto p-5 space-y-4">
          {/* 파일 선택 */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded">
              <Upload size={14} />
              {file ? "엑셀 파일 변경" : "엑셀 파일 선택"}
              <input type="file" accept=".xlsx,.xls"
                onChange={e => { const f = e.target.files?.[0]; if (f) handlePreview(f); e.target.value = ""; }}
                className="hidden" />
            </label>
            {file && <span className="ml-3 text-xs text-gray-700">{file.name} ({(file.size / 1024).toFixed(1)} KB)</span>}
          </div>

          {/* 로딩 */}
          {loading && (
            <div className="text-center text-gray-500 text-sm py-8">
              <Loader2 size={16} className="animate-spin inline mr-2" /> 엑셀 분석 중...
            </div>
          )}

          {/* 에러 */}
          {error && (
            <div className="text-red-700 text-sm bg-red-50 border border-red-200 rounded p-3">
              ⚠ {error}
            </div>
          )}

          {/* 저장 완료 */}
          {saveResult && (
            <div className="text-emerald-700 text-sm bg-emerald-50 border border-emerald-200 rounded p-3 flex items-center gap-2">
              <CheckCircle2 size={16} />
              저장 완료 — 총 {saveResult.total}행 중 {saveResult.saved}행 저장됨 (4개 다 비어있는 행은 자동 skip)
            </div>
          )}

          {/* 미리보기 */}
          {preview && (
            <>
              {/* 경고 */}
              {preview.warnings.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded p-3 space-y-1">
                  <div className="flex items-center gap-2 text-amber-800 text-xs font-semibold">
                    <AlertTriangle size={12} /> 경고 ({preview.warnings.length})
                  </div>
                  {preview.warnings.map((w, i) => (
                    <div key={i} className="text-amber-700 text-xs ml-5">· {w}</div>
                  ))}
                </div>
              )}

              {/* 메타 */}
              <div className="text-xs text-gray-600 flex items-center gap-4">
                <span>📄 PDF: <b>{preview.pdf.filename}</b> ({preview.pdf.pageCount} 페이지)</span>
                <span>📊 엑셀 행수: <b className="text-blue-600">{preview.total}</b> {preview.rows.length < preview.total && `(미리보기 ${preview.rows.length}행)`}</span>
              </div>

              {/* 미리보기 표 */}
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 border-b-2 border-gray-300">
                    <tr>
                      <th className="px-2 py-2 text-center font-semibold text-gray-600 border-r w-14">엑셀 행</th>
                      <th className="px-2 py-2 text-center font-semibold text-gray-600 border-r w-14">페이지</th>
                      <th className="px-2 py-2 text-left font-semibold text-gray-600 border-r">도면번호</th>
                      <th className="px-2 py-2 text-right font-semibold text-gray-600 border-r w-24">부재중량 (Kg)</th>
                      <th className="px-2 py-2 text-right font-semibold text-gray-600 border-r w-24">마킹길이 (M)</th>
                      <th className="px-2 py-2 text-right font-semibold text-gray-600 w-24">절단길이 (M)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {preview.rows.length === 0 ? (
                      <tr><td colSpan={6} className="px-3 py-10 text-center text-gray-400">
                        파싱된 데이터가 없습니다. 컬럼 헤더와 페이지 번호를 확인하세요.
                      </td></tr>
                    ) : preview.rows.map((r, i) => {
                      const overPage = r.pageNumber > preview.pdf.pageCount;
                      return (
                        <tr key={i} className={overPage ? "bg-red-50" : "hover:bg-gray-50/70"}>
                          <td className="px-2 py-1 text-center text-gray-400 font-mono border-r">{r.rowIndex}</td>
                          <td className={`px-2 py-1 text-center font-mono border-r ${overPage ? "text-red-600 font-bold" : "text-gray-700"}`} title={overPage ? "PDF 페이지 수 초과" : ""}>
                            {r.pageNumber}{overPage && " ⚠"}
                          </td>
                          <td className="px-2 py-1 text-gray-800 font-mono border-r">{r.drawingNo ?? <span className="text-gray-300">-</span>}</td>
                          <td className="px-2 py-1 text-right text-gray-700 font-mono border-r">{r.partWeight ?? <span className="text-gray-300">-</span>}</td>
                          <td className="px-2 py-1 text-right text-gray-700 font-mono border-r">{r.markingLen ?? <span className="text-gray-300">-</span>}</td>
                          <td className="px-2 py-1 text-right text-gray-700 font-mono">{r.cuttingLen ?? <span className="text-gray-300">-</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="text-[11px] text-gray-500 bg-gray-50 border border-gray-200 rounded p-3 leading-relaxed">
                · 같은 PDF 의 같은 페이지에 기존 추출 결과가 있으면 <b>덮어씁니다</b>.<br />
                · 4개 필드 (도면번호/부재중량/마킹길이/절단길이) 가 모두 비어있는 행은 저장에서 자동 제외.<br />
                · PDF 페이지 수({preview.pdf.pageCount})를 초과하는 행은 빨간색 — 저장은 되지만 PDF 뷰어에서 보이지 않습니다.
              </div>
            </>
          )}

          {!file && !loading && (
            <div className="text-center text-gray-400 text-sm py-12">
              엑셀 파일을 선택하면 자동으로 미리보기가 표시됩니다.
              <div className="text-[11px] mt-3 text-gray-500">
                PC 변환 스크립트 (Phase B-5) 가 생성하는 엑셀 형식과 호환됩니다.
              </div>
            </div>
          )}
        </div>

        {/* 푸터 */}
        <div className="px-5 py-3 border-t bg-gray-50 rounded-b-xl flex items-center justify-end gap-2">
          <button onClick={onClose} disabled={saving}
            className="px-4 h-9 text-xs border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-50">
            {saveResult ? "닫기" : "취소"}
          </button>
          {preview && !saveResult && (
            <button onClick={handleSave} disabled={saving || loading || preview.total === 0}
              className="px-5 h-9 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white rounded flex items-center gap-1.5">
              {saving ? <><Loader2 size={12} className="animate-spin" /> 저장 중...</> : <>업로드 ({preview.total}행)</>}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

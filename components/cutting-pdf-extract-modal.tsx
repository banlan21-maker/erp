"use client";

/**
 * 절단도면 PDF 추출 결과 모달 (Phase B-1)
 *
 * 열림 → POST /api/cutting-drawings/[id]/extract (자동 매칭 + 일괄 추출)
 * → 결과 표 표시 → 셀 inline 수정 가능 → PATCH 로 저장
 */

import { useEffect, useState, useCallback } from "react";
import { X, RefreshCw, Loader2, Save, Trash2 } from "lucide-react";

interface ExtractItem {
  id?:         string;
  pageNumber:  number;
  drawingNo:   string | null;
  partWeight:  number | null;
  markingLen:  number | null;
  cuttingLen:  number | null;
  method:      string;
  matched?:    { drawingNo: boolean; partWeight: boolean; markingLen: boolean; cuttingLen: boolean };
}

interface ExtractResult {
  preset:  { id: string; name: string; method: string };
  summary: { totalPages: number; extracted: number; skipped: number; ocrNeeded: number };
  items:   ExtractItem[];
}

export default function CuttingPdfExtractModal({
  pdfId,
  filename,
  onClose,
  onSaved,
}: {
  pdfId:    string;
  filename: string;
  onClose:  () => void;
  onSaved?: () => void;
}) {
  const [loading,    setLoading]    = useState(false);
  const [result,     setResult]     = useState<ExtractResult | null>(null);
  const [rows,       setRows]       = useState<ExtractItem[]>([]);
  const [error,      setError]      = useState<string | null>(null);
  const [savingIds,  setSavingIds]  = useState<Set<string>>(new Set());

  const runExtract = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch(`/api/cutting-drawings/${pdfId}/extract`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const d = await r.json();
      if (!d.success) { setError(d.error || "추출 실패"); return; }
      // POST 응답에는 id 가 없음 → GET 으로 다시 fetch (id 포함)
      const r2 = await fetch(`/api/cutting-drawings/${pdfId}/extractions`);
      const d2 = await r2.json();
      setResult({ preset: d.preset, summary: d.summary, items: d.items });
      if (d2.success) setRows(d2.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "추출 중 오류");
    } finally { setLoading(false); }
  }, [pdfId]);

  // 모달 열림 — 기존 결과 있으면 그대로 표시, 없으면 자동 추출
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const r = await fetch(`/api/cutting-drawings/${pdfId}/extractions`);
        const d = await r.json();
        if (d.success && d.data.length > 0) {
          setRows(d.data);
          setResult(null); // 기존 결과 — preset 정보는 없음 (필요하면 별도 fetch)
        } else {
          await runExtract();
        }
      } finally { setLoading(false); }
    })();
  }, [pdfId, runExtract]);

  const updateCell = (idx: number, key: keyof ExtractItem, value: string) => {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, [key]: value === "" ? null : (key === "drawingNo" ? value : Number(value)) } : r));
  };

  const saveRow = async (row: ExtractItem) => {
    if (!row.id) return;
    setSavingIds(s => new Set(s).add(row.id!));
    try {
      const r = await fetch(`/api/cutting-drawings/extractions/${row.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          drawingNo:  row.drawingNo,
          partWeight: row.partWeight,
          markingLen: row.markingLen,
          cuttingLen: row.cuttingLen,
        }),
      });
      const d = await r.json();
      if (!d.success) { alert(d.error || "저장 실패"); return; }
      onSaved?.();
    } finally { setSavingIds(s => { const n = new Set(s); n.delete(row.id!); return n; }); }
  };

  const deleteRow = async (row: ExtractItem) => {
    if (!row.id) return;
    if (!confirm(`페이지 ${row.pageNumber} 의 추출 결과를 삭제하시겠습니까?`)) return;
    const r = await fetch(`/api/cutting-drawings/extractions/${row.id}`, { method: "DELETE" });
    const d = await r.json();
    if (!d.success) { alert(d.error || "삭제 실패"); return; }
    setRows(prev => prev.filter(x => x.id !== row.id));
    onSaved?.();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col">
        {/* 헤더 */}
        <div className="px-5 py-3 border-b flex items-center justify-between gap-3 bg-gray-50 rounded-t-xl">
          <div className="min-w-0 flex-1">
            <h3 className="font-bold text-sm text-gray-800 truncate" title={filename}>📄 {filename}</h3>
            {result && (
              <div className="text-xs text-gray-500 mt-0.5">
                프리셋: <span className="font-semibold text-blue-600">{result.preset.name}</span>
                {" · "}추출 {result.summary.extracted}건
                {result.summary.skipped > 0 && <> · 건너뜀 {result.summary.skipped}</>}
                {result.summary.ocrNeeded > 0 && <> · <span className="text-orange-600">OCR 필요 {result.summary.ocrNeeded}</span></>}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={runExtract} disabled={loading}
              className="px-3 py-1.5 text-xs border border-gray-300 rounded hover:bg-gray-100 flex items-center gap-1 disabled:opacity-50">
              <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> 재추출
            </button>
            <button onClick={onClose} className="p-1.5 hover:bg-gray-200 rounded">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* 본문 */}
        <div className="flex-1 overflow-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center h-full text-gray-500 text-sm gap-2">
              <Loader2 size={16} className="animate-spin" /> 추출 중...
            </div>
          ) : error ? (
            <div className="text-red-600 text-sm p-4 bg-red-50 rounded border border-red-200">
              {error}
            </div>
          ) : rows.length === 0 ? (
            <div className="text-gray-400 text-sm p-8 text-center">
              추출된 데이터가 없습니다.
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-b-2 border-gray-300">
                <tr>
                  <th className="px-2 py-2 text-center font-semibold text-gray-600 border-r border-gray-200 w-14">페이지</th>
                  <th className="px-2 py-2 text-left font-semibold text-gray-600 border-r border-gray-200">도면번호</th>
                  <th className="px-2 py-2 text-right font-semibold text-gray-600 border-r border-gray-200 w-28">부재중량 (Kg)</th>
                  <th className="px-2 py-2 text-right font-semibold text-gray-600 border-r border-gray-200 w-28">마킹길이 (M)</th>
                  <th className="px-2 py-2 text-right font-semibold text-gray-600 border-r border-gray-200 w-28">절단길이 (M)</th>
                  <th className="px-2 py-2 text-center font-semibold text-gray-600 border-r border-gray-200 w-20">방식</th>
                  <th className="px-2 py-2 text-center font-semibold text-gray-600 w-20">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((r, idx) => (
                  <tr key={r.id ?? r.pageNumber} className="hover:bg-blue-50/30">
                    <td className="px-2 py-1 text-center font-mono border-r border-gray-100">{r.pageNumber}</td>
                    <td className="px-1 border-r border-gray-100">
                      <input type="text" value={r.drawingNo ?? ""} onChange={e => updateCell(idx, "drawingNo", e.target.value)}
                        className={`w-full px-1.5 py-1 border rounded text-xs font-mono ${r.drawingNo ? "border-transparent" : "border-amber-300 bg-amber-50"}`} />
                    </td>
                    <td className="px-1 border-r border-gray-100">
                      <input type="number" step="0.1" value={r.partWeight ?? ""} onChange={e => updateCell(idx, "partWeight", e.target.value)}
                        className={`w-full px-1.5 py-1 border rounded text-xs text-right font-mono ${r.partWeight !== null ? "border-transparent" : "border-amber-300 bg-amber-50"}`} />
                    </td>
                    <td className="px-1 border-r border-gray-100">
                      <input type="number" step="0.1" value={r.markingLen ?? ""} onChange={e => updateCell(idx, "markingLen", e.target.value)}
                        className={`w-full px-1.5 py-1 border rounded text-xs text-right font-mono ${r.markingLen !== null ? "border-transparent" : "border-amber-300 bg-amber-50"}`} />
                    </td>
                    <td className="px-1 border-r border-gray-100">
                      <input type="number" step="0.1" value={r.cuttingLen ?? ""} onChange={e => updateCell(idx, "cuttingLen", e.target.value)}
                        className={`w-full px-1.5 py-1 border rounded text-xs text-right font-mono ${r.cuttingLen !== null ? "border-transparent" : "border-amber-300 bg-amber-50"}`} />
                    </td>
                    <td className="px-2 py-1 text-center border-r border-gray-100">
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                        r.method === "MANUAL" ? "bg-purple-100 text-purple-700" :
                        r.method === "OCR" ? "bg-orange-100 text-orange-700" :
                        r.method === "OCR_NEEDED" ? "bg-red-100 text-red-700" :
                        "bg-blue-100 text-blue-700"
                      }`}>{r.method}</span>
                    </td>
                    <td className="px-2 py-1 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => saveRow(r)} disabled={!r.id || savingIds.has(r.id)}
                          className="p-1 text-gray-500 hover:text-emerald-600 disabled:opacity-30" title="저장">
                          {r.id && savingIds.has(r.id) ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
                        </button>
                        <button onClick={() => deleteRow(r)} disabled={!r.id}
                          className="p-1 text-gray-400 hover:text-red-500 disabled:opacity-30" title="삭제">
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="px-5 py-2.5 border-t bg-gray-50 rounded-b-xl text-xs text-gray-500 flex items-center justify-between">
          <span>각 셀 직접 수정 후 행별 저장 버튼 클릭 (양식이 다른 OCR PDF 는 다음 단계에서 지원 예정)</span>
          <button onClick={onClose} className="px-4 py-1.5 text-xs bg-gray-700 text-white rounded hover:bg-gray-800">닫기</button>
        </div>
      </div>
    </div>
  );
}

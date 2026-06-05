"use client";

/**
 * 절단도면 PDF 추출 결과 모달 (Phase B-2)
 *
 * 흐름:
 *  1) 열림 → POST /extract (서버 텍스트 PDF 처리)
 *  2) 응답에 OCR_NEEDED 페이지 있으면 → 프리셋 선택 dropdown (자동 매칭 실패 시) → [OCR 시작]
 *  3) Tesseract.js (영문 모드) 로 페이지마다 OCR → POST /ocr-result → 결과 표 업데이트
 *  4) 셀 inline 수정 → PATCH 저장
 */

import { useEffect, useState, useCallback, useRef } from "react";
import { X, RefreshCw, Loader2, Save, Trash2, FileSearch, StopCircle } from "lucide-react";
import { createOcrWorker, terminateOcrWorker, ocrPdfPage } from "@/lib/cutting-pdf-ocr-client";
import type { Worker as TesseractWorker } from "tesseract.js";

interface ExtractItem {
  id?:         string;
  pageNumber:  number;
  drawingNo:   string | null;
  partWeight:  number | null;
  markingLen:  number | null;
  cuttingLen:  number | null;
  method:      string;
  matched?:    { drawingNo: boolean; partWeight: boolean; markingLen: boolean; cuttingLen: boolean };
  confidence?: number | null;
}

interface PresetOption { id: string; name: string; method: string }

interface ExtractResult {
  preset:           PresetOption | null;
  summary:          { totalPages: number; extracted: number; skipped: number; ocrNeeded: number };
  items:            ExtractItem[];
  availablePresets?: PresetOption[];
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
  const [loading,        setLoading]        = useState(false);
  const [result,         setResult]         = useState<ExtractResult | null>(null);
  const [rows,           setRows]           = useState<ExtractItem[]>([]);
  const [error,          setError]          = useState<string | null>(null);
  const [savingIds,      setSavingIds]      = useState<Set<string>>(new Set());

  // OCR 상태
  const [ocrPresetId,    setOcrPresetId]    = useState<string>("");
  const [ocrRunning,     setOcrRunning]     = useState(false);
  const [ocrProgress,    setOcrProgress]    = useState<{ current: number; total: number; stage: string } | null>(null);
  const workerRef    = useRef<TesseractWorker | null>(null);
  const cancelledRef = useRef(false);

  const loadRows = useCallback(async () => {
    const r = await fetch(`/api/cutting-drawings/${pdfId}/extractions`);
    const d = await r.json();
    if (d.success) setRows(d.data);
  }, [pdfId]);

  const runExtract = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch(`/api/cutting-drawings/${pdfId}/extract`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const d = await r.json();
      if (!d.success) { setError(d.error || "추출 실패"); return; }
      setResult(d);
      // 자동 매칭된 프리셋 또는 첫 가용 프리셋을 OCR 기본값으로
      if (d.preset?.id) setOcrPresetId(d.preset.id);
      else if (d.availablePresets?.length) {
        const ocrPresets = d.availablePresets.filter((p: PresetOption) => p.method === "OCR");
        setOcrPresetId((ocrPresets[0] ?? d.availablePresets[0]).id);
      }
      await loadRows();
    } catch (e) {
      setError(e instanceof Error ? e.message : "추출 중 오류");
    } finally { setLoading(false); }
  }, [pdfId, loadRows]);

  // 모달 열림 — 기존 결과 있으면 그대로 표시, 없으면 자동 추출
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const r = await fetch(`/api/cutting-drawings/${pdfId}/extractions`);
        const d = await r.json();
        if (d.success && d.data.length > 0) {
          setRows(d.data);
        } else {
          await runExtract();
        }
      } finally { setLoading(false); }
    })();
    return () => {
      cancelledRef.current = true;
      terminateOcrWorker(workerRef.current);
      workerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfId]);

  const ocrNeededPages = (result?.items ?? []).filter(i => i.method === "OCR_NEEDED").map(i => i.pageNumber);
  const availablePresets = result?.availablePresets ?? (result?.preset ? [result.preset] : []);

  // OCR 시작
  const startOcr = useCallback(async () => {
    if (!ocrPresetId) { alert("프리셋을 먼저 선택하세요."); return; }
    if (ocrNeededPages.length === 0) return;
    cancelledRef.current = false;
    setOcrRunning(true);
    setOcrProgress({ current: 0, total: ocrNeededPages.length, stage: "워커 로딩" });
    try {
      workerRef.current = await createOcrWorker();
      const pdfUrl = `/api/cutting-drawings/${pdfId}/file`;
      for (let i = 0; i < ocrNeededPages.length; i++) {
        if (cancelledRef.current) break;
        const pn = ocrNeededPages[i];
        setOcrProgress({ current: i, total: ocrNeededPages.length, stage: `페이지 ${pn} 렌더링` });
        const ocrResult = await ocrPdfPage(workerRef.current, pdfUrl, pn, 2, info => {
          setOcrProgress({ current: i, total: ocrNeededPages.length, stage: `페이지 ${pn} ${info.stage} ${Math.round(info.progress * 100)}%` });
        });
        if (cancelledRef.current) break;
        // 서버에 결과 POST
        await fetch(`/api/cutting-drawings/${pdfId}/extract/ocr-result`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pageNumber: pn,
            presetId:   ocrPresetId,
            items:      ocrResult.items,
            confidence: ocrResult.avgConfidence,
            fullText:   ocrResult.fullText.slice(0, 2000),
          }),
        });
        await loadRows();
        setOcrProgress({ current: i + 1, total: ocrNeededPages.length, stage: `페이지 ${pn} 완료` });
      }
    } catch (e) {
      setError(e instanceof Error ? `OCR 오류: ${e.message}` : "OCR 중 오류");
    } finally {
      await terminateOcrWorker(workerRef.current);
      workerRef.current = null;
      setOcrRunning(false);
      // OCR 후 result.items 의 OCR_NEEDED 표시 해제
      setResult(prev => prev ? { ...prev, items: prev.items.map(it => ocrNeededPages.includes(it.pageNumber) ? { ...it, method: "OCR" } : it) } : prev);
      onSaved?.();
    }
  }, [ocrPresetId, ocrNeededPages, pdfId, loadRows, onSaved]);

  const cancelOcr = () => {
    cancelledRef.current = true;
    setOcrProgress(p => p ? { ...p, stage: "취소 중..." } : null);
  };

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
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl h-[92vh] flex flex-col">
        {/* 헤더 */}
        <div className="px-5 py-3 border-b flex items-center justify-between gap-3 bg-gray-50 rounded-t-xl">
          <div className="min-w-0 flex-1">
            <h3 className="font-bold text-sm text-gray-800 truncate" title={filename}>📄 {filename}</h3>
            {result && (
              <div className="text-xs text-gray-500 mt-0.5">
                {result.preset
                  ? <>프리셋: <span className="font-semibold text-blue-600">{result.preset.name}</span> · 추출 {result.summary.extracted}건</>
                  : <span className="text-amber-600">자동 매칭 실패 — OCR 진행을 위해 프리셋 선택 필요</span>}
                {result.summary.skipped   > 0 && <> · 건너뜀 {result.summary.skipped}</>}
                {result.summary.ocrNeeded > 0 && <> · <span className="text-orange-600">OCR 필요 {result.summary.ocrNeeded}</span></>}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={runExtract} disabled={loading || ocrRunning}
              className="px-3 py-1.5 text-xs border border-gray-300 rounded hover:bg-gray-100 flex items-center gap-1 disabled:opacity-50">
              <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> 재추출
            </button>
            <button onClick={onClose} className="p-1.5 hover:bg-gray-200 rounded" disabled={ocrRunning}>
              <X size={16} />
            </button>
          </div>
        </div>

        {/* OCR 컨트롤 */}
        {ocrNeededPages.length > 0 && !ocrRunning && (
          <div className="px-5 py-3 bg-amber-50 border-b border-amber-200 flex items-center gap-3 flex-wrap">
            <FileSearch size={16} className="text-amber-700" />
            <span className="text-xs text-amber-900 font-semibold">{ocrNeededPages.length}개 페이지가 OCR 필요 (path-outlined PDF)</span>
            {availablePresets.length > 0 && (
              <select value={ocrPresetId} onChange={e => setOcrPresetId(e.target.value)}
                className="text-xs h-8 px-2 border border-amber-300 rounded bg-white">
                {availablePresets.map(p => (
                  <option key={p.id} value={p.id}>[{p.method}] {p.name}</option>
                ))}
              </select>
            )}
            <button onClick={startOcr} disabled={!ocrPresetId}
              className="ml-auto px-3 py-1.5 text-xs font-bold bg-orange-600 hover:bg-orange-700 text-white rounded disabled:opacity-50 flex items-center gap-1">
              <FileSearch size={12} /> OCR 시작 (사용자 PC 에서 처리)
            </button>
          </div>
        )}

        {/* OCR 진행 */}
        {ocrRunning && ocrProgress && (
          <div className="px-5 py-3 bg-blue-50 border-b border-blue-200">
            <div className="flex items-center gap-3 mb-1.5">
              <Loader2 size={14} className="animate-spin text-blue-600" />
              <span className="text-xs font-semibold text-blue-900">OCR 진행 중 — {ocrProgress.current}/{ocrProgress.total}</span>
              <span className="text-[11px] text-blue-700">{ocrProgress.stage}</span>
              <button onClick={cancelOcr} className="ml-auto px-2 py-1 text-[11px] border border-red-300 text-red-700 hover:bg-red-50 rounded flex items-center gap-1">
                <StopCircle size={11} /> 취소
              </button>
            </div>
            <div className="w-full h-2 bg-blue-200 rounded overflow-hidden">
              <div className="h-full bg-blue-600 transition-all" style={{ width: `${(ocrProgress.current / Math.max(1, ocrProgress.total)) * 100}%` }} />
            </div>
          </div>
        )}

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
          ) : rows.length === 0 && ocrNeededPages.length === 0 ? (
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
                  <th className="px-2 py-2 text-center font-semibold text-gray-600 border-r border-gray-200 w-24">방식/신뢰도</th>
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
                      {r.method === "OCR" && r.confidence !== null && r.confidence !== undefined && (
                        <div className="text-[10px] text-gray-500 mt-0.5">{Math.round(r.confidence * 100)}%</div>
                      )}
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
          <span>셀 직접 수정 후 행별 저장 · OCR 은 사용자 PC 에서 처리됩니다 (NAS 부담 0)</span>
          <button onClick={onClose} disabled={ocrRunning}
            className="px-4 py-1.5 text-xs bg-gray-700 text-white rounded hover:bg-gray-800 disabled:opacity-50">닫기</button>
        </div>
      </div>
    </div>
  );
}

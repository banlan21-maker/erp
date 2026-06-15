"use client";

import { useState, useEffect, useCallback } from "react";
import * as XLSX from "xlsx";
import { Upload, Download, Trash2, RefreshCw, X, FileSpreadsheet, Search, Eye } from "lucide-react";

/* ── 상태 정의 ─────────────────────────────────────────────────────────────── */
const STATUS_LIST = [
  { key: "REGISTERED",  label: "대기" },
  { key: "RECEIVED",    label: "입고" },
  { key: "ISSUED",      label: "투입" },
  { key: "COMPLETED",   label: "절단" },
  { key: "SHIPPED_OUT", label: "외부" },
] as const;
const STATUS_LABEL: Record<string, string> = Object.fromEntries(STATUS_LIST.map(s => [s.key, s.label]));
const STATUS_CLS: Record<string, string> = {
  REGISTERED:  "bg-gray-100 text-gray-700",
  RECEIVED:    "bg-green-100 text-green-700",
  ISSUED:      "bg-cyan-100 text-cyan-700",
  COMPLETED:   "bg-blue-100 text-blue-700",
  SHIPPED_OUT: "bg-purple-100 text-purple-700",
};
const ALL_KEYS = STATUS_LIST.map(s => s.key);

const fmtT = (v: number) => parseFloat(v.toFixed(1));
const fmtL = (v: number) => Math.round(v);
const fmtYMD = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return `${String(d.getFullYear()).slice(2)}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
};
const fmtDateTime = (iso: string) => new Date(iso).toLocaleString("ko-KR", { year: "2-digit", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });

interface Job     { id: string; name: string; statuses: string; specCount: number; createdAt: string }
interface Spec    { vesselCode: string; material: string; thickness: number; width: number; length: number }
interface PlanRow { id: string; vesselCode: string; material: string; thickness: number; width: number; length: number; status: string; uploadBatchNo: string | null; receivedAt: string | null; storageLocation: string | null; reservedFor: string | null }
interface MatchRow { matched: boolean; spec: Spec; plan: PlanRow | null }

const statusesLabel = (s: string) => (!s || s === "ALL") ? "전체" : s.split(",").map(k => STATUS_LABEL[k] ?? k).join("·");

/* ── 엑셀 파싱 (호선·재질·두께·폭·길이, 호선 빈칸 허용) ──────────────────────── */
function parseSpecs(raw: unknown[][]): Spec[] {
  let headerRow = 0;
  for (let i = 0; i < Math.min(10, raw.length); i++) {
    const joined = (raw[i] as string[]).join(" ");
    if (/재질|두께|폭|길이|material|thickness/i.test(joined)) { headerRow = i; break; }
  }
  const headers = (raw[headerRow] as string[]).map(h => String(h).trim().toLowerCase());
  const colIdx = (keys: string[]) => headers.findIndex(h => keys.some(k => h.includes(k)));
  const iVessel    = colIdx(["호선", "vessel"]);
  const iMaterial  = colIdx(["재질", "material"]);
  const iThickness = colIdx(["두께", "thickness", "t."]);
  const iWidth     = colIdx(["폭", "width", "w."]);
  const iLength    = colIdx(["길이", "length", "l."]);

  const specs: Spec[] = [];
  for (let i = headerRow + 1; i < raw.length; i++) {
    const r = raw[i] as (string | number)[];
    const material  = iMaterial  >= 0 ? String(r[iMaterial] ?? "").trim() : "";
    const thickness = iThickness >= 0 ? Number(r[iThickness]) : 0;
    const width     = iWidth     >= 0 ? Number(r[iWidth])     : 0;
    const length    = iLength    >= 0 ? Number(r[iLength])    : 0;
    if (!material || !thickness || !width || !length) continue;
    specs.push({
      vesselCode: iVessel >= 0 ? String(r[iVessel] ?? "").trim() : "",   // 빈칸이면 "" → 호선 제외 매칭
      material, thickness: fmtT(thickness), width: fmtL(width), length: fmtL(length),
    });
  }
  return specs;
}

export default function SteelMatchTab() {
  const [jobs, setJobs]           = useState<Job[]>([]);
  const [loading, setLoading]     = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);

  const [selJobId, setSelJobId]   = useState<string | null>(null);
  const [selJobName, setSelJobName] = useState("");
  const [rows, setRows]           = useState<MatchRow[]>([]);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [viewStatuses, setViewStatuses] = useState<Set<string>>(new Set(ALL_KEYS));
  const [search, setSearch]       = useState("");

  const loadJobs = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/steel-match");
      const d = await r.json();
      if (d.success) setJobs(d.data);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { loadJobs(); }, [loadJobs]);

  const loadMatches = useCallback(async (jobId: string, statuses: Set<string>) => {
    setRowsLoading(true);
    try {
      const stParam = statuses.size === ALL_KEYS.length ? "ALL" : Array.from(statuses).join(",");
      const r = await fetch(`/api/steel-match/${jobId}?statuses=${encodeURIComponent(stParam)}`);
      const d = await r.json();
      if (d.success) { setRows(d.data.rows); setSelJobName(d.data.job.name); }
      else { alert(d.error ?? "조회 실패"); setRows([]); }
    } finally { setRowsLoading(false); }
  }, []);

  const openJob = (jobId: string) => {
    setSelJobId(jobId);
    setSearch("");
    const all = new Set(ALL_KEYS);
    setViewStatuses(all);
    loadMatches(jobId, all);
  };

  const toggleStatus = (key: string) => {
    const next = new Set(viewStatuses);
    if (next.has(key)) next.delete(key); else next.add(key);
    if (next.size === 0) return;             // 최소 1개는 유지
    setViewStatuses(next);
    if (selJobId) loadMatches(selJobId, next);
  };
  const selectAllStatuses = () => {
    const all = new Set(ALL_KEYS);
    setViewStatuses(all);
    if (selJobId) loadMatches(selJobId, all);
  };

  const deleteJob = async (jobId: string, name: string) => {
    if (!confirm(`매칭 작업 '${name}'을(를) 삭제하시겠습니까?`)) return;
    const r = await fetch(`/api/steel-match/${jobId}`, { method: "DELETE" });
    if (r.ok) {
      if (selJobId === jobId) { setSelJobId(null); setRows([]); }
      loadJobs();
    } else alert("삭제 실패");
  };

  const filteredRows = rows.filter(r => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    const hay = `${r.plan?.vesselCode ?? r.spec.vesselCode} ${r.spec.material} ${r.plan?.uploadBatchNo ?? ""} ${r.plan?.reservedFor ?? ""} ${r.plan?.storageLocation ?? ""}`.toLowerCase();
    return hay.includes(q);
  });

  const summary = (() => {
    const counts: Record<string, number> = {};
    let unmatched = 0;
    for (const r of filteredRows) {
      if (r.matched && r.plan) counts[r.plan.status] = (counts[r.plan.status] ?? 0) + 1;
      else unmatched++;
    }
    return { counts, unmatched };
  })();

  // 일부 상태만 선택한 경우 '미매칭'은 '선택 상태 범위에 없음'을 의미 — 라벨로 명확화
  const unmatchedLabel = viewStatuses.size === ALL_KEYS.length ? "미매칭" : "미매칭(선택상태)";

  const downloadExcel = () => {
    if (filteredRows.length === 0) { alert("다운로드할 데이터가 없습니다."); return; }
    const wsRows = filteredRows.map(r => ({
      "호선":       r.matched ? r.plan!.vesselCode : (r.spec.vesselCode || "(전체)"),
      "재질":       r.spec.material,
      "두께":       fmtT(r.spec.thickness),
      "폭":         fmtL(r.spec.width),
      "길이":       fmtL(r.spec.length),
      "상태":       r.matched ? (STATUS_LABEL[r.plan!.status] ?? r.plan!.status) : unmatchedLabel,
      "업로드번호": r.plan?.uploadBatchNo ?? "",
      "입고일":     fmtYMD(r.plan?.receivedAt ?? null),
      "위치":       r.plan?.storageLocation ?? "",
      "확정정보":   r.plan?.reservedFor ?? "",
    }));
    const ws = XLSX.utils.json_to_sheet(wsRows);
    ws["!cols"] = [{ wch: 12 },{ wch: 8 },{ wch: 6 },{ wch: 7 },{ wch: 7 },{ wch: 8 },{ wch: 14 },{ wch: 10 },{ wch: 14 },{ wch: 16 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "강재매칭");
    const today = new Date().toISOString().split("T")[0];
    const safe = (selJobName || "강재매칭").replace(/[\\/?*[\]:]/g, "_").slice(0, 40);
    XLSX.writeFile(wb, `강재매칭_${safe}_${today}.xlsx`);
  };

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-700">강재매칭 작업</h3>
          <p className="text-xs text-gray-500 mt-0.5">엑셀 사양 목록을 강재전체목록과 매칭해 저장 — 새로고침 시 현재 상태로 다시 매칭됩니다.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadJobs} className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
            <RefreshCw size={14} /> 새로고침
          </button>
          <button onClick={() => setUploadOpen(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            <Upload size={14} /> 엑셀 업로드 매칭
          </button>
        </div>
      </div>

      {/* 매칭 작업 목록 */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-gray-600">매칭 이름</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600">업로드일시</th>
              <th className="px-3 py-2 text-right font-medium text-gray-600">사양수</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600">기본 대상상태</th>
              <th className="px-3 py-2 text-center font-medium text-gray-600 w-28">작업</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={5} className="py-8 text-center text-gray-400">불러오는 중...</td></tr>
            ) : jobs.length === 0 ? (
              <tr><td colSpan={5} className="py-8 text-center text-gray-400">저장된 매칭 작업이 없습니다. [엑셀 업로드 매칭]으로 시작하세요.</td></tr>
            ) : jobs.map(j => (
              <tr key={j.id} className={`hover:bg-blue-50/40 ${selJobId === j.id ? "bg-blue-50" : ""}`}>
                <td className="px-3 py-2 font-medium text-gray-800">{j.name}</td>
                <td className="px-3 py-2 text-gray-500">{fmtDateTime(j.createdAt)}</td>
                <td className="px-3 py-2 text-right text-gray-600">{j.specCount}</td>
                <td className="px-3 py-2 text-gray-500">{statusesLabel(j.statuses)}</td>
                <td className="px-3 py-2 text-center">
                  <div className="flex items-center justify-center gap-1">
                    <button onClick={() => openJob(j.id)} className="inline-flex items-center gap-1 px-2 py-1 text-[11px] bg-blue-600 text-white rounded hover:bg-blue-700"><Eye size={11} /> 보기</button>
                    <button onClick={() => deleteJob(j.id, j.name)} className="inline-flex items-center gap-1 px-2 py-1 text-[11px] border border-red-300 text-red-600 rounded hover:bg-red-50"><Trash2 size={11} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 매칭 결과 */}
      {selJobId && (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 flex-1 min-w-[200px]">
              <FileSpreadsheet size={15} className="text-blue-600" />
              <span className="text-sm font-semibold text-gray-800">{selJobName}</span>
              <span className="text-xs text-gray-400">매칭 {filteredRows.length}건</span>
            </div>
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="호선·재질·업로드번호 검색"
                className="pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg w-56 focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
            <button onClick={downloadExcel} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700">
              <Download size={14} /> 엑셀 다운로드
            </button>
          </div>

          {/* 상태 필터 */}
          <div className="px-4 py-2.5 border-b border-gray-200 flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-500 font-medium">상태:</span>
            <button onClick={selectAllStatuses}
              className={`px-2.5 py-1 text-xs rounded-full border ${viewStatuses.size === ALL_KEYS.length ? "bg-blue-600 border-blue-600 text-white" : "border-gray-300 text-gray-600 hover:bg-gray-50"}`}>
              전체
            </button>
            {STATUS_LIST.map(s => {
              const on = viewStatuses.has(s.key);
              const cnt = summary.counts[s.key] ?? 0;
              return (
                <button key={s.key} onClick={() => toggleStatus(s.key)}
                  className={`px-2.5 py-1 text-xs rounded-full border ${on ? "bg-blue-600 border-blue-600 text-white" : "border-gray-300 text-gray-500 hover:bg-gray-50"}`}>
                  {s.label}{on && cnt > 0 ? ` ${cnt}` : ""}
                </button>
              );
            })}
            {summary.unmatched > 0 && <span className="text-xs text-red-500 ml-1">미매칭 {summary.unmatched}건</span>}
          </div>

          {/* 결과 테이블 */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs whitespace-nowrap">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {["호선","재질","두께","폭","길이","상태","업로드번호","입고일","위치","확정정보"].map(h => (
                    <th key={h} className="px-3 py-2 text-left font-medium text-gray-600">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rowsLoading ? (
                  <tr><td colSpan={10} className="py-8 text-center text-gray-400">매칭 중...</td></tr>
                ) : filteredRows.length === 0 ? (
                  <tr><td colSpan={10} className="py-8 text-center text-gray-400">매칭 결과가 없습니다.</td></tr>
                ) : filteredRows.map((r, i) => (
                  <tr key={i} className={`hover:bg-gray-50 ${!r.matched ? "bg-red-50/40" : ""}`}>
                    <td className="px-3 py-1.5 font-medium">{r.matched ? r.plan!.vesselCode : (r.spec.vesselCode || <span className="text-gray-400">(전체)</span>)}</td>
                    <td className="px-3 py-1.5">{r.spec.material}</td>
                    <td className="px-3 py-1.5">{fmtT(r.spec.thickness)}</td>
                    <td className="px-3 py-1.5">{fmtL(r.spec.width)}</td>
                    <td className="px-3 py-1.5">{fmtL(r.spec.length)}</td>
                    <td className="px-3 py-1.5">
                      {r.matched
                        ? <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${STATUS_CLS[r.plan!.status] ?? "bg-gray-100 text-gray-600"}`}>{STATUS_LABEL[r.plan!.status] ?? r.plan!.status}</span>
                        : <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-red-100 text-red-600">{unmatchedLabel}</span>}
                    </td>
                    <td className="px-3 py-1.5 font-mono text-[10px] text-gray-400">{r.plan?.uploadBatchNo ?? "-"}</td>
                    <td className="px-3 py-1.5 text-gray-500 font-mono">{r.plan?.receivedAt ? fmtYMD(r.plan.receivedAt) : "-"}</td>
                    <td className="px-3 py-1.5 text-gray-600">{r.plan?.storageLocation ?? "-"}</td>
                    <td className="px-3 py-1.5 text-purple-700">{r.plan?.reservedFor ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {uploadOpen && (
        <UploadMatchModal
          onClose={() => setUploadOpen(false)}
          onCreated={(id) => { setUploadOpen(false); loadJobs(); openJob(id); }}
        />
      )}
    </div>
  );
}

/* ── 업로드 → 사양 확인 → 이름·상태 입력 → 생성 ───────────────────────────── */
function UploadMatchModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [step, setStep]       = useState<"upload" | "confirm">("upload");
  const [specs, setSpecs]     = useState<Spec[]>([]);
  const [name, setName]       = useState("");
  const [statuses, setStatuses] = useState<Set<string>>(new Set(ALL_KEYS));
  const [loading, setLoading] = useState(false);

  const handleFile = async (file: File) => {
    setLoading(true);
    try {
      const buf = await file.arrayBuffer();
      const wb  = XLSX.read(buf);
      const ws  = wb.Sheets[wb.SheetNames[0]];
      const raw = (XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as unknown) as unknown[][];
      const parsed = parseSpecs(raw);
      if (parsed.length === 0) {
        alert("유효한 사양 행을 찾지 못했습니다.\n헤더(호선·재질·두께·폭·길이)가 있어야 하며, 재질·두께·폭·길이는 필수입니다.");
        return;
      }
      setSpecs(parsed);
      setName(file.name.replace(/\.(xlsx|xls)$/i, ""));
      setStep("confirm");
    } catch (e) {
      alert(e instanceof Error ? e.message : "파일 처리 실패");
    } finally { setLoading(false); }
  };

  const toggle = (key: string) => setStatuses(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next.size === 0 ? prev : next;
  });

  const create = async () => {
    if (!name.trim()) { alert("매칭 이름을 입력하세요. (예: 4506호선 입고자재 매칭작업)"); return; }
    setLoading(true);
    try {
      const stParam = statuses.size === ALL_KEYS.length ? "ALL" : Array.from(statuses).join(",");
      const r = await fetch("/api/steel-match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), statuses: stParam, specs }),
      });
      const d = await r.json();
      if (!d.success) { alert(d.error ?? "생성 실패"); return; }
      onCreated(d.data.id);
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => !loading && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
          <h3 className="font-bold text-base text-gray-900 flex items-center gap-2"><Upload size={16} className="text-blue-600" /> 강재매칭 — 엑셀 업로드</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full"><X size={16} /></button>
        </div>

        {step === "upload" && (
          <div className="p-5 space-y-3">
            <div className="text-sm text-gray-700 leading-relaxed">
              양식: <strong>호선 · 재질 · 두께 · 폭 · 길이</strong> 컬럼이 헤더 1행에 있는 엑셀.<br />
              <span className="text-gray-500 text-xs">호선이 비어 있으면 호선을 제외하고 나머지 사양으로 매칭합니다.</span>
            </div>
            <label className={`block border-2 border-dashed rounded-xl p-8 text-center cursor-pointer ${loading ? "border-gray-300 bg-gray-50" : "border-blue-300 hover:bg-blue-50/50"}`}>
              <Upload size={24} className="mx-auto mb-2 text-blue-500" />
              <div className="text-sm font-semibold text-gray-700">{loading ? "처리 중…" : "엑셀 파일 선택 또는 드래그"}</div>
              <input type="file" accept=".xlsx,.xls" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            </label>
          </div>
        )}

        {step === "confirm" && (
          <div className="p-5 space-y-4 overflow-y-auto">
            <div className="text-sm bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-blue-700">
              사양 <strong>{specs.length}건</strong> 인식됨. 매칭 이름과 기본 대상 상태를 설정하세요.
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">매칭 이름 <span className="text-red-500">*</span></label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="예: 4506호선 입고자재 매칭작업"
                className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" autoFocus />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">기본 대상 상태 <span className="text-gray-400 font-normal">(보기에서 변경 가능)</span></label>
              <div className="flex gap-1.5 flex-wrap">
                {STATUS_LIST.map(s => {
                  const on = statuses.has(s.key);
                  return (
                    <button key={s.key} type="button" onClick={() => toggle(s.key)}
                      className={`px-2.5 py-1 text-xs rounded-full border ${on ? "bg-blue-600 border-blue-600 text-white" : "border-gray-300 text-gray-500 hover:bg-gray-50"}`}>
                      {s.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-gray-100">
              <button onClick={() => setStep("upload")} className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50">← 다시 업로드</button>
              <button onClick={create} disabled={loading} className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-40">
                {loading ? "생성 중..." : "매칭 작업 생성"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

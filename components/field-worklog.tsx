"use client";

import { useState, useEffect, useCallback } from "react";
import { Play, Square, RotateCcw, ChevronDown, ChevronUp, Loader2, Check } from "lucide-react";

// ─── 타입 ──────────────────────────────────────────────────────────────────

interface Equipment { id: string; name: string; type: string }
interface Project   { id: string; projectCode: string; projectName: string }
interface Worker    { id: string; name: string; nationality: string | null }
interface DrawingRow {
  id: string; drawingNo: string | null; heatNo: string | null;
  material: string; thickness: number; width: number; length: number; qty: number; block: string | null;
}
interface CuttingLog {
  id: string; equipmentId: string;
  equipment: { id: string; name: string; type: string };
  project: { projectCode: string; projectName: string } | null;
  heatNo: string; material: string | null; thickness: number | null;
  drawingNo: string | null; operator: string;
  status: "STARTED" | "COMPLETED";
  startAt: string; endAt: string | null; memo: string | null;
}

const TYPE_LABEL: Record<string, string> = { PLASMA: "플라즈마", GAS: "가스" };

// ─── 유틸 ──────────────────────────────────────────────────────────────────

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
}
function fmtDuration(start: string, end: string | null) {
  const ms = (end ? new Date(end) : new Date()).getTime() - new Date(start).getTime();
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000);
  return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}분 ${s}초` : `${s}초`;
}

function LiveTimer({ startAt }: { startAt: string }) {
  const [, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick(n => n + 1), 1000); return () => clearInterval(t); }, []);
  return <span>{fmtDuration(startAt, null)}</span>;
}

// ─── 메인 컴포넌트 ──────────────────────────────────────────────────────────

export default function FieldWorklog({
  equipment, projects, workers, todayLogs: initialLogs,
}: {
  equipment: Equipment[];
  projects:  Project[];
  workers:   Worker[];
  todayLogs: CuttingLog[];
}) {
  const [logs,       setLogs]       = useState<CuttingLog[]>(initialLogs);
  const [selectedEq, setSelectedEq] = useState<string>("");
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [step1Open,  setStep1Open]  = useState(true);

  // 1단계 (세션, 유지)
  const [s1, setS1] = useState({ vesselCode: "", projectId: "", operatorId: "" });
  const s1Done = !!(s1.projectId && s1.operatorId);

  // 2단계 (매 절단마다 초기화)
  const [drawingId,  setDrawingId]  = useState("");
  const [heatNo,     setHeatNo]     = useState("");
  const [memo,       setMemo]       = useState("");
  const [drawings,   setDrawings]   = useState<DrawingRow[]>([]);
  const [dwLoading,  setDwLoading]  = useState(false);
  const [search,     setSearch]     = useState("");

  const eqLogs    = logs.filter(l => l.equipmentId === selectedEq);
  const ongoing   = eqLogs.find(l => l.status === "STARTED");
  const doneLogs  = eqLogs.filter(l => l.status === "COMPLETED");

  const vesselCodes     = [...new Set(projects.map(p => p.projectCode))].sort();
  const blocksForVessel = projects.filter(p => p.projectCode === s1.vesselCode);
  const selBlock  = projects.find(p => p.id === s1.projectId);
  const selWorker = workers.find(w => w.id === s1.operatorId);
  const selDrawing= drawings.find(d => d.id === drawingId);

  const refreshLogs = useCallback(async () => {
    const res = await fetch(`/api/cutting-logs?date=${new Date().toISOString().slice(0, 10)}`);
    const d = await res.json();
    if (d.success) setLogs(d.data);
  }, []);

  const resetStep2 = () => { setDrawingId(""); setHeatNo(""); setMemo(""); setSearch(""); };
  const resetAll   = () => { setS1({ vesselCode: "", projectId: "", operatorId: "" }); resetStep2(); setDrawings([]); setStep1Open(true); };

  const handleBlockChange = async (pid: string) => {
    setS1(s => ({ ...s, projectId: pid }));
    resetStep2();
    setDrawings([]);
    if (!pid) return;
    setDwLoading(true);
    try {
      const res = await fetch(`/api/drawings?projectId=${pid}&status=WAITING`);
      const d = await res.json();
      if (d.success) setDrawings(d.data);
    } finally { setDwLoading(false); }
  };

  const handleStart = async () => {
    setError(null);
    if (!selectedEq)  { setError("장비를 선택하세요."); return; }
    if (!s1.projectId){ setError("호선·블록을 선택하세요."); return; }
    if (!s1.operatorId){ setError("작업자를 선택하세요."); return; }
    if (!drawingId)    { setError("도면번호를 선택하세요."); return; }

    setLoading(true);
    try {
      const row = drawings.find(d => d.id === drawingId);
      const res = await fetch("/api/cutting-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          equipmentId:   selectedEq,
          projectId:     s1.projectId,
          drawingListId: drawingId,
          heatNo:        heatNo || "",
          material:      row?.material   || null,
          thickness:     row?.thickness  || null,
          width:         row?.width      || null,
          length:        row?.length     || null,
          qty:           row?.qty        || null,
          drawingNo:     row?.drawingNo  || null,
          operator:      selWorker?.name ?? "",
          memo:          memo || null,
        }),
      });
      const d = await res.json();
      if (!d.success) { setError(d.error); return; }
      resetStep2();
      await refreshLogs();
    } catch { setError("서버 오류"); } finally { setLoading(false); }
  };

  const handleComplete = async (logId: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/cutting-logs/${logId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "complete" }),
      });
      const d = await res.json();
      if (!d.success) { setError(d.error); return; }
      resetStep2();
      await refreshLogs();
    } catch { setError("서버 오류"); } finally { setLoading(false); }
  };

  const filteredDrawings = drawings.filter(d => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return d.drawingNo?.toLowerCase().includes(q) || d.heatNo?.toLowerCase().includes(q);
  });

  // ── 장비 미선택 ──────────────────────────────────────────────────────────

  if (!selectedEq) {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col">
        {/* 헤더 */}
        <div className="bg-gray-900 px-4 py-4 border-b border-gray-800">
          <p className="text-xs text-gray-500 font-medium">CNC 절단 파트</p>
          <h1 className="text-lg font-bold text-white mt-0.5">현장 작업일보</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            {new Date().toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short" })}
          </p>
        </div>

        <div className="flex-1 p-4">
          <p className="text-sm text-gray-400 mb-4 font-medium">사용할 장비를 선택하세요</p>
          <div className="grid grid-cols-1 gap-3">
            {equipment.map(eq => {
              const eqOngoing = logs.find(l => l.equipmentId === eq.id && l.status === "STARTED");
              const eqDone    = logs.filter(l => l.equipmentId === eq.id && l.status === "COMPLETED").length;
              return (
                <button
                  key={eq.id}
                  onClick={() => setSelectedEq(eq.id)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-2xl p-5 text-left active:scale-95 transition-transform"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-lg font-bold text-white">{eq.name}</p>
                      <p className="text-sm text-gray-400 mt-0.5">{TYPE_LABEL[eq.type]}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                      {eqOngoing && (
                        <span className="text-xs px-2.5 py-1 rounded-full bg-red-500 text-white font-bold animate-pulse">진행중</span>
                      )}
                      {eqDone > 0 && (
                        <span className="text-xs px-2.5 py-1 rounded-full bg-gray-700 text-gray-300">완료 {eqDone}건</span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          {equipment.length === 0 && (
            <p className="text-center text-gray-500 py-12">등록된 장비가 없습니다.</p>
          )}
        </div>
      </div>
    );
  }

  const eq = equipment.find(e => e.id === selectedEq)!;

  // ── 메인 작업 화면 ────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col max-w-lg mx-auto">
      {/* 헤더 */}
      <div className="bg-gray-900 px-4 py-3 border-b border-gray-800 flex items-center justify-between sticky top-0 z-10">
        <div>
          <button onClick={() => setSelectedEq("")} className="text-xs text-gray-500 hover:text-gray-300 mb-0.5">← 장비 변경</button>
          <p className="text-base font-bold text-white">{eq.name} <span className="text-xs font-normal text-gray-400">{TYPE_LABEL[eq.type]}</span></p>
        </div>
        <p className="text-xs text-gray-500">
          {new Date().toLocaleDateString("ko-KR", { month: "numeric", day: "numeric", weekday: "short" })}
        </p>
      </div>

      <div className="flex-1 p-4 space-y-3 pb-8">

        {/* ══ 진행중 작업 ══ */}
        {ongoing && (
          <div className="bg-red-950 border-2 border-red-500 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
                <span className="font-bold text-red-300 text-base">절단 진행중</span>
              </div>
              <span className="text-red-300 font-mono text-lg font-bold">
                <LiveTimer startAt={ongoing.startAt} />
              </span>
            </div>
            <div className="space-y-1.5 text-sm">
              {ongoing.drawingNo && (
                <div className="flex gap-3">
                  <span className="text-gray-500 w-16">도면번호</span>
                  <span className="font-mono font-bold text-white">{ongoing.drawingNo}</span>
                </div>
              )}
              {ongoing.heatNo && (
                <div className="flex gap-3">
                  <span className="text-gray-500 w-16">Heat NO</span>
                  <span className="font-mono text-blue-300">{ongoing.heatNo}</span>
                </div>
              )}
              {ongoing.project && (
                <div className="flex gap-3">
                  <span className="text-gray-500 w-16">호선/블록</span>
                  <span className="text-gray-300">[{ongoing.project.projectCode}] {ongoing.project.projectName}</span>
                </div>
              )}
              <div className="flex gap-3">
                <span className="text-gray-500 w-16">작업자</span>
                <span className="text-gray-300">{ongoing.operator}</span>
              </div>
              <div className="flex gap-3">
                <span className="text-gray-500 w-16">시작</span>
                <span className="text-gray-300">{fmtTime(ongoing.startAt)}</span>
              </div>
              {ongoing.memo && (
                <div className="flex gap-3">
                  <span className="text-gray-500 w-16">특이사항</span>
                  <span className="text-gray-400">{ongoing.memo}</span>
                </div>
              )}
            </div>
            <button
              onClick={() => handleComplete(ongoing.id)}
              disabled={loading}
              className="w-full bg-red-600 active:bg-red-700 rounded-xl py-4 flex items-center justify-center gap-3 text-white font-bold text-lg transition-colors disabled:opacity-60"
            >
              <Square size={20} fill="currentColor" />
              절단 종료
            </button>
          </div>
        )}

        {/* ══ 1단계: 세션 설정 ══ */}
        <div className={`rounded-2xl border-2 overflow-hidden ${s1Done ? "border-blue-600 bg-blue-950" : "border-gray-700 bg-gray-900"}`}>
          <button
            className="w-full flex items-center justify-between px-4 py-3"
            onClick={() => setStep1Open(o => !o)}
          >
            <div className="flex items-center gap-3">
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${s1Done ? "bg-blue-500 text-white" : "bg-gray-600 text-gray-400"}`}>
                {s1Done ? <Check size={13} /> : "1"}
              </span>
              <div className="text-left">
                <p className="text-sm font-semibold text-white">세션 설정</p>
                {s1Done && (
                  <p className="text-xs text-blue-300 mt-0.5">
                    {selBlock ? `[${selBlock.projectCode}] ${selBlock.projectName}` : ""} · {selWorker?.name}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {s1Done && (
                <button
                  onClick={e => { e.stopPropagation(); resetAll(); }}
                  className="text-xs text-gray-500 hover:text-red-400 px-2 py-1 rounded"
                >
                  <RotateCcw size={13} />
                </button>
              )}
              {step1Open ? <ChevronUp size={16} className="text-gray-500" /> : <ChevronDown size={16} className="text-gray-500" />}
            </div>
          </button>

          {step1Open && (
            <div className="border-t border-gray-700 px-4 pb-4 pt-3 space-y-3">
              {/* 호선 */}
              <div>
                <label className="text-xs text-gray-400 font-medium mb-1.5 block">호선 선택</label>
                <select
                  value={s1.vesselCode}
                  onChange={e => {
                    setS1(s => ({ ...s, vesselCode: e.target.value, projectId: "" }));
                    resetStep2(); setDrawings([]);
                  }}
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-3 text-sm text-white appearance-none"
                >
                  <option value="">-- 호선 선택 --</option>
                  {vesselCodes.map(code => (
                    <option key={code} value={code}>{code}</option>
                  ))}
                </select>
              </div>

              {/* 블록 */}
              <div>
                <label className="text-xs text-gray-400 font-medium mb-1.5 block">블록 선택</label>
                <select
                  value={s1.projectId}
                  onChange={e => handleBlockChange(e.target.value)}
                  disabled={!s1.vesselCode}
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-3 text-sm text-white appearance-none disabled:opacity-40"
                >
                  <option value="">-- 블록 선택 --</option>
                  {blocksForVessel.map(p => (
                    <option key={p.id} value={p.id}>{p.projectName}</option>
                  ))}
                </select>
              </div>

              {/* 작업자 */}
              <div>
                <label className="text-xs text-gray-400 font-medium mb-1.5 block">작업자 선택</label>
                <select
                  value={s1.operatorId}
                  onChange={e => setS1(s => ({ ...s, operatorId: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-3 text-sm text-white appearance-none"
                >
                  <option value="">-- 작업자 선택 --</option>
                  {workers.map(w => (
                    <option key={w.id} value={w.id}>{w.name}{w.nationality ? ` (${w.nationality})` : ""}</option>
                  ))}
                </select>
                {workers.length === 0 && <p className="text-xs text-gray-500 mt-1">인원관리에서 먼저 등록하세요.</p>}
              </div>

              {s1Done && (
                <button
                  onClick={() => setStep1Open(false)}
                  className="w-full bg-blue-600 active:bg-blue-700 rounded-xl py-3 text-white font-semibold text-sm"
                >
                  확인 →
                </button>
              )}
            </div>
          )}
        </div>

        {/* ══ 2단계: 절단 등록 ══ */}
        {s1Done && !ongoing && (
          <div className="rounded-2xl border-2 border-green-600 bg-gray-900 overflow-hidden">
            <div className="px-4 py-3 bg-green-950 border-b border-green-800 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-green-600 text-white flex items-center justify-center text-xs font-bold">2</span>
              <span className="text-sm font-semibold text-green-300">절단 등록</span>
              <span className="text-xs text-gray-500 ml-1">
                {selBlock ? `[${selBlock.projectCode}] ${selBlock.projectName}` : ""} · {selWorker?.name}
              </span>
            </div>
            <div className="px-4 pb-4 pt-3 space-y-3">

              {/* 도면번호 검색 */}
              <div>
                <label className="text-xs text-gray-400 font-medium mb-1.5 block">
                  도면번호 선택 <span className="text-red-400">*</span>
                  {dwLoading && <Loader2 size={11} className="inline ml-1 animate-spin" />}
                </label>
                {drawings.length > 5 && (
                  <input
                    type="text"
                    placeholder="도면번호 검색..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-500 mb-2"
                  />
                )}
                <div className="space-y-2 max-h-52 overflow-y-auto">
                  {filteredDrawings.length === 0 && !dwLoading && (
                    <p className="text-xs text-gray-500 py-2">
                      {!s1.projectId ? "블록을 먼저 선택하세요" : "입고 완료된 강재가 없습니다"}
                    </p>
                  )}
                  {filteredDrawings.map(d => (
                    <button
                      key={d.id}
                      onClick={() => setDrawingId(d.id)}
                      className={`w-full text-left px-3 py-3 rounded-xl border transition-colors ${
                        drawingId === d.id
                          ? "bg-green-700 border-green-500 text-white"
                          : "bg-gray-800 border-gray-700 text-gray-300 active:bg-gray-700"
                      }`}
                    >
                      <p className="font-mono font-semibold text-sm">{d.drawingNo ?? "(번호없음)"}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {d.material} {d.thickness}t × {d.width} × {d.length} · {d.qty}매
                        {d.heatNo ? ` · ${d.heatNo}` : ""}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              {/* 선택된 도면 정보 */}
              {selDrawing && (
                <div className="bg-gray-800 rounded-xl px-3 py-2.5 text-xs text-gray-400 space-y-1">
                  <div className="flex justify-between"><span>재질</span><span className="text-white font-medium">{selDrawing.material}</span></div>
                  <div className="flex justify-between"><span>두께</span><span className="text-white font-medium">{selDrawing.thickness}mm</span></div>
                  <div className="flex justify-between"><span>폭 × 길이</span><span className="text-white font-medium">{selDrawing.width} × {selDrawing.length}</span></div>
                  <div className="flex justify-between"><span>수량</span><span className="text-white font-medium">{selDrawing.qty}매</span></div>
                </div>
              )}

              {/* Heat NO */}
              <div>
                <label className="text-xs text-gray-400 font-medium mb-1.5 block">Heat NO <span className="text-gray-600">(선택)</span></label>
                <input
                  type="text"
                  placeholder="Heat NO"
                  value={heatNo}
                  onChange={e => setHeatNo(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-3 text-sm text-white placeholder-gray-500 font-mono"
                />
              </div>

              {/* 특이사항 */}
              <div>
                <label className="text-xs text-gray-400 font-medium mb-1.5 block">특이사항 <span className="text-gray-600">(선택)</span></label>
                <textarea
                  rows={2}
                  placeholder="특이사항"
                  value={memo}
                  onChange={e => setMemo(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-3 text-sm text-white placeholder-gray-500 resize-none"
                />
              </div>

              {error && (
                <p className="text-sm text-red-400 bg-red-950 border border-red-800 rounded-xl px-3 py-2.5">{error}</p>
              )}

              <button
                onClick={handleStart}
                disabled={loading || !drawingId}
                className="w-full bg-green-600 active:bg-green-700 disabled:opacity-50 rounded-xl py-4 flex items-center justify-center gap-3 text-white font-bold text-lg transition-colors"
              >
                <Play size={20} fill="currentColor" />
                {loading ? "등록 중..." : "절단 시작"}
              </button>
            </div>
          </div>
        )}

        {!s1Done && !ongoing && (
          <div className="rounded-2xl border-2 border-dashed border-gray-800 p-8 text-center text-gray-600 text-sm">
            1단계 세션을 설정하면 절단 등록이 활성화됩니다
          </div>
        )}

        {/* ══ 오늘 완료 목록 ══ */}
        {doneLogs.length > 0 && (
          <div className="rounded-2xl bg-gray-900 border border-gray-800 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-800">
              <h3 className="text-sm font-semibold text-gray-300">오늘 완료 <span className="text-gray-500 font-normal">({doneLogs.length}건)</span></h3>
            </div>
            <div className="divide-y divide-gray-800">
              {doneLogs.map(log => (
                <div key={log.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {log.drawingNo && (
                          <span className="font-mono text-xs font-bold text-white bg-gray-800 px-2 py-0.5 rounded">{log.drawingNo}</span>
                        )}
                        {log.heatNo && (
                          <span className="font-mono text-xs text-blue-400 bg-blue-950 px-2 py-0.5 rounded">{log.heatNo}</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500">
                        {log.operator} · {fmtTime(log.startAt)} ~ {log.endAt ? fmtTime(log.endAt) : "-"}
                        {log.endAt && <span className="text-green-500 ml-1">{fmtDuration(log.startAt, log.endAt)}</span>}
                      </p>
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-green-900 text-green-400 flex-shrink-0">완료</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

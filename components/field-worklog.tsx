"use client";

import { useState, useEffect, useCallback } from "react";
import { Play, Square, RotateCcw, ChevronDown, ChevronUp, Loader2, Check, Zap, AlertTriangle, X, Save } from "lucide-react";

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
  isUrgent?: boolean; urgentWorkId?: string | null;
}

interface UrgentWork {
  id: string;
  urgentNo: string;
  title: string;
  urgency: string;
  requester: string | null;
  dueDate: string | null;
  destination: string | null;
  materialMemo: string | null;
  status: string;
  remnant: { id: string; remnantNo: string; material: string; thickness: number; weight: number; needsConsult: boolean } | null;
}

interface Remnant {
  id: string; remnantNo: string; material: string; thickness: number; weight: number; needsConsult: boolean;
}

const URGENCY_COLOR_DARK: Record<string, string> = {
  URGENT:   "border-red-500 bg-red-950",
  FLEXIBLE: "border-green-600 bg-green-950",
  PRECUT:   "border-blue-600 bg-blue-950",
};
const URGENCY_BADGE: Record<string, string> = {
  URGENT:   "bg-red-600 text-white",
  FLEXIBLE: "bg-green-600 text-white",
  PRECUT:   "bg-blue-600 text-white",
};
const URGENCY_LABEL: Record<string, string> = { URGENT: "⚡ 긴급", FLEXIBLE: "✅ 여유", PRECUT: "📦 선행" };

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
  const [mainTab,    setMainTab]    = useState<"normal" | "urgent">("normal");

  // 돌발 탭 상태
  const [urgentWorks,     setUrgentWorks]     = useState<UrgentWork[]>([]);
  const [urgentLoaded,    setUrgentLoaded]    = useState(false);
  const [selUrgentId,     setSelUrgentId]     = useState<string>("");
  const [uOperatorId,     setUOperatorId]     = useState<string>("");
  const [uHeatNo,         setUHeatNo]         = useState<string>("");
  const [uMemo,           setUMemo]           = useState<string>("");
  const [uRemnantId,      setURemnantId]      = useState<string>("");
  const [remnants,        setRemnants]        = useState<Remnant[]>([]);
  const [remnantLoaded,   setRemnantLoaded]   = useState(false);
  const [remnantPopup,    setRemnantPopup]    = useState<{ logId: string; urgentId: string } | null>(null);
  const [remForm,         setRemForm]         = useState({ material: "", thickness: "", width: "", length: "", weight: "", registeredBy: "" });

  // 1단계 (세션, 유지)
  const [s1, setS1] = useState({ vesselCode: "", projectId: "", operatorId: "" });
  const s1Done = !!(s1.projectId && s1.operatorId);

  // 2단계 (매 절단마다 초기화)
  const [drawingId,    setDrawingId]    = useState("");
  const [heatNo,       setHeatNo]       = useState("");
  const [heatNoQuery,  setHeatNoQuery]  = useState("");
  const [heatOptions,  setHeatOptions]  = useState<{ id: string; heatNo: string; status: string }[]>([]);
  const [heatLoading,  setHeatLoading]  = useState(false);
  const [memo,         setMemo]         = useState("");
  const [drawings,     setDrawings]     = useState<DrawingRow[]>([]);
  const [dwLoading,    setDwLoading]    = useState(false);
  const [search,       setSearch]       = useState("");

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

  const resetStep2 = () => { setDrawingId(""); setHeatNo(""); setHeatNoQuery(""); setHeatOptions([]); setMemo(""); setSearch(""); };
  const resetAll   = () => { setS1({ vesselCode: "", projectId: "", operatorId: "" }); resetStep2(); setDrawings([]); setStep1Open(true); };

  const loadUrgentWorks = useCallback(async () => {
    try {
      const res  = await fetch("/api/urgent-works?status=PENDING&urgency=URGENT");
      const res2 = await fetch("/api/urgent-works?status=PENDING");
      const res3 = await fetch("/api/urgent-works?status=IN_PROGRESS");
      const [d1, d2, d3] = await Promise.all([res.json(), res2.json(), res3.json()]);
      const all: UrgentWork[] = [];
      const seen = new Set<string>();
      for (const d of [d1, d2, d3]) {
        if (d.success) for (const w of d.data) { if (!seen.has(w.id)) { seen.add(w.id); all.push(w); } }
      }
      all.sort((a, b) => {
        const order: Record<string, number> = { URGENT: 0, FLEXIBLE: 1, PRECUT: 2 };
        return (order[a.urgency] ?? 9) - (order[b.urgency] ?? 9);
      });
      setUrgentWorks(all);
      setUrgentLoaded(true);
    } catch { /* ignore */ }
  }, []);

  const loadRemnants = useCallback(async () => {
    if (remnantLoaded) return;
    try {
      const res  = await fetch("/api/remnants?status=IN_STOCK");
      const data = await res.json();
      if (data.success) setRemnants(data.data);
    } catch { /* ignore */ }
    setRemnantLoaded(true);
  }, [remnantLoaded]);

  const handleUrgentStart = async () => {
    setError(null);
    if (!selectedEq)   { setError("장비를 선택하세요."); return; }
    if (!selUrgentId)  { setError("돌발작업을 선택하세요."); return; }
    if (!uOperatorId)  { setError("작업자를 선택하세요."); return; }
    setLoading(true);
    try {
      const w = urgentWorks.find(u => u.id === selUrgentId);
      const workerName = workers.find(wo => wo.id === uOperatorId)?.name ?? "";
      const res = await fetch("/api/cutting-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          equipmentId:  selectedEq,
          heatNo:       uHeatNo || "",
          operator:     workerName,
          memo:         uMemo || null,
          isUrgent:     true,
          urgentWorkId: selUrgentId,
        }),
      });
      const d = await res.json();
      if (!d.success) { setError(d.error); return; }
      // update urgent work status to IN_PROGRESS
      await fetch(`/api/urgent-works/${selUrgentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "IN_PROGRESS" }),
      });
      setUHeatNo(""); setUMemo(""); setURemnantId("");
      await refreshLogs();
      await loadUrgentWorks();
    } catch { setError("서버 오류"); }
    finally { setLoading(false); }
  };

  const handleUrgentComplete = async (logId: string, urgentId: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/cutting-logs/${logId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "complete" }),
      });
      const d = await res.json();
      if (!d.success) { setError(d.error); return; }
      await refreshLogs();
      // show remnant popup
      setRemnantPopup({ logId, urgentId });
    } catch { setError("서버 오류"); }
    finally { setLoading(false); }
  };

  const handleRemnantNo = async () => {
    // 잔여분 없음 → urgent work COMPLETED
    if (remnantPopup) {
      await fetch(`/api/urgent-works/${remnantPopup.urgentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "COMPLETED" }),
      });
    }
    setRemnantPopup(null);
    await loadUrgentWorks();
  };

  const handleRemnantYes = async () => {
    if (!remForm.material || !remForm.thickness || !remForm.weight) {
      alert("재질, 두께, 중량은 필수입니다.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/remnants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "REMNANT",
          shape: "RECTANGLE",
          material: remForm.material,
          thickness: parseFloat(remForm.thickness),
          weight: parseFloat(remForm.weight),
          width1: remForm.width ? parseFloat(remForm.width) : null,
          length1: remForm.length ? parseFloat(remForm.length) : null,
          registeredBy: remForm.registeredBy || workers.find(w => w.id === uOperatorId)?.name || "현장",
        }),
      });
      const d = await res.json();
      if (!d.success) { alert(d.error); return; }
      if (remnantPopup) {
        await fetch(`/api/urgent-works/${remnantPopup.urgentId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "COMPLETED" }),
        });
      }
      setRemnantPopup(null);
      setRemForm({ material: "", thickness: "", width: "", length: "", weight: "", registeredBy: "" });
      setRemnantLoaded(false);
      await loadUrgentWorks();
    } catch { alert("서버 오류"); }
    finally { setLoading(false); }
  };

  const handleBlockChange = async (pid: string) => {
    setS1(s => ({ ...s, projectId: pid }));
    resetStep2();
    setDrawings([]);
    if (!pid) return;
    setDwLoading(true);
    try {
      // WAITING(입고완료) 우선, 없으면 REGISTERED(대기)도 포함
      const res = await fetch(`/api/drawings?projectId=${pid}`);
      const d = await res.json();
      if (d.success) setDrawings(d.data.filter((r: DrawingRow & { status?: string }) => r.status !== "CUT"));
    } finally { setDwLoading(false); }
  };

  const handleDrawingSelect = async (did: string) => {
    setDrawingId(did);
    setHeatNo("");
    setHeatNoQuery("");
    setHeatOptions([]);
    if (!did) return;
    const row = drawings.find(d => d.id === did);
    if (!row || !s1.vesselCode) return;
    setHeatLoading(true);
    try {
      const params = new URLSearchParams({
        vesselCode: s1.vesselCode,
        material:   row.material,
        thickness:  String(row.thickness),
        width:      String(row.width),
        length:     String(row.length),
      });
      const res = await fetch(`/api/steel-plan/heat-options?${params}`);
      if (res.ok) setHeatOptions(await res.json());
    } finally { setHeatLoading(false); }
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

  const urgentPendingCount = urgentWorks.filter(w => w.status !== "COMPLETED").length;
  const urgentOngoing = eqLogs.find(l => l.status === "STARTED" && l.isUrgent);

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col max-w-lg mx-auto">
      {/* 헤더 */}
      <div className="bg-gray-900 px-4 py-3 border-b border-gray-800 sticky top-0 z-10">
        <div className="flex items-center justify-between mb-2">
          <div>
            <button onClick={() => setSelectedEq("")} className="text-xs text-gray-500 hover:text-gray-300 mb-0.5">← 장비 변경</button>
            <p className="text-base font-bold text-white">{eq.name} <span className="text-xs font-normal text-gray-400">{TYPE_LABEL[eq.type]}</span></p>
          </div>
          <p className="text-xs text-gray-500">
            {new Date().toLocaleDateString("ko-KR", { month: "numeric", day: "numeric", weekday: "short" })}
          </p>
        </div>
        {/* 탭 */}
        <div className="flex gap-1">
          <button
            onClick={() => setMainTab("normal")}
            className={`flex-1 py-2 rounded-xl text-xs font-bold transition-colors ${
              mainTab === "normal" ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400"
            }`}
          >정규작업</button>
          <button
            onClick={() => {
              setMainTab("urgent");
              if (!urgentLoaded) loadUrgentWorks();
              loadRemnants();
            }}
            className={`flex-1 py-2 rounded-xl text-xs font-bold transition-colors relative ${
              mainTab === "urgent" ? "bg-orange-600 text-white" : "bg-gray-800 text-gray-400"
            }`}
          >
            <Zap size={11} className="inline mr-0.5 mb-0.5" />돌발작업
            {urgentPendingCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {urgentPendingCount > 9 ? "9+" : urgentPendingCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ══ 돌발작업 탭 ══ */}
      {mainTab === "urgent" && (
        <div className="flex-1 p-4 space-y-3 pb-8">

          {/* 돌발 진행중 */}
          {urgentOngoing && (
            <div className="bg-orange-950 border-2 border-orange-500 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 bg-orange-500 rounded-full animate-pulse" />
                  <span className="font-bold text-orange-300 text-base">돌발 진행중</span>
                </div>
                <span className="text-orange-300 font-mono text-lg font-bold">
                  <LiveTimer startAt={urgentOngoing.startAt} />
                </span>
              </div>
              <div className="space-y-1.5 text-sm">
                <div className="flex gap-3">
                  <span className="text-gray-500 w-16">작업자</span>
                  <span className="text-gray-300">{urgentOngoing.operator}</span>
                </div>
                {urgentOngoing.heatNo && (
                  <div className="flex gap-3">
                    <span className="text-gray-500 w-16">Heat NO</span>
                    <span className="font-mono text-blue-300">{urgentOngoing.heatNo}</span>
                  </div>
                )}
              </div>
              <button
                onClick={() => urgentOngoing.urgentWorkId && handleUrgentComplete(urgentOngoing.id, urgentOngoing.urgentWorkId)}
                disabled={loading}
                className="w-full bg-orange-600 active:bg-orange-700 rounded-xl py-4 flex items-center justify-center gap-3 text-white font-bold text-lg transition-colors disabled:opacity-60"
              >
                <Square size={20} fill="currentColor" />
                작업 종료
              </button>
            </div>
          )}

          {/* 돌발 목록 */}
          {!urgentOngoing && (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-400 font-medium">돌발작업 선택</p>
                <button onClick={loadUrgentWorks} className="text-xs text-gray-600 flex items-center gap-1">
                  <RotateCcw size={11} /> 새로고침
                </button>
              </div>
              {urgentWorks.length === 0 ? (
                <div className="rounded-2xl border-2 border-dashed border-gray-800 p-8 text-center text-gray-600 text-sm">
                  등록된 돌발작업이 없습니다
                </div>
              ) : (
                <div className="space-y-2">
                  {urgentWorks.map(w => (
                    <button
                      key={w.id}
                      onClick={() => setSelUrgentId(prev => prev === w.id ? "" : w.id)}
                      className={`w-full text-left px-4 py-4 rounded-2xl border-2 transition-all ${
                        selUrgentId === w.id
                          ? URGENCY_COLOR_DARK[w.urgency] ?? "border-orange-500 bg-orange-950"
                          : "border-gray-700 bg-gray-900"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-1 min-w-0">
                          <p className="font-semibold text-white text-sm leading-tight">{w.title}</p>
                          <p className="text-xs text-gray-500 font-mono">{w.urgentNo}</p>
                          {w.materialMemo && <p className="text-xs text-gray-400">재질: {w.materialMemo}</p>}
                          {w.destination && <p className="text-xs text-gray-400">→ {w.destination}</p>}
                          {w.dueDate && <p className="text-xs text-yellow-600">납기: {w.dueDate.slice(0,10)}</p>}
                        </div>
                        <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold flex-shrink-0 ${URGENCY_BADGE[w.urgency] ?? "bg-gray-700 text-gray-300"}`}>
                          {URGENCY_LABEL[w.urgency]}
                        </span>
                      </div>
                      {w.remnant && (
                        <p className={`mt-2 text-xs flex items-center gap-1 ${w.remnant.needsConsult ? "text-purple-400" : "text-gray-500"}`}>
                          {w.remnant.needsConsult && <AlertTriangle size={11} />}
                          잔재: {w.remnant.remnantNo} ({w.remnant.material} {w.remnant.thickness}t)
                        </p>
                      )}
                    </button>
                  ))}
                </div>
              )}

              {/* 작업 입력 */}
              {selUrgentId && (
                <div className="rounded-2xl border-2 border-orange-600 bg-gray-900 overflow-hidden">
                  <div className="px-4 py-3 bg-orange-950 border-b border-orange-800 flex items-center gap-2">
                    <Zap size={14} className="text-orange-400" />
                    <span className="text-sm font-semibold text-orange-300">작업 정보 입력</span>
                  </div>
                  <div className="px-4 pb-4 pt-3 space-y-3">
                    {/* 작업자 */}
                    <div>
                      <label className="text-xs text-gray-400 font-medium mb-1.5 block">작업자 <span className="text-red-400">*</span></label>
                      <select
                        value={uOperatorId}
                        onChange={e => setUOperatorId(e.target.value)}
                        className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-3 text-sm text-white"
                      >
                        <option value="">-- 선택 --</option>
                        {workers.map(w => <option key={w.id} value={w.id}>{w.name}{w.nationality ? ` (${w.nationality})` : ""}</option>)}
                      </select>
                    </div>
                    {/* Heat NO */}
                    <div>
                      <label className="text-xs text-gray-400 font-medium mb-1.5 block">Heat NO <span className="text-gray-600">(선택)</span></label>
                      <input
                        type="text"
                        placeholder="Heat NO"
                        value={uHeatNo}
                        onChange={e => setUHeatNo(e.target.value)}
                        className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-3 text-sm text-white placeholder-gray-500 font-mono"
                      />
                    </div>
                    {/* 특이사항 */}
                    <div>
                      <label className="text-xs text-gray-400 font-medium mb-1.5 block">특이사항</label>
                      <textarea
                        rows={2}
                        value={uMemo}
                        onChange={e => setUMemo(e.target.value)}
                        className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-3 text-sm text-white placeholder-gray-500 resize-none"
                      />
                    </div>
                    {error && (
                      <p className="text-sm text-red-400 bg-red-950 border border-red-800 rounded-xl px-3 py-2.5">{error}</p>
                    )}
                    <button
                      onClick={handleUrgentStart}
                      disabled={loading || !selUrgentId || !uOperatorId}
                      className="w-full bg-orange-600 active:bg-orange-700 disabled:opacity-50 rounded-xl py-4 flex items-center justify-center gap-3 text-white font-bold text-lg"
                    >
                      <Play size={20} fill="currentColor" />
                      {loading ? "등록 중..." : "작업 시작"}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* 돌발 완료 목록 */}
          {eqLogs.filter(l => l.status === "COMPLETED" && l.isUrgent).length > 0 && (
            <div className="rounded-2xl bg-gray-900 border border-gray-800 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-800">
                <h3 className="text-sm font-semibold text-gray-300">
                  오늘 돌발 완료 <span className="text-gray-500 font-normal">({eqLogs.filter(l => l.status === "COMPLETED" && l.isUrgent).length}건)</span>
                </h3>
              </div>
              <div className="divide-y divide-gray-800">
                {eqLogs.filter(l => l.status === "COMPLETED" && l.isUrgent).map(log => (
                  <div key={log.id} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1">
                        <p className="text-xs font-semibold text-orange-300 flex items-center gap-1"><Zap size={11} /> 돌발</p>
                        <p className="text-xs text-gray-500">
                          {log.operator} · {fmtTime(log.startAt)} ~ {log.endAt ? fmtTime(log.endAt) : "-"}
                          {log.endAt && <span className="text-green-500 ml-1">{fmtDuration(log.startAt, log.endAt)}</span>}
                        </p>
                      </div>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-orange-900 text-orange-400 flex-shrink-0">완료</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 잔여분 팝업 */}
      {remnantPopup && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-end justify-center">
          <div className="bg-gray-900 rounded-t-3xl w-full max-w-lg p-6 space-y-4 pb-8">
            <h3 className="text-base font-bold text-white text-center">남은 잔재가 있나요?</h3>
            <p className="text-xs text-gray-400 text-center">이번 작업에 사용한 자재가 남아있으면 등록해주세요</p>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <input type="text" placeholder="재질 (예: AH36)" value={remForm.material}
                  onChange={e => setRemForm(f => ({ ...f, material: e.target.value }))}
                  className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-3 text-sm text-white placeholder-gray-500" />
                <input type="number" placeholder="두께 (mm)" value={remForm.thickness}
                  onChange={e => setRemForm(f => ({ ...f, thickness: e.target.value }))}
                  className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-3 text-sm text-white placeholder-gray-500" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input type="number" placeholder="폭 mm (선택)" value={remForm.width}
                  onChange={e => setRemForm(f => ({ ...f, width: e.target.value }))}
                  className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-3 text-sm text-white placeholder-gray-500" />
                <input type="number" placeholder="길이 mm (선택)" value={remForm.length}
                  onChange={e => setRemForm(f => ({ ...f, length: e.target.value }))}
                  className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-3 text-sm text-white placeholder-gray-500" />
              </div>
              <input type="number" placeholder="중량 kg *" value={remForm.weight}
                onChange={e => setRemForm(f => ({ ...f, weight: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-3 text-sm text-white placeholder-gray-500" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={handleRemnantNo}
                className="py-4 rounded-xl bg-gray-700 text-white font-semibold text-sm active:bg-gray-600"
              >없음</button>
              <button
                onClick={handleRemnantYes}
                disabled={loading}
                className="py-4 rounded-xl bg-blue-600 text-white font-bold text-sm active:bg-blue-700 disabled:opacity-50"
              >{loading ? "등록 중..." : "있음 — 등록"}</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ 정규작업 탭 ══ */}
      {mainTab === "normal" && (
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
                      onClick={() => handleDrawingSelect(d.id)}
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

              {/* Heat NO — SteelPlan 검색 */}
              <div>
                <label className="text-xs text-gray-400 font-medium mb-1.5 block">
                  판번호(Heat NO) <span className="text-gray-600">(선택)</span>
                </label>
                {heatLoading ? (
                  <p className="text-xs text-gray-500 py-2">판번호 목록 로딩 중...</p>
                ) : heatOptions.length > 0 ? (
                  <div className="space-y-1.5">
                    <input
                      type="text"
                      placeholder="판번호 검색..."
                      value={heatNoQuery}
                      onChange={e => setHeatNoQuery(e.target.value)}
                      className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-500 font-mono"
                    />
                    <div className="max-h-36 overflow-y-auto space-y-1">
                      {heatOptions
                        .filter(h => !heatNoQuery || h.heatNo!.toLowerCase().includes(heatNoQuery.toLowerCase()))
                        .map(h => (
                          <button
                            key={h.id}
                            onClick={() => setHeatNo(h.heatNo!)}
                            className={`w-full text-left px-3 py-2 rounded-lg text-sm font-mono transition-colors ${
                              heatNo === h.heatNo
                                ? "bg-blue-700 text-white"
                                : "bg-gray-800 text-gray-300 hover:bg-gray-700"
                            }`}
                          >
                            {h.heatNo}
                            <span className={`ml-2 text-xs ${h.status === "RECEIVED" ? "text-green-400" : "text-yellow-400"}`}>
                              {h.status === "RECEIVED" ? "입고" : "대기"}
                            </span>
                          </button>
                        ))}
                    </div>
                    {heatNo && (
                      <p className="text-xs text-blue-400">선택됨: <span className="font-mono font-bold">{heatNo}</span>
                        <button onClick={() => { setHeatNo(""); setHeatNoQuery(""); }} className="ml-2 text-gray-500 hover:text-gray-300">✕ 취소</button>
                      </p>
                    )}
                  </div>
                ) : (
                  <input
                    type="text"
                    placeholder="판번호 직접 입력"
                    value={heatNo}
                    onChange={e => setHeatNo(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-3 text-sm text-white placeholder-gray-500 font-mono"
                  />
                )}
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
      )}
    </div>
  );
}

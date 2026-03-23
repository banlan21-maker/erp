"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from "@/components/ui/select";
import {
  Play, Square, Trash2, Settings, Loader2, Search,
  RotateCcw, ChevronRight, User, Layers, FileText,
} from "lucide-react";
import Link from "next/link";

// ─── 타입 ─────────────────────────────────────────────────────────────────────

interface Equipment  { id: string; name: string; type: string; status: string }
interface Project    { id: string; projectCode: string; projectName: string }
interface Worker     { id: string; name: string; nationality: string | null }
interface DrawingRow {
  id: string; drawingNo: string | null; heatNo: string | null;
  material: string; thickness: number; width: number; length: number; qty: number; block: string | null;
  status?: string;
}
interface CuttingLog {
  id: string; equipmentId: string;
  equipment: { id: string; name: string; type: string };
  project: { projectCode: string; projectName: string } | null;
  heatNo: string; material: string | null; thickness: number | null;
  width: number | null; length: number | null; qty: number | null;
  drawingNo: string | null; operator: string;
  status: "STARTED" | "COMPLETED";
  startAt: string; endAt: string | null; memo: string | null;
}

// ─── 헬퍼 ─────────────────────────────────────────────────────────────────────

const TYPE_LABEL: Record<string, string> = { PLASMA: "플라즈마", GAS: "가스" };

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
function formatDuration(start: string, end: string | null) {
  const ms = (end ? new Date(end) : new Date()).getTime() - new Date(start).getTime();
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return h > 0 ? `${h}시간 ${m}분` : m > 0 ? `${m}분 ${s}초` : `${s}초`;
}
function LiveDuration({ startAt }: { startAt: string }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  const ms = now.getTime() - new Date(startAt).getTime();
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000);
  return <span className="font-mono font-bold text-red-700">{h > 0 ? `${h}시간 ${m}분 ${s}초` : `${m}분 ${s}초`}</span>;
}

// ─── 상태 초기값 ──────────────────────────────────────────────────────────────

const emptyStep1 = { vesselCode: "", projectId: "", operatorId: "" };
const emptyStep2 = { drawingListId: "", heatNo: "", memo: "" };
type DrawingInfo  = { material: string; thickness: string; width: string; length: string; qty: string; drawingNo: string };
const emptyDrawingInfo: DrawingInfo = { material: "", thickness: "", width: "", length: "", qty: "", drawingNo: "" };

// ─── 메인 컴포넌트 ────────────────────────────────────────────────────────────

export default function WorklogMain({
  equipment, projects, workers, todayLogs: initialLogs,
}: {
  equipment: Equipment[];
  projects:  Project[];
  workers:   Worker[];
  todayLogs: CuttingLog[];
}) {
  const router = useRouter();

  const [selectedEqId, setSelectedEqId] = useState(equipment[0]?.id ?? "");
  const [logs, setLogs]     = useState<CuttingLog[]>(initialLogs);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  // 1단계 (리셋 전 유지)
  const [step1, setStep1] = useState(emptyStep1);
  const step1Done = !!(step1.projectId && step1.operatorId);

  // 2단계 (절단 시작마다 리셋)
  const [step2, setStep2]           = useState(emptyStep2);
  const [drawingInfo, setDrawingInfo] = useState<DrawingInfo>(emptyDrawingInfo);
  const [drawings, setDrawings]       = useState<DrawingRow[]>([]);
  const [drawingsLoading, setDrawingsLoading] = useState(false);
  const [drawingSearch, setDrawingSearch]     = useState("");

  const selectedEq   = equipment.find((e) => e.id === selectedEqId);
  const eqLogs       = logs.filter((l) => l.equipmentId === selectedEqId);
  const ongoingLog   = eqLogs.find((l) => l.status === "STARTED");
  const doneLogs     = eqLogs.filter((l) => l.status === "COMPLETED");

  const vesselCodes    = [...new Set(projects.map((p) => p.projectCode))].sort();
  const blocksForVessel = projects.filter((p) => p.projectCode === step1.vesselCode);
  const selectedWorker  = workers.find((w) => w.id === step1.operatorId);
  const selectedBlock   = projects.find((p) => p.id === step1.projectId);

  const refreshLogs = useCallback(async () => {
    const res  = await fetch(`/api/cutting-logs?date=${new Date().toISOString().slice(0, 10)}`);
    const data = await res.json();
    if (data.success) setLogs(data.data);
  }, []);

  // 장비 변경 시 2단계만 초기화 (1단계는 유지)
  const switchEquipment = (eqId: string) => {
    setSelectedEqId(eqId);
    setStep2(emptyStep2);
    setDrawingInfo(emptyDrawingInfo);
    setDrawings([]);
    setDrawingSearch("");
    setError(null);
  };

  // 1단계 리셋
  const resetAll = () => {
    setStep1(emptyStep1);
    setStep2(emptyStep2);
    setDrawingInfo(emptyDrawingInfo);
    setDrawings([]);
    setDrawingSearch("");
    setError(null);
  };

  // 호선 선택
  const handleVesselChange = (code: string) => {
    setStep1((s) => ({ ...s, vesselCode: code, projectId: "" }));
    setStep2(emptyStep2);
    setDrawingInfo(emptyDrawingInfo);
    setDrawings([]);
    setDrawingSearch("");
  };

  // 블록 선택 → 도면 목록 fetch
  const handleBlockChange = async (projectId: string) => {
    setStep1((s) => ({ ...s, projectId }));
    setStep2(emptyStep2);
    setDrawingInfo(emptyDrawingInfo);
    setDrawings([]);
    setDrawingSearch("");
    if (!projectId) return;
    setDrawingsLoading(true);
    try {
      const res  = await fetch(`/api/drawings?projectId=${projectId}&status=WAITING`);
      const data = await res.json();
      if (data.success) setDrawings(data.data);
    } catch { /* ignore */ } finally { setDrawingsLoading(false); }
  };

  // 도면번호 선택 → 자동입력
  const handleDrawingChange = (drawingListId: string) => {
    const row = drawings.find((d) => d.id === drawingListId);
    setStep2((s) => ({ ...s, drawingListId }));
    setDrawingInfo(row ? {
      material:  row.material ?? "",
      thickness: row.thickness != null ? String(row.thickness) : "",
      width:     row.width     != null ? String(row.width)     : "",
      length:    row.length    != null ? String(row.length)    : "",
      qty:       row.qty       != null ? String(row.qty)       : "",
      drawingNo: row.drawingNo ?? "",
    } : emptyDrawingInfo);
  };

  // 절단 시작
  const handleStart = async () => {
    setError(null);
    if (!step1.projectId)  { setError("1단계: 호선·블록을 선택하세요."); return; }
    if (!step1.operatorId) { setError("1단계: 작업자를 선택하세요."); return; }
    if (!step2.drawingListId) { setError("도면번호를 선택하세요."); return; }

    setLoading(true);
    try {
      const res = await fetch("/api/cutting-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          equipmentId:   selectedEqId,
          projectId:     step1.projectId   || null,
          drawingListId: step2.drawingListId || null,
          heatNo:        step2.heatNo       || "",
          material:      drawingInfo.material  || null,
          thickness:     drawingInfo.thickness ? Number(drawingInfo.thickness) : null,
          width:         drawingInfo.width     ? Number(drawingInfo.width)     : null,
          length:        drawingInfo.length    ? Number(drawingInfo.length)    : null,
          qty:           drawingInfo.qty       ? Number(drawingInfo.qty)       : null,
          drawingNo:     drawingInfo.drawingNo || null,
          operator:      selectedWorker?.name  ?? "",
          memo:          step2.memo            || null,
        }),
      });
      const data = await res.json();
      if (!data.success) { setError(data.error); return; }

      // 2단계만 초기화, 1단계 유지
      setStep2(emptyStep2);
      setDrawingInfo(emptyDrawingInfo);
      setDrawingSearch("");
      await refreshLogs();
      router.refresh();
    } catch {
      setError("서버 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  // 절단 종료
  const handleComplete = async (logId: string) => {
    setLoading(true);
    try {
      const res  = await fetch(`/api/cutting-logs/${logId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "complete" }),
      });
      const data = await res.json();
      if (!data.success) { alert(data.error); return; }

      // 2단계 초기화, 1단계 유지
      setStep2(emptyStep2);
      setDrawingInfo(emptyDrawingInfo);
      setDrawingSearch("");
      await refreshLogs();
      router.refresh();
    } catch { alert("서버 오류"); } finally { setLoading(false); }
  };

  // 기록 삭제
  const handleDelete = async (logId: string) => {
    if (!confirm("이 작업 기록을 삭제할까요?")) return;
    try {
      await fetch(`/api/cutting-logs/${logId}`, { method: "DELETE" });
      await refreshLogs();
    } catch { alert("서버 오류"); }
  };

  // 필터된 도면 목록
  const filteredDrawings = drawings.filter((d) => {
    if (!drawingSearch.trim()) return true;
    const q = drawingSearch.toLowerCase();
    return d.drawingNo?.toLowerCase().includes(q) || d.heatNo?.toLowerCase().includes(q);
  });

  // ── 렌더 ──────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-5">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">작업일보</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {new Date().toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "long" })}
          </p>
        </div>
        <Link href="/equipment" className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600">
          <Settings size={13} /> 장비 설정
        </Link>
      </div>

      {equipment.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border text-gray-400">
          <p>등록된 장비가 없습니다.</p>
          <Link href="/equipment" className="text-sm text-blue-500 hover:underline mt-2 inline-block">장비 등록하기 →</Link>
        </div>
      ) : (
        <div className="flex gap-5 items-start">

          {/* ── 좌측: 장비 탭 ── */}
          <div className="w-44 flex-shrink-0 space-y-1">
            {equipment.map((eq) => {
              const eqOngoing = logs.find((l) => l.equipmentId === eq.id && l.status === "STARTED");
              const eqDone    = logs.filter((l) => l.equipmentId === eq.id && l.status === "COMPLETED").length;
              return (
                <button
                  key={eq.id}
                  onClick={() => switchEquipment(eq.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl border transition-all ${
                    selectedEqId === eq.id
                      ? "bg-gray-900 text-white border-gray-900 shadow"
                      : "bg-white text-gray-700 border-gray-200 hover:border-gray-400"
                  }`}
                >
                  <p className="text-sm font-semibold truncate">{eq.name}</p>
                  <p className="text-xs mt-0.5 opacity-60">{TYPE_LABEL[eq.type]}</p>
                  <div className="flex gap-1.5 mt-1.5 flex-wrap">
                    {eqOngoing && (
                      <span className="text-xs px-1.5 py-0.5 rounded-full bg-red-500 text-white font-bold animate-pulse">진행중</span>
                    )}
                    {eqDone > 0 && (
                      <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${selectedEqId === eq.id ? "bg-gray-700 text-gray-300" : "bg-gray-100 text-gray-500"}`}>
                        완료 {eqDone}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* ── 우측: 작업 패널 ── */}
          <div className="flex-1 space-y-3 min-w-0">

            {/* 장비명 */}
            <h3 className="text-base font-bold text-gray-800">
              {selectedEq?.name}
              <span className="text-xs font-normal text-gray-400 ml-2">{TYPE_LABEL[selectedEq?.type ?? ""]}</span>
            </h3>

            {/* ══ 1단계: 작업 세션 설정 ══ */}
            <div className={`rounded-xl border-2 ${step1Done ? "border-blue-400 bg-blue-50" : "border-gray-200 bg-white"}`}>
              {/* 헤더 */}
              <div className="flex items-center justify-between px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${step1Done ? "bg-blue-600 text-white" : "bg-gray-300 text-white"}`}>1</span>
                  <span className="text-sm font-semibold text-gray-700">작업 세션 설정</span>
                  {step1Done && (
                    <span className="text-xs text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
                      {selectedBlock ? `[${selectedBlock.projectCode}] ${selectedBlock.projectName}` : ""} · {selectedWorker?.name}
                    </span>
                  )}
                </div>
                {step1Done && (
                  <button
                    onClick={resetAll}
                    className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-500 transition-colors"
                    title="1단계 초기화"
                  >
                    <RotateCcw size={12} /> 리셋
                  </button>
                )}
              </div>

              {/* 폼 (세션 미설정 시 또는 항상 열려있게) */}
              {!step1Done && (
                <div className="border-t px-4 pb-4 pt-3 space-y-3">
                  {/* 호선 */}
                  <div className="space-y-1">
                    <Label className="text-xs text-gray-600 flex items-center gap-1"><Layers size={11} /> 호선 선택</Label>
                    <Select value={step1.vesselCode} onValueChange={(v) => handleVesselChange((v ?? "") === "__none__" ? "" : (v ?? ""))}>
                      <SelectTrigger className="h-8 text-xs">
                        <span className={step1.vesselCode ? "text-gray-900 font-medium" : "text-gray-400"}>
                          {step1.vesselCode ? `[${step1.vesselCode}]` : "호선 선택"}
                        </span>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">선택 안함</SelectItem>
                        {vesselCodes.map((code) => (
                          <SelectItem key={code} value={code} className="text-xs">[{code}]</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* 블록 */}
                  {step1.vesselCode && (
                    <div className="space-y-1">
                      <Label className="text-xs text-gray-600">블록 선택</Label>
                      <Select value={step1.projectId} onValueChange={(v) => handleBlockChange((v ?? "") === "__none__" ? "" : (v ?? ""))}>
                        <SelectTrigger className="h-8 text-xs">
                          <span className={step1.projectId ? "text-gray-900 font-medium" : "text-gray-400"}>
                            {step1.projectId ? (blocksForVessel.find((p) => p.id === step1.projectId)?.projectName ?? "블록 선택") : "블록 선택"}
                          </span>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">선택 안함</SelectItem>
                          {blocksForVessel.map((p) => (
                            <SelectItem key={p.id} value={p.id} className="text-xs">{p.projectName}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* 작업자 */}
                  <div className="space-y-1">
                    <Label className="text-xs text-gray-600 flex items-center gap-1"><User size={11} /> 작업자 선택</Label>
                    {workers.length === 0 ? (
                      <p className="text-xs text-gray-400">
                        <Link href="/workers" className="text-blue-500 hover:underline">인원관리</Link>에서 먼저 등록하세요.
                      </p>
                    ) : (
                      <Select value={step1.operatorId} onValueChange={(v) => setStep1((s) => ({ ...s, operatorId: (v ?? "") === "__none__" ? "" : (v ?? "") }))}>
                        <SelectTrigger className="h-8 text-xs">
                          <span className={step1.operatorId ? "text-gray-900 font-medium" : "text-gray-400"}>
                            {step1.operatorId
                              ? (workers.find((w) => w.id === step1.operatorId)?.name ?? "작업자 선택")
                              : "작업자 선택"}
                          </span>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">선택 안함</SelectItem>
                          {workers.map((w) => (
                            <SelectItem key={w.id} value={w.id} className="text-xs">
                              {w.name}{w.nationality ? ` (${w.nationality})` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* ══ 진행중 작업 ══ */}
            {ongoingLog && (
              <div className="bg-red-50 border-2 border-red-300 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-red-700 flex items-center gap-2">
                    <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse inline-block" />
                    절단 진행중
                  </span>
                  <LiveDuration startAt={ongoingLog.startAt} />
                </div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                  <div className="flex gap-2"><span className="text-gray-500 w-16 flex-shrink-0">작업자</span><span className="font-semibold">{ongoingLog.operator}</span></div>
                  <div className="flex gap-2"><span className="text-gray-500 w-16 flex-shrink-0">시작</span><span className="font-semibold">{formatTime(ongoingLog.startAt)}</span></div>
                  {ongoingLog.drawingNo && <div className="flex gap-2"><span className="text-gray-500 w-16 flex-shrink-0">도면번호</span><span className="font-mono">{ongoingLog.drawingNo}</span></div>}
                  {ongoingLog.heatNo && <div className="flex gap-2"><span className="text-gray-500 w-16 flex-shrink-0">Heat NO</span><span className="font-mono font-bold">{ongoingLog.heatNo}</span></div>}
                  {ongoingLog.project && <div className="flex gap-2"><span className="text-gray-500 w-16 flex-shrink-0">호선/블록</span><span>[{ongoingLog.project.projectCode}] {ongoingLog.project.projectName}</span></div>}
                  {ongoingLog.material && (
                    <div className="flex gap-2">
                      <span className="text-gray-500 w-16 flex-shrink-0">규격</span>
                      <span>{ongoingLog.material}{ongoingLog.thickness ? ` ${ongoingLog.thickness}t` : ""}{ongoingLog.width ? ` × ${ongoingLog.width}` : ""}{ongoingLog.length ? ` × ${ongoingLog.length}` : ""}{ongoingLog.qty ? ` (${ongoingLog.qty}매)` : ""}</span>
                    </div>
                  )}
                  {ongoingLog.memo && <div className="flex gap-2 col-span-2"><span className="text-gray-500 w-16 flex-shrink-0">특이사항</span><span className="text-gray-600">{ongoingLog.memo}</span></div>}
                </div>
                <Button onClick={() => handleComplete(ongoingLog.id)} disabled={loading}
                  className="w-full bg-red-600 hover:bg-red-700 flex items-center gap-2">
                  <Square size={14} fill="currentColor" /> 절단 종료
                </Button>
              </div>
            )}

            {/* ══ 2단계: 절단 등록 ══ */}
            {step1Done && !ongoingLog && (
              <div className="rounded-xl border-2 border-green-300 bg-white">
                <div className="flex items-center gap-2 px-4 py-2.5 border-b bg-green-50 rounded-t-xl">
                  <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold bg-green-600 text-white">2</span>
                  <span className="text-sm font-semibold text-gray-700 flex items-center gap-1">
                    <FileText size={13} /> 절단 등록
                  </span>
                  <ChevronRight size={13} className="text-gray-400 mx-1" />
                  <span className="text-xs text-gray-500">
                    {selectedBlock ? `[${selectedBlock.projectCode}] ${selectedBlock.projectName}` : ""} · {selectedWorker?.name}
                  </span>
                </div>

                <div className="px-4 pb-4 pt-3 space-y-3">
                  {/* 도면번호 검색 + 선택 */}
                  <div className="space-y-1.5">
                    <Label className="text-xs text-gray-600">
                      도면번호 선택 <span className="text-red-500">*</span>
                      {drawingsLoading && <Loader2 size={11} className="inline ml-1 animate-spin" />}
                    </Label>
                    {drawings.length > 0 && (
                      <div className="relative">
                        <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
                        <Input
                          className="h-7 text-xs pl-6"
                          placeholder="도면번호 / Heat NO 검색"
                          value={drawingSearch}
                          onChange={(e) => setDrawingSearch(e.target.value)}
                        />
                      </div>
                    )}
                    <Select
                      value={step2.drawingListId}
                      onValueChange={(v) => handleDrawingChange((v ?? "") === "__none__" ? "" : (v ?? ""))}
                      disabled={drawingsLoading || !step1.projectId}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <span className={step2.drawingListId ? "font-mono text-gray-900" : "text-gray-400"}>
                          {step2.drawingListId
                            ? (() => { const d = drawings.find((x) => x.id === step2.drawingListId); return d ? `${d.drawingNo ?? "(번호없음)"}` : "도면번호 선택"; })()
                            : !step1.projectId ? "먼저 블록을 선택하세요"
                            : drawings.length === 0 && !drawingsLoading ? "강재리스트 없음"
                            : "도면번호 선택"}
                        </span>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">선택 안함</SelectItem>
                        {filteredDrawings.map((d) => (
                          <SelectItem key={d.id} value={d.id} className="text-xs font-mono">
                            {d.drawingNo ?? "(번호없음)"}{d.heatNo ? ` · ${d.heatNo}` : ""}{d.block ? ` [${d.block}]` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* 자동입력된 규격 정보 */}
                  {step2.drawingListId && (drawingInfo.material || drawingInfo.thickness) && (
                    <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700">
                      <p className="font-semibold text-slate-500 mb-1 text-[11px]">강재리스트 자동입력</p>
                      <div className="flex flex-wrap gap-x-4 gap-y-0.5">
                        {drawingInfo.material   && <span>재질 <strong>{drawingInfo.material}</strong></span>}
                        {drawingInfo.thickness  && <span>두께 <strong>{drawingInfo.thickness}t</strong></span>}
                        {drawingInfo.width      && <span>폭 <strong>{drawingInfo.width}</strong></span>}
                        {drawingInfo.length     && <span>길이 <strong>{drawingInfo.length}</strong></span>}
                        {drawingInfo.qty        && <span>수량 <strong>{drawingInfo.qty}매</strong></span>}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    {/* Heat NO */}
                    <div className="space-y-1">
                      <Label className="text-xs text-gray-600">Heat NO <span className="text-gray-400 text-[10px]">(선택)</span></Label>
                      <Input
                        className="h-8 text-sm font-mono"
                        placeholder="Heat NO"
                        value={step2.heatNo}
                        onChange={(e) => setStep2((s) => ({ ...s, heatNo: e.target.value }))}
                      />
                    </div>
                    {/* 특이사항 */}
                    <div className="space-y-1">
                      <Label className="text-xs text-gray-600">특이사항 <span className="text-gray-400 text-[10px]">(선택)</span></Label>
                      <Input
                        className="h-8 text-sm"
                        placeholder="특이사항"
                        value={step2.memo}
                        onChange={(e) => setStep2((s) => ({ ...s, memo: e.target.value }))}
                      />
                    </div>
                  </div>

                  {error && (
                    <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1.5">{error}</p>
                  )}

                  <Button onClick={handleStart} disabled={loading}
                    className="w-full bg-green-600 hover:bg-green-700 flex items-center gap-2 text-sm">
                    <Play size={14} fill="currentColor" />
                    {loading ? "등록 중..." : "절단 시작"}
                  </Button>
                </div>
              </div>
            )}

            {/* 1단계 미완료 안내 */}
            {!step1Done && !ongoingLog && (
              <div className="rounded-xl border-2 border-dashed border-gray-200 p-6 text-center text-sm text-gray-400">
                1단계에서 호선·블록·작업자를 선택하면 절단 등록이 활성화됩니다.
              </div>
            )}

            {/* ══ 오늘 완료 목록 ══ */}
            <div className="bg-white border rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b bg-gray-50">
                <h4 className="text-sm font-semibold text-gray-700">
                  오늘 완료 작업
                  <span className="text-gray-400 font-normal ml-1">({doneLogs.length}건)</span>
                </h4>
              </div>
              {doneLogs.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">오늘 완료된 작업이 없습니다.</p>
              ) : (
                <div className="divide-y">
                  {doneLogs.map((log) => (
                    <div key={log.id} className="px-4 py-3 hover:bg-gray-50">
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-0.5 min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            {log.drawingNo && (
                              <span className="font-mono text-xs font-bold text-gray-800 bg-gray-100 px-1.5 py-0.5 rounded">
                                {log.drawingNo}
                              </span>
                            )}
                            {log.heatNo && (
                              <span className="font-mono text-xs text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">
                                {log.heatNo}
                              </span>
                            )}
                            {log.project && (
                              <span className="text-xs text-gray-500">[{log.project.projectCode}] {log.project.projectName}</span>
                            )}
                            {log.material && (
                              <span className="text-xs text-gray-500">
                                {log.material}{log.thickness ? ` ${log.thickness}t` : ""}
                                {log.width ? ` × ${log.width}` : ""}{log.length ? ` × ${log.length}` : ""}
                                {log.qty ? ` (${log.qty}매)` : ""}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-xs text-gray-500">
                            <span>작업자: <span className="font-medium text-gray-700">{log.operator}</span></span>
                            <span>{formatTime(log.startAt)} → {log.endAt ? formatTime(log.endAt) : "-"}</span>
                            <span className="text-green-600 font-medium">{log.endAt ? formatDuration(log.startAt, log.endAt) : ""}</span>
                          </div>
                          {log.memo && <p className="text-xs text-gray-400">{log.memo}</p>}
                        </div>
                        <button onClick={() => handleDelete(log.id)}
                          className="p-1 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded flex-shrink-0">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

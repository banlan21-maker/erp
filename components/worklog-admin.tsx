"use client";

import { useState, useEffect, useMemo } from "react";
import { ClipboardList, RefreshCw, Plus, Edit2, Trash2, AlertCircle, Search, X, Save, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// ─── 타입 ──────────────────────────────────────────────────────────────────

interface Equipment { id: string; name: string; type: string }
interface Project   { id: string; projectCode: string; projectName: string }
interface Worker    { id: string; name: string }

interface Drawing {
  id: string;
  block: string | null;
  drawingNo: string | null;
  heatNo: string | null;
  material: string;
  thickness: number;
  width: number;
  length: number;
  qty: number;
  status: string;
}

interface CuttingLog {
  id: string;
  drawingListId: string | null;
  equipmentId: string;
  equipment: { id: string; name: string; type: string };
  project: { projectCode: string; projectName: string } | null;
  heatNo: string;
  material: string | null;
  thickness: number | null;
  width: number | null;
  length: number | null;
  qty: number | null;
  drawingNo: string | null;
  operator: string;
  status: "STARTED" | "COMPLETED";
  startAt: string;
  endAt: string | null;
  memo: string | null;
}

// ─── 헬퍼 ──────────────────────────────────────────────────────────────────

const TYPE_LABEL: Record<string, string> = { PLASMA: "플라즈마", GAS: "가스" };
const STATUS_LABEL: Record<string, string> = {
  REGISTERED: "등록",
  WAITING: "대기",
  CUT: "절단완료",
};
const STATUS_COLOR: Record<string, string> = {
  REGISTERED: "bg-gray-100 text-gray-600",
  WAITING: "bg-yellow-100 text-yellow-700",
  CUT: "bg-green-100 text-green-700",
};

function fmtDt(iso: string) {
  const d = new Date(iso);
  return `${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}
function fmtDuration(start: string, end: string | null) {
  if (!end) return "-";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}시간 ${m}분` : `${m}분`;
}
function toLocalDatetimeValue(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ─── 로그 등록/수정 모달 ────────────────────────────────────────────────────

function LogModal({
  mode,
  drawing,
  log,
  equipment,
  workers,
  projectId,
  onClose,
  onSaved,
}: {
  mode: "add" | "edit";
  drawing: Drawing | null;
  log: CuttingLog | null;
  equipment: Equipment[];
  workers: Worker[];
  projectId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    equipmentId: log?.equipmentId ?? equipment[0]?.id ?? "",
    operator:    log?.operator ?? "",
    heatNo:      log?.heatNo ?? drawing?.heatNo ?? "",
    startAt:     toLocalDatetimeValue(log?.startAt ?? new Date().toISOString()),
    endAt:       toLocalDatetimeValue(log?.endAt ?? null),
    status:      log?.status ?? "COMPLETED",
    memo:        log?.memo ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.equipmentId || !form.operator.trim() || !form.startAt) {
      setError("장비, 작업자, 시작일시는 필수입니다.");
      return;
    }
    setSaving(true);
    try {
      if (mode === "add") {
        const res = await fetch("/api/cutting-logs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            equipmentId:   form.equipmentId,
            projectId,
            drawingListId: drawing?.id ?? null,
            heatNo:        form.heatNo || (drawing?.heatNo ?? ""),
            material:      drawing?.material ?? null,
            thickness:     drawing?.thickness ?? null,
            width:         drawing?.width ?? null,
            length:        drawing?.length ?? null,
            qty:           drawing?.qty ?? null,
            drawingNo:     drawing?.drawingNo ?? null,
            operator:      form.operator,
            memo:          form.memo || null,
          }),
        });
        const data = await res.json();
        if (!data.success) { setError(data.error); return; }

        // 추가 후 바로 완료 처리 (endAt 있는 경우)
        if (form.endAt && data.data?.id) {
          await fetch(`/api/cutting-logs/${data.data.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "complete",
              memo: form.memo || null,
            }),
          });
        }
      } else if (log) {
        const res = await fetch(`/api/cutting-logs/${log.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            equipmentId: form.equipmentId,
            operator:    form.operator,
            heatNo:      form.heatNo || null,
            startAt:     form.startAt,
            endAt:       form.endAt || null,
            status:      form.endAt ? "COMPLETED" : "STARTED",
            memo:        form.memo || null,
          }),
        });
        const data = await res.json();
        if (!data.success) { setError(data.error); return; }
      }
      onSaved();
    } catch {
      setError("서버 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
          <h3 className="font-bold text-lg text-gray-900 flex items-center gap-2">
            {mode === "add" ? <Plus size={18} className="text-blue-600" /> : <Edit2 size={18} className="text-blue-600" />}
            {mode === "add" ? "작업일보 추가 등록" : "작업일보 수정"}
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded-full transition-colors"><X size={18} /></button>
        </div>

        {drawing && (
          <div className="px-6 py-3 bg-blue-50 border-b border-blue-100 text-xs text-blue-800">
            <span className="font-semibold">강재:</span>{" "}
            {drawing.drawingNo && <span className="font-mono mr-2">{drawing.drawingNo}</span>}
            {drawing.block && <span className="mr-2">[{drawing.block}]</span>}
            <span>{drawing.material} {drawing.thickness}t × {drawing.width} × {drawing.length} ({drawing.qty}매)</span>
          </div>
        )}

        {error && (
          <div className="mx-6 mt-4 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm flex items-center gap-2">
            <AlertCircle size={14} /> {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* 장비 */}
          <div>
            <label className="block text-sm font-semibold text-gray-800 mb-1.5">장비 <span className="text-red-500">*</span></label>
            <select
              value={form.equipmentId}
              onChange={e => setForm(f => ({ ...f, equipmentId: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {equipment.map(eq => (
                <option key={eq.id} value={eq.id}>{eq.name} ({TYPE_LABEL[eq.type] ?? eq.type})</option>
              ))}
            </select>
          </div>

          {/* 작업자 */}
          <div>
            <label className="block text-sm font-semibold text-gray-800 mb-1.5">작업자 <span className="text-red-500">*</span></label>
            <div className="flex gap-2">
              <Input
                value={form.operator}
                onChange={e => setForm(f => ({ ...f, operator: e.target.value }))}
                placeholder="작업자명 직접 입력"
                className="flex-1"
              />
              {workers.length > 0 && (
                <select
                  onChange={e => { if (e.target.value) setForm(f => ({ ...f, operator: e.target.value })); }}
                  className="px-2 py-1.5 border border-gray-200 rounded-md text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  defaultValue=""
                >
                  <option value="">목록 선택</option>
                  {workers.map(w => <option key={w.id} value={w.name}>{w.name}</option>)}
                </select>
              )}
            </div>
          </div>

          {/* Heat NO */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Heat NO</label>
            <Input
              value={form.heatNo}
              onChange={e => setForm(f => ({ ...f, heatNo: e.target.value }))}
              placeholder="Heat NO (선택)"
              className="font-mono"
            />
          </div>

          {/* 시작/종료 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-800 mb-1.5">시작 일시 <span className="text-red-500">*</span></label>
              <Input
                type="datetime-local"
                value={form.startAt}
                onChange={e => setForm(f => ({ ...f, startAt: e.target.value }))}
                className="text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">종료 일시</label>
              <Input
                type="datetime-local"
                value={form.endAt}
                onChange={e => setForm(f => ({ ...f, endAt: e.target.value }))}
                className="text-sm"
              />
            </div>
          </div>

          {/* 비고 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">특이사항</label>
            <textarea
              value={form.memo}
              onChange={e => setForm(f => ({ ...f, memo: e.target.value }))}
              rows={2}
              className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="특이사항 입력 (선택)"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
            <Button type="button" variant="outline" onClick={onClose}>취소</Button>
            <Button type="submit" disabled={saving} className="bg-blue-600 hover:bg-blue-700 font-bold">
              <Save size={14} className="mr-1.5" />
              {saving ? "저장 중..." : mode === "add" ? "등록" : "수정 저장"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── 메인 컴포넌트 ─────────────────────────────────────────────────────────

export default function WorklogAdmin({
  equipment,
  projects,
  workers,
}: {
  equipment: Equipment[];
  projects: Project[];
  workers: Worker[];
}) {
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [dateFilter, setDateFilter] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");

  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [logs, setLogs] = useState<CuttingLog[]>([]);
  const [loading, setLoading] = useState(false);

  // 모달 상태
  const [modal, setModal] = useState<{
    open: boolean;
    mode: "add" | "edit";
    drawing: Drawing | null;
    log: CuttingLog | null;
  }>({ open: false, mode: "add", drawing: null, log: null });

  // 접기/펼치기 (미등록 항목)
  const [showUnregistered, setShowUnregistered] = useState(true);

  const vesselCodes = [...new Set(projects.map(p => p.projectCode))].sort();
  const [selectedVessel, setSelectedVessel] = useState("");
  const blocksForVessel = projects.filter(p => p.projectCode === selectedVessel);
  const selectedProject = projects.find(p => p.id === selectedProjectId);

  const fetchData = async (projectId: string) => {
    if (!projectId) return;
    setLoading(true);
    try {
      const [drawingsRes, logsRes] = await Promise.all([
        fetch(`/api/drawings?projectId=${projectId}`),
        fetch(`/api/cutting-logs?projectId=${projectId}${dateFilter ? `&date=${dateFilter}` : ""}`),
      ]);
      const drawingsJson = await drawingsRes.json();
      const logsJson     = await logsRes.json();
      if (drawingsJson.success) setDrawings(drawingsJson.data);
      if (logsJson.success)     setLogs(logsJson.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedProjectId) fetchData(selectedProjectId);
    else { setDrawings([]); setLogs([]); }
  }, [selectedProjectId, dateFilter]);

  // 각 drawing에 연결된 로그 매핑
  const logByDrawingId = useMemo(() => {
    const map = new Map<string, CuttingLog>();
    logs.forEach(l => { if (l.drawingListId) map.set(l.drawingListId, l); });
    return map;
  }, [logs]);

  // 강재 리스트와 연결 안 된 orphan 로그 (drawingListId 없는 것)
  const orphanLogs = useMemo(() => logs.filter(l => !l.drawingListId), [logs]);

  const filteredDrawings = useMemo(() => {
    if (!searchTerm.trim()) return drawings;
    const q = searchTerm.toLowerCase();
    return drawings.filter(d =>
      d.drawingNo?.toLowerCase().includes(q) ||
      d.heatNo?.toLowerCase().includes(q) ||
      d.block?.toLowerCase().includes(q) ||
      d.material?.toLowerCase().includes(q)
    );
  }, [drawings, searchTerm]);

  const registeredDrawings   = filteredDrawings.filter(d => logByDrawingId.has(d.id));
  const unregisteredDrawings = filteredDrawings.filter(d => !logByDrawingId.has(d.id));

  const handleDelete = async (logId: string) => {
    if (!confirm("이 작업일보를 삭제할까요? (강재 상태가 복원됩니다)")) return;
    await fetch(`/api/cutting-logs/${logId}`, { method: "DELETE" });
    fetchData(selectedProjectId);
  };

  const openAdd = (drawing: Drawing) => {
    setModal({ open: true, mode: "add", drawing, log: null });
  };
  const openEdit = (drawing: Drawing | null, log: CuttingLog) => {
    setModal({ open: true, mode: "edit", drawing, log });
  };

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ClipboardList size={24} className="text-blue-600" /> 작업일보 관리
          </h2>
          <p className="text-sm text-gray-500 mt-1">강재 리스트 기준으로 작업 현황을 확인하고 누락 항목을 등록합니다.</p>
        </div>
      </div>

      {/* 프로젝트 + 날짜 선택 */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* 호선 */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">호선 선택</label>
            <select
              value={selectedVessel}
              onChange={e => { setSelectedVessel(e.target.value); setSelectedProjectId(""); }}
              className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">-- 호선 선택 --</option>
              {vesselCodes.map(code => <option key={code} value={code}>[{code}]</option>)}
            </select>
          </div>
          {/* 블록 */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">블록 선택</label>
            <select
              value={selectedProjectId}
              onChange={e => setSelectedProjectId(e.target.value)}
              disabled={!selectedVessel}
              className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            >
              <option value="">-- 블록 선택 --</option>
              {blocksForVessel.map(p => <option key={p.id} value={p.id}>{p.projectName}</option>)}
            </select>
          </div>
          {/* 날짜 (선택) */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">날짜 필터 <span className="font-normal text-gray-400">(비우면 전체)</span></label>
            <Input
              type="date"
              value={dateFilter}
              onChange={e => setDateFilter(e.target.value)}
              className="text-sm"
            />
          </div>
        </div>
      </div>

      {/* 선택 전 안내 */}
      {!selectedProjectId && (
        <div className="text-center py-20 bg-white rounded-xl border border-dashed border-gray-300 text-gray-400">
          <ClipboardList size={40} className="mx-auto mb-3 opacity-30" />
          <p>호선과 블록을 선택하면 강재 리스트가 표시됩니다.</p>
        </div>
      )}

      {/* 선택 후 데이터 영역 */}
      {selectedProjectId && (
        <>
          {loading ? (
            <div className="flex justify-center items-center py-20 text-gray-400 gap-3">
              <RefreshCw className="animate-spin text-blue-500" size={24} /> 데이터를 불러오는 중...
            </div>
          ) : (
            <div className="space-y-4">

              {/* 요약 + 검색 */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white border border-gray-200 rounded-xl px-5 py-3 shadow-sm">
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-gray-500">전체 <strong className="text-gray-900">{drawings.length}</strong>건</span>
                  <span className="text-green-600">완료 <strong>{drawings.filter(d => logByDrawingId.has(d.id)).length}</strong>건</span>
                  <span className="text-orange-500">미등록 <strong>{drawings.filter(d => !logByDrawingId.has(d.id)).length}</strong>건</span>
                  {orphanLogs.length > 0 && (
                    <span className="text-purple-500">별도등록 <strong>{orphanLogs.length}</strong>건</span>
                  )}
                </div>
                <div className="relative w-full sm:w-auto">
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <Input
                    placeholder="도면번호 / Heat NO / 블록 검색"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="pl-8 h-9 text-sm sm:w-64"
                  />
                </div>
                <button
                  onClick={() => fetchData(selectedProjectId)}
                  className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-blue-600 transition-colors"
                >
                  <RefreshCw size={13} /> 새로고침
                </button>
              </div>

              {/* ── 작업일보 등록된 항목 ── */}
              {registeredDrawings.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                  <div className="px-5 py-3 border-b border-gray-100 bg-green-50/50 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-green-500"></span>
                    <span className="text-sm font-semibold text-gray-700">작업 완료 ({registeredDrawings.length}건)</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left whitespace-nowrap">
                      <thead className="bg-gray-50 border-b border-gray-100 text-xs text-gray-500 uppercase">
                        <tr>
                          <th className="px-4 py-2.5">도면번호</th>
                          <th className="px-4 py-2.5">블록</th>
                          <th className="px-4 py-2.5">규격</th>
                          <th className="px-4 py-2.5">강재상태</th>
                          <th className="px-4 py-2.5">작업자</th>
                          <th className="px-4 py-2.5">작업시간</th>
                          <th className="px-4 py-2.5">장비</th>
                          <th className="px-4 py-2.5">비고</th>
                          <th className="px-4 py-2.5 text-center">액션</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {registeredDrawings.map(d => {
                          const log = logByDrawingId.get(d.id)!;
                          return (
                            <tr key={d.id} className="hover:bg-green-50/30 transition-colors">
                              <td className="px-4 py-3 font-mono text-xs font-bold text-gray-800">{d.drawingNo || "-"}</td>
                              <td className="px-4 py-3 text-gray-600 text-xs">{d.block || "-"}</td>
                              <td className="px-4 py-3 text-xs text-gray-600">
                                {d.material} {d.thickness}t × {d.width} × {d.length}
                                <span className="text-gray-400 ml-1">({d.qty}매)</span>
                              </td>
                              <td className="px-4 py-3">
                                <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${STATUS_COLOR[d.status] ?? "bg-gray-100 text-gray-600"}`}>
                                  {STATUS_LABEL[d.status] ?? d.status}
                                </span>
                              </td>
                              <td className="px-4 py-3 font-semibold text-gray-800 text-xs">{log.operator}</td>
                              <td className="px-4 py-3 text-xs text-gray-600">
                                <div>{fmtDt(log.startAt)}</div>
                                {log.endAt && (
                                  <div className="text-green-600 font-medium">→ {fmtDuration(log.startAt, log.endAt)}</div>
                                )}
                              </td>
                              <td className="px-4 py-3 text-xs text-gray-500">{log.equipment?.name ?? "-"}</td>
                              <td className="px-4 py-3 text-xs text-gray-400 max-w-[120px] truncate">{log.memo || "-"}</td>
                              <td className="px-4 py-3 text-center">
                                <div className="flex items-center justify-center gap-1">
                                  <button
                                    onClick={() => openEdit(d, log)}
                                    className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-md transition-colors"
                                    title="수정"
                                  >
                                    <Edit2 size={13} />
                                  </button>
                                  <button
                                    onClick={() => handleDelete(log.id)}
                                    className="p-1.5 text-red-400 hover:bg-red-50 rounded-md transition-colors"
                                    title="삭제"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ── 미등록 항목 ── */}
              {unregisteredDrawings.length > 0 && (
                <div className="bg-white rounded-xl border border-orange-200 shadow-sm overflow-hidden">
                  <button
                    onClick={() => setShowUnregistered(v => !v)}
                    className="w-full px-5 py-3 border-b border-orange-100 bg-orange-50/50 flex items-center justify-between hover:bg-orange-50 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-orange-400"></span>
                      <span className="text-sm font-semibold text-gray-700">작업일보 미등록 ({unregisteredDrawings.length}건)</span>
                      <span className="text-xs text-orange-500">— 아래 항목은 작업일보가 없습니다. 누락된 경우 추가하세요.</span>
                    </div>
                    {showUnregistered ? <ChevronUp size={15} className="text-gray-400" /> : <ChevronDown size={15} className="text-gray-400" />}
                  </button>
                  {showUnregistered && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left whitespace-nowrap">
                        <thead className="bg-gray-50 border-b border-gray-100 text-xs text-gray-500 uppercase">
                          <tr>
                            <th className="px-4 py-2.5">도면번호</th>
                            <th className="px-4 py-2.5">블록</th>
                            <th className="px-4 py-2.5">규격</th>
                            <th className="px-4 py-2.5">강재상태</th>
                            <th className="px-4 py-2.5 text-center">액션</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {unregisteredDrawings.map(d => (
                            <tr key={d.id} className="hover:bg-orange-50/30 transition-colors">
                              <td className="px-4 py-3 font-mono text-xs font-bold text-gray-700">{d.drawingNo || "-"}</td>
                              <td className="px-4 py-3 text-gray-600 text-xs">{d.block || "-"}</td>
                              <td className="px-4 py-3 text-xs text-gray-600">
                                {d.material} {d.thickness}t × {d.width} × {d.length}
                                <span className="text-gray-400 ml-1">({d.qty}매)</span>
                              </td>
                              <td className="px-4 py-3">
                                <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${STATUS_COLOR[d.status] ?? "bg-gray-100 text-gray-600"}`}>
                                  {STATUS_LABEL[d.status] ?? d.status}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-center">
                                <button
                                  onClick={() => openAdd(d)}
                                  className="flex items-center gap-1 text-xs px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-semibold transition-colors mx-auto"
                                >
                                  <Plus size={12} /> 추가
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* ── 강재 미연결 로그 (별도 등록된 것) ── */}
              {orphanLogs.length > 0 && (
                <div className="bg-white rounded-xl border border-purple-200 shadow-sm overflow-hidden">
                  <div className="px-5 py-3 border-b border-purple-100 bg-purple-50/50 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-purple-400"></span>
                    <span className="text-sm font-semibold text-gray-700">강재 미연결 작업일보 ({orphanLogs.length}건)</span>
                    <span className="text-xs text-purple-400">— 강재리스트와 연결되지 않은 작업 기록</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left whitespace-nowrap">
                      <thead className="bg-gray-50 border-b border-gray-100 text-xs text-gray-500 uppercase">
                        <tr>
                          <th className="px-4 py-2.5">도면번호</th>
                          <th className="px-4 py-2.5">Heat NO</th>
                          <th className="px-4 py-2.5">작업자</th>
                          <th className="px-4 py-2.5">시작일시</th>
                          <th className="px-4 py-2.5">소요시간</th>
                          <th className="px-4 py-2.5">장비</th>
                          <th className="px-4 py-2.5 text-center">액션</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {orphanLogs.map(log => (
                          <tr key={log.id} className="hover:bg-purple-50/30 transition-colors">
                            <td className="px-4 py-3 font-mono text-xs text-gray-700">{log.drawingNo || "-"}</td>
                            <td className="px-4 py-3 font-mono text-xs text-blue-700">{log.heatNo || "-"}</td>
                            <td className="px-4 py-3 font-semibold text-xs text-gray-800">{log.operator}</td>
                            <td className="px-4 py-3 text-xs text-gray-500">{fmtDt(log.startAt)}</td>
                            <td className="px-4 py-3 text-xs text-green-600">{fmtDuration(log.startAt, log.endAt)}</td>
                            <td className="px-4 py-3 text-xs text-gray-500">{log.equipment?.name ?? "-"}</td>
                            <td className="px-4 py-3 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <button onClick={() => openEdit(null, log)} className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-md transition-colors"><Edit2 size={13} /></button>
                                <button onClick={() => handleDelete(log.id)} className="p-1.5 text-red-400 hover:bg-red-50 rounded-md transition-colors"><Trash2 size={13} /></button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {drawings.length === 0 && (
                <div className="text-center py-16 text-gray-400 bg-white rounded-xl border border-dashed border-gray-200">
                  등록된 강재리스트가 없습니다.
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* 모달 */}
      {modal.open && (
        <LogModal
          mode={modal.mode}
          drawing={modal.drawing}
          log={modal.log}
          equipment={equipment}
          workers={workers}
          projectId={selectedProjectId}
          onClose={() => setModal(m => ({ ...m, open: false }))}
          onSaved={() => {
            setModal(m => ({ ...m, open: false }));
            fetchData(selectedProjectId);
          }}
        />
      )}
    </div>
  );
}

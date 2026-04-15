"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, RefreshCw, X, Save, ChevronLeft, ChevronRight, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { TransportVehicle } from "@/components/transport-main";

/* ── 타입 ── */
interface Worker { id: string; name: string; role: string | null; position: string | null }
interface DrivingLog {
  id: string;
  vehicleId: string;
  date: string;
  driver: string;
  departure: string | null;
  destination: string | null;
  purpose: string | null;
  startTime: string | null;
  endTime: string | null;
  startMileage: number | null;
  endMileage: number | null;
  fuelCost: number | null;
  tollCost: number | null;
  memo: string | null;
  createdAt: string;
  vehicle: { id: string; code: string; name: string; plateNo: string | null };
}

const LOG_INIT = {
  vehicleId: "", date: "", driver: "",
  departure: "", destination: "", purpose: "",
  startTime: "", endTime: "",
  startMileage: "", endMileage: "",
  fuelCost: "", tollCost: "", memo: "",
};

const won = (n: number | null) =>
  n != null ? n.toLocaleString() + "원" : "-";
const km = (n: number | null) =>
  n != null ? n.toLocaleString() + "km" : "-";
const distance = (s: number | null, e: number | null) =>
  s != null && e != null && e >= s ? (e - s).toLocaleString() + "km" : "-";

/* ══════════════════════════════════════════════════════════ */
export default function TransportDrivingLogTab({
  vehicles,
}: {
  vehicles: TransportVehicle[];
}) {
  const today = new Date();
  const [selVehicleId, setSelVehicleId] = useState<string>("");
  const [year,  setYear]  = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [logs,  setLogs]  = useState<DrivingLog[]>([]);
  const [loading, setLoading] = useState(false);

  /* 등록 모달 */
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]       = useState({ ...LOG_INIT });
  const [saving, setSaving]   = useState(false);
  const [formErr, setFormErr] = useState("");

  /* 수정 */
  const [editId,   setEditId]   = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ ...LOG_INIT });

  /* 인원 목록 (운전자 선택용) */
  const [workers, setWorkers] = useState<Worker[]>([]);

  const set  = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));
  const setE = (k: string, v: string) => setEditForm(f => ({ ...f, [k]: v }));

  /* 데이터 로드 */
  const load = useCallback(async () => {
    setLoading(true);
    const p = new URLSearchParams({ year: String(year), month: String(month) });
    if (selVehicleId) p.set("vehicleId", selVehicleId);
    const res = await fetch(`/api/transport-driving-log?${p}`);
    if (res.ok) {
      const data = await res.json();
      if (data.success) setLogs(data.data);
    }
    setLoading(false);
  }, [year, month, selVehicleId]);

  useEffect(() => { load(); }, [load]);

  /* 인원 목록 1회 로드 */
  useEffect(() => {
    fetch("/api/workers")
      .then(r => r.json())
      .then(d => { if (d.success) setWorkers(d.data); })
      .catch(() => {});
  }, []);

  /* 월 이동 */
  const prevMonth = () => {
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
  };

  /* 등록 */
  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormErr("");
    if (!form.vehicleId) { setFormErr("차량을 선택해주세요."); return; }
    if (!form.date)      { setFormErr("운행일을 입력해주세요."); return; }
    if (!form.driver.trim()) { setFormErr("운전자를 입력해주세요."); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/transport-driving-log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vehicleId:    form.vehicleId,
          date:         form.date,
          driver:       form.driver,
          departure:    form.departure    || null,
          destination:  form.destination  || null,
          purpose:      form.purpose      || null,
          startTime:    form.startTime    || null,
          endTime:      form.endTime      || null,
          startMileage: form.startMileage || null,
          endMileage:   form.endMileage   || null,
          fuelCost:     form.fuelCost     || null,
          tollCost:     form.tollCost     || null,
          memo:         form.memo         || null,
        }),
      });
      const data = await res.json();
      if (!data.success) { setFormErr(data.error); return; }
      setShowForm(false);
      setForm({ ...LOG_INIT });
      load();
    } catch { setFormErr("서버 오류"); }
    finally { setSaving(false); }
  };

  /* 수정 시작 */
  const startEdit = (log: DrivingLog) => {
    setEditId(log.id);
    setEditForm({
      vehicleId:    log.vehicleId,
      date:         log.date,
      driver:       log.driver,
      departure:    log.departure    ?? "",
      destination:  log.destination  ?? "",
      purpose:      log.purpose      ?? "",
      startTime:    log.startTime    ?? "",
      endTime:      log.endTime      ?? "",
      startMileage: log.startMileage != null ? String(log.startMileage) : "",
      endMileage:   log.endMileage   != null ? String(log.endMileage)   : "",
      fuelCost:     log.fuelCost     != null ? String(log.fuelCost)     : "",
      tollCost:     log.tollCost     != null ? String(log.tollCost)     : "",
      memo:         log.memo         ?? "",
    });
  };

  /* 수정 저장 */
  const saveEdit = async () => {
    if (!editId) return;
    const res = await fetch(`/api/transport-driving-log/${editId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date:         editForm.date         || undefined,
        driver:       editForm.driver       || undefined,
        departure:    editForm.departure,
        destination:  editForm.destination,
        purpose:      editForm.purpose,
        startTime:    editForm.startTime,
        endTime:      editForm.endTime,
        startMileage: editForm.startMileage,
        endMileage:   editForm.endMileage,
        fuelCost:     editForm.fuelCost,
        tollCost:     editForm.tollCost,
        memo:         editForm.memo,
      }),
    });
    if (res.ok) { setEditId(null); load(); }
    else alert("수정 실패");
  };

  /* 삭제 */
  const handleDelete = async (id: string) => {
    if (!confirm("이 운행일지를 삭제하시겠습니까?")) return;
    const res = await fetch(`/api/transport-driving-log/${id}`, { method: "DELETE" });
    if (res.ok) setLogs(l => l.filter(x => x.id !== id));
    else alert("삭제 실패");
  };

  /* 월간 합계 */
  const summary = logs.reduce(
    (acc, l) => ({
      count:    acc.count + 1,
      distance: acc.distance + (l.startMileage != null && l.endMileage != null && l.endMileage >= l.startMileage ? l.endMileage - l.startMileage : 0),
      fuel:     acc.fuel    + (l.fuelCost  ?? 0),
      toll:     acc.toll    + (l.tollCost  ?? 0),
    }),
    { count: 0, distance: 0, fuel: 0, toll: 0 }
  );

  /* 날짜별 그룹핑 */
  const grouped = logs.reduce((acc, l) => {
    if (!acc[l.date]) acc[l.date] = [];
    acc[l.date].push(l);
    return acc;
  }, {} as Record<string, DrivingLog[]>);
  const dates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  const inUsedVehicles = vehicles.filter(v => v.usage !== "DISPOSED" && v.vehicleType === "VEHICLE");

  return (
    <div className="space-y-4">
      {/* 상단 컨트롤 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          {/* 차량 선택 */}
          <select
            value={selVehicleId}
            onChange={e => setSelVehicleId(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[180px]"
          >
            <option value="">전체 차량</option>
            {inUsedVehicles.map(v => (
              <option key={v.id} value={v.id}>
                [{v.code}] {v.name}{v.plateNo ? ` (${v.plateNo})` : ""}
              </option>
            ))}
          </select>

          {/* 연/월 선택 */}
          <div className="flex items-center gap-1">
            <button onClick={prevMonth} className="p-1.5 hover:bg-gray-100 rounded-md transition-colors">
              <ChevronLeft size={16} />
            </button>
            <div className="flex items-center gap-1">
              <select value={year} onChange={e => setYear(Number(e.target.value))}
                className="px-2 py-1.5 border border-gray-200 rounded-md text-sm bg-white focus:outline-none">
                {Array.from({ length: 5 }, (_, i) => today.getFullYear() - 2 + i).map(y => (
                  <option key={y} value={y}>{y}년</option>
                ))}
              </select>
              <select value={month} onChange={e => setMonth(Number(e.target.value))}
                className="px-2 py-1.5 border border-gray-200 rounded-md text-sm bg-white focus:outline-none">
                {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                  <option key={m} value={m}>{m}월</option>
                ))}
              </select>
            </div>
            <button onClick={nextMonth} className="p-1.5 hover:bg-gray-100 rounded-md transition-colors">
              <ChevronRight size={16} />
            </button>
          </div>

          <button onClick={load} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-500 transition-colors" title="새로고침">
            <RefreshCw size={14} />
          </button>
        </div>

        <Button onClick={() => { setShowForm(true); setForm({ ...LOG_INIT, date: `${year}-${String(month).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`, vehicleId: selVehicleId }); setFormErr(""); }}
          className="flex items-center gap-2">
          <Plus size={15} /> 운행일지 등록
        </Button>
      </div>

      {/* 월간 요약 카드 */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "총 운행건수", value: `${summary.count}건` },
          { label: "총 운행거리", value: `${summary.distance.toLocaleString()}km` },
          { label: "총 유류비", value: `${summary.fuel.toLocaleString()}원` },
          { label: "총 통행료", value: `${summary.toll.toLocaleString()}원` },
        ].map(item => (
          <div key={item.label} className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 font-medium">{item.label}</p>
            <p className="text-lg font-bold text-gray-800 mt-0.5">{item.value}</p>
          </div>
        ))}
      </div>

      {/* 운행일지 목록 */}
      {loading ? (
        <div className="py-16 text-center text-gray-400 text-sm">불러오는 중…</div>
      ) : dates.length === 0 ? (
        <div className="py-16 text-center text-gray-400 text-sm">
          <FileText size={40} className="mx-auto mb-3 opacity-30" />
          {year}년 {month}월 운행일지가 없습니다.
        </div>
      ) : (
        <div className="space-y-4">
          {dates.map(date => (
            <div key={date} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {/* 날짜 헤더 */}
              <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
                <span className="font-semibold text-sm text-gray-700">
                  {new Date(date + "T00:00:00").toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "short" })}
                </span>
                <span className="text-xs text-gray-400">{grouped[date].length}건</span>
              </div>

              {/* 해당 날짜 로그 */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      {["차량", "운전자", "출발지 → 도착지", "목적", "출발시간", "도착시간", "출발거리", "도착거리", "운행거리", "유류비", "통행료", "비고", ""].map(h => (
                        <th key={h} className="px-3 py-2 text-left text-xs font-medium text-gray-500 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {grouped[date].map(log => (
                      editId === log.id ? (
                        /* 수정 행 */
                        <tr key={log.id} className="bg-blue-50">
                          <td className="px-2 py-1.5 text-xs text-gray-500 whitespace-nowrap">
                            {log.vehicle.name}
                          </td>
                          <td className="px-2 py-1.5"><Input value={editForm.driver} onChange={e => setE("driver", e.target.value)} className="h-7 text-xs w-20" /></td>
                          <td className="px-2 py-1.5">
                            <div className="flex items-center gap-1">
                              <Input value={editForm.departure}   onChange={e => setE("departure",   e.target.value)} placeholder="출발" className="h-7 text-xs w-20" />
                              <span className="text-gray-400">→</span>
                              <Input value={editForm.destination} onChange={e => setE("destination", e.target.value)} placeholder="도착" className="h-7 text-xs w-20" />
                            </div>
                          </td>
                          <td className="px-2 py-1.5"><Input value={editForm.purpose}  onChange={e => setE("purpose",  e.target.value)} className="h-7 text-xs w-24" /></td>
                          <td className="px-2 py-1.5"><Input type="time" value={editForm.startTime} onChange={e => setE("startTime", e.target.value)} className="h-7 text-xs w-24" /></td>
                          <td className="px-2 py-1.5"><Input type="time" value={editForm.endTime}   onChange={e => setE("endTime",   e.target.value)} className="h-7 text-xs w-24" /></td>
                          <td className="px-2 py-1.5"><Input type="number" value={editForm.startMileage} onChange={e => setE("startMileage", e.target.value)} className="h-7 text-xs w-20" /></td>
                          <td className="px-2 py-1.5"><Input type="number" value={editForm.endMileage}   onChange={e => setE("endMileage",   e.target.value)} className="h-7 text-xs w-20" /></td>
                          <td className="px-2 py-1.5 text-xs text-gray-400">-</td>
                          <td className="px-2 py-1.5"><Input type="number" value={editForm.fuelCost} onChange={e => setE("fuelCost", e.target.value)} className="h-7 text-xs w-20" /></td>
                          <td className="px-2 py-1.5"><Input type="number" value={editForm.tollCost} onChange={e => setE("tollCost", e.target.value)} className="h-7 text-xs w-20" /></td>
                          <td className="px-2 py-1.5"><Input value={editForm.memo} onChange={e => setE("memo", e.target.value)} className="h-7 text-xs w-28" /></td>
                          <td className="px-2 py-1.5 whitespace-nowrap">
                            <div className="flex gap-1">
                              <button onClick={saveEdit} className="p-1 text-blue-600 hover:bg-blue-100 rounded" title="저장"><Save size={13} /></button>
                              <button onClick={() => setEditId(null)} className="p-1 text-gray-400 hover:bg-gray-100 rounded" title="취소"><X size={13} /></button>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        /* 일반 행 */
                        <tr key={log.id} className="hover:bg-gray-50 transition-colors cursor-pointer" onDoubleClick={() => startEdit(log)}>
                          <td className="px-3 py-2 text-xs text-gray-600 whitespace-nowrap">
                            <span className="font-medium">{log.vehicle.name}</span>
                            {log.vehicle.plateNo && <span className="ml-1 text-gray-400">({log.vehicle.plateNo})</span>}
                          </td>
                          <td className="px-3 py-2 text-gray-800 whitespace-nowrap">{log.driver}</td>
                          <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                            {log.departure || log.destination
                              ? <>{log.departure || "-"} <span className="text-gray-400">→</span> {log.destination || "-"}</>
                              : <span className="text-gray-300">-</span>}
                          </td>
                          <td className="px-3 py-2 text-gray-600 max-w-[140px] truncate" title={log.purpose ?? ""}>{log.purpose || "-"}</td>
                          <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{log.startTime || "-"}</td>
                          <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{log.endTime   || "-"}</td>
                          <td className="px-3 py-2 text-gray-600 whitespace-nowrap text-right">{km(log.startMileage)}</td>
                          <td className="px-3 py-2 text-gray-600 whitespace-nowrap text-right">{km(log.endMileage)}</td>
                          <td className="px-3 py-2 font-medium whitespace-nowrap text-right">
                            {log.startMileage != null && log.endMileage != null
                              ? <span className="text-blue-600">{distance(log.startMileage, log.endMileage)}</span>
                              : <span className="text-gray-300">-</span>}
                          </td>
                          <td className="px-3 py-2 text-gray-600 whitespace-nowrap text-right">{won(log.fuelCost)}</td>
                          <td className="px-3 py-2 text-gray-600 whitespace-nowrap text-right">{won(log.tollCost)}</td>
                          <td className="px-3 py-2 text-gray-400 text-xs max-w-[120px] truncate" title={log.memo ?? ""}>{log.memo || "-"}</td>
                          <td className="px-3 py-2">
                            <button onClick={() => handleDelete(log.id)}
                              className="p-1 text-gray-300 hover:text-red-500 transition-colors rounded" title="삭제">
                              <Trash2 size={13} />
                            </button>
                          </td>
                        </tr>
                      )
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 등록 모달 */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-4">
            {/* 헤더 */}
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <h3 className="font-bold text-lg text-gray-800">운행일지 등록</h3>
              <button onClick={() => setShowForm(false)} className="p-1 hover:bg-gray-100 rounded-full">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAdd} className="p-6 space-y-4">
              {formErr && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{formErr}</div>
              )}

              {/* 차량 + 운행일 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">차량 <span className="text-red-500">*</span></label>
                  <select value={form.vehicleId} onChange={e => set("vehicleId", e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">-- 차량 선택 --</option>
                    {inUsedVehicles.map(v => (
                      <option key={v.id} value={v.id}>[{v.code}] {v.name}{v.plateNo ? ` (${v.plateNo})` : ""}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">운행일 <span className="text-red-500">*</span></label>
                  <Input type="date" value={form.date} onChange={e => set("date", e.target.value)} />
                </div>
              </div>

              {/* 운전자 + 목적 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">운전자 <span className="text-red-500">*</span></label>
                  {workers.length > 0 ? (
                    <div className="flex gap-2">
                      <select
                        value={workers.some(w => w.name === form.driver) ? form.driver : "__custom__"}
                        onChange={e => {
                          if (e.target.value !== "__custom__") set("driver", e.target.value);
                          else set("driver", "");
                        }}
                        className="flex-1 px-3 py-2 border border-gray-200 rounded-md text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="__custom__">-- 직접입력 --</option>
                        {workers.map(w => (
                          <option key={w.id} value={w.name}>
                            {w.name}{w.position ? ` (${w.position})` : ""}
                          </option>
                        ))}
                      </select>
                      {!workers.some(w => w.name === form.driver) && (
                        <Input value={form.driver} onChange={e => set("driver", e.target.value)} placeholder="이름 직접입력" className="flex-1" />
                      )}
                    </div>
                  ) : (
                    <Input value={form.driver} onChange={e => set("driver", e.target.value)} placeholder="이름" />
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">목적/용무</label>
                  <Input value={form.purpose} onChange={e => set("purpose", e.target.value)} placeholder="예: 자재 운반, 현장 이동" />
                </div>
              </div>

              {/* 출발지 → 도착지 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">출발지</label>
                  <Input value={form.departure} onChange={e => set("departure", e.target.value)} placeholder="예: 본사" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">도착지</label>
                  <Input value={form.destination} onChange={e => set("destination", e.target.value)} placeholder="예: 거제 현장" />
                </div>
              </div>

              {/* 출발·도착 시간 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">출발시간</label>
                  <Input type="time" value={form.startTime} onChange={e => set("startTime", e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">도착시간</label>
                  <Input type="time" value={form.endTime} onChange={e => set("endTime", e.target.value)} />
                </div>
              </div>

              {/* 주행거리 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">출발 전 주행거리 (km)</label>
                  <Input type="number" value={form.startMileage} onChange={e => set("startMileage", e.target.value)} placeholder="0" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">도착 후 주행거리 (km)</label>
                  <Input type="number" value={form.endMileage} onChange={e => set("endMileage", e.target.value)} placeholder="0" />
                </div>
              </div>
              {form.startMileage && form.endMileage && Number(form.endMileage) >= Number(form.startMileage) && (
                <p className="text-sm text-blue-600 font-medium -mt-2">
                  운행거리: {(Number(form.endMileage) - Number(form.startMileage)).toLocaleString()}km
                </p>
              )}

              {/* 비용 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">유류비 (원)</label>
                  <Input type="number" value={form.fuelCost} onChange={e => set("fuelCost", e.target.value)} placeholder="0" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">통행료 (원)</label>
                  <Input type="number" value={form.tollCost} onChange={e => set("tollCost", e.target.value)} placeholder="0" />
                </div>
              </div>

              {/* 비고 */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">비고</label>
                <textarea value={form.memo} onChange={e => set("memo", e.target.value)} rows={2}
                  className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>

              <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>취소</Button>
                <Button type="submit" disabled={saving}>
                  <Save size={14} className="mr-1.5" />
                  {saving ? "저장 중..." : "등록"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      <p className="text-xs text-gray-400 text-center">행을 더블클릭하면 수정할 수 있습니다.</p>
    </div>
  );
}

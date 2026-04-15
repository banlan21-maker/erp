"use client";

import { useState, useRef, useEffect } from "react";
import { Car, CheckCircle2, ChevronDown, RefreshCw } from "lucide-react";

interface Vehicle { id: string; code: string; name: string; plateNo: string | null; mileage: number | null }
interface Worker  { id: string; name: string; position: string | null }

const PURPOSE_PRESETS  = ["자재운반", "현장이동", "정비", "출장"];
const LOCATION_PRESETS = ["진교", "삼정", "세림", "한국야나세", "통영조선소", "삼부TS", "함안공장"];

const todayStr = () => new Date().toISOString().split("T")[0];

const INIT = {
  vehicleId: "", date: todayStr(), driver: "",
  purpose: "", departure: "", destination: "",
  startTime: "", endTime: "",
  startMileage: "", endMileage: "",
  fuelCost: "", tollCost: "", memo: "",
};

/* ── 공통 스타일 ── */
const fieldCls = "w-full bg-gray-800 border border-gray-700 rounded-2xl px-4 py-4 text-white text-base placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 appearance-none";
const labelCls = "block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2";

/* ── 커스텀 드롭다운 (iOS Safari 호환) ── */
function MobileAutocomplete({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { label: string; sub?: string }[];
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const wrapRef = useRef<HTMLDivElement>(null);

  // 외부 터치시 닫기
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, [open]);

  // 상위 value가 바뀌면 query 동기화 (reset 시)
  useEffect(() => { setQuery(value); }, [value]);

  const filtered = query.trim()
    ? options.filter(o => o.label.includes(query) || (o.sub && o.sub.includes(query)))
    : options;

  const select = (label: string) => {
    onChange(label);
    setQuery(label);
    setOpen(false);
  };

  return (
    <div ref={wrapRef} className="relative">
      <input
        type="text"
        value={query}
        placeholder={placeholder}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        className={fieldCls}
        onFocus={() => setOpen(true)}
        onChange={e => {
          setQuery(e.target.value);
          onChange(e.target.value);
          setOpen(true);
        }}
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-50 left-0 right-0 mt-1 bg-gray-800 border border-gray-600 rounded-2xl overflow-hidden shadow-xl max-h-52 overflow-y-auto">
          {filtered.map((o, i) => (
            <li key={i}>
              <button
                type="button"
                onMouseDown={e => { e.preventDefault(); select(o.label); }}
                onTouchEnd={e => { e.preventDefault(); select(o.label); }}
                className="w-full text-left px-4 py-3 text-white text-base active:bg-gray-700 border-b border-gray-700 last:border-0"
              >
                {o.label}
                {o.sub && <span className="text-gray-400 text-sm ml-2">{o.sub}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ── 장소 선택 (칩 + 직접입력) ── */
function LocationPicker({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {LOCATION_PRESETS.map(loc => (
          <button
            key={loc}
            type="button"
            onClick={() => onChange(value === loc ? "" : loc)}
            className={`px-3 py-2 rounded-full text-sm font-semibold border transition-colors active:scale-95 ${
              value === loc
                ? "bg-blue-600 border-blue-600 text-white"
                : "border-gray-600 text-gray-400 bg-gray-800"
            }`}
          >
            {loc}
          </button>
        ))}
      </div>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder ?? "직접 입력 (선택사항)"}
        autoComplete="off"
        className={fieldCls}
      />
    </div>
  );
}

export default function FieldDrivingLog({
  vehicles,
  workers,
}: {
  vehicles: Vehicle[];
  workers: Worker[];
}) {
  const [form, setForm] = useState({ ...INIT });
  const [saving, setSaving] = useState(false);
  const [done,   setDone]   = useState(false);
  const [error,  setError]  = useState("");

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const selVehicle = vehicles.find(v => v.id === form.vehicleId);

  const handleVehicleChange = (id: string) => {
    const v = vehicles.find(v => v.id === id);
    setForm(f => ({
      ...f,
      vehicleId:    id,
      startMileage: v?.mileage != null ? String(v.mileage) : "",
    }));
  };

  const workerOptions = workers.map(w => ({
    label: w.name,
    sub: w.position ?? undefined,
  }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!form.vehicleId)      { setError("차량을 선택해주세요."); return; }
    if (!form.date)           { setError("운행일을 입력해주세요."); return; }
    if (!form.driver.trim())  { setError("운전자를 입력해주세요."); return; }

    setSaving(true);
    try {
      const res = await fetch("/api/transport-driving-log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vehicleId:    form.vehicleId,
          date:         form.date,
          driver:       form.driver,
          purpose:      form.purpose      || null,
          departure:    form.departure    || null,
          destination:  form.destination  || null,
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
      if (!data.success) { setError(data.error || "저장 실패"); return; }
      setDone(true);
    } catch {
      setError("서버 오류가 발생했습니다. 다시 시도해주세요.");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setDone(false);
    setError("");
    setForm({ ...INIT, date: todayStr() });
  };

  /* ── 등록 완료 화면 ── */
  if (done) {
    const dist = form.startMileage && form.endMileage && Number(form.endMileage) > Number(form.startMileage)
      ? Number(form.endMileage) - Number(form.startMileage)
      : null;
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center px-6 text-center">
        <CheckCircle2 size={64} className="text-green-400 mb-5" />
        <h2 className="text-2xl font-bold text-white mb-2">운행일지 등록 완료</h2>
        <p className="text-gray-400 text-sm mb-1">{form.date} · {selVehicle?.name}</p>
        <p className="text-gray-400 text-sm mb-1">운전자: {form.driver}</p>
        {form.purpose && <p className="text-gray-400 text-sm mb-1">목적: {form.purpose}</p>}
        {dist != null && (
          <p className="text-blue-400 font-semibold text-base mt-2">운행거리 {dist.toLocaleString()} km</p>
        )}
        <button
          onClick={handleReset}
          className="mt-8 flex items-center gap-2 px-6 py-3.5 bg-blue-600 text-white rounded-2xl font-semibold text-base active:bg-blue-700"
        >
          <RefreshCw size={18} /> 새 운행일지 등록
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 pb-10">
      {/* 헤더 */}
      <div className="sticky top-0 z-10 bg-gray-950/95 backdrop-blur border-b border-gray-800 px-5 py-4 flex items-center gap-3">
        <Car size={22} className="text-blue-400 shrink-0" />
        <div>
          <h1 className="text-base font-bold text-white leading-tight">현장 운행일지</h1>
          <p className="text-xs text-gray-500">차량 운행 기록 입력</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="px-5 pt-6 space-y-5">

        {/* 에러 */}
        {error && (
          <div className="bg-red-900/40 border border-red-700 text-red-300 rounded-2xl px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {/* ① 차량 선택 */}
        <div>
          <label className={labelCls}>차량 <span className="text-red-400">*</span></label>
          <div className="relative">
            <select
              value={form.vehicleId}
              onChange={e => handleVehicleChange(e.target.value)}
              className={fieldCls + " pr-10"}
            >
              <option value="">-- 차량 선택 --</option>
              {vehicles.map(v => (
                <option key={v.id} value={v.id}>
                  {v.name}{v.plateNo ? ` (${v.plateNo})` : ""}
                </option>
              ))}
            </select>
            <ChevronDown size={18} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-gray-500" />
          </div>
          {selVehicle?.mileage != null && (
            <p className="mt-1.5 text-xs text-blue-400 px-1">현재 주행거리: {selVehicle.mileage.toLocaleString()} km</p>
          )}
        </div>

        {/* ② 운행일 */}
        <div>
          <label className={labelCls}>운행일 <span className="text-red-400">*</span></label>
          <input
            type="date"
            value={form.date}
            onChange={e => set("date", e.target.value)}
            className={fieldCls}
          />
        </div>

        {/* ③ 운전자 */}
        <div>
          <label className={labelCls}>운전자 <span className="text-red-400">*</span></label>
          <MobileAutocomplete
            value={form.driver}
            onChange={v => set("driver", v)}
            options={workerOptions}
            placeholder="이름 입력 또는 목록에서 선택"
          />
        </div>

        {/* ④ 목적/용무 */}
        <div>
          <label className={labelCls}>목적/용무</label>
          <div className="flex flex-wrap gap-2 mb-3">
            {PURPOSE_PRESETS.map(p => (
              <button
                key={p} type="button"
                onClick={() => set("purpose", form.purpose === p ? "" : p)}
                className={`px-4 py-2.5 rounded-full text-sm font-semibold border transition-colors active:scale-95 ${
                  form.purpose === p
                    ? "bg-blue-600 border-blue-600 text-white"
                    : "border-gray-600 text-gray-400 bg-gray-800"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          <input
            value={form.purpose}
            onChange={e => set("purpose", e.target.value)}
            placeholder="직접 입력 (선택사항)"
            className={fieldCls}
          />
        </div>

        {/* ⑤ 출발지 / 도착지 */}
        <div className="space-y-4">
          <div>
            <label className={labelCls}>출발지</label>
            <LocationPicker
              value={form.departure}
              onChange={v => set("departure", v)}
              placeholder="출발지 직접 입력"
            />
          </div>
          <div>
            <label className={labelCls}>도착지</label>
            <LocationPicker
              value={form.destination}
              onChange={v => set("destination", v)}
              placeholder="도착지 직접 입력"
            />
          </div>
        </div>

        {/* ⑥ 출발 / 도착 시간 */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>출발시간</label>
            <input type="time" value={form.startTime} onChange={e => set("startTime", e.target.value)} className={fieldCls} />
          </div>
          <div>
            <label className={labelCls}>도착시간</label>
            <input type="time" value={form.endTime} onChange={e => set("endTime", e.target.value)} className={fieldCls} />
          </div>
        </div>

        {/* ⑦ 주행거리 */}
        <div>
          <label className={labelCls}>주행거리 (km)</label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-gray-500 mb-1.5">출발 전</p>
              <input
                type="number"
                value={form.startMileage}
                onChange={e => set("startMileage", e.target.value)}
                placeholder="0"
                className={fieldCls}
                inputMode="numeric"
              />
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1.5">도착 후</p>
              <input
                type="number"
                value={form.endMileage}
                onChange={e => set("endMileage", e.target.value)}
                placeholder="0"
                className={fieldCls}
                inputMode="numeric"
              />
            </div>
          </div>
          {form.startMileage && form.endMileage && Number(form.endMileage) > Number(form.startMileage) && (
            <div className="mt-2 bg-blue-900/30 border border-blue-700/40 rounded-xl px-4 py-2.5 text-center">
              <span className="text-blue-300 font-bold text-base">
                운행거리 {(Number(form.endMileage) - Number(form.startMileage)).toLocaleString()} km
              </span>
            </div>
          )}
        </div>

        {/* ⑧ 비용 */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>유류비 (원)</label>
            <input
              type="number"
              value={form.fuelCost}
              onChange={e => set("fuelCost", e.target.value)}
              placeholder="0"
              className={fieldCls}
              inputMode="numeric"
            />
          </div>
          <div>
            <label className={labelCls}>통행료 (원)</label>
            <input
              type="number"
              value={form.tollCost}
              onChange={e => set("tollCost", e.target.value)}
              placeholder="0"
              className={fieldCls}
              inputMode="numeric"
            />
          </div>
        </div>

        {/* ⑨ 비고 */}
        <div>
          <label className={labelCls}>비고</label>
          <textarea
            value={form.memo}
            onChange={e => set("memo", e.target.value)}
            rows={3}
            placeholder="특이사항 입력 (선택사항)"
            className={fieldCls + " resize-none"}
          />
        </div>

        {/* 제출 버튼 */}
        <button
          type="submit"
          disabled={saving}
          className="w-full py-4.5 bg-blue-600 text-white text-base font-bold rounded-2xl active:bg-blue-700 disabled:opacity-50 transition-colors mt-2"
          style={{ paddingTop: "1.125rem", paddingBottom: "1.125rem" }}
        >
          {saving ? "저장 중..." : "운행일지 등록"}
        </button>
      </form>
    </div>
  );
}

"use client";

/**
 * 현장 용차사용 등록 폼 — 모바일 다크 톤
 * field-payment.tsx 와 동일한 스타일.
 */

import { useState, useEffect } from "react";
import { Truck, CheckCircle2, Loader2 } from "lucide-react";

interface DrivingLocation { id: string; name: string }
interface CharterDriver { id: string; name: string; vehicleNo: string | null; phoneNo: string | null }

const todayStr = () => new Date().toISOString().split("T")[0];
const nowHM    = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

const fieldCls = "w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-3 text-white text-base placeholder-gray-500 focus:outline-none focus:border-blue-500";
const labelCls = "block text-xs font-semibold text-gray-400 mb-1.5";

export default function FieldCharterUsage() {
  const [locations, setLocations] = useState<DrivingLocation[]>([]);
  const [drivers,   setDrivers]   = useState<CharterDriver[]>([]);
  const [showDriverList, setShowDriverList] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const [form, setForm] = useState({
    date:        todayStr(),
    driverName:  "",
    driverPhone: "",
    vehicleNo:   "",
    items:       "",
    departure:   "",
    destination: "",
    departTime:  nowHM(),
    cost:        "",
    memo:        "",
  });

  useEffect(() => {
    fetch("/api/driving-location").then(r => r.json()).then(d => {
      if (d.success) setLocations(d.data);
    });
    fetch("/api/transport-drivers?type=CHARTER").then(r => r.json()).then(d => {
      if (d.success) setDrivers(d.data);
    }).catch(() => {});
  }, []);

  const set = (k: keyof typeof form, v: string) => setForm(p => ({ ...p, [k]: v }));

  const selectDriver = (d: CharterDriver) => {
    setForm(p => ({
      ...p,
      driverName:  d.name,
      driverPhone: d.phoneNo   ?? "",
      vehicleNo:   d.vehicleNo ?? "",
    }));
    setShowDriverList(false);
  };

  // 직접 입력 시 마스터 일치하면 그 사람 차량/전화로 덮어씀.
  // 다른 사람으로 바꾸면 자동으로 새 정보로 교체. 마스터에 없는 이름이면 기존 값 유지.
  const onDriverNameChange = (v: string) => {
    setForm(p => {
      const next = { ...p, driverName: v };
      const hit = drivers.find(d => d.name === v.trim());
      if (hit) {
        next.vehicleNo   = hit.vehicleNo ?? "";
        next.driverPhone = hit.phoneNo   ?? "";
      }
      return next;
    });
  };

  const submit = async () => {
    if (!form.driverName.trim()) { alert("운전자 이름을 입력하세요."); return; }
    setLoading(true);
    try {
      const r = await fetch("/api/charter-usage", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const d = await r.json();
      if (!d.success) { alert(d.error ?? "저장 실패"); return; }
      setForm({
        date: todayStr(), driverName: "", driverPhone: "", vehicleNo: "",
        items: "", departure: "", destination: "", departTime: nowHM(),
        cost: "", memo: "",
      });
      setDone(true);
      setTimeout(() => setDone(false), 2000);
    } catch { alert("서버 오류"); }
    finally { setLoading(false); }
  };

  return (
    <div className="flex-1 p-4 space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>날짜</label>
          <input type="date" value={form.date} onChange={e => set("date", e.target.value)} className={fieldCls} />
        </div>
        <div>
          <label className={labelCls}>출발시간</label>
          <input type="time" value={form.departTime} onChange={e => set("departTime", e.target.value)} className={fieldCls} />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className={labelCls + " mb-0"}>운전자 이름 *</label>
          {drivers.length > 0 && (
            <button
              type="button"
              onClick={() => setShowDriverList(v => !v)}
              className="text-xs font-semibold text-blue-300 active:text-blue-200"
            >
              {showDriverList ? "목록 닫기" : `등록된 운전자 (${drivers.length})`}
            </button>
          )}
        </div>
        <input
          value={form.driverName}
          onChange={e => onDriverNameChange(e.target.value)}
          placeholder="이름 입력 또는 목록에서 선택"
          autoComplete="off"
          className={fieldCls}
        />
        {showDriverList && drivers.length > 0 && (
          <div className="mt-2 bg-gray-900 border border-gray-800 rounded-2xl divide-y divide-gray-800 max-h-60 overflow-y-auto">
            {drivers.map(d => (
              <button
                key={d.id}
                type="button"
                onClick={() => selectDriver(d)}
                className="w-full flex items-start justify-between px-3 py-2.5 active:bg-gray-800 text-left"
              >
                <div>
                  <div className="text-sm font-semibold text-white">{d.name}</div>
                  <div className="text-[11px] text-gray-400 font-mono mt-0.5">
                    {d.vehicleNo ?? "-"} · {d.phoneNo ?? "-"}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div>
        <label className={labelCls}>전화번호</label>
        <input value={form.driverPhone} onChange={e => set("driverPhone", e.target.value)} placeholder="010-0000-0000" className={fieldCls} inputMode="tel" />
      </div>

      <div>
        <label className={labelCls}>차량번호</label>
        <input value={form.vehicleNo} onChange={e => set("vehicleNo", e.target.value)} placeholder="00가0000" className={fieldCls} />
      </div>

      <div>
        <label className={labelCls}>출고품목</label>
        <input value={form.items} onChange={e => set("items", e.target.value)} placeholder="예: 강재, 부재" className={fieldCls} />
      </div>

      {/* 출발지 / 도착지 — 프리셋 + 직접입력 */}
      {(["departure", "destination"] as const).map(field => (
        <div key={field}>
          <label className={labelCls}>{field === "departure" ? "출발지" : "도착지"}</label>
          {locations.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {locations.map(loc => (
                <button key={loc.id} type="button"
                  onClick={() => set(field, form[field] === loc.name ? "" : loc.name)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                    form[field] === loc.name
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-gray-800 text-gray-300 border-gray-700"
                  }`}>
                  {loc.name}
                </button>
              ))}
            </div>
          )}
          <input value={form[field]} onChange={e => set(field, e.target.value)} placeholder="직접 입력" className={fieldCls} />
        </div>
      ))}

      <div>
        <label className={labelCls}>용차비용 (원)</label>
        <input type="number" inputMode="numeric" value={form.cost} onChange={e => set("cost", e.target.value)} placeholder="금액" className={fieldCls} />
      </div>

      <div>
        <label className={labelCls}>비고</label>
        <textarea value={form.memo} onChange={e => set("memo", e.target.value)} rows={2} className={fieldCls} placeholder="특이사항" />
      </div>

      <button onClick={submit} disabled={loading}
        className="w-full py-4 rounded-2xl bg-blue-600 text-white font-bold text-base active:bg-blue-700 disabled:opacity-60 flex items-center justify-center gap-2">
        {loading ? <><Loader2 size={18} className="animate-spin" /> 저장 중...</> : <><Truck size={18} /> 용차사용 등록</>}
      </button>

      {done && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-green-600 text-white px-5 py-3 rounded-full font-bold flex items-center gap-2 shadow-lg z-50">
          <CheckCircle2 size={18} /> 용차사용이 등록되었습니다
        </div>
      )}
    </div>
  );
}

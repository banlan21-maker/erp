"use client";

import { useState } from "react";
import { Flame, Wind, CheckCircle2, Loader2 } from "lucide-react";

function nowKST() { return new Date(Date.now() + 9 * 3600000); }
function todayStr() { return nowKST().toISOString().slice(0, 10); }
function timeStr() {
  const d = nowKST();
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

const fieldCls = "w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-3 text-white text-base placeholder-gray-500 focus:outline-none focus:border-blue-500";
const labelCls = "block text-xs font-semibold text-gray-400 mb-1.5";

const VISUAL_OPTS = ["양호", "점검요망", "불량"];

export default function FieldFacility() {
  const [tab, setTab] = useState<"gas" | "compressor">("gas");
  const [date, setDate] = useState(todayStr());
  const [time, setTime] = useState(timeStr());
  const [recordedBy, setRecordedBy] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  // 가스설비 입력값
  const [gas, setGas] = useState({
    o2Pressure: "", o2Charge: "", lpgPressure: "", lpgCharge: "", co2Pressure: "", co2Charge: "", memo: "",
  });
  // 컴프레셔 입력값
  const [comp, setComp] = useState({
    runtime1: "", runtime2: "", runtime3: "",
    pressure1: "", pressure2: "", pressure3: "",
    temp1: "", temp2: "", temp3: "",
    visual1: "양호", visual2: "양호", visual3: "양호",
    memo: "",
  });

  const resetCommon = () => { setTime(timeStr()); };

  const submitGas = async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/facility/gas", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, time, recordedBy, ...gas }),
      });
      const d = await r.json();
      if (!d.success) { alert(d.error ?? "저장 실패"); return; }
      setGas({ o2Pressure: "", o2Charge: "", lpgPressure: "", lpgCharge: "", co2Pressure: "", co2Charge: "", memo: "" });
      resetCommon();
      flashDone();
    } catch { alert("서버 오류"); } finally { setLoading(false); }
  };

  const submitComp = async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/facility/compressor", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, time, recordedBy, ...comp }),
      });
      const d = await r.json();
      if (!d.success) { alert(d.error ?? "저장 실패"); return; }
      setComp({
        runtime1: "", runtime2: "", runtime3: "",
        pressure1: "", pressure2: "", pressure3: "",
        temp1: "", temp2: "", temp3: "",
        visual1: "양호", visual2: "양호", visual3: "양호", memo: "",
      });
      resetCommon();
      flashDone();
    } catch { alert("서버 오류"); } finally { setLoading(false); }
  };

  const flashDone = () => { setDone(true); setTimeout(() => setDone(false), 2000); };

  const g = (k: keyof typeof gas, v: string) => setGas(p => ({ ...p, [k]: v }));
  const c = (k: keyof typeof comp, v: string) => setComp(p => ({ ...p, [k]: v }));

  // 3호기 묶음 입력 렌더
  const TripleInput = ({ label, keys, unit }: { label: string; keys: [keyof typeof comp, keyof typeof comp, keyof typeof comp]; unit?: string }) => (
    <div>
      <label className={labelCls}>{label}{unit ? ` (${unit})` : ""}</label>
      <div className="grid grid-cols-3 gap-2">
        {keys.map((k, i) => (
          <div key={k}>
            <input type="number" inputMode="decimal" value={comp[k] as string} onChange={e => c(k, e.target.value)}
              placeholder={`${i + 1}호`} className={fieldCls} />
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      {/* 헤더 */}
      <div className="bg-gray-900 px-4 py-4 border-b border-gray-800">
        <p className="text-xs text-gray-500 font-medium">시설관리</p>
        <h1 className="text-lg font-bold text-white mt-0.5">현장 시설 점검</h1>
        <p className="text-xs text-gray-500 mt-0.5">{date} ({["일","월","화","수","목","금","토"][new Date(date + "T12:00:00").getDay()]})</p>
      </div>

      {/* 탭 */}
      <div className="flex border-b border-gray-800">
        <button onClick={() => setTab("gas")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-3.5 text-sm font-bold ${tab === "gas" ? "text-orange-400 border-b-2 border-orange-500 bg-gray-900" : "text-gray-500"}`}>
          <Flame size={16} /> 가스설비
        </button>
        <button onClick={() => setTab("compressor")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-3.5 text-sm font-bold ${tab === "compressor" ? "text-blue-400 border-b-2 border-blue-500 bg-gray-900" : "text-gray-500"}`}>
          <Wind size={16} /> 컴프레셔
        </button>
      </div>

      <div className="flex-1 p-4 space-y-4">
        {/* 공통: 날짜/시간/점검자 */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>점검일</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className={fieldCls} />
          </div>
          <div>
            <label className={labelCls}>점검시간</label>
            <input type="time" value={time} onChange={e => setTime(e.target.value)} className={fieldCls} />
          </div>
        </div>
        <div>
          <label className={labelCls}>점검자</label>
          <input value={recordedBy} onChange={e => setRecordedBy(e.target.value)} placeholder="이름" className={fieldCls} />
        </div>

        {tab === "gas" ? (
          <div className="space-y-4">
            {/* 액화산소 */}
            <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800">
              <p className="text-sm font-bold text-cyan-400 mb-3">액화산소</p>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={labelCls}>압력</label><input type="number" inputMode="decimal" value={gas.o2Pressure} onChange={e => g("o2Pressure", e.target.value)} className={fieldCls} placeholder="압력" /></div>
                <div><label className={labelCls}>충전량</label><input type="number" inputMode="decimal" value={gas.o2Charge} onChange={e => g("o2Charge", e.target.value)} className={fieldCls} placeholder="충전량" /></div>
              </div>
            </div>
            {/* LPG */}
            <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800">
              <p className="text-sm font-bold text-orange-400 mb-3">LPG</p>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={labelCls}>압력</label><input type="number" inputMode="decimal" value={gas.lpgPressure} onChange={e => g("lpgPressure", e.target.value)} className={fieldCls} placeholder="압력" /></div>
                <div><label className={labelCls}>충전량</label><input type="number" inputMode="decimal" value={gas.lpgCharge} onChange={e => g("lpgCharge", e.target.value)} className={fieldCls} placeholder="충전량" /></div>
              </div>
            </div>
            {/* CO2 */}
            <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800">
              <p className="text-sm font-bold text-purple-400 mb-3">CO2</p>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={labelCls}>압력</label><input type="number" inputMode="decimal" value={gas.co2Pressure} onChange={e => g("co2Pressure", e.target.value)} className={fieldCls} placeholder="압력" /></div>
                <div><label className={labelCls}>충전량</label><input type="number" inputMode="decimal" value={gas.co2Charge} onChange={e => g("co2Charge", e.target.value)} className={fieldCls} placeholder="충전량" /></div>
              </div>
            </div>
            <div>
              <label className={labelCls}>비고</label>
              <textarea value={gas.memo} onChange={e => g("memo", e.target.value)} rows={2} className={fieldCls} placeholder="특이사항" />
            </div>
            <button onClick={submitGas} disabled={loading}
              className="w-full py-4 rounded-2xl bg-orange-600 text-white font-bold text-base active:bg-orange-700 disabled:opacity-60 flex items-center justify-center gap-2">
              {loading ? <><Loader2 size={18} className="animate-spin" /> 저장 중...</> : "가스설비 점검 저장"}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800 space-y-4">
              <TripleInput label="운전시간" keys={["runtime1", "runtime2", "runtime3"]} unit="h" />
              <TripleInput label="토출압력" keys={["pressure1", "pressure2", "pressure3"]} />
              <TripleInput label="온도" keys={["temp1", "temp2", "temp3"]} unit="℃" />
              {/* 외관검사 */}
              <div>
                <label className={labelCls}>외관검사</label>
                <div className="grid grid-cols-3 gap-2">
                  {(["visual1", "visual2", "visual3"] as const).map((k, i) => (
                    <div key={k}>
                      <select value={comp[k]} onChange={e => c(k, e.target.value)} className={fieldCls}>
                        {VISUAL_OPTS.map(o => <option key={o} value={o}>{i + 1}호 {o}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div>
              <label className={labelCls}>비고</label>
              <textarea value={comp.memo} onChange={e => c("memo", e.target.value)} rows={2} className={fieldCls} placeholder="특이사항" />
            </div>
            <button onClick={submitComp} disabled={loading}
              className="w-full py-4 rounded-2xl bg-blue-600 text-white font-bold text-base active:bg-blue-700 disabled:opacity-60 flex items-center justify-center gap-2">
              {loading ? <><Loader2 size={18} className="animate-spin" /> 저장 중...</> : "컴프레셔 점검 저장"}
            </button>
          </div>
        )}
      </div>

      {/* 저장 완료 토스트 */}
      {done && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-green-600 text-white px-5 py-3 rounded-full font-bold flex items-center gap-2 shadow-lg z-50">
          <CheckCircle2 size={18} /> 점검 기록이 저장되었습니다
        </div>
      )}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Wrench, ClipboardCheck, Save, AlertTriangle, CheckCircle2, Plus, X, Search, Zap } from "lucide-react";
import type { Equipment } from "@/components/equipment-main";

/**
 * 이력등록 탭 — 장비카드에 들어가지 않고 여기서 바로 수선·검사 이력을 넣는다.
 *
 * 입력 항목은 장비카드의 등록 폼과 똑같다(같은 API 를 쓴다):
 *   수선 : POST /api/mgmt-repair
 *   검사 : POST /api/mgmt-inspection/[검사항목id]/complete  → 최종검사일·다음검사일 자동 갱신
 * 그래서 여기서 등록해도 해당 장비의 이력카드에 그대로 쌓인다.
 *
 * 검사는 '검사 항목' 에 매달리는 구조라 장비만으로는 등록할 수 없다 —
 * 장비를 고르면 그 장비에 등록된 검사 항목을 고르게 한다.
 */

const inputCls = "w-full h-9 px-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400";
const labelCls = "block text-xs font-semibold text-gray-600 mb-1";

type Kind = "repair" | "inspection";

export default function EquipmentHistoryRegister({
  equipments,
  onDone,
}: {
  equipments: Equipment[];
  onDone: () => void;
}) {
  const today = new Date().toISOString().split("T")[0];

  const [kind, setKind] = useState<Kind>("repair");
  const [eqSearch, setEqSearch] = useState("");
  const [equipmentId, setEquipmentId] = useState("");

  // 공통
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  // 수선
  const [repairedAt, setRepairedAt] = useState(today);
  const [cause, setCause] = useState("");
  const [content, setContent] = useState("");
  const [contractor, setContractor] = useState("");
  const [costs, setCosts] = useState<{ itemName: string; amount: string }[]>([]);
  const [dtH, setDtH] = useState("");
  const [dtM, setDtM] = useState("");
  const [memo, setMemo] = useState("");

  // 검사
  const [itemId, setItemId] = useState("");
  const [completedAt, setCompletedAt] = useState(today);
  const [insMemo, setInsMemo] = useState("");

  /* ── 작업일보 고장 정지 — 수선이력 미반영 (2026-10-02) ──
     현장이 [중단 → 장비고장] 으로 찍은 정지 중 아직 수선이력에 안 들어간 것.
     골라서 [수선이력 작성] 을 누르면 장비·수선일·비가동시간이 채워지고, 저장하면 그 정지들이
     이 수선이력에 묶여 목록에서 빠진다. 이미 따로 등록했거나 수선이 아니면 [목록에서 빼기]. */
  type PendingPause = {
    id: string; pausedAt: string; resumedAt: string | null; minutes: number | null; reasonText: string | null;
    operator: string; drawingNo: string | null; equipmentName: string; mgmtEquipmentId: string; mgmtEquipmentName: string;
  };
  const [pending, setPending] = useState<PendingPause[]>([]);
  const [pickedPauses, setPickedPauses] = useState<Set<string>>(new Set());
  const [linkedPauseIds, setLinkedPauseIds] = useState<string[]>([]);
  const loadPending = useCallback(async () => {
    try {
      const r = await fetch("/api/mgmt-repair/pending-pauses?days=30");
      const d = await r.json();
      if (d.success) setPending(d.data);
    } catch { /* 목록은 보조 기능 — 실패해도 등록 화면은 쓸 수 있어야 한다 */ }
  }, []);
  useEffect(() => { loadPending(); }, [loadPending]);
  const kstDate = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date(iso));
  const kstTime = (iso: string) => new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
  const togglePause = (pz: PendingPause) => setPickedPauses(prev => {
    const n = new Set(prev);
    if (n.has(pz.id)) { n.delete(pz.id); return n; }
    // 한 수선이력은 한 장비 — 다른 장비 정지를 고르면 새로 시작
    const other = pending.find(x => n.has(x.id) && x.mgmtEquipmentId !== pz.mgmtEquipmentId);
    if (other) n.clear();
    n.add(pz.id);
    return n;
  });
  const startFromPauses = () => {
    const sel = pending.filter(x => pickedPauses.has(x.id)).sort((a, b) => a.pausedAt.localeCompare(b.pausedAt));
    if (!sel.length) return;
    const mins = sel.reduce((s2, x) => s2 + (x.minutes ?? 0), 0);
    setKind("repair");
    setEquipmentId(sel[0].mgmtEquipmentId);
    setRepairedAt(kstDate(sel[0].pausedAt));
    setDtH(String(Math.floor(mins / 60))); setDtM(String(mins % 60));
    const texts = [...new Set(sel.map(x => x.reasonText?.trim()).filter(Boolean))];
    if (texts.length) setCause(texts.join(" / "));
    setMemo(`작업일보 고장 정지 ${sel.length}건 — ${sel.map(x => `${kstTime(x.pausedAt)} ${x.operator}`).join(", ")}`);
    setLinkedPauseIds(sel.map(x => x.id));
    setError(""); setDone("");
  };
  const dismissPauses = async () => {
    const ids = [...pickedPauses];
    if (!ids.length) return;
    if (!confirm(`고장 정지 ${ids.length}건을 목록에서 뺄까요?
(수선이 아니었거나 이미 수선이력을 따로 등록한 경우)`)) return;
    await fetch("/api/mgmt-repair/pending-pauses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "dismiss", ids }) });
    setPickedPauses(new Set());
    loadPending();
  };

  const eq = equipments.find(e => e.id === equipmentId) ?? null;
  const totalCost = costs.reduce((s, c) => s + (Number(c.amount) || 0), 0);

  const filtered = useMemo(() => {
    const q = eqSearch.trim().toLowerCase();
    if (!q) return equipments;
    return equipments.filter(e =>
      [e.name, e.code, e.managementNo ?? "", e.kind, e.location ?? ""]
        .join(" ").toLowerCase().includes(q));
  }, [equipments, eqSearch]);

  const resetRepair = () => {
    setCause(""); setContent(""); setContractor(""); setCosts([]);
    setDtH(""); setDtM(""); setMemo(""); setRepairedAt(today);
    setLinkedPauseIds([]);
  };

  const save = async () => {
    setError(""); setDone("");
    if (!equipmentId) { setError("장비를 선택하세요."); return; }
    setSaving(true);
    try {
      if (kind === "repair") {
        if (!content.trim()) { setError("조치 내용을 입력하세요."); setSaving(false); return; }
        const res = await fetch("/api/mgmt-repair", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            equipmentId, repairedAt, cause, content, contractor, memo,
            costs: costs.filter(c => c.itemName.trim() && Number(c.amount) > 0),
            downtimeHours: Number(dtH) || 0,
            downtimeMins: Number(dtM) || 0,
            // 같은 장비일 때만 묶는다 — 작성 중에 장비를 바꿨으면 연결하지 않는다(서버도 장비로 거른다)
            pauseIds: linkedPauseIds,
          }),
        });
        const json = await res.json();
        if (!json.success) { setError(json.error || "등록 실패"); return; }
        setDone(`${eq?.name} 수선이력이 등록됐습니다. 장비 이력카드에서 확인할 수 있습니다.`
          + (linkedPauseIds.length ? ` (작업일보 고장 정지 ${linkedPauseIds.length}건 연결)` : ""));
        resetRepair();
        setPickedPauses(new Set());
        loadPending();
      } else {
        if (!itemId) { setError("검사 항목을 선택하세요."); setSaving(false); return; }
        const res = await fetch(`/api/mgmt-inspection/${itemId}/complete`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ completedAt, memo: insMemo }),
        });
        const json = await res.json();
        if (!json.success) { setError(json.error || "등록 실패"); return; }
        const nx = json.data?.item?.nextInspectAt
          ? new Date(json.data.item.nextInspectAt).toISOString().slice(0, 10) : null;
        setDone(`${eq?.name} 검사이력이 등록됐습니다.${nx ? ` 다음 검사 예정일은 ${nx} 입니다.` : ""}`);
        setInsMemo(""); setCompletedAt(today); setItemId("");
      }
      onDone();
    } catch {
      setError("서버 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {done && (
        <div className="bg-green-50 border border-green-200 text-green-800 rounded-lg px-4 py-3 text-sm flex items-start gap-2">
          <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
          <span>{done}</span>
          <button onClick={() => setDone("")} className="ml-auto text-green-700"><X size={14} /></button>
        </div>
      )}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm flex items-start gap-2">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" /> {error}
        </div>
      )}

      {/* 작업일보 고장 정지 — 수선이력 미반영 */}
      {pending.length > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Zap size={15} className="text-orange-600" />
            <p className="text-sm font-bold text-orange-800">작업일보 고장 정지 — 수선이력 미등록 {pending.length}건</p>
            <span className="text-xs text-orange-700/80">최근 30일 · 현장에서 [장비고장] 으로 중단한 기록</span>
            <div className="ml-auto flex gap-2">
              <button onClick={startFromPauses} disabled={!pickedPauses.size}
                className="px-3 py-1.5 text-xs font-bold bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-40">
                선택한 {pickedPauses.size || ""}건으로 수선이력 작성
              </button>
              <button onClick={dismissPauses} disabled={!pickedPauses.size}
                className="px-3 py-1.5 text-xs border border-orange-300 text-orange-700 rounded-lg hover:bg-orange-100 disabled:opacity-40">
                목록에서 빼기
              </button>
            </div>
          </div>
          <div className="bg-white rounded-lg border border-orange-100 divide-y divide-orange-50 max-h-56 overflow-y-auto">
            {pending.map(pz => (
              <label key={pz.id} className="flex items-center gap-3 px-3 py-1.5 text-xs cursor-pointer hover:bg-orange-50/50">
                <input type="checkbox" checked={pickedPauses.has(pz.id)} onChange={() => togglePause(pz)} />
                <span className="font-semibold text-gray-800 w-32 truncate">{pz.mgmtEquipmentName}</span>
                <span className="tabular-nums text-gray-600 w-28">{kstTime(pz.pausedAt)}</span>
                <span className="tabular-nums text-red-600 w-20">{pz.minutes != null ? `${Math.floor(pz.minutes / 60)}시간 ${pz.minutes % 60}분` : "정지 중"}</span>
                <span className="text-gray-600 w-16 truncate">{pz.operator}</span>
                <span className="text-gray-400 truncate">{pz.reasonText ?? pz.drawingNo ?? ""}</span>
              </label>
            ))}
          </div>
          {linkedPauseIds.length > 0 && (
            <p className="text-xs text-orange-800">→ 아래 수선이력에 고장 정지 {linkedPauseIds.length}건이 연결돼 있습니다. 조치 내용을 채우고 저장하세요.</p>
          )}
        </div>
      )}

      {/* 종류 선택 */}
      <div className="grid grid-cols-2 gap-3 max-w-lg">
        {([
          ["repair", "수선이력", <Wrench key="w" size={16} />, "border-orange-400 bg-orange-50 text-orange-700"],
          ["inspection", "검사이력", <ClipboardCheck key="c" size={16} />, "border-blue-400 bg-blue-50 text-blue-700"],
        ] as const).map(([k, label, icon, cls]) => (
          <button key={k} type="button" onClick={() => { setKind(k); setError(""); }}
            className={`px-4 py-3 rounded-xl border-2 font-bold text-sm flex items-center justify-center gap-2 transition ${
              kind === k ? cls : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"
            }`}>
            {icon} {label}
          </button>
        ))}
      </div>

      {/* 장비 선택 */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
        <p className="text-xs font-bold text-gray-700">1. 장비 선택</p>
        <div className="relative max-w-md">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={eqSearch} onChange={e => setEqSearch(e.target.value)}
            placeholder="장비명·코드·관리번호·종류·위치 검색"
            className="w-full h-9 pl-8 pr-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
        </div>
        <select value={equipmentId} onChange={e => { setEquipmentId(e.target.value); setItemId(""); }}
          className={`${inputCls} max-w-md bg-white`}>
          <option value="">장비를 선택하세요 ({filtered.length}대)</option>
          {filtered.map(e => (
            <option key={e.id} value={e.id}>
              [{e.code}] {e.name} · {e.kind}{e.location ? ` · ${e.location}` : ""}
            </option>
          ))}
        </select>
        {eq && (
          <p className="text-xs text-gray-500">
            {eq.maker ? `${eq.maker} ` : ""}{eq.modelName ?? ""}
            {eq.managementNo ? ` · 관리번호 ${eq.managementNo}` : ""}
          </p>
        )}
      </div>

      {/* 내용 입력 */}
      {equipmentId && kind === "repair" && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
          <p className="text-xs font-bold text-gray-700">2. 수선 내용</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>수선일 *</label>
              <input className={inputCls} type="date" value={repairedAt} onChange={e => setRepairedAt(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>수선 업체/담당자</label>
              <input className={inputCls} value={contractor} onChange={e => setContractor(e.target.value)} placeholder="예: ○○기계" />
            </div>
            <div className="md:col-span-2">
              <label className={labelCls}>고장 원인</label>
              <input className={inputCls} value={cause} onChange={e => setCause(e.target.value)}
                placeholder="예: 모터 베어링 마모로 진동 발생" />
            </div>
            <div className="md:col-span-2">
              <label className={labelCls}>조치 내용 *</label>
              <textarea className={`${inputCls} h-20 py-2`} value={content} onChange={e => setContent(e.target.value)}
                placeholder="어떤 조치를 했는지" />
            </div>
            <div>
              <label className={labelCls}>비가동시간</label>
              <div className="flex items-center gap-1">
                <input className={inputCls} type="number" min="0" value={dtH} onChange={e => setDtH(e.target.value)} placeholder="시간" />
                <span className="text-xs text-gray-500">시간</span>
                <input className={inputCls} type="number" min="0" max="59" value={dtM} onChange={e => setDtM(e.target.value)} placeholder="분" />
                <span className="text-xs text-gray-500">분</span>
              </div>
            </div>
            <div>
              <label className={labelCls}>비고</label>
              <input className={inputCls} value={memo} onChange={e => setMemo(e.target.value)} />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className={labelCls}>소모 비용 (항목별)</label>
              <button type="button" onClick={() => setCosts(p => [...p, { itemName: "", amount: "" }])}
                className="text-xs text-blue-600 hover:underline inline-flex items-center gap-0.5">
                <Plus size={11} /> 항목 추가
              </button>
            </div>
            {costs.length === 0 ? (
              <p className="text-xs text-gray-400">[항목 추가] 버튼으로 부품비·인건비 등 비용 항목을 입력하세요.</p>
            ) : (
              <div className="space-y-1.5">
                {costs.map((c, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input className={`${inputCls} flex-1`} value={c.itemName}
                      onChange={e => setCosts(p => p.map((x, j) => j === i ? { ...x, itemName: e.target.value } : x))}
                      placeholder="항목명 (예: 부품비)" />
                    <input className={`${inputCls} w-36`} type="number" value={c.amount}
                      onChange={e => setCosts(p => p.map((x, j) => j === i ? { ...x, amount: e.target.value } : x))}
                      placeholder="금액(원)" />
                    <button type="button" onClick={() => setCosts(p => p.filter((_, j) => j !== i))}
                      className="p-1 text-gray-400 hover:text-red-600"><X size={14} /></button>
                  </div>
                ))}
                <p className="text-xs text-gray-600 text-right font-semibold">
                  합계 {totalCost.toLocaleString()}원
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {equipmentId && kind === "inspection" && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
          <p className="text-xs font-bold text-gray-700">2. 검사 내용</p>
          {eq && eq.inspections.length === 0 ? (
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              이 장비에 등록된 검사 항목이 없습니다.
              <br />
              <span className="text-xs">검사이력은 검사 항목에 쌓입니다 — 장비목록에서 이 장비를 열어 검사 항목을 먼저 등록하세요.</span>
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="md:col-span-2">
                <label className={labelCls}>검사 항목 *</label>
                <select value={itemId} onChange={e => setItemId(e.target.value)} className={`${inputCls} bg-white`}>
                  <option value="">항목을 선택하세요</option>
                  {eq?.inspections.map(it => (
                    <option key={it.id} value={it.id}>
                      {it.itemName} · 주기 {it.periodMonth}개월
                      {it.lastInspectedAt ? ` · 최종 ${String(it.lastInspectedAt).slice(0, 10)}` : " · 최종 검사 없음"}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-gray-400 mt-1">
                  등록하면 그 항목의 최종 검사일이 갱신되고 다음 검사 예정일이 주기만큼 자동으로 밀립니다.
                </p>
              </div>
              <div>
                <label className={labelCls}>완료일 *</label>
                <input className={inputCls} type="date" value={completedAt} onChange={e => setCompletedAt(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>비고</label>
                <input className={inputCls} value={insMemo} onChange={e => setInsMemo(e.target.value)} placeholder="검사 결과·특이사항" />
              </div>
            </div>
          )}
        </div>
      )}

      {equipmentId && (
        <div className="flex justify-end">
          <button type="button" onClick={save} disabled={saving}
            className="inline-flex items-center gap-1.5 px-5 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
            <Save size={14} /> {saving ? "등록 중…" : kind === "repair" ? "수선이력 등록" : "검사이력 등록"}
          </button>
        </div>
      )}
    </div>
  );
}

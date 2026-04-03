"use client";

import { useState, useEffect, useCallback } from "react";
import { UtensilsCrossed, Plus, Pencil, Trash2, Copy, RefreshCw, X, Save, Check, Link2, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const FACTORIES = ["진교", "진동"] as const;
type Factory = typeof FACTORIES[number];

const MEAL_TYPES = ["점심", "저녁", "기타"] as const;

function getTodayKST(): string {
  return new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
}

function getNowKST() {
  return new Date(Date.now() + 9 * 3600000);
}

function isPastDeadline(deadlineHour: number, deadlineMin: number): boolean {
  const now = getNowKST();
  const h = now.getUTCHours();
  const m = now.getUTCMinutes();
  return h > deadlineHour || (h === deadlineHour && m >= deadlineMin);
}

function formatTime(isoStr: string): string {
  const d = new Date(new Date(isoStr).getTime() + 9 * 3600000);
  return `${String(d.getUTCHours()).padStart(2,"0")}:${String(d.getUTCMinutes()).padStart(2,"0")}`;
}

const DAYS = ["일","월","화","수","목","금","토"];
function getDayStr(dateStr: string) { return DAYS[new Date(dateStr + "T12:00:00").getDay()]; }
function isWeekend(dateStr: string) { const d = new Date(dateStr + "T12:00:00").getDay(); return d === 0 || d === 6; }
function getDaysInMonth(year: number, month: number) { return new Date(year, month, 0).getDate(); }

interface MealVendor {
  id: string; name: string; factory: string; phone: string | null;
  pricePerMeal: number | null; token: string;
  deadlineHour: number; deadlineMin: number;
  defaultCount: number; defaultMealType: string; isActive: boolean;
}

interface MealRecord {
  id: string; date: string; factory: string; mealType: string;
  count: number; memo: string | null; registrar: string | null;
  createdAt: string; updatedAt: string;
}

interface CardState {
  mealType: string; count: string; memo: string; loading: boolean; forceEdit: boolean;
}

const emptyVendorForm = {
  name: "", factory: "진교", phone: "", pricePerMeal: "",
  deadlineHour: "10", deadlineMin: "0",
  defaultCount: "0", defaultMealType: "점심", isActive: true,
};

export default function MealMain() {
  const [activeTab, setActiveTab] = useState<"today" | "monthly" | "vendors">("today");

  // --- vendors ---
  const [vendors, setVendors] = useState<MealVendor[]>([]);
  const [loadingVendors, setLoadingVendors] = useState(true);

  const loadVendors = useCallback(async () => {
    setLoadingVendors(true);
    try {
      const r = await fetch("/api/meal-vendor");
      const d = await r.json();
      if (d.success) setVendors(d.data);
    } finally { setLoadingVendors(false); }
  }, []);

  useEffect(() => { loadVendors(); }, [loadVendors]);
  useEffect(() => { setOrigin(window.location.origin); }, []);

  // --- 공장별 등록자 (localStorage 기본값) ---
  const [registrars, setRegistrars] = useState<Record<Factory, string>>({ 진교: "", 진동: "" });
  const [isDefault, setIsDefault] = useState<Record<Factory, boolean>>({ 진교: false, 진동: false });

  useEffect(() => {
    const next: Record<Factory, string> = { 진교: "", 진동: "" };
    const def: Record<Factory, boolean> = { 진교: false, 진동: false };
    for (const f of FACTORIES) {
      const saved = localStorage.getItem(`mealRegistrar_${f}`);
      if (saved) { next[f] = saved; def[f] = true; }
    }
    setRegistrars(next);
    setIsDefault(def);
  }, []);

  const updateRegistrar = (f: Factory, val: string) => {
    setRegistrars(prev => ({ ...prev, [f]: val }));
    if (isDefault[f]) localStorage.setItem(`mealRegistrar_${f}`, val);
  };

  const toggleDefault = (f: Factory, checked: boolean) => {
    setIsDefault(prev => ({ ...prev, [f]: checked }));
    if (checked) localStorage.setItem(`mealRegistrar_${f}`, registrars[f]);
    else localStorage.removeItem(`mealRegistrar_${f}`);
  };

  // --- origin (클라이언트 전용) ---
  const [origin, setOrigin] = useState("");

  // --- today records ---
  const today = getTodayKST();
  const [todayRecords, setTodayRecords] = useState<Record<Factory, MealRecord | null>>({ 진교: null, 진동: null });
  const [cards, setCards] = useState<Record<Factory, CardState>>({
    진교: { mealType: "점심", count: "0", memo: "", loading: false, forceEdit: false },
    진동: { mealType: "점심", count: "0", memo: "", loading: false, forceEdit: false },
  });

  const loadTodayRecords = useCallback(async () => {
    const r = await fetch(`/api/meal-record?date=${today}`);
    const d = await r.json();
    if (!d.success) return;
    const recs: MealRecord[] = d.data;
    const map: Record<Factory, MealRecord | null> = { 진교: null, 진동: null };
    recs.forEach(rec => { if (rec.factory === "진교" || rec.factory === "진동") map[rec.factory] = rec; });
    setTodayRecords(map);
  }, [today]);

  useEffect(() => { loadTodayRecords(); }, [loadTodayRecords]);

  // Sync card defaults from vendors
  useEffect(() => {
    setCards(prev => {
      const next = { ...prev };
      for (const f of FACTORIES) {
        const v = vendors.find(vv => vv.factory === f && vv.isActive);
        const rec = todayRecords[f];
        if (rec) {
          next[f] = { ...next[f], mealType: rec.mealType, count: String(rec.count), memo: rec.memo || "" };
        } else if (v) {
          next[f] = { ...next[f], mealType: v.defaultMealType, count: String(v.defaultCount), memo: "" };
        }
      }
      return next;
    });
  }, [vendors, todayRecords]);

  const updateCard = (f: Factory, key: keyof CardState, val: string | boolean) => {
    setCards(prev => ({ ...prev, [f]: { ...prev[f], [key]: val } }));
  };

  const submitFactory = async (f: Factory) => {
    const v = vendors.find(vv => vv.factory === f && vv.isActive);
    updateCard(f, "loading", true);
    try {
      const r = await fetch("/api/meal-record", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: today, factory: f,
          mealType: cards[f].mealType,
          count: parseInt(cards[f].count) || 0,
          memo: cards[f].memo,
          registrar: registrars[f],
          vendorId: v?.id || null,
        }),
      });
      const d = await r.json();
      if (d.success) {
        setTodayRecords(prev => ({ ...prev, [f]: d.data }));
        updateCard(f, "forceEdit", false);
      } else alert(d.error ?? "저장 실패");
    } finally { updateCard(f, "loading", false); }
  };

  const submitAll = async () => {
    await Promise.all(FACTORIES.map(f => submitFactory(f)));
  };

  // --- monthly ---
  const now = getNowKST();
  const [monthYear, setMonthYear] = useState(String(now.getUTCFullYear()));
  const [monthMonth, setMonthMonth] = useState(String(now.getUTCMonth() + 1));
  const [monthRecords, setMonthRecords] = useState<MealRecord[]>([]);
  const [loadingMonth, setLoadingMonth] = useState(false);

  const loadMonth = useCallback(async () => {
    setLoadingMonth(true);
    try {
      const r = await fetch(`/api/meal-record?year=${monthYear}&month=${monthMonth}`);
      const d = await r.json();
      if (d.success) setMonthRecords(d.data);
    } finally { setLoadingMonth(false); }
  }, [monthYear, monthMonth]);

  useEffect(() => { if (activeTab === "monthly") loadMonth(); }, [activeTab, loadMonth]);

  // Build daily table
  const daysCount = getDaysInMonth(parseInt(monthYear), parseInt(monthMonth));
  const dailyRows = Array.from({ length: daysCount }, (_, i) => {
    const day = String(i + 1).padStart(2, "0");
    const dateStr = `${monthYear}-${monthMonth.padStart(2,"0")}-${day}`;
    const jingyo = monthRecords.find(r => r.date === dateStr && r.factory === "진교" && r.mealType === "점심");
    const jindong = monthRecords.find(r => r.date === dateStr && r.factory === "진동" && r.mealType === "점심");
    return { dateStr, jingyo, jindong };
  });
  const jingyoTotal = dailyRows.reduce((s, r) => s + (r.jingyo?.count ?? 0), 0);
  const jindongTotal = dailyRows.reduce((s, r) => s + (r.jindong?.count ?? 0), 0);

  // --- vendor modal ---
  const [showVendorModal, setShowVendorModal] = useState(false);
  const [editingVendor, setEditingVendor] = useState<MealVendor | null>(null);
  const [vendorForm, setVendorForm] = useState({ ...emptyVendorForm });
  const [savingVendor, setSavingVendor] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const openNewVendor = () => {
    setEditingVendor(null);
    setVendorForm({ ...emptyVendorForm });
    setShowVendorModal(true);
  };

  const openEditVendor = (v: MealVendor) => {
    setEditingVendor(v);
    setVendorForm({
      name: v.name, factory: v.factory, phone: v.phone || "",
      pricePerMeal: v.pricePerMeal ? String(v.pricePerMeal) : "",
      deadlineHour: String(v.deadlineHour), deadlineMin: String(v.deadlineMin),
      defaultCount: String(v.defaultCount), defaultMealType: v.defaultMealType, isActive: v.isActive,
    });
    setShowVendorModal(true);
  };

  const saveVendor = async () => {
    setSavingVendor(true);
    try {
      const body = {
        name: vendorForm.name, factory: vendorForm.factory, phone: vendorForm.phone,
        pricePerMeal: vendorForm.pricePerMeal || null,
        deadlineHour: parseInt(vendorForm.deadlineHour), deadlineMin: parseInt(vendorForm.deadlineMin),
        defaultCount: parseInt(vendorForm.defaultCount), defaultMealType: vendorForm.defaultMealType,
        isActive: vendorForm.isActive,
      };
      const url = editingVendor ? `/api/meal-vendor/${editingVendor.id}` : "/api/meal-vendor";
      const method = editingVendor ? "PATCH" : "POST";
      const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json();
      if (d.success) { setShowVendorModal(false); loadVendors(); }
      else alert(d.error ?? "저장 실패");
    } finally { setSavingVendor(false); }
  };

  const deleteVendor = async (v: MealVendor) => {
    if (!confirm(`"${v.name}" 업체를 삭제하시겠습니까?`)) return;
    const r = await fetch(`/api/meal-vendor/${v.id}`, { method: "DELETE" });
    const d = await r.json();
    if (d.success) loadVendors();
    else alert(d.error ?? "삭제 실패");
  };

  const resetToken = async (v: MealVendor) => {
    if (!confirm("조회 링크가 변경됩니다. 기존 링크는 더 이상 작동하지 않습니다. 계속하시겠습니까?")) return;
    const r = await fetch(`/api/meal-vendor/${v.id}/reset-token`, { method: "POST" });
    const d = await r.json();
    if (d.success) loadVendors();
    else alert(d.error ?? "오류");
  };

  const copyLink = (token: string) => {
    const url = `${origin}/field/meal/${token}`;
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(url).then(() => {
        setCopiedToken(token);
        setTimeout(() => setCopiedToken(null), 2000);
      });
    } else {
      // HTTP 환경 fallback
      const el = document.createElement("textarea");
      el.value = url;
      el.style.cssText = "position:fixed;top:-999px;left:-999px;opacity:0";
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setCopiedToken(token);
      setTimeout(() => setCopiedToken(null), 2000);
    }
  };

  // deadline check per factory
  const getVendorForFactory = (f: Factory) => vendors.find(v => v.factory === f && v.isActive);
  const isDeadlinePast = (f: Factory) => {
    const v = getVendorForFactory(f);
    if (!v) return false;
    return isPastDeadline(v.deadlineHour, v.deadlineMin);
  };

  const tabCls = (t: string) => `px-5 py-3 text-sm font-semibold flex items-center gap-2 relative transition-colors ${
    activeTab === t ? "text-blue-600" : "text-gray-500 hover:text-gray-800 hover:bg-gray-50"
  }`;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
          <UtensilsCrossed size={24} className="text-blue-600" />
          식수 관리
        </h2>
        <p className="text-sm text-gray-500 mt-1">공장별 식수 인원을 매일 등록하고 월별 현황을 확인합니다.</p>
      </div>

      {/* 탭 */}
      <div className="flex border-b border-gray-200">
        <button onClick={() => setActiveTab("today")} className={tabCls("today")}>
          오늘 식수 입력 {activeTab === "today" && <span className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600 rounded-t-md" />}
        </button>
        <button onClick={() => setActiveTab("monthly")} className={tabCls("monthly")}>
          월별 현황 {activeTab === "monthly" && <span className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600 rounded-t-md" />}
        </button>
        <button onClick={() => setActiveTab("vendors")} className={tabCls("vendors")}>
          업체 관리 {activeTab === "vendors" && <span className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600 rounded-t-md" />}
        </button>
      </div>

      {/* ========== 오늘 식수 입력 ========== */}
      {activeTab === "today" && (
        <div className="space-y-4">
          {/* 날짜 */}
          <div className="text-lg font-bold text-gray-800">
            {today} ({getDayStr(today)})
          </div>

          {/* 카드 2개 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {FACTORIES.map(f => {
              const v = getVendorForFactory(f);
              const rec = todayRecords[f];
              const card = cards[f];
              const deadline = isDeadlinePast(f);
              const isSubmitted = !!rec && !card.forceEdit;
              const isLocked = deadline && !card.forceEdit;
              const deadlineStr = v ? `${v.deadlineHour}:${String(v.deadlineMin).padStart(2,"0")} 마감` : "";

              return (
                <div key={f} className={`bg-white rounded-xl border-2 shadow-sm overflow-hidden ${isSubmitted ? "border-green-400" : "border-gray-200"}`}>
                  <div className={`px-5 py-3 flex items-center justify-between ${isSubmitted ? "bg-green-50" : "bg-gray-50"}`}>
                    <div>
                      <span className="font-bold text-gray-900 text-base">{f} 공장</span>
                      {v && <span className="ml-2 text-sm text-gray-500">{v.name}</span>}
                    </div>
                    <div className="text-xs text-gray-400">{deadlineStr}</div>
                  </div>

                  <div className="p-5 space-y-4">
                    {isLocked ? (
                      <div className="py-6 text-center text-red-500 font-semibold">마감됐습니다</div>
                    ) : isSubmitted ? (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 text-green-600 font-semibold">
                          <Check size={16} />
                          {formatTime(rec!.updatedAt)} 요청 완료
                        </div>
                        <div className="text-sm text-gray-600 space-y-1">
                          <div>식사: <strong>{rec!.mealType}</strong> / 인원: <strong>{rec!.count}명</strong></div>
                          {rec!.memo && <div>전달사항: {rec!.memo}</div>}
                          {rec!.registrar && <div>등록자: {rec!.registrar}</div>}
                        </div>
                        <Button size="sm" variant="outline" onClick={() => updateCard(f, "forceEdit", true)} className="w-full">수정하기</Button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {/* 식사 구분 */}
                        <div>
                          <label className="text-xs font-medium text-gray-600 mb-1.5 block">식사 구분</label>
                          <div className="flex gap-2">
                            {MEAL_TYPES.map(mt => (
                              <button key={mt} onClick={() => updateCard(f, "mealType", mt)}
                                className={`px-3 py-1.5 text-sm rounded-lg border font-medium transition-colors ${card.mealType === mt ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-200 hover:border-blue-300"}`}>
                                {mt}
                              </button>
                            ))}
                          </div>
                        </div>
                        {/* 인원 수 */}
                        <div>
                          <label className="text-xs font-medium text-gray-600 mb-1.5 block">식사 인원 수</label>
                          <div className="flex items-center gap-2">
                            <button onClick={() => updateCard(f, "count", String(Math.max(0, parseInt(card.count||"0")-1)))} className="w-9 h-9 rounded-lg border border-gray-200 text-lg font-bold text-gray-600 hover:bg-gray-50">−</button>
                            <Input type="number" min={0} value={card.count}
                              onChange={e => updateCard(f, "count", e.target.value)}
                              className="w-20 h-9 text-center text-lg font-bold" />
                            <button onClick={() => updateCard(f, "count", String(parseInt(card.count||"0")+1))} className="w-9 h-9 rounded-lg border border-gray-200 text-lg font-bold text-gray-600 hover:bg-gray-50">+</button>
                            <span className="text-sm text-gray-500">명</span>
                          </div>
                        </div>
                        {/* 전달사항 */}
                        <div>
                          <label className="text-xs font-medium text-gray-600 mb-1.5 block">업체 전달사항 (선택)</label>
                          <textarea value={card.memo} onChange={e => updateCard(f, "memo", e.target.value)}
                            placeholder="예: 오늘 김치찌개 빼주세요"
                            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none h-16" />
                        </div>
                        {/* 등록자 */}
                        <div>
                          <label className="text-xs font-medium text-gray-600 mb-1.5 block">등록자</label>
                          <div className="flex items-center gap-2">
                            <Input
                              value={registrars[f]}
                              onChange={e => updateRegistrar(f, e.target.value)}
                              placeholder="이름 입력"
                              className="flex-1 h-8 text-sm"
                            />
                            <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer whitespace-nowrap select-none">
                              <input
                                type="checkbox"
                                checked={isDefault[f]}
                                onChange={e => toggleDefault(f, e.target.checked)}
                                className="w-3.5 h-3.5 accent-blue-600"
                              />
                              기본값 설정
                            </label>
                          </div>
                        </div>
                        <Button onClick={() => submitFactory(f)} disabled={card.loading} className="w-full bg-blue-600 hover:bg-blue-700 font-bold">
                          {card.loading ? "저장 중..." : "요청하기"}
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* 전체 요청하기 */}
          <div className="flex justify-center pt-2">
            <Button onClick={submitAll} size="lg" className="bg-blue-700 hover:bg-blue-800 font-bold px-12">
              전체 요청하기
            </Button>
          </div>
        </div>
      )}

      {/* ========== 월별 현황 ========== */}
      {activeTab === "monthly" && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Input type="number" value={monthYear} onChange={e => setMonthYear(e.target.value)} className="w-24 h-9" placeholder="연도" />
            <span className="text-gray-600">년</span>
            <select value={monthMonth} onChange={e => setMonthMonth(e.target.value)} className="h-9 px-3 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              {Array.from({length:12},(_,i)=><option key={i+1} value={i+1}>{i+1}월</option>)}
            </select>
            <Button size="sm" onClick={loadMonth} disabled={loadingMonth} variant="outline">조회</Button>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-center whitespace-nowrap">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 font-semibold text-xs text-gray-500">날짜</th>
                    <th className="px-4 py-3 font-semibold text-xs text-gray-500">요일</th>
                    <th className="px-4 py-3 font-semibold text-xs text-gray-500">진교 점심</th>
                    <th className="px-4 py-3 font-semibold text-xs text-gray-500">진동 점심</th>
                    <th className="px-4 py-3 font-semibold text-xs text-gray-500">비고</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {loadingMonth ? (
                    <tr><td colSpan={5} className="py-8 text-gray-400">불러오는 중...</td></tr>
                  ) : dailyRows.map(({ dateStr, jingyo, jindong }) => {
                    const weekend = isWeekend(dateStr);
                    const jg = jingyo?.count;
                    const jd = jindong?.count;
                    const memo = [jingyo?.memo, jindong?.memo].filter(Boolean).join(" / ");
                    return (
                      <tr key={dateStr} className={weekend ? "bg-red-50/40 text-red-700" : "hover:bg-gray-50"}>
                        <td className="px-4 py-2.5 font-mono">{dateStr.slice(5)}</td>
                        <td className="px-4 py-2.5 font-semibold">{getDayStr(dateStr)}</td>
                        <td className={`px-4 py-2.5 font-semibold ${jg != null ? "text-blue-700" : "text-gray-300"}`}>{jg != null ? `${jg}명` : "-"}</td>
                        <td className={`px-4 py-2.5 font-semibold ${jd != null ? "text-blue-700" : "text-gray-300"}`}>{jd != null ? `${jd}명` : "-"}</td>
                        <td className="px-4 py-2.5 text-xs text-gray-500 text-left">{memo || ""}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-blue-50 border-t-2 border-blue-200">
                  <tr>
                    <td colSpan={2} className="px-4 py-3 font-bold text-blue-800 text-left">합계</td>
                    <td className="px-4 py-3 font-bold text-blue-800">{jingyoTotal}식</td>
                    <td className="px-4 py-3 font-bold text-blue-800">{jindongTotal}식</td>
                    <td className="px-4 py-3 font-bold text-blue-800 text-left">전체 {jingyoTotal + jindongTotal}식</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========== 업체 관리 ========== */}
      {activeTab === "vendors" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={openNewVendor} className="bg-blue-600 hover:bg-blue-700 gap-2">
              <Plus size={16} /> 업체 추가
            </Button>
          </div>

          {loadingVendors ? (
            <div className="text-center py-8 text-gray-400">불러오는 중...</div>
          ) : vendors.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <Building2 size={40} className="mx-auto mb-2 opacity-30" />
              <p>등록된 업체가 없습니다.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {vendors.map(v => {
                const link = `${origin}/field/meal/${v.token}`;
                const isCopied = copiedToken === v.token;
                return (
                  <div key={v.id} className={`bg-white rounded-xl border shadow-sm overflow-hidden ${v.isActive ? "border-gray-200" : "border-gray-100 opacity-60"}`}>
                    <div className="px-5 py-3 bg-gray-50 flex items-center justify-between">
                      <div>
                        <span className="font-bold text-gray-900">{v.name}</span>
                        <span className="ml-2 text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full font-semibold">{v.factory}</span>
                        {!v.isActive && <span className="ml-2 text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full">비활성</span>}
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => openEditVendor(v)} className="p-1.5 text-gray-400 hover:text-blue-600 rounded transition-colors"><Pencil size={14} /></button>
                        <button onClick={() => deleteVendor(v)} className="p-1.5 text-gray-400 hover:text-red-500 rounded transition-colors"><Trash2 size={14} /></button>
                      </div>
                    </div>
                    <div className="px-5 py-4 space-y-2 text-sm text-gray-600">
                      {v.phone && <div>연락처: {v.phone}</div>}
                      {v.pricePerMeal && <div>단가: {v.pricePerMeal.toLocaleString()}원/식</div>}
                      <div>마감: {v.deadlineHour}:{String(v.deadlineMin).padStart(2,"0")} / 기본 {v.defaultCount}명 ({v.defaultMealType})</div>
                      <div className="pt-2 border-t border-gray-100">
                        <div className="flex items-center gap-2">
                          <Link2 size={13} className="text-gray-400 flex-shrink-0" />
                          <span className="text-xs text-gray-400 font-mono truncate flex-1">/field/meal/{v.token.slice(0,12)}...</span>
                          <button onClick={() => copyLink(v.token)}
                            className={`flex items-center gap-1 text-xs px-2 py-1 rounded border transition-colors ${isCopied ? "border-green-400 text-green-600 bg-green-50" : "border-gray-200 text-gray-500 hover:border-blue-300 hover:text-blue-600"}`}>
                            {isCopied ? <><Check size={12} />복사됨</> : <><Copy size={12} />링크 복사</>}
                          </button>
                          <button onClick={() => resetToken(v)} title="링크 재생성" className="p-1 text-gray-300 hover:text-orange-500 rounded transition-colors">
                            <RefreshCw size={13} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========== 업체 모달 ========== */}
      {showVendorModal && (
        <div className="fixed inset-0 z-50 bg-gray-900/60 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h3 className="font-bold text-lg text-gray-900">{editingVendor ? "업체 정보 수정" : "신규 업체 추가"}</h3>
              <button onClick={() => setShowVendorModal(false)} className="text-gray-400 hover:text-gray-600 p-1 rounded"><X size={20} /></button>
            </div>
            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 space-y-1.5">
                  <label className="text-xs font-semibold text-gray-700">업체명 *</label>
                  <Input value={vendorForm.name} onChange={e => setVendorForm(p=>({...p, name: e.target.value}))} placeholder="업체명 입력" className="h-9" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-700">담당 공장 *</label>
                  <select value={vendorForm.factory} onChange={e => setVendorForm(p=>({...p, factory: e.target.value}))} className="w-full h-9 px-3 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {FACTORIES.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-700">연락처</label>
                  <Input value={vendorForm.phone} onChange={e => setVendorForm(p=>({...p, phone: e.target.value}))} placeholder="010-0000-0000" className="h-9" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-700">단가 (원/식)</label>
                  <Input type="number" value={vendorForm.pricePerMeal} onChange={e => setVendorForm(p=>({...p, pricePerMeal: e.target.value}))} placeholder="5000" className="h-9" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-700">마감 시각</label>
                  <div className="flex items-center gap-1">
                    <Input type="number" min={0} max={23} value={vendorForm.deadlineHour} onChange={e => setVendorForm(p=>({...p, deadlineHour: e.target.value}))} className="h-9 w-16 text-center" />
                    <span className="text-gray-500">:</span>
                    <Input type="number" min={0} max={59} value={vendorForm.deadlineMin} onChange={e => setVendorForm(p=>({...p, deadlineMin: e.target.value}))} className="h-9 w-16 text-center" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-700">기본 인원 수</label>
                  <Input type="number" min={0} value={vendorForm.defaultCount} onChange={e => setVendorForm(p=>({...p, defaultCount: e.target.value}))} className="h-9" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-700">기본 식사 구분</label>
                  <select value={vendorForm.defaultMealType} onChange={e => setVendorForm(p=>({...p, defaultMealType: e.target.value}))} className="w-full h-9 px-3 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {MEAL_TYPES.map(mt => <option key={mt} value={mt}>{mt}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5 flex items-end">
                  <button onClick={() => setVendorForm(p=>({...p, isActive: !p.isActive}))}
                    className={`h-9 w-full px-3 rounded-md text-sm font-bold border flex items-center gap-2 justify-center transition-colors ${vendorForm.isActive ? "bg-green-600 text-white border-green-600" : "bg-white text-gray-400 border-gray-200"}`}>
                    <span className={`w-3 h-3 rounded-full border-2 ${vendorForm.isActive ? "bg-white border-white" : "border-gray-300"}`} />
                    {vendorForm.isActive ? "사용중" : "비활성"}
                  </button>
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
              <Button variant="outline" onClick={() => setShowVendorModal(false)}>취소</Button>
              <Button onClick={saveVendor} disabled={savingVendor} className="bg-blue-600 hover:bg-blue-700">
                <Save size={15} className="mr-1.5" /> {savingVendor ? "저장 중..." : "저장"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { LayoutDashboard, AlertTriangle, Clock, CheckCircle, Wrench, XCircle, MinusCircle, Truck, ChevronDown, ChevronUp, RefreshCw } from "lucide-react";
import Link from "next/link";

const STORAGE_KEY = "mgmt_dashboard_collapse";

function useCollapse(key: string, defaultOpen: boolean) {
  const [open, setOpen] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (typeof parsed[key] === "boolean") return parsed[key];
      }
    } catch {}
    return defaultOpen;
  });

  const toggle = () => {
    setOpen(prev => {
      const next = !prev;
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        const parsed = stored ? JSON.parse(stored) : {};
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...parsed, [key]: next }));
      } catch {}
      return next;
    });
  };

  return [open, toggle] as const;
}

function SectionHeader({
  open,
  onToggle,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="w-full px-5 py-4 border-b bg-gray-50 flex items-center justify-between hover:bg-gray-100/70 transition-colors"
    >
      <div className="flex items-center gap-2">{children}</div>
      {open ? <ChevronUp size={16} className="text-gray-400 shrink-0" /> : <ChevronDown size={16} className="text-gray-400 shrink-0" />}
    </button>
  );
}

export default function ManagementDashboardPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [visaOpen, toggleVisa] = useCollapse("visa", true);
  const [equipOpen, toggleEquip] = useCollapse("equip", true);
  const [transportOpen, toggleTransport] = useCollapse("transport", true);

  useEffect(() => {
    fetch("/api/management/dashboard")
      .then(r => r.json())
      .then(j => { if (j.success) setData(j.data); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-gray-400 gap-3">
        <RefreshCw className="animate-spin text-blue-500" size={32} />
        <p className="text-sm font-medium">대시보드 데이터를 불러오는 중입니다...</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-8 text-center text-red-500 bg-red-50 rounded-xl border border-red-100">
        데이터를 불러오지 못했습니다.
      </div>
    );
  }

  const { alertInspections, transportInspAlerts, combinedConsumables, foreignWorkers } = data;
  const today = new Date(data.today);
  const in90days = new Date(data.in90days);

  const expiring = foreignWorkers.filter((w: any) => new Date(w.visaExpiry) <= in90days);
  const safe     = foreignWorkers.filter((w: any) => new Date(w.visaExpiry) > in90days);

  const overdueInsp       = alertInspections.filter((i: any) => new Date(i.nextInspectAt) < today);
  const upcomingInsp      = alertInspections.filter((i: any) => new Date(i.nextInspectAt) >= today);
  const overdueTransportInsp  = transportInspAlerts.filter((i: any) => new Date(i.nextInspectAt) < today);
  const upcomingTransportInsp = transportInspAlerts.filter((i: any) => new Date(i.nextInspectAt) >= today);

  function dDayLabel(expiryStr: string) {
    const diff = Math.floor((new Date(expiryStr).getTime() - today.getTime()) / 86400000);
    if (diff < 0)  return { label: `${Math.abs(diff)}일 초과`, color: "text-red-700 bg-red-100" };
    if (diff === 0) return { label: "오늘 만료",                color: "text-red-700 bg-red-100" };
    return { label: `D-${diff}`, color: diff <= 30 ? "text-red-700 bg-red-100" : "text-orange-700 bg-orange-100" };
  }

  function inspDDay(dateStr: string) {
    const diff = Math.floor((new Date(dateStr).getTime() - today.getTime()) / 86400000);
    if (diff < 0)   return { label: `D+${Math.abs(diff)}`, color: "text-red-700 bg-red-100" };
    if (diff === 0) return { label: "D-day",                color: "text-red-700 bg-red-100" };
    if (diff <= 30) return { label: `D-${diff}`,            color: "text-orange-700 bg-orange-100" };
    return            { label: `D-${diff}`,                 color: "text-yellow-700 bg-yellow-100" };
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <LayoutDashboard size={24} className="text-blue-600" /> 관리 대시보드
        </h2>
        <p className="text-sm text-gray-500 mt-1">관리 파트 현황을 한눈에 확인합니다.</p>
      </div>

      {/* 외국인 비자 만기 관리 */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <SectionHeader open={visaOpen} onToggle={toggleVisa}>
          <AlertTriangle size={18} className="text-orange-500" />
          <span className="font-semibold text-gray-800">외국인 비자 만기 관리</span>
          {expiring.length > 0 && (
            <span className="ml-1 text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-bold">
              {expiring.length}명 주의
            </span>
          )}
          <Link href="/management/workers" onClick={e => e.stopPropagation()} className="text-xs text-blue-600 hover:underline ml-2">인원 관리 →</Link>
        </SectionHeader>

        {visaOpen && (
          foreignWorkers.length === 0 ? (
            <div className="py-12 text-center text-gray-400 text-sm">비자 만기일이 등록된 외국인 인원이 없습니다.</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {expiring.length > 0 && (
                <div className="p-5">
                  <p className="text-xs font-bold text-red-600 mb-3 flex items-center gap-1">
                    <AlertTriangle size={13} /> 3개월 이내 만료 — 즉시 연장 필요
                  </p>
                  <div className="space-y-2">
                    {expiring.map((w: any) => {
                      const { label, color } = dDayLabel(w.visaExpiry);
                      return (
                        <div key={w.id} className="flex items-center justify-between bg-red-50 rounded-lg px-4 py-3">
                          <div>
                            <p className="text-sm font-bold text-gray-900">
                              {w.name}{w.nickname && <span className="ml-1 text-xs text-gray-500 font-normal">({w.nickname})</span>}
                            </p>
                            <p className="text-xs text-gray-500 mt-0.5">{w.nationality} · {w.visaType || "비자타입 미입력"}</p>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-gray-500 font-mono">{w.visaExpiry.slice(0, 10)}</span>
                            <span className={`text-xs font-bold px-2 py-1 rounded-full ${color}`}>{label}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {safe.length > 0 && (
                <div className="p-5">
                  <p className="text-xs font-bold text-green-600 mb-3 flex items-center gap-1">
                    <CheckCircle size={13} /> 3개월 이후 만료
                  </p>
                  <div className="space-y-2">
                    {safe.map((w: any) => {
                      const diff = Math.floor((new Date(w.visaExpiry).getTime() - today.getTime()) / 86400000);
                      return (
                        <div key={w.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-2.5">
                          <div>
                            <p className="text-sm font-semibold text-gray-800">
                              {w.name}{w.nickname && <span className="ml-1 text-xs text-gray-400 font-normal">({w.nickname})</span>}
                            </p>
                            <p className="text-xs text-gray-400">{w.nationality} · {w.visaType || "-"}</p>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-gray-400 font-mono">{w.visaExpiry.slice(0, 10)}</span>
                            <span className="text-xs text-green-600 font-semibold flex items-center gap-1"><Clock size={11} /> D-{diff}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )
        )}
      </div>

      {/* 장비 검사 알림 */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <SectionHeader open={equipOpen} onToggle={toggleEquip}>
          <Wrench size={18} className="text-blue-500" />
          <span className="font-semibold text-gray-800">장비 검사 알림</span>
          {overdueInsp.length > 0 && (
            <span className="ml-1 text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-bold">
              {overdueInsp.length}건 초과
            </span>
          )}
          <Link href="/management/equipment" onClick={e => e.stopPropagation()} className="text-xs text-blue-600 hover:underline ml-2">장비관리 →</Link>
        </SectionHeader>

        {equipOpen && (
          alertInspections.length === 0 ? (
            <div className="py-12 text-center text-gray-400 text-sm">60일 이내 도래하는 검사 항목이 없습니다.</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {overdueInsp.length > 0 && (
                <div className="p-5">
                  <p className="text-xs font-bold text-red-600 mb-3 flex items-center gap-1"><XCircle size={13} /> 검사 기한 초과 — 즉시 조치 필요</p>
                  <div className="space-y-2">
                    {overdueInsp.map((ins: any) => {
                      const { label, color } = inspDDay(ins.nextInspectAt);
                      return (
                        <Link key={ins.id} href={`/management/equipment/${ins.equipment.id}`}
                          className="flex items-center justify-between bg-red-50 rounded-lg px-4 py-3 hover:bg-red-100 transition-colors">
                          <div>
                            <p className="text-sm font-bold text-gray-900">{ins.equipment.name}<span className="ml-1 text-xs text-gray-500 font-normal">— {ins.itemName}</span></p>
                            <p className="text-xs text-gray-500 mt-0.5 font-mono">{ins.equipment.code}</p>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-gray-500 font-mono">{ins.nextInspectAt.slice(0, 10)}</span>
                            <span className={`text-xs font-bold px-2 py-1 rounded-full ${color}`}>{label}</span>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              )}
              {upcomingInsp.length > 0 && (
                <div className="p-5">
                  <p className="text-xs font-bold text-orange-600 mb-3 flex items-center gap-1"><MinusCircle size={13} /> 60일 이내 도래</p>
                  <div className="space-y-2">
                    {upcomingInsp.map((ins: any) => {
                      const { label, color } = inspDDay(ins.nextInspectAt);
                      return (
                        <Link key={ins.id} href={`/management/equipment/${ins.equipment.id}`}
                          className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-2.5 hover:bg-gray-100 transition-colors">
                          <div>
                            <p className="text-sm font-semibold text-gray-800">{ins.equipment.name}<span className="ml-1 text-xs text-gray-400 font-normal">— {ins.itemName}</span></p>
                            <p className="text-xs text-gray-400 font-mono">{ins.equipment.code}</p>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-gray-400 font-mono">{ins.nextInspectAt.slice(0, 10)}</span>
                            <span className={`text-xs font-bold px-2 py-1 rounded-full ${color}`}>{label}</span>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )
        )}
      </div>

      {/* 운송관리 알림 */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <SectionHeader open={transportOpen} onToggle={toggleTransport}>
          <Truck size={18} className="text-purple-500" />
          <span className="font-semibold text-gray-800">운송관리 알림</span>
          {overdueTransportInsp.length > 0 && (
            <span className="ml-1 text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-bold">
              {overdueTransportInsp.length}건 초과
            </span>
          )}
          <Link href="/management/transport" onClick={e => e.stopPropagation()} className="text-xs text-blue-600 hover:underline ml-2">운송관리 →</Link>
        </SectionHeader>

        {transportOpen && (
          transportInspAlerts.length === 0 && combinedConsumables.length === 0 ? (
            <div className="py-12 text-center text-gray-400 text-sm">알림 대상 항목이 없습니다.</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {overdueTransportInsp.length > 0 && (
                <div className="p-5">
                  <p className="text-xs font-bold text-red-600 mb-3 flex items-center gap-1"><XCircle size={13} /> 운송장비 검사 기한 초과</p>
                  <div className="space-y-2">
                    {overdueTransportInsp.map((ins: any) => {
                      const { label, color } = inspDDay(ins.nextInspectAt);
                      return (
                        <Link key={ins.id} href={`/management/transport/${ins.vehicle.id}`}
                          className="flex items-center justify-between bg-red-50 rounded-lg px-4 py-3 hover:bg-red-100 transition-colors">
                          <div>
                            <p className="text-sm font-bold text-gray-900">{ins.vehicle.name}<span className="ml-1 text-xs text-gray-500 font-normal">— {ins.itemName}</span></p>
                            <p className="text-xs text-gray-500 mt-0.5 font-mono">{ins.vehicle.code}</p>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-gray-500 font-mono">{ins.nextInspectAt.slice(0, 10)}</span>
                            <span className={`text-xs font-bold px-2 py-1 rounded-full ${color}`}>{label}</span>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              )}
              {upcomingTransportInsp.length > 0 && (
                <div className="p-5">
                  <p className="text-xs font-bold text-orange-600 mb-3 flex items-center gap-1"><MinusCircle size={13} /> 운송장비 검사 60일 이내 도래</p>
                  <div className="space-y-2">
                    {upcomingTransportInsp.map((ins: any) => {
                      const { label, color } = inspDDay(ins.nextInspectAt);
                      return (
                        <Link key={ins.id} href={`/management/transport/${ins.vehicle.id}`}
                          className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-2.5 hover:bg-gray-100 transition-colors">
                          <div>
                            <p className="text-sm font-semibold text-gray-800">{ins.vehicle.name}<span className="ml-1 text-xs text-gray-400 font-normal">— {ins.itemName}</span></p>
                            <p className="text-xs text-gray-400 font-mono">{ins.vehicle.code}</p>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-gray-400 font-mono">{ins.nextInspectAt.slice(0, 10)}</span>
                            <span className={`text-xs font-bold px-2 py-1 rounded-full ${color}`}>{label}</span>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              )}
              {combinedConsumables.length > 0 && (
                <div className="p-5">
                  <p className="text-xs font-bold text-yellow-700 mb-3 flex items-center gap-1"><AlertTriangle size={13} /> 일반차량 소모품 교체 임박</p>
                  <div className="space-y-2">
                    {combinedConsumables.map((c: any) => {
                      const remaining = c.vehicle.mileage != null && c.nextReplaceMileage != null
                        ? c.nextReplaceMileage - c.vehicle.mileage : null;
                      const isKmOverdue = remaining != null && remaining < 0;
                      const badgeColor = isKmOverdue ? "text-red-700 bg-red-100" : remaining != null && remaining <= 500 ? "text-orange-700 bg-orange-100" : "text-yellow-700 bg-yellow-100";
                      return (
                        <Link key={c.id} href={`/management/transport/${c.vehicle.id}`}
                          className="flex items-center justify-between bg-yellow-50 rounded-lg px-4 py-2.5 hover:bg-yellow-100 transition-colors">
                          <div>
                            <p className="text-sm font-semibold text-gray-800">{c.vehicle.name}<span className="ml-1 text-xs text-gray-400 font-normal">— {c.itemName}</span></p>
                            <p className="text-xs text-gray-400 font-mono">{c.vehicle.code}</p>
                          </div>
                          <div className="flex items-center gap-3">
                            {remaining != null && (
                              <span className={`text-xs font-bold px-2 py-1 rounded-full ${badgeColor}`}>
                                {remaining < 0 ? `${Math.abs(remaining).toLocaleString()}km 초과` : `${remaining.toLocaleString()}km 남음`}
                              </span>
                            )}
                            {c.nextReplaceAt && (
                              <span className="text-xs text-gray-400 font-mono">{c.nextReplaceAt.slice(0, 10)}</span>
                            )}
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )
        )}
      </div>
    </div>
  );
}

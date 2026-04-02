export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { LayoutDashboard, AlertTriangle, Clock, CheckCircle, Wrench, XCircle, MinusCircle, Truck } from "lucide-react";
import Link from "next/link";

export default async function ManagementDashboardPage() {
  const today = new Date();
  const in90days = new Date(today.getTime() + 90 * 86400000);
  const in60days = new Date(today.getTime() + 60 * 86400000);
  const in30days = new Date(today.getTime() + 30 * 86400000);

  // 장비 검사 알림: 다음 검사 예정일이 60일 이내인 항목
  const alertInspections = await prisma.mgmtInspectionItem.findMany({
    where: { nextInspectAt: { not: null, lte: in60days } },
    orderBy: { nextInspectAt: "asc" },
    include: { equipment: { select: { id: true, name: true, code: true } } },
  });

  function inspDDay(d: Date) {
    const diff = Math.floor((d.getTime() - today.getTime()) / 86400000);
    if (diff < 0)  return { label: `D+${Math.abs(diff)}`, color: "text-red-700 bg-red-100" };
    if (diff === 0) return { label: "D-day",              color: "text-red-700 bg-red-100" };
    if (diff <= 30) return { label: `D-${diff}`,          color: "text-orange-700 bg-orange-100" };
    return           { label: `D-${diff}`,                color: "text-yellow-700 bg-yellow-100" };
  }

  // 초과(overdue) 먼저, 그다음 임박/주의 날짜 오름차순
  const overdueInsp  = alertInspections.filter(i => i.nextInspectAt! < today);
  const upcomingInsp = alertInspections.filter(i => i.nextInspectAt! >= today);

  // ── 운송관리 알림 ────────────────────────────────────────────
  // 운송장비: 검사 30일 이내
  const transportInspAlerts = await prisma.transportInspectionItem.findMany({
    where: { nextInspectAt: { not: null, lte: in60days } },
    orderBy: { nextInspectAt: "asc" },
    include: { vehicle: { select: { id: true, name: true, code: true } } },
  });

  // 일반차량: 소모품 교체 30일 이내 (기간 기준)
  const consumableAlerts = await prisma.transportConsumable.findMany({
    where: {
      OR: [
        { nextReplaceAt: { not: null, lte: in30days } },
      ],
    },
    orderBy: { nextReplaceAt: "asc" },
    include: { vehicle: { select: { id: true, name: true, code: true, mileage: true } } },
  });

  // 일반차량 주행거리 기준 소모품 알림 (nextReplaceMileage <= currentMileage + 1000)
  const allConsumables = await prisma.transportConsumable.findMany({
    where: { nextReplaceMileage: { not: null } },
    include: { vehicle: { select: { id: true, name: true, code: true, mileage: true } } },
  });
  const mileageAlerts = allConsumables.filter(c => {
    if (c.vehicle.mileage == null || c.nextReplaceMileage == null) return false;
    return c.nextReplaceMileage - c.vehicle.mileage <= 1000;
  });

  // 합산 (중복 제거: 같은 consumableId)
  const consumableAlertIds = new Set(consumableAlerts.map(c => c.id));
  const combinedConsumables = [
    ...consumableAlerts,
    ...mileageAlerts.filter(c => !consumableAlertIds.has(c.id)),
  ];

  const overdueTransportInsp = transportInspAlerts.filter(i => i.nextInspectAt! < today);
  const upcomingTransportInsp = transportInspAlerts.filter(i => i.nextInspectAt! >= today);

  function transportInspDDay(d: Date) {
    const diff = Math.floor((d.getTime() - today.getTime()) / 86400000);
    if (diff < 0)   return { label: `D+${Math.abs(diff)}`, color: "text-red-700 bg-red-100" };
    if (diff === 0) return { label: "D-day",                color: "text-red-700 bg-red-100" };
    if (diff <= 30) return { label: `D-${diff}`,            color: "text-orange-700 bg-orange-100" };
    return            { label: `D-${diff}`,                 color: "text-yellow-700 bg-yellow-100" };
  }

  // 비자만기일이 있는 외국인 전체 (만기일 오름차순)
  const foreignWorkers = await prisma.worker.findMany({
    where: { visaExpiry: { not: null } },
    orderBy: { visaExpiry: "asc" },
    select: { id: true, name: true, nickname: true, nationality: true, visaType: true, visaExpiry: true },
  });

  const expiring = foreignWorkers.filter(w => w.visaExpiry! <= in90days);
  const safe     = foreignWorkers.filter(w => w.visaExpiry! > in90days);

  function dDayLabel(expiry: Date) {
    const diff = Math.floor((expiry.getTime() - today.getTime()) / 86400000);
    if (diff < 0)  return { label: `${Math.abs(diff)}일 초과`, color: "text-red-700 bg-red-100" };
    if (diff === 0) return { label: "오늘 만료", color: "text-red-700 bg-red-100" };
    return { label: `D-${diff}`, color: diff <= 30 ? "text-red-700 bg-red-100" : "text-orange-700 bg-orange-100" };
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <LayoutDashboard size={24} className="text-blue-600" /> 관리 대시보드
        </h2>
        <p className="text-sm text-gray-500 mt-1">관리 파트 현황을 한눈에 확인합니다.</p>
      </div>

      {/* 비자 만기 관리 */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b bg-gray-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle size={18} className="text-orange-500" />
            <span className="font-semibold text-gray-800">외국인 비자 만기 관리</span>
            {expiring.length > 0 && (
              <span className="ml-1 text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-bold">
                {expiring.length}명 주의
              </span>
            )}
          </div>
          <Link href="/management/workers" className="text-xs text-blue-600 hover:underline">인원 관리 →</Link>
        </div>

        {foreignWorkers.length === 0 ? (
          <div className="py-12 text-center text-gray-400 text-sm">
            비자 만기일이 등록된 외국인 인원이 없습니다.
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {/* 3개월 이내 만료 (긴급) */}
            {expiring.length > 0 && (
              <div className="p-5">
                <p className="text-xs font-bold text-red-600 mb-3 flex items-center gap-1">
                  <AlertTriangle size={13} /> 3개월 이내 만료 — 즉시 연장 필요
                </p>
                <div className="space-y-2">
                  {expiring.map(w => {
                    const { label, color } = dDayLabel(w.visaExpiry!);
                    return (
                      <div key={w.id} className="flex items-center justify-between bg-red-50 rounded-lg px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div>
                            <p className="text-sm font-bold text-gray-900">
                              {w.name}
                              {w.nickname && <span className="ml-1 text-xs text-gray-500 font-normal">({w.nickname})</span>}
                            </p>
                            <p className="text-xs text-gray-500 mt-0.5">
                              {w.nationality} · {w.visaType || "비자타입 미입력"}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-gray-500 font-mono">
                            {w.visaExpiry!.toISOString().slice(0, 10)}
                          </span>
                          <span className={`text-xs font-bold px-2 py-1 rounded-full ${color}`}>
                            {label}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 3개월 이후 만료 (안전) */}
            {safe.length > 0 && (
              <div className="p-5">
                <p className="text-xs font-bold text-green-600 mb-3 flex items-center gap-1">
                  <CheckCircle size={13} /> 3개월 이후 만료
                </p>
                <div className="space-y-2">
                  {safe.map(w => {
                    const diff = Math.floor((w.visaExpiry!.getTime() - today.getTime()) / 86400000);
                    return (
                      <div key={w.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-2.5">
                        <div>
                          <p className="text-sm font-semibold text-gray-800">
                            {w.name}
                            {w.nickname && <span className="ml-1 text-xs text-gray-400 font-normal">({w.nickname})</span>}
                          </p>
                          <p className="text-xs text-gray-400">{w.nationality} · {w.visaType || "-"}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-gray-400 font-mono">{w.visaExpiry!.toISOString().slice(0, 10)}</span>
                          <span className="text-xs text-green-600 font-semibold flex items-center gap-1">
                            <Clock size={11} /> D-{diff}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      {/* 장비 검사 알림 위젯 */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b bg-gray-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wrench size={18} className="text-blue-500" />
            <span className="font-semibold text-gray-800">장비 검사 알림</span>
            {overdueInsp.length > 0 && (
              <span className="ml-1 text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-bold">
                {overdueInsp.length}건 초과
              </span>
            )}
          </div>
          <Link href="/management/equipment" className="text-xs text-blue-600 hover:underline">장비관리 →</Link>
        </div>

        {alertInspections.length === 0 ? (
          <div className="py-12 text-center text-gray-400 text-sm">
            60일 이내 도래하는 검사 항목이 없습니다.
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {/* 초과 항목 */}
            {overdueInsp.length > 0 && (
              <div className="p-5">
                <p className="text-xs font-bold text-red-600 mb-3 flex items-center gap-1">
                  <XCircle size={13} /> 검사 기한 초과 — 즉시 조치 필요
                </p>
                <div className="space-y-2">
                  {overdueInsp.map(ins => {
                    const { label, color } = inspDDay(ins.nextInspectAt!);
                    return (
                      <Link
                        key={ins.id}
                        href={`/management/equipment/${ins.equipment.id}`}
                        className="flex items-center justify-between bg-red-50 rounded-lg px-4 py-3 hover:bg-red-100 transition-colors"
                      >
                        <div>
                          <p className="text-sm font-bold text-gray-900">
                            {ins.equipment.name}
                            <span className="ml-1 text-xs text-gray-500 font-normal">— {ins.itemName}</span>
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5 font-mono">{ins.equipment.code}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-gray-500 font-mono">
                            {ins.nextInspectAt!.toISOString().slice(0, 10)}
                          </span>
                          <span className={`text-xs font-bold px-2 py-1 rounded-full ${color}`}>{label}</span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 임박/주의 항목 */}
            {upcomingInsp.length > 0 && (
              <div className="p-5">
                <p className="text-xs font-bold text-orange-600 mb-3 flex items-center gap-1">
                  <MinusCircle size={13} /> 60일 이내 도래
                </p>
                <div className="space-y-2">
                  {upcomingInsp.map(ins => {
                    const { label, color } = inspDDay(ins.nextInspectAt!);
                    return (
                      <Link
                        key={ins.id}
                        href={`/management/equipment/${ins.equipment.id}`}
                        className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-2.5 hover:bg-gray-100 transition-colors"
                      >
                        <div>
                          <p className="text-sm font-semibold text-gray-800">
                            {ins.equipment.name}
                            <span className="ml-1 text-xs text-gray-400 font-normal">— {ins.itemName}</span>
                          </p>
                          <p className="text-xs text-gray-400 font-mono">{ins.equipment.code}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-gray-400 font-mono">
                            {ins.nextInspectAt!.toISOString().slice(0, 10)}
                          </span>
                          <span className={`text-xs font-bold px-2 py-1 rounded-full ${color}`}>{label}</span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      {/* 운송관리 알림 위젯 */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b bg-gray-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Truck size={18} className="text-purple-500" />
            <span className="font-semibold text-gray-800">운송관리 알림</span>
            {(overdueTransportInsp.length > 0) && (
              <span className="ml-1 text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-bold">
                {overdueTransportInsp.length}건 초과
              </span>
            )}
          </div>
          <Link href="/management/transport" className="text-xs text-blue-600 hover:underline">운송관리 →</Link>
        </div>

        {transportInspAlerts.length === 0 && combinedConsumables.length === 0 ? (
          <div className="py-12 text-center text-gray-400 text-sm">
            알림 대상 항목이 없습니다.
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {/* 운송장비 검사 초과 */}
            {overdueTransportInsp.length > 0 && (
              <div className="p-5">
                <p className="text-xs font-bold text-red-600 mb-3 flex items-center gap-1">
                  <XCircle size={13} /> 운송장비 검사 기한 초과
                </p>
                <div className="space-y-2">
                  {overdueTransportInsp.map(ins => {
                    const { label, color } = transportInspDDay(ins.nextInspectAt!);
                    return (
                      <Link key={ins.id} href={`/management/transport/${ins.vehicle.id}`}
                        className="flex items-center justify-between bg-red-50 rounded-lg px-4 py-3 hover:bg-red-100 transition-colors">
                        <div>
                          <p className="text-sm font-bold text-gray-900">{ins.vehicle.name}
                            <span className="ml-1 text-xs text-gray-500 font-normal">— {ins.itemName}</span>
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5 font-mono">{ins.vehicle.code}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-gray-500 font-mono">{ins.nextInspectAt!.toISOString().slice(0, 10)}</span>
                          <span className={`text-xs font-bold px-2 py-1 rounded-full ${color}`}>{label}</span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}
            {/* 운송장비 검사 임박 */}
            {upcomingTransportInsp.length > 0 && (
              <div className="p-5">
                <p className="text-xs font-bold text-orange-600 mb-3 flex items-center gap-1">
                  <MinusCircle size={13} /> 운송장비 검사 60일 이내 도래
                </p>
                <div className="space-y-2">
                  {upcomingTransportInsp.map(ins => {
                    const { label, color } = transportInspDDay(ins.nextInspectAt!);
                    return (
                      <Link key={ins.id} href={`/management/transport/${ins.vehicle.id}`}
                        className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-2.5 hover:bg-gray-100 transition-colors">
                        <div>
                          <p className="text-sm font-semibold text-gray-800">{ins.vehicle.name}
                            <span className="ml-1 text-xs text-gray-400 font-normal">— {ins.itemName}</span>
                          </p>
                          <p className="text-xs text-gray-400 font-mono">{ins.vehicle.code}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-gray-400 font-mono">{ins.nextInspectAt!.toISOString().slice(0, 10)}</span>
                          <span className={`text-xs font-bold px-2 py-1 rounded-full ${color}`}>{label}</span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}
            {/* 일반차량 소모품 교체 임박 */}
            {combinedConsumables.length > 0 && (
              <div className="p-5">
                <p className="text-xs font-bold text-yellow-700 mb-3 flex items-center gap-1">
                  <AlertTriangle size={13} /> 일반차량 소모품 교체 임박
                </p>
                <div className="space-y-2">
                  {combinedConsumables.map(c => {
                    const remaining = c.vehicle.mileage != null && c.nextReplaceMileage != null
                      ? c.nextReplaceMileage - c.vehicle.mileage : null;
                    const isKmOverdue = remaining != null && remaining < 0;
                    const badgeColor = isKmOverdue ? "text-red-700 bg-red-100" : remaining != null && remaining <= 500 ? "text-orange-700 bg-orange-100" : "text-yellow-700 bg-yellow-100";
                    return (
                      <Link key={c.id} href={`/management/transport/${c.vehicle.id}`}
                        className="flex items-center justify-between bg-yellow-50 rounded-lg px-4 py-2.5 hover:bg-yellow-100 transition-colors">
                        <div>
                          <p className="text-sm font-semibold text-gray-800">{c.vehicle.name}
                            <span className="ml-1 text-xs text-gray-400 font-normal">— {c.itemName}</span>
                          </p>
                          <p className="text-xs text-gray-400 font-mono">{c.vehicle.code}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          {remaining != null && (
                            <span className={`text-xs font-bold px-2 py-1 rounded-full ${badgeColor}`}>
                              {remaining < 0 ? `${Math.abs(remaining).toLocaleString()}km 초과` : `${remaining.toLocaleString()}km 남음`}
                            </span>
                          )}
                          {c.nextReplaceAt && (
                            <span className="text-xs text-gray-400 font-mono">{c.nextReplaceAt.toISOString().slice(0, 10)}</span>
                          )}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

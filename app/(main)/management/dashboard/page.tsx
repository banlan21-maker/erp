export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { LayoutDashboard, AlertTriangle, Clock, CheckCircle } from "lucide-react";
import Link from "next/link";

export default async function ManagementDashboardPage() {
  const today = new Date();
  const in90days = new Date(today.getTime() + 90 * 86400000);

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
    </div>
  );
}

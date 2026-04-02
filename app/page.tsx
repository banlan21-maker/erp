import { prisma } from "@/lib/prisma";
import Link from "next/link";
import {
  Scissors, Package, Settings,
  AlertTriangle, XCircle, Clock, ChevronRight,
} from "lucide-react";
import NoticeSection from "@/components/notice-section";

export const dynamic = "force-dynamic";

export default async function LandingPage() {
  const today = new Date();
  const in30days = new Date(today.getTime() + 30 * 86400000);
  const in60days = new Date(today.getTime() + 60 * 86400000);

  // ── 알림 현황 데이터 ──────────────────────────────────────────
  const [
    notices,
    managementNotices,
    overdueEquipInsp,
    upcomingEquipInsp,
    overdueTransInsp,
    visaExpiringWorkers,
    consumableAlerts,
  ] = await Promise.all([
    // 공지사항
    prisma.notice.findMany({
      where: { category: "NOTICE" },
      orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
    }),
    // 경영진 전달사항
    prisma.notice.findMany({
      where: { category: "MANAGEMENT" },
      orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
    }),
    // 장비 검사 초과
    prisma.mgmtInspectionItem.findMany({
      where: { nextInspectAt: { lt: today } },
      include: { equipment: { select: { name: true } } },
    }),
    // 장비 검사 60일 이내
    prisma.mgmtInspectionItem.findMany({
      where: { nextInspectAt: { gte: today, lte: in60days } },
    }),
    // 운송장비 검사 초과
    prisma.transportInspectionItem.findMany({
      where: { nextInspectAt: { lt: today } },
      include: { vehicle: { select: { name: true } } },
    }),
    // 비자 만료 30일 이내
    prisma.worker.findMany({
      where: { visaExpiry: { not: null, lte: in30days } },
      select: { id: true, name: true, visaExpiry: true },
    }),
    // 소모품 교체 30일 이내 (기간 기준)
    prisma.transportConsumable.findMany({
      where: { nextReplaceAt: { not: null, lte: in30days } },
      include: { vehicle: { select: { name: true } } },
    }),
  ]);

  // 날짜 직렬화
  const serializedNotices = notices.map(n => ({
    ...n,
    createdAt: n.createdAt.toISOString(),
    updatedAt: n.updatedAt.toISOString(),
  }));
  const serializedMgmt = managementNotices.map(n => ({
    ...n,
    createdAt: n.createdAt.toISOString(),
    updatedAt: n.updatedAt.toISOString(),
  }));

  // 알림 총계
  const alertTotal =
    overdueEquipInsp.length +
    upcomingEquipInsp.length +
    overdueTransInsp.length +
    visaExpiringWorkers.filter(w => w.visaExpiry! <= in30days).length +
    consumableAlerts.length;

  const overdueTotal = overdueEquipInsp.length + overdueTransInsp.length;

  // 날짜 포맷
  const dateStr = today.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "long" });

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* ── GNB ── */}
      <header className="h-14 bg-white border-b border-gray-200 sticky top-0 z-40 shadow-sm">
        <div className="max-w-6xl mx-auto h-full flex items-center justify-between px-6">
          {/* 로고 (홈 링크) */}
          <Link
            href="/"
            className="font-bold text-[19px] tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-blue-700 to-blue-500 hover:opacity-80 transition-opacity"
          >
            한국테크 ERP 시스템
          </Link>

          {/* 파트 네비게이션 */}
          <nav className="flex items-center gap-1 h-14">
            <Link href="/cutpart/dashboard" className="px-4 h-full flex items-center text-sm font-semibold text-gray-500 hover:text-gray-900 hover:bg-gray-50 transition-colors">
              절단 파트
            </Link>
            <Link href="/supply/dashboard" className="px-4 h-full flex items-center text-sm font-semibold text-gray-500 hover:text-gray-900 hover:bg-gray-50 transition-colors">
              구매/자재 파트
            </Link>
            <Link href="/management/dashboard" className="px-4 h-full flex items-center text-sm font-semibold text-gray-500 hover:text-gray-900 hover:bg-gray-50 transition-colors">
              관리 파트
            </Link>
          </nav>

          {/* 날짜 */}
          <p className="text-xs text-gray-500 hidden md:block">{dateStr}</p>
        </div>
      </header>

      {/* ── 본문 ── */}
      <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-8 space-y-8">

        {/* ── 파트 바로가기 카드 ── */}
        <div className="grid grid-cols-3 gap-4">
          <Link href="/cutpart/dashboard" className="group bg-white border border-gray-200 rounded-2xl p-6 hover:border-blue-400 hover:shadow-md transition-all">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center group-hover:bg-blue-100 transition-colors">
                <Scissors size={20} className="text-blue-600" />
              </div>
              <ChevronRight size={16} className="text-gray-300 group-hover:text-blue-400 transition-colors" />
            </div>
            <p className="font-bold text-gray-900 text-base">절단 파트</p>
            <p className="text-xs text-gray-500 mt-1">프로젝트 · 강재관리 · 작업일보 · 스케줄 · 보고서</p>
          </Link>

          <Link href="/supply/dashboard" className="group bg-white border border-gray-200 rounded-2xl p-6 hover:border-emerald-400 hover:shadow-md transition-all">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center group-hover:bg-emerald-100 transition-colors">
                <Package size={20} className="text-emerald-600" />
              </div>
              <ChevronRight size={16} className="text-gray-300 group-hover:text-emerald-400 transition-colors" />
            </div>
            <p className="font-bold text-gray-900 text-base">구매/자재 파트</p>
            <p className="text-xs text-gray-500 mt-1">재고관리 · 입출고 · 월별 사용량 · 거래처</p>
          </Link>

          <Link href="/management/dashboard" className="group bg-white border border-gray-200 rounded-2xl p-6 hover:border-purple-400 hover:shadow-md transition-all">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center group-hover:bg-purple-100 transition-colors">
                <Settings size={20} className="text-purple-600" />
              </div>
              <ChevronRight size={16} className="text-gray-300 group-hover:text-purple-400 transition-colors" />
            </div>
            <p className="font-bold text-gray-900 text-base">관리 파트</p>
            <p className="text-xs text-gray-500 mt-1">인원 · 조직도 · 비상연락망 · 장비 · 운송</p>
          </Link>
        </div>

        {/* ── 통합 알림 현황 (초과/임박 있을 때만) ── */}
        {alertTotal > 0 && (
          <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
              {overdueTotal > 0
                ? <XCircle size={16} className="text-red-500" />
                : <AlertTriangle size={16} className="text-orange-500" />}
              <span className="font-bold text-gray-900">통합 알림 현황</span>
              {overdueTotal > 0 && (
                <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-bold">{overdueTotal}건 초과</span>
              )}
            </div>
            <div className="px-5 py-4 flex flex-wrap gap-4">
              {overdueEquipInsp.length > 0 && (
                <Link href="/management/equipment" className="flex items-center gap-2 text-sm px-4 py-2.5 bg-red-50 border border-red-200 rounded-xl hover:bg-red-100 transition-colors">
                  <XCircle size={14} className="text-red-600" />
                  <span className="font-semibold text-red-700">장비 검사 초과</span>
                  <span className="text-red-600 font-bold">{overdueEquipInsp.length}건</span>
                </Link>
              )}
              {overdueTransInsp.length > 0 && (
                <Link href="/management/transport" className="flex items-center gap-2 text-sm px-4 py-2.5 bg-red-50 border border-red-200 rounded-xl hover:bg-red-100 transition-colors">
                  <XCircle size={14} className="text-red-600" />
                  <span className="font-semibold text-red-700">운송장비 검사 초과</span>
                  <span className="text-red-600 font-bold">{overdueTransInsp.length}건</span>
                </Link>
              )}
              {upcomingEquipInsp.length > 0 && (
                <Link href="/management/equipment" className="flex items-center gap-2 text-sm px-4 py-2.5 bg-orange-50 border border-orange-200 rounded-xl hover:bg-orange-100 transition-colors">
                  <Clock size={14} className="text-orange-600" />
                  <span className="font-semibold text-orange-700">장비 검사 임박</span>
                  <span className="text-orange-600 font-bold">{upcomingEquipInsp.length}건</span>
                </Link>
              )}
              {visaExpiringWorkers.length > 0 && (
                <Link href="/management/workers" className="flex items-center gap-2 text-sm px-4 py-2.5 bg-yellow-50 border border-yellow-200 rounded-xl hover:bg-yellow-100 transition-colors">
                  <AlertTriangle size={14} className="text-yellow-600" />
                  <span className="font-semibold text-yellow-700">비자 만료 임박</span>
                  <span className="text-yellow-600 font-bold">{visaExpiringWorkers.length}명</span>
                </Link>
              )}
              {consumableAlerts.length > 0 && (
                <Link href="/management/transport" className="flex items-center gap-2 text-sm px-4 py-2.5 bg-yellow-50 border border-yellow-200 rounded-xl hover:bg-yellow-100 transition-colors">
                  <AlertTriangle size={14} className="text-yellow-600" />
                  <span className="font-semibold text-yellow-700">소모품 교체 임박</span>
                  <span className="text-yellow-600 font-bold">{consumableAlerts.length}건</span>
                </Link>
              )}
            </div>
          </div>
        )}

        {/* ── 공지사항 + 경영진 전달사항 ── */}
        <div className="grid grid-cols-2 gap-6">
          <NoticeSection
            category="NOTICE"
            initialNotices={serializedNotices}
            title="공지사항"
            accentColor="blue"
          />
          <NoticeSection
            category="MANAGEMENT"
            initialNotices={serializedMgmt}
            title="경영진 · 관리자 전달사항"
            accentColor="purple"
          />
        </div>
      </main>

      {/* ── 푸터 ── */}
      <footer className="border-t border-gray-200 bg-white">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <p className="text-xs text-gray-400">한국테크 ERP 시스템 · CNC 절단 파트</p>
          <p className="text-xs text-gray-400">관리자 : 김남훈 · 010-9704-5626</p>
        </div>
      </footer>
    </div>
  );
}

import { prisma } from "@/lib/prisma";
import Link from "next/link";
import {
  Scissors, Package, Settings,
  AlertTriangle, XCircle, Clock, ChevronRight, HardHat, History,
} from "lucide-react";
import NoticeSection from "@/components/notice-section";
import WeatherBar from "@/components/weather-bar";

export const dynamic = "force-dynamic";

export default async function LandingPage() {
  const today = new Date();
  const in30days = new Date(today.getTime() + 30 * 86400000);
  const in60days = new Date(today.getTime() + 60 * 86400000);
  const in90days = new Date(today.getTime() + 90 * 86400000);

  // 최근 일주일(어제까지 7일) — KST 기준
  const kstTodayStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
  const kstYesterdayEnd = new Date(`${kstTodayStr}T00:00:00+09:00`); // 어제 자정 직전 = 오늘 자정 KST
  const kst7DaysAgoStart = new Date(kstYesterdayEnd.getTime() - 7 * 86400000); // 6일 전 자정 KST
  // (7일 범위 = 6일 전 자정 ~ 어제 23:59:59)

  const [
    notices,
    managementNotices,
    overdueEquipInsp,
    upcomingEquipInsp,
    overdueTransInsp,
    visaExpiringWorkers,
    consumableAlerts,
    activeEquipment,
    startedLogs,
    consumables,
    visaIn90,
    weeklyCutLogs,
  ] = await Promise.all([
    prisma.notice.findMany({
      where: { category: "NOTICE" },
      orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
    }),
    prisma.notice.findMany({
      where: { category: "MANAGEMENT" },
      orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
    }),
    prisma.mgmtInspectionItem.findMany({
      where: { nextInspectAt: { lt: today } },
      include: { equipment: { select: { name: true } } },
    }),
    prisma.mgmtInspectionItem.findMany({
      where: { nextInspectAt: { gte: today, lte: in60days } },
    }),
    prisma.transportInspectionItem.findMany({
      where: { nextInspectAt: { lt: today } },
      include: { vehicle: { select: { name: true } } },
    }),
    // 비자 만료 30일 이내 — 통합 알림용
    prisma.worker.findMany({
      where: { visaExpiry: { not: null, lte: in30days } },
      select: { id: true, name: true, visaExpiry: true },
    }),
    // 소모품 교체 30일 이내 (기간 기준)
    prisma.transportConsumable.findMany({
      where: { nextReplaceAt: { not: null, lte: in30days } },
      include: { vehicle: { select: { name: true } } },
    }),
    // 활성 장비 목록
    prisma.equipment.findMany({
      where: { status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, type: true },
    }),
    // 진행중(STARTED) 작업 — 장비별로 최신 1건씩 매칭
    prisma.cuttingLog.findMany({
      where: { status: "STARTED" },
      include: {
        project:     { select: { projectCode: true } },
        drawingList: { select: { block: true } },
      },
      orderBy: { startAt: "desc" },
    }),
    // 발주 필요 판정용 — 소모품 + reorderPoint 설정된 것
    prisma.supplyItem.findMany({
      where: { category: "CONSUMABLE", reorderPoint: { not: null } },
      select: { id: true, name: true, stockQty: true, reorderPoint: true, unit: true },
    }),
    // 비자 만기 90일(3개월) 이내 — 카드용 상세 목록
    prisma.worker.findMany({
      where: { visaExpiry: { not: null, lte: in90days } },
      select: { id: true, name: true, nationality: true, visaExpiry: true },
      orderBy: { visaExpiry: "asc" },
    }),
    // 최근 일주일 정규작업 절단 완료 (어제까지) — 호선/블록 unique 표시용
    prisma.cuttingLog.findMany({
      where: {
        isUrgent: false,
        status:   "COMPLETED",
        startAt:  { gte: kst7DaysAgoStart, lt: kstYesterdayEnd },
      },
      include: {
        project:     { select: { projectCode: true } },
        drawingList: { select: { block: true } },
      },
    }),
  ]);

  // ── 최근 일주일 절단 호선/블록 (unique) ────────────────────────────
  const weeklyPairs = (() => {
    const seen = new Set<string>();
    const list: string[] = [];
    for (const log of weeklyCutLogs) {
      const vessel = log.project?.projectCode ?? "";
      const block  = log.drawingList?.block ?? "";
      if (!vessel && !block) continue;
      const key = `${vessel}-${block}`;
      if (seen.has(key)) continue;
      seen.add(key);
      list.push(block ? `${vessel}-${block}` : vessel);
    }
    return list;
  })();
  const fmtMdKst = (d: Date) =>
    new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric" }).format(d);
  const weeklyRangeLabel = `${fmtMdKst(kst7DaysAgoStart)}~${fmtMdKst(new Date(kstYesterdayEnd.getTime() - 86400000))} 진행상황`;

  // ── 정보 카드 데이터 가공 ────────────────────────────────────────────
  const equipmentWork = activeEquipment.map(eq => {
    const log = startedLogs.find(l => l.equipmentId === eq.id);
    return {
      id: eq.id,
      name: eq.name,
      type: eq.type as "PLASMA" | "GAS",
      vessel: log?.project?.projectCode ?? null,
      block:  log?.drawingList?.block ?? null,
    };
  });

  const reorderNeeded = consumables
    .filter(it => it.stockQty <= (it.reorderPoint ?? 0))
    .sort((a, b) => {
      const ra = a.stockQty / Math.max(a.reorderPoint ?? 1, 1);
      const rb = b.stockQty / Math.max(b.reorderPoint ?? 1, 1);
      return ra - rb;
    })
    .slice(0, 5);

  const visaList = visaIn90.map(w => {
    const daysLeft = Math.floor((new Date(w.visaExpiry!).getTime() - today.getTime()) / 86400000);
    return {
      id: w.id,
      name: w.name,
      nationality: w.nationality ?? "",
      visaExpiry: w.visaExpiry!.toISOString().slice(0, 10),
      daysLeft,
    };
  }).slice(0, 5);

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
    visaExpiringWorkers.length +
    consumableAlerts.length;

  const overdueTotal = overdueEquipInsp.length + overdueTransInsp.length;

  const dateStr = today.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "long" });

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* ── GNB ── 모바일: 2줄 (로고 / 네비) · md↑: 1줄 ── */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40 shadow-sm">
        <div className="max-w-6xl mx-auto px-3 sm:px-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between md:h-14 py-1.5 md:py-0">
            {/* 로고 */}
            <Link
              href="/"
              className="font-bold text-base sm:text-lg md:text-[19px] tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-blue-700 to-blue-500 hover:opacity-80 transition-opacity text-center md:text-left py-1 md:py-0"
            >
              한국테크 ERP 시스템
            </Link>

            {/* 파트 네비 — 모바일: 가로 등분 + 윗줄 구분선 · md↑: 우측 정렬 */}
            <nav className="flex items-stretch justify-around md:justify-end md:gap-1 md:h-14 border-t border-gray-100 md:border-0 mt-1 md:mt-0 -mx-3 sm:-mx-6 md:mx-0">
              <Link
                href="/cutpart/dashboard"
                className="flex-1 md:flex-initial px-2 md:px-4 py-2 md:h-full flex items-center justify-center text-[13px] sm:text-sm font-semibold text-gray-600 hover:text-blue-700 hover:bg-blue-50 active:bg-blue-100 transition-colors"
              >
                절단 파트
              </Link>
              <Link
                href="/supply/dashboard"
                className="flex-1 md:flex-initial px-2 md:px-4 py-2 md:h-full flex items-center justify-center text-[13px] sm:text-sm font-semibold text-gray-600 hover:text-emerald-700 hover:bg-emerald-50 active:bg-emerald-100 transition-colors"
              >
                구매/자재 파트
              </Link>
              <Link
                href="/management/dashboard"
                className="flex-1 md:flex-initial px-2 md:px-4 py-2 md:h-full flex items-center justify-center text-[13px] sm:text-sm font-semibold text-gray-600 hover:text-purple-700 hover:bg-purple-50 active:bg-purple-100 transition-colors"
              >
                관리 파트
              </Link>
            </nav>

            {/* 날짜 (lg↑만) */}
            <p className="text-xs text-gray-500 hidden lg:block">{dateStr}</p>
          </div>
        </div>
      </header>

      {/* ── 본문 ── */}
      <main className="flex-1 max-w-6xl mx-auto w-full px-3 sm:px-6 py-4 sm:py-6 space-y-4 sm:space-y-6">

        {/* 공지사항 + 경영진 — 최상단 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
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

        {/* 최근 일주일 절단 진행상황 (어제까지) */}
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-4 sm:px-5 py-3 border-b border-gray-100 bg-blue-50/30">
            <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
              <History size={16} className="text-blue-600" />
            </div>
            <div className="min-w-0">
              <p className="font-bold text-gray-900 text-[15px] sm:text-base leading-tight">{weeklyRangeLabel}</p>
              <p className="text-[11px] text-gray-500 mt-0.5">최근 일주일간 절단 완료된 정규작업 호선/블록</p>
            </div>
            <span className="ml-auto text-[11px] text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full font-bold">{weeklyPairs.length}건</span>
          </div>
          <div className="px-4 sm:px-5 py-3">
            {weeklyPairs.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-3">최근 일주일 절단 기록 없음</p>
            ) : (
              <ol className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-1 text-[13px] sm:text-sm text-gray-700">
                {weeklyPairs.map((p, i) => (
                  <li key={p} className="flex items-baseline gap-1.5 tabular-nums">
                    <span className="text-gray-400 text-[11px] w-5 text-right">{i + 1}.</span>
                    <span className="font-medium">{p}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>

        {/* 진교·진동 현재 날씨 */}
        <WeatherBar />

        {/* 현장용 링크모음 */}
        <Link
          href="/field"
          className="group flex items-center justify-between bg-gradient-to-r from-slate-900 to-slate-800 text-white rounded-2xl px-4 sm:px-5 py-3.5 sm:py-4 hover:from-slate-800 hover:to-slate-700 transition-all shadow-sm"
        >
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-amber-500/20 flex items-center justify-center shrink-0">
              <HardHat size={20} className="text-amber-300" />
            </div>
            <div className="min-w-0">
              <p className="font-bold text-sm sm:text-base">현장용 링크모음</p>
              <p className="text-[11px] sm:text-xs text-slate-300 mt-0.5 truncate">입출고 · 운행일지 · 시설관리 · 결제관리</p>
            </div>
          </div>
          <ChevronRight size={18} className="text-slate-400 group-hover:text-white group-hover:translate-x-1 transition-all shrink-0" />
        </Link>

        {/* 파트별 핵심 정보 카드 — 모바일 1열 · md 2열 · lg 3열 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">

          {/* 절단 파트 — 장비별 현재 작업 */}
          <Link
            href="/cutpart/dashboard"
            className="group bg-white border border-gray-200 rounded-2xl hover:border-blue-400 hover:shadow-md transition-all flex flex-col overflow-hidden"
          >
            <div className="flex items-center justify-between px-4 sm:px-5 py-3 sm:py-3.5 border-b border-gray-100 bg-blue-50/30">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
                  <Scissors size={17} className="text-blue-600" />
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-gray-900 text-[15px] sm:text-base leading-tight">절단 파트</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">장비별 진행 중인 작업</p>
                </div>
              </div>
              <ChevronRight size={16} className="text-gray-300 group-hover:text-blue-500 transition-colors shrink-0" />
            </div>
            <div className="px-4 sm:px-5 py-3 sm:py-3.5 space-y-2 flex-1">
              {equipmentWork.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-4">등록된 장비 없음</p>
              ) : equipmentWork.map(eq => (
                <div key={eq.id} className="flex items-center justify-between gap-2 text-[13px] sm:text-sm">
                  <span className="text-gray-700 font-medium truncate">{eq.name}</span>
                  {eq.vessel ? (
                    <span className="text-blue-700 font-bold whitespace-nowrap tabular-nums">
                      {eq.vessel}
                      {eq.block && (<><span className="text-gray-300 font-normal mx-1">/</span>{eq.block}</>)}
                    </span>
                  ) : (
                    <span className="text-gray-400 text-[11px] sm:text-xs">대기</span>
                  )}
                </div>
              ))}
            </div>
          </Link>

          {/* 구매/자재 파트 — 발주 필요 품목 */}
          <Link
            href="/supply/dashboard"
            className="group bg-white border border-gray-200 rounded-2xl hover:border-emerald-400 hover:shadow-md transition-all flex flex-col overflow-hidden"
          >
            <div className="flex items-center justify-between px-4 sm:px-5 py-3 sm:py-3.5 border-b border-gray-100 bg-emerald-50/30">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
                  <Package size={17} className="text-emerald-600" />
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-gray-900 text-[15px] sm:text-base leading-tight">구매/자재 파트</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">발주 필요 품목 (재고 ≤ 발주점)</p>
                </div>
              </div>
              <ChevronRight size={16} className="text-gray-300 group-hover:text-emerald-500 transition-colors shrink-0" />
            </div>
            <div className="px-4 sm:px-5 py-3 sm:py-3.5 space-y-2 flex-1">
              {reorderNeeded.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-4">발주 필요 품목 없음</p>
              ) : reorderNeeded.map(it => (
                <div key={it.id} className="flex items-center justify-between gap-2 text-[13px] sm:text-sm">
                  <span className="text-gray-700 font-medium truncate">{it.name}</span>
                  <span className="text-emerald-700 font-bold whitespace-nowrap tabular-nums">
                    {it.stockQty}
                    <span className="text-gray-400 font-normal text-[11px] sm:text-xs"> / {it.reorderPoint}{it.unit ?? ""}</span>
                  </span>
                </div>
              ))}
            </div>
          </Link>

          {/* 관리 파트 — 비자만기 3개월 이내 */}
          <Link
            href="/management/workers"
            className="group bg-white border border-gray-200 rounded-2xl hover:border-purple-400 hover:shadow-md transition-all flex flex-col overflow-hidden md:col-span-2 lg:col-span-1"
          >
            <div className="flex items-center justify-between px-4 sm:px-5 py-3 sm:py-3.5 border-b border-gray-100 bg-purple-50/30">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-purple-100 flex items-center justify-center shrink-0">
                  <Settings size={17} className="text-purple-600" />
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-gray-900 text-[15px] sm:text-base leading-tight">관리 파트</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">외국인 비자만기 3개월 이내</p>
                </div>
              </div>
              <ChevronRight size={16} className="text-gray-300 group-hover:text-purple-500 transition-colors shrink-0" />
            </div>
            <div className="px-4 sm:px-5 py-3 sm:py-3.5 space-y-2 flex-1">
              {visaList.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-4">3개월 내 만기 직원 없음</p>
              ) : visaList.map(w => {
                const expired = w.daysLeft < 0;
                const urgent  = w.daysLeft <= 30;
                return (
                  <div key={w.id} className="flex items-center justify-between gap-2 text-[13px] sm:text-sm">
                    <span className="text-gray-700 font-medium truncate">
                      {w.name}
                      {w.nationality && <span className="text-gray-400 text-[11px] sm:text-xs ml-1">({w.nationality})</span>}
                    </span>
                    <span className={`font-bold whitespace-nowrap tabular-nums ${expired ? "text-red-600" : urgent ? "text-orange-600" : "text-purple-700"}`}>
                      {expired ? `만료 ${Math.abs(w.daysLeft)}일` : `D-${w.daysLeft}`}
                      <span className="text-gray-400 font-normal text-[11px] sm:text-xs ml-1">{w.visaExpiry}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </Link>
        </div>

        {/* ── 통합 알림 현황 ── */}
        {alertTotal > 0 && (
          <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-4 sm:px-5 py-3 sm:py-4 border-b border-gray-100 flex items-center gap-2">
              {overdueTotal > 0
                ? <XCircle size={16} className="text-red-500" />
                : <AlertTriangle size={16} className="text-orange-500" />}
              <span className="font-bold text-gray-900 text-sm sm:text-base">통합 알림 현황</span>
              {overdueTotal > 0 && (
                <span className="text-[11px] sm:text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-bold">{overdueTotal}건 초과</span>
              )}
            </div>
            <div className="px-3 sm:px-5 py-3 sm:py-4 flex flex-wrap gap-2 sm:gap-3">
              {overdueEquipInsp.length > 0 && (
                <Link href="/management/equipment" className="flex items-center gap-1.5 text-[12px] sm:text-sm px-3 sm:px-4 py-2 sm:py-2.5 bg-red-50 border border-red-200 rounded-xl hover:bg-red-100 transition-colors">
                  <XCircle size={13} className="text-red-600" />
                  <span className="font-semibold text-red-700">장비 검사 초과</span>
                  <span className="text-red-600 font-bold">{overdueEquipInsp.length}건</span>
                </Link>
              )}
              {overdueTransInsp.length > 0 && (
                <Link href="/management/transport" className="flex items-center gap-1.5 text-[12px] sm:text-sm px-3 sm:px-4 py-2 sm:py-2.5 bg-red-50 border border-red-200 rounded-xl hover:bg-red-100 transition-colors">
                  <XCircle size={13} className="text-red-600" />
                  <span className="font-semibold text-red-700">운송장비 검사 초과</span>
                  <span className="text-red-600 font-bold">{overdueTransInsp.length}건</span>
                </Link>
              )}
              {upcomingEquipInsp.length > 0 && (
                <Link href="/management/equipment" className="flex items-center gap-1.5 text-[12px] sm:text-sm px-3 sm:px-4 py-2 sm:py-2.5 bg-orange-50 border border-orange-200 rounded-xl hover:bg-orange-100 transition-colors">
                  <Clock size={13} className="text-orange-600" />
                  <span className="font-semibold text-orange-700">장비 검사 임박</span>
                  <span className="text-orange-600 font-bold">{upcomingEquipInsp.length}건</span>
                </Link>
              )}
              {visaExpiringWorkers.length > 0 && (
                <Link href="/management/workers" className="flex items-center gap-1.5 text-[12px] sm:text-sm px-3 sm:px-4 py-2 sm:py-2.5 bg-yellow-50 border border-yellow-200 rounded-xl hover:bg-yellow-100 transition-colors">
                  <AlertTriangle size={13} className="text-yellow-600" />
                  <span className="font-semibold text-yellow-700">비자 만료 임박</span>
                  <span className="text-yellow-600 font-bold">{visaExpiringWorkers.length}명</span>
                </Link>
              )}
              {consumableAlerts.length > 0 && (
                <Link href="/management/transport" className="flex items-center gap-1.5 text-[12px] sm:text-sm px-3 sm:px-4 py-2 sm:py-2.5 bg-yellow-50 border border-yellow-200 rounded-xl hover:bg-yellow-100 transition-colors">
                  <AlertTriangle size={13} className="text-yellow-600" />
                  <span className="font-semibold text-yellow-700">소모품 교체 임박</span>
                  <span className="text-yellow-600 font-bold">{consumableAlerts.length}건</span>
                </Link>
              )}
            </div>
          </div>
        )}

      </main>

      {/* ── 푸터 ── */}
      <footer className="border-t border-gray-200 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-0 text-center sm:text-left">
          <p className="text-[11px] sm:text-xs text-gray-400">한국테크 ERP 시스템 · CNC 절단 파트</p>
          <p className="text-[11px] sm:text-xs text-gray-400">관리자 : 김남훈 · 010-9704-5626</p>
        </div>
      </footer>
    </div>
  );
}

import { prisma } from "@/lib/prisma";
import { kstDayRange } from "@/lib/work-date";
import { NIGHT_OFF_REASONS } from "@/lib/cutting-time";

/**
 * 주간보고 계산 (2026-10-02) — 업무관리 > 보고서 > 주간보고
 *
 * 사무실이 매주 엑셀로 만들던 세 장(플라즈마 가동현황 · 주간업무계획표 · 업무보고) 중
 * 숫자로 나오는 부분을 작업일보·강재·출고 데이터에서 계산한다. 기준(사용자 결정):
 *   · 절단물량 — 정규작업은 도면중량(=사용중량 useWeight, 엑셀 수식의 숫자와 일치 확인),
 *                돌발은 돌발 사용중량 → 없으면 원판(잔재) 중량. 날짜는 **절단을 끝낸 날**(endAt, KST).
 *   · 가동시간 — 작업일보상 실제로 장비가 돈 시간. 작업 구간에서 모든 중단(야간이월 포함)을 빼고,
 *                자정을 넘긴 작업은 날별로 잘라 나눈다.
 *   · 미가동시간 — 중단 중 야간이월(퇴근)을 뺀 것(장비고장·도면변경·소모품교체·기타). 절단보고서와 같은 정의.
 *   · 평균 가동률 — Σ가동 ÷ (Σ가동 + Σ미가동).
 *   · 특이사항 — 그날 자른 호선(LB·4자리 호선번호)·잔재·돌발·고장. 사람이 고친 값이 있으면 그걸 쓴다.
 *
 * 보정 두 가지(실데이터 검증에서 나옴, 9/25~10/1):
 *   · 휴무 — 플라즈마가 한 대도 안 돌고 절단완료도 없는 날은 휴무로 보고 칸을 비운다.
 *     고장으로 멈춘 작업이 추석 연휴 내내 '중단'으로 걸려 하루 24시간 미가동으로 잡혔다.
 *   · 미가동은 그날 근무시간(월·화·목·금 15h, 수·토 8h) 안에서만 센다 — 고장 중단이 밤새 이어지면
 *     퇴근 후 시간까지 미가동이 됐다. 가동시간은 실제 시간 그대로(근무시간을 넘으면 표시만 한다).
 */
export const shiftHours = (ymd: string) => { const wd = new Date(`${ymd}T00:00:00Z`).getUTCDay(); return wd === 3 || wd === 6 ? 8 : 15; };

export type OpsDay = { ymd: string; label: string };
export type OpsCell = {
  runH: number; tons: number; stopH: number; autoNote: string;
  off?: boolean;   // 공장 전체가 안 돈 날(휴무)
  over?: boolean;  // 가동시간이 그날 근무시간을 넘음 — 퇴근/야간이월 없이 밤새 '진행 중'으로 남은 작업 의심
};
export type OpsMachine = { id: string; name: string; cells: OpsCell[]; runH: number; tons: number; stopH: number };
export type Ops = { days: OpsDay[]; machines: OpsMachine[]; dailyTons: number[]; totalTons: number; avgRate: number | null };

const WD = ["일", "월", "화", "수", "목", "금", "토"];
const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;
const plateKg = (t?: number | null, w?: number | null, l?: number | null) => (t && w && l ? t * w * l * 7.85 / 1e6 : 0);
const kstYmd = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(d);

/** 기간의 날짜들 — 일요일은 빼고 최대 6일 (양식 칸이 6개) */
export function periodDays(fromYmd: string, toYmd: string): OpsDay[] {
  const out: OpsDay[] = [];
  const d = new Date(`${fromYmd}T00:00:00Z`);
  const end = new Date(`${toYmd}T00:00:00Z`);
  while (d <= end && out.length < 6) {
    const wd = d.getUTCDay();
    if (wd !== 0) {
      const ymd = d.toISOString().slice(0, 10);
      out.push({ ymd, label: `${WD[wd]}(${d.getUTCMonth() + 1}/${d.getUTCDate()})` });
    }
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

const overlap = (a0: number, a1: number, b0: number, b1: number) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));

/** 호선코드 → 특이사항 짧은 표기 (LB4508 → LB, KYTS-1023 → 1023) */
function vesselTag(code?: string | null) {
  if (!code) return "";
  if (/^LB/i.test(code)) return "LB";
  const m = code.match(/(\d{3,4})\s*$/);
  return m ? m[1] : code;
}

export async function buildOps(fromYmd: string, toYmd: string, noteOverrides: Record<string, string> = {}): Promise<Ops> {
  const days = periodDays(fromYmd, toYmd);
  const pStart = kstDayRange(fromYmd).start.getTime();
  const pEnd = kstDayRange(toYmd).end.getTime();
  const now = Date.now();

  const equipment = await prisma.equipment.findMany({ where: { type: "PLASMA" }, orderBy: { name: "asc" }, select: { id: true, name: true } });
  const logs = await prisma.cuttingLog.findMany({
    where: {
      equipmentId: { in: equipment.map(e => e.id) },
      startAt: { lte: new Date(pEnd) },
      OR: [{ endAt: null }, { endAt: { gte: new Date(pStart) } }],
    },
    select: {
      equipmentId: true, status: true, isUrgent: true, startAt: true, endAt: true,
      thickness: true, width: true, length: true,
      project: { select: { projectCode: true } },
      drawingList: { select: { useWeight: true, steelWeight: true, assignedRemnantId: true } },
      urgentWork: { select: { useWeight: true, remnant: { select: { weight: true } } } },
      pauses: { select: { reason: true, pausedAt: true, resumedAt: true } },
    },
  });

  const machines: OpsMachine[] = equipment.slice(0, 4).map(eq => {
    const mine = logs.filter(l => l.equipmentId === eq.id);
    const cells = days.map(day => {
      const { start, end } = kstDayRange(day.ymd);
      const d0 = start.getTime(), d1 = end.getTime() + 1;
      let runMs = 0, stopMs = 0, kg = 0;
      const tags = new Set<string>();
      for (const l of mine) {
        const s = l.startAt.getTime();
        const e = l.endAt ? l.endAt.getTime() : Math.min(now, pEnd);
        const spanDay = overlap(s, e, d0, d1);
        if (spanDay > 0) {
          let pausedDay = 0;
          for (const p of l.pauses) {
            const ps = Math.max(p.pausedAt.getTime(), s);
            const pe = Math.min(p.resumedAt ? p.resumedAt.getTime() : e, e);
            const o = overlap(ps, pe, d0, d1);
            pausedDay += o;
            if (!NIGHT_OFF_REASONS.has(p.reason)) stopMs += o;
            if (p.reason === "EQUIPMENT_FAILURE" && o > 0) tags.add("고장");
          }
          const ranDay = Math.max(0, spanDay - pausedDay);
          runMs += ranDay;
          // 그날 실제로 돌았던 작업만 특이사항에 — 중단인 채 걸쳐 있기만 한 작업은 빼고
          if (ranDay > 0) tags.add(l.isUrgent ? "돌발" : l.drawingList?.assignedRemnantId ? "잔재" : vesselTag(l.project?.projectCode));
        }
        // 절단물량 — 끝낸 날 기준
        if (l.status === "COMPLETED" && l.endAt && kstYmd(l.endAt) === day.ymd) {
          tags.add(l.isUrgent ? "돌발" : l.drawingList?.assignedRemnantId ? "잔재" : vesselTag(l.project?.projectCode));
          kg += l.isUrgent
            ? (l.urgentWork?.useWeight ?? l.urgentWork?.remnant?.weight ?? plateKg(l.thickness, l.width, l.length))
            : (l.drawingList?.useWeight ?? l.drawingList?.steelWeight ?? plateKg(l.thickness, l.width, l.length));
        }
      }
      tags.delete("");
      const auto = [...tags].sort((a, b) => (a === "고장" ? 1 : b === "고장" ? -1 : 0)).join(", ");
      const key = `${eq.id}|${day.ymd}`;
      const runH = runMs / 36e5, cap = shiftHours(day.ymd);
      return {
        runH: r1(runH), tons: r2(kg / 1000),
        stopH: r1(Math.min(stopMs / 36e5, Math.max(0, cap - runH))),   // 근무시간 안에서만
        autoNote: noteOverrides[key] ?? auto, key, rawTagsFromFailure: tags.has("고장"), over: runH > cap + 0.05,
      };
    });
    return {
      id: eq.id, name: eq.name, cells,
      runH: r1(cells.reduce((s, c) => s + c.runH, 0)),
      tons: r2(cells.reduce((s, c) => s + c.tons, 0)),
      stopH: r1(cells.reduce((s, c) => s + c.stopH, 0)),
    };
  });

  // 휴무 — 플라즈마가 한 대도 안 돌고 절단완료도 없는 날
  days.forEach((day, i) => {
    const off = machines.every(m => m.cells[i].runH === 0 && m.cells[i].tons === 0);
    if (!off) return;
    for (const m of machines) {
      const c = m.cells[i] as OpsCell & { key?: string };
      c.off = true; c.runH = 0; c.stopH = 0; c.over = false;
      c.autoNote = noteOverrides[c.key ?? ""] ?? "휴무";
    }
  });
  for (const m of machines) {
    m.cells = m.cells.map(c => { const { key: _k, rawTagsFromFailure: _f, ...rest } = c as OpsCell & { key?: string; rawTagsFromFailure?: boolean }; return rest; });
    m.runH = r1(m.cells.reduce((s, c) => s + c.runH, 0));
    m.stopH = r1(m.cells.reduce((s, c) => s + c.stopH, 0));
  }
  const dailyTons = days.map((_, i) => r2(machines.reduce((s, m) => s + m.cells[i].tons, 0)));
  const run = machines.reduce((s, m) => s + m.runH, 0), stop = machines.reduce((s, m) => s + m.stopH, 0);
  return { days, machines, dailyTons, totalTons: r2(dailyTons.reduce((s, x) => s + x, 0)), avgRate: run + stop > 0 ? run / (run + stop) : null };
}

/** 주간업무계획표 숫자 칸 + 업무보고 초안에 쓸 값 */
export async function buildAuto(fromYmd: string, toYmd: string, ops: Ops) {
  const s = kstDayRange(fromYmd).start, e = kstDayRange(toYmd).end;
  const [inbound, stock, cons, fail, insp, rep, vehicles, blocks] = await Promise.all([
    prisma.steelPlan.findMany({ where: { receivedAt: { gte: s, lte: e } }, select: { thickness: true, width: true, length: true } }),
    prisma.steelPlan.findMany({ where: { status: "RECEIVED", archivedAt: null }, select: { thickness: true, width: true, length: true } }),
    prisma.cuttingPause.count({ where: { reason: "CONSUMABLE", pausedAt: { gte: s, lte: e } } }),
    prisma.cuttingPause.count({ where: { reason: "EQUIPMENT_FAILURE", pausedAt: { gte: s, lte: e } } }),
    prisma.mgmtInspectionLog.count({ where: { completedAt: { gte: s, lte: e } } }),
    prisma.mgmtRepairLog.count({ where: { repairedAt: { gte: s, lte: e } } }),
    prisma.shipmentVehicle.findMany({
      where: { shipment: { status: "ACTIVE", shippedAt: { gte: s, lte: e } } },
      select: { charterUsage: { select: { id: true } } },
    }),
    // 이번 주에 절단완료가 있었던 블록 — 업무보고 '절단실적' 초안
    prisma.cuttingLog.groupBy({
      by: ["projectId"],
      where: { status: "COMPLETED", isUrgent: false, endAt: { gte: s, lte: e }, projectId: { not: null } },
      _count: { _all: true },
    }),
  ]);
  const tons = (rows: { thickness: number; width: number; length: number }[]) => r1(rows.reduce((x, p) => x + plateKg(p.thickness, p.width, p.length), 0) / 1000);
  const projects = await prisma.project.findMany({
    where: { id: { in: blocks.map(b => b.projectId!) } },
    select: { id: true, projectCode: true, projectName: true, status: true, _count: { select: { drawingLists: true } } },
  });
  const cutTotals = await prisma.drawingList.groupBy({ by: ["projectId"], where: { projectId: { in: projects.map(p => p.id) }, status: "CUT" }, _count: { _all: true } });
  const blockLines = projects
    .map(p => {
      const week = blocks.find(b => b.projectId === p.id)?._count._all ?? 0;
      const cut = cutTotals.find(c => c.projectId === p.id)?._count._all ?? 0;
      return { code: p.projectCode, name: p.projectName, week, cut, total: p._count.drawingLists, done: p.status === "COMPLETED" };
    })
    .sort((a, b) => a.code.localeCompare(b.code) || a.name.localeCompare(b.name));
  const charter = vehicles.filter(v => v.charterUsage).length;
  return {
    inboundTons: tons(inbound), stockTons: tons(stock), cutTons: ops.totalTons,
    avgRate: ops.avgRate, consumable: cons, failure: fail, inspections: insp, repairs: rep,
    vehicles: vehicles.length, charter, own: vehicles.length - charter, blockLines,
  };
}

export type Auto = Awaited<ReturnType<typeof buildAuto>>;

/* ── 주간업무계획표 행 (엑셀 양식 9~18행) ── */
export const PLAN_ROWS = [
  { key: "materials", dept: "생산부", label: "원자재 입고", row: 9 },
  { key: "cutting",   dept: "생산부", label: "절단실적", row: 10 },
  { key: "equipment", dept: "생산부", label: "설비가동 (프라즈마 4대)", row: 11 },
  { key: "quality",   dept: "생산부", label: "품질 / 불량", row: 12 },
  { key: "inspect",   dept: "생산부", label: "설비점검·소모품", row: 13 },
  { key: "shipping",  dept: "생산부", label: "출하내역", row: 14 },
  { key: "hr",        dept: "관리부", label: "인사·노무", row: 15 },
  { key: "admin",     dept: "관리부", label: "총무·대관", row: 16 },
  { key: "maint",     dept: "관리부", label: "설비보수유지", row: 17 },
  { key: "safety",    dept: "관리부", label: "안전보건·법규", row: 18 },
] as const;
export type PlanKey = typeof PLAN_ROWS[number]["key"];
export type PlanRow = { now: string; next: string; note: string };

const pct = (r: number | null) => (r == null ? "-" : `${(r * 100).toFixed(1)}%`);

/** 숫자로 채울 수 있는 칸의 초안 — 저장된 값이 없을 때만 쓴다 */
export function defaultPlan(a: Auto): Record<PlanKey, PlanRow> {
  return {
    materials: { now: `후판 입고 ${a.inboundTons} ton (재고 ${a.stockTons} ton)`, next: "", note: "" },
    cutting:   { now: `금주절단물량: 약 ${a.cutTons} ton`, next: "절단 목표물량: 약    ton", note: "" },
    equipment: { now: `평균 가동률 ${pct(a.avgRate)} (1·2·3·4호기별 별첨)`, next: "가동률    % 이상 유지", note: "" },
    quality:   { now: "불량률    %, 주요 불량유형 (    )", next: "불량 저감 대책", note: "" },
    inspect:   { now: `정기점검 ${a.inspections}회, 수선 ${a.repairs}회, 소모품 교체 ${a.consumable}회 (장비고장 정지 ${a.failure}회)`, next: "예방정비 일정 (    )", note: "" },
    shipping:  { now: `자차: ${a.own}회, 용차: ${a.charter}회`, next: "출하 계획", note: "" },
    hr:        { now: "", next: "", note: "" },
    admin:     { now: "인허가·보조금 진행상황 (    )", next: "신청·제출 예정 (ICT위탁, 보조금 등)", note: "" },
    maint:     { now: "재해 0건, 안전점검 (   회), 분진·소음 관리", next: "위험성평가 / 외국인근로자 안전교육 (    )", note: "" },
    safety:    { now: "법정의무 이행(각종 법정선임관리교육 등) 점검", next: "법규 대응·교육 일정", note: "" },
  };
}

/** 업무보고 '금주 실적' 초안 */
export function defaultThisWeek(a: Auto): string {
  const lines = [" <절단실적>", " - 가동현황 시트 참조"];
  if (a.blockLines.length) {
    lines.push("  <블록 절단>");
    for (const b of a.blockLines) lines.push(` - ${b.code} ${b.name} ${b.week}행 절단 (${b.cut}/${b.total}${b.done ? " 완료" : ""})`);
  }
  return lines.join("\n");
}

export const rangeLabel = (fromYmd: string, toYmd: string) => {
  const f = new Date(`${fromYmd}T00:00:00Z`), t = new Date(`${toYmd}T00:00:00Z`);
  return `${f.getUTCMonth() + 1}/${f.getUTCDate()}~${t.getUTCMonth() + 1}/${t.getUTCDate()}`;
};
export const shiftYmd7 = (ymd: string, days: number) => {
  const d = new Date(`${ymd}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10);
};

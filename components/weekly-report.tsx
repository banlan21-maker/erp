"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Save, Download, Loader2, RefreshCw, ChevronLeft, ChevronRight, History, ListChecks } from "lucide-react";
import { useWorkUser } from "@/components/work-user-context";
import { kstTodayYmd } from "@/lib/work-date";
import WeeklyReportPicker from "@/components/weekly-report-picker";

/**
 * 주간보고 (업무관리 > 보고서) — 2026-10-02
 *
 * 사무실이 매주 엑셀로 만들어 보내던 세 장을 여기서 작성하고, 같은 양식의 엑셀로 내려받는다.
 *   1. 플라즈마 가동현황 — 작업일보에서 자동 계산(특이사항만 고칠 수 있음)
 *   2. 주간업무계획표 — 숫자 칸은 자동 초안, 나머지는 입력
 *   3. 업무보고 — 서술형 입력(금주 실적은 절단 블록 목록으로 초안, 업무일지·일정에서 골라 덧붙이기)
 * 저장은 기간 시작일 기준 한 건. 엑셀은 저장한 내용으로 만든다(받기 전에 자동 저장).
 */

type Cell = { runH: number; tons: number; stopH: number; autoNote: string; off?: boolean; over?: boolean };
type Machine = { id: string; name: string; cells: Cell[]; runH: number; tons: number; stopH: number };
type Ops = { days: { ymd: string; label: string }[]; machines: Machine[]; dailyTons: number[]; totalTons: number; avgRate: number | null };
type PlanRow = { now: string; next: string; note: string };
type Form = {
  writer: string; writtenAt: string;
  plan: { rows: Record<string, PlanRow>; special: string };
  report: { thisWeek: string; nextWeek: string; problems: string; requests: string; thisRange: string; nextRange: string };
};

const PLAN_ROWS = [
  { key: "materials", dept: "생산부", label: "원자재 입고", auto: true },
  { key: "cutting",   dept: "생산부", label: "절단실적", auto: true },
  { key: "equipment", dept: "생산부", label: "설비가동 (프라즈마 4대)", auto: true },
  { key: "quality",   dept: "생산부", label: "품질 / 불량" },
  { key: "inspect",   dept: "생산부", label: "설비점검·소모품", auto: true },
  { key: "shipping",  dept: "생산부", label: "출하내역", auto: true },
  { key: "hr",        dept: "관리부", label: "인사·노무" },
  { key: "admin",     dept: "관리부", label: "총무·대관" },
  { key: "maint",     dept: "관리부", label: "설비보수유지" },
  { key: "safety",    dept: "관리부", label: "안전보건·법규" },
];

const addDays = (ymd: string, n: number) => { const d = new Date(`${ymd}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
/** 이번 주 월요일 (KST) */
const mondayOf = (ymd: string) => { const d = new Date(`${ymd}T00:00:00Z`); const wd = d.getUTCDay(); return addDays(ymd, wd === 0 ? -6 : 1 - wd); };
const h = (n: number) => (n ? n.toFixed(1) : "");
const t = (n: number) => (n ? n.toFixed(2) : "");

const area = "w-full border border-gray-200 rounded px-2 py-1 text-xs leading-snug focus:outline-none focus:ring-1 focus:ring-blue-400 resize-y";

export default function WeeklyReport() {
  const { currentUser } = useWorkUser();
  const [from, setFrom] = useState(() => mondayOf(kstTodayYmd()));
  const [to, setTo] = useState(() => addDays(mondayOf(kstTodayYmd()), 6));
  const [ops, setOps] = useState<Ops | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [prev, setPrev] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);

  const load = useCallback(async (f: string, tt: string) => {
    setLoading(true); setMsg(null);
    try {
      const r = await fetch(`/api/weekly-report?from=${f}&to=${tt}`);
      const d = await r.json();
      if (!d.success) { setMsg(d.error ?? "불러오기 실패"); return; }
      setOps(d.ops);
      const fm: Form = d.form;
      if (!fm.writer && currentUser?.name) fm.writer = currentUser.name;
      if (!fm.writtenAt) fm.writtenAt = kstTodayYmd();
      setForm(fm);
      const n: Record<string, string> = {};
      for (const m of d.ops.machines as Machine[]) m.cells.forEach((c, i) => { n[`${m.id}|${d.ops.days[i].ymd}`] = c.autoNote; });
      setNotes(n);
      setSavedAt(d.saved?.updatedAt ?? null);
      setPrev(d.prev);
      setDirty(false);
    } catch { setMsg("서버 오류"); }
    finally { setLoading(false); }
  }, [currentUser?.name]);

  useEffect(() => { load(from, to); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const moveWeek = (n: number) => {
    if (dirty && !confirm("저장하지 않은 내용이 있습니다. 다른 주로 이동할까요?")) return;
    const f = addDays(from, 7 * n), tt = addDays(to, 7 * n);
    setFrom(f); setTo(tt); load(f, tt);
  };

  const save = async (): Promise<boolean> => {
    if (!form) return false;
    setSaving(true); setMsg(null);
    try {
      const r = await fetch("/api/weekly-report", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from, to, writer: form.writer, writtenAt: form.writtenAt, opsNotes: notes, plan: form.plan, report: form.report }),
      });
      const d = await r.json();
      if (!d.success) { setMsg(d.error ?? "저장 실패"); return false; }
      setSavedAt(d.updatedAt); setDirty(false); setMsg("저장했습니다.");
      return true;
    } catch { setMsg("서버 오류"); return false; }
    finally { setSaving(false); }
  };

  const download = async () => {
    if (!(await save())) return;
    window.location.href = `/api/weekly-report/excel?from=${from}&to=${to}`;
  };

  /** 지난 보고서의 사람이 쓴 칸을 불러온다(숫자 자동 칸은 이번 주 값 유지) */
  const loadPrev = async () => {
    if (!prev || !form) return;
    if (!confirm(`지난 보고서(${prev} 주)의 입력 내용을 불러옵니다.\n숫자로 자동 계산되는 칸은 이번 주 값을 그대로 둡니다. 계속할까요?`)) return;
    const pTo = addDays(prev, 6);
    const r = await fetch(`/api/weekly-report?from=${prev}&to=${pTo}`);
    const d = await r.json();
    if (!d.success) { setMsg(d.error ?? "불러오기 실패"); return; }
    const pf: Form = d.form;
    const rows = { ...form.plan.rows };
    for (const row of PLAN_ROWS) {
      const p = pf.plan.rows[row.key];
      rows[row.key] = { now: row.auto ? rows[row.key].now : p.now, next: p.next, note: p.note };
    }
    setForm({ ...form, plan: { rows, special: pf.plan.special }, report: { ...form.report, nextWeek: pf.report.nextWeek, problems: pf.report.problems, requests: pf.report.requests } });
    setDirty(true);
  };

  const setRow = (key: string, patch: Partial<PlanRow>) => {
    if (!form) return;
    setForm({ ...form, plan: { ...form.plan, rows: { ...form.plan.rows, [key]: { ...form.plan.rows[key], ...patch } } } });
    setDirty(true);
  };
  const setRep = (patch: Partial<Form["report"]>) => { if (form) { setForm({ ...form, report: { ...form.report, ...patch } }); setDirty(true); } };

  const rate = useMemo(() => (ops?.avgRate == null ? "-" : `${(ops.avgRate * 100).toFixed(1)}%`), [ops]);

  return (
    <div className="space-y-4">
      {/* 기간·작성자·버튼 */}
      <div className="bg-white border border-gray-200 rounded-xl p-3 flex items-center gap-2 flex-wrap">
        <button onClick={() => moveWeek(-1)} className="p-1.5 border border-gray-200 rounded-lg hover:bg-gray-50" title="이전 주"><ChevronLeft size={15} /></button>
        <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="h-8 px-2 border border-gray-300 rounded-lg text-sm" />
        <span className="text-gray-400">~</span>
        <input type="date" value={to} onChange={e => setTo(e.target.value)} className="h-8 px-2 border border-gray-300 rounded-lg text-sm" />
        <button onClick={() => moveWeek(1)} className="p-1.5 border border-gray-200 rounded-lg hover:bg-gray-50" title="다음 주"><ChevronRight size={15} /></button>
        <button onClick={() => load(from, to)} className="h-8 px-3 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 inline-flex items-center gap-1">
          <RefreshCw size={13} /> 불러오기
        </button>
        {form && (
          <>
            <span className="ml-3 text-xs text-gray-500">작성자</span>
            <input value={form.writer} onChange={e => { setForm({ ...form, writer: e.target.value }); setDirty(true); }} className="h-8 w-24 px-2 border border-gray-300 rounded-lg text-sm" />
            <span className="text-xs text-gray-500">작성일</span>
            <input type="date" value={form.writtenAt} onChange={e => { setForm({ ...form, writtenAt: e.target.value }); setDirty(true); }} className="h-8 px-2 border border-gray-300 rounded-lg text-sm" />
          </>
        )}
        <div className="ml-auto flex items-center gap-2">
          {prev && <button onClick={loadPrev} className="h-8 px-3 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 inline-flex items-center gap-1"><History size={13} /> 지난 보고서 불러오기</button>}
          <span className="text-[11px] text-gray-400">{dirty ? "저장 안 됨" : savedAt ? `저장됨 ${savedAt.slice(0, 16).replace("T", " ")}` : "아직 저장 안 함"}</span>
          <button onClick={save} disabled={saving || !form} className="h-8 px-3 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 inline-flex items-center gap-1">
            <Save size={13} /> {saving ? "저장 중…" : "저장"}
          </button>
          <button onClick={download} disabled={saving || !form} className="h-8 px-3 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-40 inline-flex items-center gap-1">
            <Download size={13} /> 엑셀 다운로드
          </button>
        </div>
      </div>
      {msg && <p className="text-sm text-blue-700">{msg}</p>}
      {loading && <p className="text-sm text-gray-400 flex items-center gap-1"><Loader2 size={14} className="animate-spin" /> 계산 중…</p>}

      {ops && form && !loading && (
        <>
          {/* 1. 플라즈마 가동현황 */}
          <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold text-gray-800">1. 플라즈마 절단기 주간 가동현황</h3>
              <span className="text-xs text-gray-400">작업일보 자동 계산 · 특이사항만 고칠 수 있습니다</span>
              <span className="ml-auto text-sm">주간 절단 <b className="tabular-nums">{ops.totalTons.toFixed(2)}</b>t · 평균 가동률 <b className="text-blue-700">{rate}</b></span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 text-gray-500">
                  <tr>
                    <th className="px-2 py-1.5 text-left w-40">구분</th>
                    {ops.days.map(d => <th key={d.ymd} className="px-2 py-1.5 text-center">{d.label}</th>)}
                    <th className="px-2 py-1.5 text-center w-20">주간 합계</th>
                  </tr>
                </thead>
                <tbody>
                  {ops.machines.map((m, mi) => (
                    <FragmentRows key={m.id}>
                      <tr className="border-t border-gray-200">
                        <td className="px-2 py-1 font-semibold text-gray-800">[{mi + 1}호기] 가동시간(h)</td>
                        {m.cells.map((c, i) => (
                          <td key={i} className={`px-2 py-1 text-center tabular-nums ${c.off ? "bg-gray-50" : ""} ${c.over ? "bg-amber-100 text-amber-800 font-semibold" : ""}`}
                            title={c.over ? "근무시간보다 깁니다 — 퇴근/야간이월 없이 밤새 '진행 중'으로 남은 작업이 있는지 작업일보를 확인하세요" : undefined}>
                            {h(c.runH)}
                          </td>
                        ))}
                        <td className="px-2 py-1 text-center tabular-nums font-semibold">{h(m.runH)}</td>
                      </tr>
                      <tr>
                        <td className="px-2 py-1 text-gray-600">절단물량(ton)</td>
                        {m.cells.map((c, i) => <td key={i} className={`px-2 py-1 text-center tabular-nums ${c.off ? "bg-gray-50" : ""}`}>{t(c.tons)}</td>)}
                        <td className="px-2 py-1 text-center tabular-nums font-semibold">{t(m.tons)}</td>
                      </tr>
                      <tr>
                        <td className="px-2 py-1 text-gray-600">미가동 시간(h)</td>
                        {m.cells.map((c, i) => <td key={i} className={`px-2 py-1 text-center tabular-nums text-red-600 ${c.off ? "bg-gray-50" : ""}`}>{h(c.stopH)}</td>)}
                        <td className="px-2 py-1 text-center tabular-nums font-semibold text-red-600">{h(m.stopH)}</td>
                      </tr>
                      <tr>
                        <td className="px-2 py-1 text-gray-600">특이사항</td>
                        {ops.days.map(d => {
                          const k = `${m.id}|${d.ymd}`;
                          return (
                            <td key={d.ymd} className="px-1 py-0.5">
                              <input value={notes[k] ?? ""} onChange={e => { setNotes({ ...notes, [k]: e.target.value }); setDirty(true); }}
                                className="w-full px-1.5 py-0.5 text-[11px] text-center border border-transparent hover:border-gray-200 focus:border-blue-400 rounded focus:outline-none" />
                            </td>
                          );
                        })}
                        <td />
                      </tr>
                    </FragmentRows>
                  ))}
                  <tr className="border-t-2 border-gray-300 bg-blue-50 font-semibold">
                    <td className="px-2 py-1.5">일절단량</td>
                    {ops.dailyTons.map((x, i) => <td key={i} className="px-2 py-1.5 text-center tabular-nums">{t(x)}</td>)}
                    <td className="px-2 py-1.5 text-center tabular-nums">{t(ops.totalTons)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="px-4 py-2 text-[11px] text-gray-400 border-t border-gray-100">
              가동시간 = 작업일보상 장비가 실제로 돈 시간(중단·퇴근 제외, 자정을 넘긴 작업은 날별로 나눔 — <span className="bg-amber-100 text-amber-800 px-1 rounded">노란 칸</span>은 근무시간 초과) ·
              미가동 = 장비고장·도면변경·소모품교체·기타, 그날 근무시간(월화목금 15h·수토 8h) 안에서만 · 플라즈마가 한 대도 안 돈 날은 휴무로 비움 ·
              절단물량 = 끝낸 날 기준, 정규는 도면 사용중량 · 돌발은 사용중량(없으면 원판 중량)
            </p>
          </section>

          {/* 2. 주간업무계획표 */}
          <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2">
              <h3 className="text-sm font-bold text-gray-800">2. 주간업무계획표</h3>
              <span className="text-xs text-gray-400">파란 칸은 숫자를 자동으로 채운 초안 — 그대로 두거나 고치면 됩니다</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 text-gray-500">
                  <tr>
                    <th className="px-2 py-1.5 w-14">부서</th><th className="px-2 py-1.5 w-32 text-left">구분</th>
                    <th className="px-2 py-1.5 text-left">금주 실적 (계획 대비)</th><th className="px-2 py-1.5 text-left">차주 추진 계획</th><th className="px-2 py-1.5 text-left w-40">비고</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {PLAN_ROWS.map((r, i) => {
                    const v = form.plan.rows[r.key] ?? { now: "", next: "", note: "" };
                    const first = i === 0 || PLAN_ROWS[i - 1].dept !== r.dept;
                    return (
                      <tr key={r.key} className="align-top">
                        <td className="px-2 py-1 text-center font-semibold text-gray-600">{first ? r.dept : ""}</td>
                        <td className="px-2 py-1.5 text-gray-700">{r.label}</td>
                        <td className="px-1 py-1"><textarea rows={2} value={v.now} onChange={e => setRow(r.key, { now: e.target.value })} className={`${area} ${r.auto ? "bg-blue-50/60" : ""}`} /></td>
                        <td className="px-1 py-1"><textarea rows={2} value={v.next} onChange={e => setRow(r.key, { next: e.target.value })} className={area} /></td>
                        <td className="px-1 py-1"><textarea rows={2} value={v.note} onChange={e => setRow(r.key, { note: e.target.value })} className={area} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-3 border-t border-gray-100">
              <p className="text-xs font-semibold text-gray-700 mb-1">■ 특이사항 및 본사 협조·건의 사항</p>
              <textarea rows={3} value={form.plan.special} onChange={e => { setForm({ ...form, plan: { ...form.plan, special: e.target.value } }); setDirty(true); }} className={area} />
            </div>
          </section>

          {/* 3. 업무보고 */}
          <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2">
              <h3 className="text-sm font-bold text-gray-800">3. 주간업무 보고서</h3>
              <span className="text-xs text-gray-400">금주 실적은 이번 주 절단 블록 목록으로 초안을 채웠습니다</span>
              <button onClick={() => setPicking(true)} className="ml-auto h-7 px-2.5 text-xs border border-blue-300 text-blue-700 rounded-lg hover:bg-blue-50 inline-flex items-center gap-1">
                <ListChecks size={13} /> 업무일지·일정에서 가져오기
              </button>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 p-4">
              <div>
                <label className="text-xs font-semibold text-gray-700 flex items-center gap-1">금 주 실 적
                  <input value={form.report.thisRange} onChange={e => setRep({ thisRange: e.target.value })} className="w-28 px-1.5 py-0.5 border border-gray-200 rounded text-xs font-normal" />
                </label>
                <textarea rows={12} value={form.report.thisWeek} onChange={e => setRep({ thisWeek: e.target.value })} className={`${area} mt-1`} />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-700 flex items-center gap-1">차 주 계 획
                  <input value={form.report.nextRange} onChange={e => setRep({ nextRange: e.target.value })} className="w-28 px-1.5 py-0.5 border border-gray-200 rounded text-xs font-normal" />
                </label>
                <textarea rows={12} value={form.report.nextWeek} onChange={e => setRep({ nextWeek: e.target.value })} className={`${area} mt-1`} />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-700">문제점 및 비고</label>
                <textarea rows={4} value={form.report.problems} onChange={e => setRep({ problems: e.target.value })} className={`${area} mt-1`} />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-700">요청사항 및 비고</label>
                <textarea rows={4} value={form.report.requests} onChange={e => setRep({ requests: e.target.value })} className={`${area} mt-1`} />
              </div>
            </div>
          </section>
          {picking && (
            <WeeklyReportPicker
              from={from} to={to} thisWeek={form.report.thisWeek} nextWeek={form.report.nextWeek}
              onClose={() => setPicking(false)}
              onAdd={add => {
                const join = (cur: string, more: string) => (!more ? cur : cur.trim() ? `${cur.replace(/\s+$/, "")}\n${more}` : more);
                setRep({ thisWeek: join(form.report.thisWeek, add.thisWeek), nextWeek: join(form.report.nextWeek, add.nextWeek) });
              }}
            />
          )}
        </>
      )}
    </div>
  );
}

function FragmentRows({ children }: { children: React.ReactNode }) { return <>{children}</>; }

"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, type ReactNode } from "react";

interface Report {
  generatedAt: string;
  totals: { steelPlans: number; steelPlanHeats: number; completedCutLogs: number; activeShipItems: number };
  summary: {
    dupCutLogs: number; heatMissedFlip: number; heatStaleCut: number;
    specStatusMismatch: number; dupWaitingHeat: number;
  };
  dupCutLogs: {
    heatNo: string; vesselCode: string; material: string; thickness: number | null; width: number | null; length: number | null;
    count: number; logs: { id: string; drawingNo: string | null; operator: string; date: string | null }[];
  }[];
  heatMissedFlip: {
    heatNo: string; vesselCode: string; material: string; thickness: number | null; width: number | null; length: number | null;
    logCount: number; poolStatus: string;
  }[];
  heatStaleCut: {
    heatNo: string; vesselCode: string; material: string; thickness: number | null; width: number | null; length: number | null;
    status: string; autoCreatedFromShipment: boolean;
  }[];
  specStatusMismatch: {
    vesselCode: string; material: string; thickness: number | null; width: number | null; length: number | null;
    received: number; issued: number; completed: number; shippedOut: number; waiting: number; cut: number; shipped: number;
    cutDiff: number; shipDiff: number; stockDiff: number;
  }[];
  dupWaitingHeat: {
    heatNo: string; vesselCode: string; material: string; thickness: number | null; width: number | null; length: number | null; count: number;
  }[];
}

const spec = (r: { material: string; thickness: number | null; width: number | null; length: number | null }) =>
  `${r.material} ${r.thickness}×${r.width}×${r.length}`;

const CARDS: { key: keyof Report["summary"]; label: string; desc: string; tone: string }[] = [
  { key: "heatMissedFlip",     label: "판번호 전환 누락",   desc: "작업일보=절단인데 판번호리스트=재고", tone: "text-red-600" },
  { key: "specStatusMismatch", label: "사양 수량 불일치",   desc: "강재목록 vs 판번호리스트 상태 수량 차이", tone: "text-red-600" },
  { key: "dupCutLogs",         label: "판번호 중복 절단",   desc: "같은 판번호가 2건 이상 절단완료", tone: "text-orange-600" },
  { key: "heatStaleCut",       label: "유령 절단/외부",     desc: "판번호는 절단/외부인데 근거 없음", tone: "text-orange-600" },
  { key: "dupWaitingHeat",     label: "재고 판번호 중복행", desc: "같은 판번호가 재고로 2행 이상", tone: "text-amber-600" },
];

export default function IntegrityPage() {
  const [data, setData] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/steel-plan/integrity", { cache: "no-store" });
      const j = await res.json();
      if (!res.ok) { setError(j.error ?? "오류"); return; }
      setData(j);
    } catch { setError("서버 오류"); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold">절단파트 정합성 진단</h1>
          <p className="text-xs text-gray-500">강재전체목록 · 판번호리스트 · 작업일보 · 외부출고를 대조 (읽기 전용 — 데이터 변경 없음)</p>
        </div>
        <button onClick={load} disabled={loading}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50">
          {loading ? "검사 중…" : "다시 검사"}
        </button>
      </div>

      {error && <div className="p-3 bg-red-50 text-red-700 text-sm rounded-lg">{error}</div>}

      {data && (
        <>
          <div className="text-xs text-gray-400">
            검사시각 {new Date(data.generatedAt).toLocaleString("ko-KR")} · 강재 {data.totals.steelPlans}건 · 판번호 {data.totals.steelPlanHeats}건 · 절단완료 작업일보 {data.totals.completedCutLogs}건 · 활성출고 {data.totals.activeShipItems}건
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            {CARDS.map((c) => (
              <div key={c.key} className="border border-gray-200 rounded-lg p-3 bg-white">
                <div className={`text-2xl font-bold ${data.summary[c.key] > 0 ? c.tone : "text-gray-300"}`}>
                  {data.summary[c.key]}
                </div>
                <div className="text-xs font-medium text-gray-700 mt-1">{c.label}</div>
                <div className="text-[10px] text-gray-400 leading-tight mt-0.5">{c.desc}</div>
              </div>
            ))}
          </div>

          {/* B. 판번호 전환 누락 */}
          <Section
            title="판번호 전환 누락 (작업일보=절단 · 판번호리스트=재고)"
            count={data.summary.heatMissedFlip}
            rows={data.heatMissedFlip}
            head={<tr className="text-gray-500 text-left"><th className="px-2 py-1">판번호</th><th className="px-2 py-1">호선</th><th className="px-2 py-1">사양</th><th className="px-2 py-1">절단로그수</th><th className="px-2 py-1">판번호풀상태</th></tr>}
            render={(r, i) => (
              <tr key={i} className="border-t border-gray-100">
                <td className="px-2 py-1 font-mono text-blue-700">{r.heatNo}</td>
                <td className="px-2 py-1">{r.vesselCode}</td>
                <td className="px-2 py-1">{spec(r)}</td>
                <td className="px-2 py-1 text-center">{r.logCount}</td>
                <td className="px-2 py-1 text-center text-gray-500">{r.poolStatus}</td>
              </tr>
            )}
          />

          {/* D. 사양 수량 불일치 */}
          <Section
            title="사양 수량 불일치 (강재목록 vs 판번호리스트)"
            count={data.summary.specStatusMismatch}
            rows={data.specStatusMismatch}
            head={<tr className="text-gray-500 text-left"><th className="px-2 py-1">호선</th><th className="px-2 py-1">사양</th><th className="px-2 py-1">재고(강재/판번호)</th><th className="px-2 py-1">절단(강재/판번호)</th><th className="px-2 py-1">외부(강재/판번호)</th></tr>}
            render={(r, i) => (
              <tr key={i} className="border-t border-gray-100">
                <td className="px-2 py-1">{r.vesselCode}</td>
                <td className="px-2 py-1">{spec(r)}</td>
                <td className="px-2 py-1 text-center">{r.received + r.issued} / {r.waiting}<Diff n={r.stockDiff} /></td>
                <td className="px-2 py-1 text-center">{r.completed} / {r.cut}<Diff n={r.cutDiff} /></td>
                <td className="px-2 py-1 text-center">{r.shippedOut} / {r.shipped}<Diff n={r.shipDiff} /></td>
              </tr>
            )}
          />

          {/* A. 판번호 중복 절단 */}
          <Section
            title="판번호 중복 절단 (작업일보)"
            count={data.summary.dupCutLogs}
            rows={data.dupCutLogs}
            head={<tr className="text-gray-500 text-left"><th className="px-2 py-1">판번호</th><th className="px-2 py-1">호선·사양</th><th className="px-2 py-1">건수</th><th className="px-2 py-1">작업일보</th></tr>}
            render={(r, i) => (
              <tr key={i} className="border-t border-gray-100 align-top">
                <td className="px-2 py-1 font-mono text-blue-700">{r.heatNo}</td>
                <td className="px-2 py-1">{r.vesselCode} · {spec(r)}</td>
                <td className="px-2 py-1 text-center">{r.count}건</td>
                <td className="px-2 py-1 text-gray-500">
                  {r.logs.map((l) => (
                    <div key={l.id}>{l.drawingNo ?? "-"} · {l.operator} · {l.date ? new Date(l.date).toLocaleDateString("ko-KR") : "-"}</div>
                  ))}
                </td>
              </tr>
            )}
          />

          {/* C. 유령 절단/외부 */}
          <Section
            title="유령 절단/외부 (판번호는 절단·외부인데 근거 없음)"
            count={data.summary.heatStaleCut}
            rows={data.heatStaleCut}
            head={<tr className="text-gray-500 text-left"><th className="px-2 py-1">판번호</th><th className="px-2 py-1">호선</th><th className="px-2 py-1">사양</th><th className="px-2 py-1">상태</th><th className="px-2 py-1"></th></tr>}
            render={(r, i) => (
              <tr key={i} className="border-t border-gray-100">
                <td className="px-2 py-1 font-mono text-blue-700">{r.heatNo}</td>
                <td className="px-2 py-1">{r.vesselCode}</td>
                <td className="px-2 py-1">{spec(r)}</td>
                <td className="px-2 py-1 text-center">{r.status === "CUT" ? "절단" : r.status === "SHIPPED" ? "외부" : r.status}</td>
                <td className="px-2 py-1 text-center text-gray-400">{r.autoCreatedFromShipment ? "출고자동생성" : ""}</td>
              </tr>
            )}
          />

          {/* E. 재고 판번호 중복행 */}
          <Section
            title="재고 판번호 중복행"
            count={data.summary.dupWaitingHeat}
            rows={data.dupWaitingHeat}
            head={<tr className="text-gray-500 text-left"><th className="px-2 py-1">판번호</th><th className="px-2 py-1">호선</th><th className="px-2 py-1">사양</th><th className="px-2 py-1">행수</th></tr>}
            render={(r, i) => (
              <tr key={i} className="border-t border-gray-100">
                <td className="px-2 py-1 font-mono text-blue-700">{r.heatNo}</td>
                <td className="px-2 py-1">{r.vesselCode}</td>
                <td className="px-2 py-1">{spec(r)}</td>
                <td className="px-2 py-1 text-center">{r.count}행</td>
              </tr>
            )}
          />
        </>
      )}
    </div>
  );
}

function Diff({ n }: { n: number }) {
  if (n === 0) return null;
  return <span className={`ml-1 font-bold ${n > 0 ? "text-red-600" : "text-purple-600"}`}>({n > 0 ? "+" : ""}{n})</span>;
}

function Section<T>({ title, count, rows, render, head }: {
  title: string; count: number; rows: T[];
  render: (r: T, i: number) => ReactNode; head: ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border border-gray-200 rounded-lg bg-white overflow-hidden">
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-50 text-left">
        <span className="text-sm font-medium">{title}</span>
        <span className={`text-sm font-bold ${count > 0 ? "text-red-600" : "text-gray-300"}`}>{count}건 {open ? "▲" : "▼"}</span>
      </button>
      {open && count > 0 && (
        <div className="overflow-x-auto border-t border-gray-100">
          <table className="w-full" style={{ fontSize: "12px" }}>
            <thead className="bg-gray-50">{head}</thead>
            <tbody>{rows.map((r, i) => render(r, i))}</tbody>
          </table>
        </div>
      )}
      {open && count === 0 && <div className="px-3 py-3 text-xs text-gray-400 border-t border-gray-100">문제 없음</div>}
    </div>
  );
}

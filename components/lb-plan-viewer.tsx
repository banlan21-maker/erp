"use client";

import { useState, useEffect, useCallback } from "react";

interface LbRow {
  id: string;
  vesselCode: string;
  blk: string;
  no: number | null;
  weeklyQty: number | null;
  erectionDate: string | null;
  assemblyStart: string | null;
  pnd: string | null;
  cutS: string | null;
  cutF: string | null;
  smallS: string | null;
  smallF: string | null;
  midS: string | null;
  midF: string | null;
  largeS: string | null;
  largeF: string | null;
  hullInspDate: string | null;
  paintStart: string | null;
  paintEnd: string | null;
  peStart: string | null;
  peEnd: string | null;
  delayDays: number | null;
  actualCutStart?: string | null;
}

interface LbPlanVersion {
  id: string;
  name: string;
  isDeployed: boolean;
  blockCount: number;
  createdAt: string;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "-";
  return iso.slice(0, 10);
}

function DiffBadge({ planned, actual }: { planned: string | null; actual: string | null | undefined }) {
  if (!planned || !actual) return <span className="text-gray-300 text-[10px]">-</span>;
  const diff = Math.round((new Date(actual).getTime() - new Date(planned).getTime()) / 86400000);
  if (diff === 0) return <span className="text-green-600 text-[10px] font-bold">정시</span>;
  if (diff > 0) return <span className="text-red-500 text-[10px] font-bold">+{diff}일 지연</span>;
  return <span className="text-blue-500 text-[10px] font-bold">{diff}일 선행</span>;
}

function StatusBadge({ row }: { row: LbRow }) {
  const today = new Date();
  if (!row.cutS) return <span className="text-gray-300 text-[10px]">-</span>;
  const cutSDate = new Date(row.cutS);
  const cutFDate = row.cutF ? new Date(row.cutF) : null;
  const isCompleted = cutFDate && cutFDate < today;
  if (isCompleted) return <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-gray-100 text-gray-500">완료</span>;
  if (cutSDate <= today) return <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-green-100 text-green-700">진행중</span>;
  return <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700">예정</span>;
}

export default function LbPlanViewer() {
  const [rows, setRows] = useState<LbRow[]>([]);
  const [deployedVersion, setDeployedVersion] = useState<LbPlanVersion | null>(null);
  const [vesselFilter, setVesselFilter] = useState("ALL");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    // 배포된 버전 정보 먼저 조회
    const verRes = await fetch("/api/lb-plan-version");
    const versions: LbPlanVersion[] = verRes.ok ? await verRes.json() : [];
    const deployed = versions.find(v => v.isDeployed) ?? null;
    setDeployedVersion(deployed);

    if (!deployed) {
      setRows([]);
      setLoading(false);
      return;
    }

    // 배포 버전 rows + 실제 절단일 연동
    const [planRes, logRes] = await Promise.all([
      fetch(`/api/lb-plan?versionId=${deployed.id}`),
      fetch(`/api/lb-actual-cut`),
    ]);
    const plans: LbRow[] = await planRes.json();
    const actuals: { vesselCode: string; blk: string; actualCutStart: string }[] = logRes.ok ? await logRes.json() : [];
    const actualMap = new Map(actuals.map(a => [`${a.vesselCode}|${a.blk}`, a.actualCutStart]));
    setRows(plans.map(p => ({ ...p, actualCutStart: actualMap.get(`${p.vesselCode}|${p.blk}`) ?? null })));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const vesselCodes = Array.from(new Set(rows.map(r => r.vesselCode).filter(Boolean))).sort();
  const filtered = vesselFilter === "ALL" ? rows : rows.filter(r => r.vesselCode === vesselFilter);

  const thCls = "text-center text-[11px] font-semibold text-gray-600 py-2 px-1 border-r border-b border-gray-200 whitespace-nowrap bg-gray-50";
  const tdCls = "text-center text-xs px-1 py-1 border-r border-b border-gray-100 whitespace-nowrap";

  return (
    <div className="flex flex-col gap-4">
      {/* 배포 버전 정보 */}
      {deployedVersion ? (
        <div className="flex items-center gap-3 px-3 py-2 bg-green-50 border border-green-200 rounded-lg">
          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-green-100 text-green-700">배포중</span>
          <span className="text-sm font-semibold text-green-800">{deployedVersion.name}</span>
          <span className="text-xs text-green-600">{new Date(deployedVersion.createdAt).toLocaleString("ko-KR")} · {deployedVersion.blockCount}블록</span>
          <div className="flex-1" />
          <button onClick={load} className="text-xs text-green-600 hover:underline">새로고침</button>
        </div>
      ) : (
        <div className="flex items-center gap-3 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg">
          <span className="text-sm text-gray-500">배포된 스케줄이 없습니다.</span>
          <span className="text-xs text-gray-400">L/B생성 탭에서 버전을 저장하고 배포하세요.</span>
        </div>
      )}

      {/* 필터 */}
      {deployedVersion && (
        <div className="flex flex-wrap items-center gap-2">
          <select className="border rounded-md text-sm px-2 h-9" value={vesselFilter} onChange={e => setVesselFilter(e.target.value)}>
            <option value="ALL">전체 호선</option>
            {vesselCodes.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
      )}

      {/* 테이블 */}
      <div className="overflow-x-auto rounded-lg border border-gray-200 shadow-sm">
        <table className="min-w-max w-full text-xs border-collapse">
          <thead>
            <tr>
              <th className={thCls}>상태</th>
              <th className={thCls}>NO</th>
              <th className={thCls}>호선</th>
              <th className={thCls}>BLK</th>
              <th className={thCls}>주당생산량</th>
              <th className={thCls}>탑재일</th>
              <th className={thCls}>PND</th>
              <th className={thCls}>조립착수일</th>
              <th className={`${thCls} bg-green-50 text-green-800`}>계획 절단S</th>
              <th className={`${thCls} bg-green-50 text-green-800`}>계획 절단F</th>
              <th className={`${thCls} bg-yellow-50 text-yellow-800`}>실제 절단착수</th>
              <th className={`${thCls} bg-yellow-50 text-yellow-800`}>계획 vs 실제</th>
              <th className={thCls}>소조 S/F</th>
              <th className={thCls}>중조 S/F</th>
              <th className={thCls}>대조 S/F</th>
              <th className={thCls}>선각검사</th>
              <th className={thCls}>도장 착수/완료</th>
              <th className={thCls}>P-E 착수/완료</th>
              <th className={thCls}>지연일수</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={19} className="text-center py-8 text-gray-400">불러오는 중...</td></tr>}
            {!loading && !deployedVersion && (
              <tr><td colSpan={19} className="text-center py-8 text-gray-400">배포된 스케줄이 없습니다.</td></tr>
            )}
            {!loading && deployedVersion && filtered.length === 0 && (
              <tr><td colSpan={19} className="text-center py-8 text-gray-400">데이터가 없습니다.</td></tr>
            )}
            {filtered.map(row => {
              const delay = row.delayDays;
              const delayCls = delay == null ? "text-gray-400" : delay >= 0 ? "text-green-700 font-bold" : "text-red-600 font-bold";
              return (
                <tr key={row.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className={tdCls}><StatusBadge row={row} /></td>
                  <td className={tdCls}>{row.no ?? "-"}</td>
                  <td className={`${tdCls} font-semibold`}>{row.vesselCode}</td>
                  <td className={tdCls}>{row.blk}</td>
                  <td className={tdCls}>{row.weeklyQty ?? "-"}</td>
                  <td className={tdCls}>{fmtDate(row.erectionDate)}</td>
                  <td className={tdCls}>{fmtDate(row.pnd)}</td>
                  <td className={tdCls}>{fmtDate(row.assemblyStart)}</td>
                  <td className={`${tdCls} bg-green-50 text-green-800 font-semibold`}>{fmtDate(row.cutS)}</td>
                  <td className={`${tdCls} bg-green-50 text-green-800 font-semibold`}>{fmtDate(row.cutF)}</td>
                  <td className={`${tdCls} bg-yellow-50`}>{fmtDate(row.actualCutStart)}</td>
                  <td className={`${tdCls} bg-yellow-50`}>
                    <DiffBadge planned={row.cutS} actual={row.actualCutStart} />
                  </td>
                  <td className={tdCls}>{fmtDate(row.smallS)} / {fmtDate(row.smallF)}</td>
                  <td className={tdCls}>{fmtDate(row.midS)} / {fmtDate(row.midF)}</td>
                  <td className={tdCls}>{fmtDate(row.largeS)} / {fmtDate(row.largeF)}</td>
                  <td className={tdCls}>{fmtDate(row.hullInspDate)}</td>
                  <td className={tdCls}>{fmtDate(row.paintStart)} / {fmtDate(row.paintEnd)}</td>
                  <td className={tdCls}>{fmtDate(row.peStart)} / {fmtDate(row.peEnd)}</td>
                  <td className={`${tdCls} ${delayCls}`}>
                    {delay != null ? (delay >= 0 ? `+${delay}일` : `${delay}일`) : "-"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-400">
        읽기 전용 · 실제 절단착수일은 작업일보(호선+블록 기준)에서 자동 연동됩니다
      </p>
    </div>
  );
}

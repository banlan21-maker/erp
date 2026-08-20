"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { Download, Wrench, ClipboardCheck, Search, Calendar, TrendingUp } from "lucide-react";

/**
 * 이력통계 탭 — 장비카드에 들어가지 않고 전체 수선·검사 이력을 한 화면에서 본다.
 *
 * 전에는 장비목록의 [수선이력 엑셀]·[검사이력 엑셀] 버튼으로 파일을 받아야만
 * 전체를 볼 수 있었다. 여기서 바로 조회하고, 필요하면 그 결과를 그대로 내려받는다.
 *
 * 구성
 *   · 연도 선택 → 12개월 요약표(건수·비용·비가동시간) — 어느 달에 돈이 나갔는지 한눈에
 *   · 월 선택   → 그 달 상세 리스트 (수선/검사 전환)
 *   · 엑셀      → 지금 보고 있는 목록 그대로 (검색어·월 적용된 상태)
 */

interface EqRef { id: string; name: string; code: string; kind: string; managementNo: string | null; location: string | null }
interface RepairRow {
  id: string; date: string; equipment: EqRef | null;
  cause: string | null; content: string; contractor: string | null;
  cost: number; costs: { itemName: string; amount: number }[];
  downtimeMinutes: number | null; memo: string | null;
}
interface InspectionRow {
  id: string; date: string; equipment: EqRef | null;
  itemName: string; periodMonth: number; inspector: string | null;
  nextInspectAt: string | null; memo: string | null;
}
interface MonthSummary { month: number; repairCount: number; repairCost: number; downtimeMinutes: number; inspectionCount: number }

const d10 = (s: string | null) => (s ? new Date(s).toISOString().slice(0, 10) : "");
const won = (n: number) => n.toLocaleString();
const hm = (min: number | null) => {
  if (!min) return "";
  const h = Math.floor(min / 60), m = min % 60;
  return h > 0 ? `${h}시간 ${m > 0 ? m + "분" : ""}`.trim() : `${m}분`;
};

export default function EquipmentHistoryStats({ reloadKey }: { reloadKey?: number }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState<number | "ALL">(now.getMonth() + 1);
  const [kind, setKind] = useState<"repair" | "inspection">("repair");
  const [q, setQ] = useState("");

  const [summary, setSummary] = useState<MonthSummary[]>([]);
  const [repairs, setRepairs] = useState<RepairRow[]>([]);
  const [inspections, setInspections] = useState<InspectionRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ year: String(year) });
      if (month !== "ALL") qs.set("month", String(month));
      const res = await fetch(`/api/mgmt-history?${qs}`);
      const json = await res.json();
      if (json.success) {
        setSummary(json.data.summary);
        setRepairs(json.data.repairs);
        setInspections(json.data.inspections);
      }
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => { load(); }, [load, reloadKey]);

  // 검색은 화면에서 — 한 달치라 양이 적고, 서버 왕복 없이 즉시 걸린다
  const term = q.trim().toLowerCase();
  const hit = (...vals: (string | null | undefined)[]) =>
    !term || vals.join(" ").toLowerCase().includes(term);

  const shownRepairs = useMemo(() => repairs.filter(r =>
    hit(r.equipment?.name, r.equipment?.code, r.equipment?.managementNo, r.equipment?.kind,
        r.equipment?.location, r.cause, r.content, r.contractor, r.memo)), [repairs, term]);

  const shownInspections = useMemo(() => inspections.filter(i =>
    hit(i.equipment?.name, i.equipment?.code, i.equipment?.managementNo, i.equipment?.kind,
        i.equipment?.location, i.itemName, i.inspector, i.memo)), [inspections, term]);

  const shownCost = shownRepairs.reduce((s, r) => s + r.cost, 0);
  const shownDown = shownRepairs.reduce((s, r) => s + (r.downtimeMinutes ?? 0), 0);

  const yearTot = summary.reduce(
    (a, m) => ({
      repairCount: a.repairCount + m.repairCount,
      repairCost: a.repairCost + m.repairCost,
      downtimeMinutes: a.downtimeMinutes + m.downtimeMinutes,
      inspectionCount: a.inspectionCount + m.inspectionCount,
    }),
    { repairCount: 0, repairCost: 0, downtimeMinutes: 0, inspectionCount: 0 },
  );

  const tag = month === "ALL" ? `${year}년` : `${year}-${String(month).padStart(2, "0")}`;

  const downloadList = () => {
    const rows = kind === "repair"
      ? shownRepairs.map(r => ({
          "수선일": d10(r.date),
          "장비코드": r.equipment?.code ?? "",
          "장비명": r.equipment?.name ?? "",
          "관리번호": r.equipment?.managementNo ?? "",
          "종류": r.equipment?.kind ?? "",
          "위치": r.equipment?.location ?? "",
          "고장 원인": r.cause ?? "",
          "조치 내용": r.content,
          "수선업체/담당자": r.contractor ?? "",
          "비용(원)": r.cost || "",
          "비용 내역": r.costs.map(c => `${c.itemName} ${won(c.amount)}`).join(", "),
          "비가동시간(분)": r.downtimeMinutes ?? "",
          "비고": r.memo ?? "",
        }))
      : shownInspections.map(i => ({
          "완료일": d10(i.date),
          "장비코드": i.equipment?.code ?? "",
          "장비명": i.equipment?.name ?? "",
          "관리번호": i.equipment?.managementNo ?? "",
          "종류": i.equipment?.kind ?? "",
          "위치": i.equipment?.location ?? "",
          "검사 항목": i.itemName,
          "주기(월)": i.periodMonth,
          "담당 기관/담당자": i.inspector ?? "",
          "다음 검사 예정일": d10(i.nextInspectAt),
          "비고": i.memo ?? "",
        }));
    if (rows.length === 0) { alert("내려받을 내용이 없습니다."); return; }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), kind === "repair" ? "수선이력" : "검사이력");
    XLSX.writeFile(wb, `장비_${kind === "repair" ? "수선이력" : "검사이력"}_${tag}.xlsx`);
  };

  const downloadSummary = () => {
    const rows = summary.map(m => ({
      "월": `${m.month}월`,
      "수선 건수": m.repairCount,
      "수선 비용(원)": m.repairCost,
      "비가동시간(분)": m.downtimeMinutes,
      "검사 건수": m.inspectionCount,
    }));
    rows.push({
      "월": "합계",
      "수선 건수": yearTot.repairCount,
      "수선 비용(원)": yearTot.repairCost,
      "비가동시간(분)": yearTot.downtimeMinutes,
      "검사 건수": yearTot.inspectionCount,
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "월별요약");
    XLSX.writeFile(wb, `장비_이력_월별요약_${year}.xlsx`);
  };

  const btn = "inline-flex items-center gap-1.5 px-3 h-9 text-sm rounded-lg border border-gray-300 hover:bg-gray-50";

  return (
    <div className="space-y-4">
      {/* 조회 조건 */}
      <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center gap-2 flex-wrap">
        <Calendar size={15} className="text-gray-400" />
        <input type="number" value={year} onChange={e => setYear(Number(e.target.value) || year)}
          className="w-24 h-9 px-2 border border-gray-300 rounded-lg text-sm" />
        <span className="text-sm text-gray-500">년</span>
        <select value={String(month)} onChange={e => setMonth(e.target.value === "ALL" ? "ALL" : Number(e.target.value))}
          className="h-9 px-2 border border-gray-300 rounded-lg text-sm bg-white">
          <option value="ALL">연간 전체</option>
          {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}월</option>)}
        </select>
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={q} onChange={e => setQ(e.target.value)}
            placeholder="장비명·코드·내용·업체 검색"
            className="w-full h-9 pl-8 pr-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
        </div>
        <button onClick={downloadSummary} className={btn}>
          <Download size={13} /> 월별요약 엑셀
        </button>
        <button onClick={downloadList} className="inline-flex items-center gap-1.5 px-3 h-9 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700">
          <Download size={13} /> 목록 엑셀
        </button>
      </div>

      {/* 월별 요약 */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2">
          <TrendingUp size={14} className="text-blue-600" />
          <span className="text-sm font-bold text-gray-800">{year}년 월별 요약</span>
          <span className="text-xs text-gray-400">월을 누르면 아래 목록이 그 달로 바뀝니다</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="px-2 py-2 text-left font-semibold">항목</th>
                {summary.map(m => (
                  <th key={m.month} className="px-2 py-2 text-right font-semibold">
                    <button onClick={() => setMonth(m.month)}
                      className={`hover:underline ${month === m.month ? "text-blue-600 font-bold" : ""}`}>
                      {m.month}월
                    </button>
                  </th>
                ))}
                <th className="px-2 py-2 text-right font-semibold bg-gray-100">합계</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              <tr>
                <td className="px-2 py-1.5 text-gray-600">수선 건수</td>
                {summary.map(m => <td key={m.month} className="px-2 py-1.5 text-right tabular-nums">{m.repairCount || "-"}</td>)}
                <td className="px-2 py-1.5 text-right tabular-nums font-bold bg-gray-50">{yearTot.repairCount}</td>
              </tr>
              <tr>
                <td className="px-2 py-1.5 text-gray-600">수선 비용(원)</td>
                {summary.map(m => <td key={m.month} className="px-2 py-1.5 text-right tabular-nums">{m.repairCost ? won(m.repairCost) : "-"}</td>)}
                <td className="px-2 py-1.5 text-right tabular-nums font-bold bg-gray-50">{won(yearTot.repairCost)}</td>
              </tr>
              <tr>
                <td className="px-2 py-1.5 text-gray-600">비가동시간</td>
                {summary.map(m => <td key={m.month} className="px-2 py-1.5 text-right tabular-nums">{hm(m.downtimeMinutes) || "-"}</td>)}
                <td className="px-2 py-1.5 text-right tabular-nums font-bold bg-gray-50">{hm(yearTot.downtimeMinutes) || "-"}</td>
              </tr>
              <tr>
                <td className="px-2 py-1.5 text-gray-600">검사 건수</td>
                {summary.map(m => <td key={m.month} className="px-2 py-1.5 text-right tabular-nums">{m.inspectionCount || "-"}</td>)}
                <td className="px-2 py-1.5 text-right tabular-nums font-bold bg-gray-50">{yearTot.inspectionCount}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 상세 목록 */}
      <div className="flex items-center gap-2">
        {([["repair", "수선이력", shownRepairs.length], ["inspection", "검사이력", shownInspections.length]] as const).map(([k, label, n]) => (
          <button key={k} onClick={() => setKind(k)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-lg border ${
              kind === k ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
            }`}>
            {k === "repair" ? <Wrench size={13} /> : <ClipboardCheck size={13} />} {label} {n}
          </button>
        ))}
        <span className="text-sm text-gray-500 ml-2">{tag}</span>
        {kind === "repair" && shownRepairs.length > 0 && (
          <span className="text-sm text-gray-600 ml-auto">
            비용 <b>{won(shownCost)}</b>원 · 비가동 <b>{hm(shownDown) || "0분"}</b>
          </span>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {loading ? (
          <p className="text-sm text-gray-400 text-center py-10">불러오는 중…</p>
        ) : kind === "repair" ? (
          shownRepairs.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-10">{tag} 수선이력이 없습니다.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 text-gray-500">
                  <tr>
                    <th className="px-2 py-2 text-left font-semibold">수선일</th>
                    <th className="px-2 py-2 text-left font-semibold">장비</th>
                    <th className="px-2 py-2 text-left font-semibold">고장 원인</th>
                    <th className="px-2 py-2 text-left font-semibold">조치 내용</th>
                    <th className="px-2 py-2 text-left font-semibold">업체/담당자</th>
                    <th className="px-2 py-2 text-right font-semibold">비용(원)</th>
                    <th className="px-2 py-2 text-right font-semibold">비가동</th>
                    <th className="px-2 py-2 text-left font-semibold">비고</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {shownRepairs.map(r => (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-2 py-1.5 whitespace-nowrap tabular-nums">{d10(r.date)}</td>
                      <td className="px-2 py-1.5">
                        <span className="font-semibold text-gray-800">{r.equipment?.name ?? "-"}</span>
                        <span className="text-gray-400 ml-1 font-mono text-[10px]">{r.equipment?.code}</span>
                      </td>
                      <td className="px-2 py-1.5 text-gray-600 max-w-[180px] truncate" title={r.cause ?? ""}>{r.cause ?? "-"}</td>
                      <td className="px-2 py-1.5 text-gray-800 max-w-[240px] truncate" title={r.content}>{r.content}</td>
                      <td className="px-2 py-1.5 text-gray-600">{r.contractor ?? "-"}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums" title={r.costs.map(c => `${c.itemName} ${won(c.amount)}`).join(", ")}>
                        {r.cost ? won(r.cost) : "-"}
                      </td>
                      <td className="px-2 py-1.5 text-right whitespace-nowrap">{hm(r.downtimeMinutes) || "-"}</td>
                      <td className="px-2 py-1.5 text-gray-500 max-w-[140px] truncate" title={r.memo ?? ""}>{r.memo ?? "-"}</td>
                    </tr>
                  ))}
                  <tr className="bg-gray-50 font-bold">
                    <td className="px-2 py-2 text-gray-600" colSpan={5}>합계 ({shownRepairs.length}건)</td>
                    <td className="px-2 py-2 text-right tabular-nums">{won(shownCost)}</td>
                    <td className="px-2 py-2 text-right whitespace-nowrap">{hm(shownDown) || "-"}</td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
          )
        ) : shownInspections.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-10">{tag} 검사이력이 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="px-2 py-2 text-left font-semibold">완료일</th>
                  <th className="px-2 py-2 text-left font-semibold">장비</th>
                  <th className="px-2 py-2 text-left font-semibold">검사 항목</th>
                  <th className="px-2 py-2 text-right font-semibold">주기(월)</th>
                  <th className="px-2 py-2 text-left font-semibold">담당 기관/담당자</th>
                  <th className="px-2 py-2 text-left font-semibold">다음 검사 예정</th>
                  <th className="px-2 py-2 text-left font-semibold">비고</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {shownInspections.map(i => (
                  <tr key={i.id} className="hover:bg-gray-50">
                    <td className="px-2 py-1.5 whitespace-nowrap tabular-nums">{d10(i.date)}</td>
                    <td className="px-2 py-1.5">
                      <span className="font-semibold text-gray-800">{i.equipment?.name ?? "-"}</span>
                      <span className="text-gray-400 ml-1 font-mono text-[10px]">{i.equipment?.code}</span>
                    </td>
                    <td className="px-2 py-1.5 text-gray-800">{i.itemName}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{i.periodMonth}</td>
                    <td className="px-2 py-1.5 text-gray-600">{i.inspector ?? "-"}</td>
                    <td className="px-2 py-1.5 tabular-nums text-gray-600">{d10(i.nextInspectAt) || "-"}</td>
                    <td className="px-2 py-1.5 text-gray-500 max-w-[160px] truncate" title={i.memo ?? ""}>{i.memo ?? "-"}</td>
                  </tr>
                ))}
                <tr className="bg-gray-50 font-bold">
                  <td className="px-2 py-2 text-gray-600" colSpan={7}>합계 ({shownInspections.length}건)</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

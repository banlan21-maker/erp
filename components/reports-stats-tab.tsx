"use client";

/**
 * 절단보고서 - 통계 탭
 *
 * 3개 차트:
 *  1. 일자별 장비별 절단 중량 (꺾은선)
 *  2. 일자별 장비별 절단 장수 (꺾은선)
 *  3. 장비별 원인별 미가동시간 (누적 막대)
 *
 * A4 가로 PDF 다운로드 지원 (html2canvas → jspdf).
 */

import { useRef, useState, useMemo } from "react";
import {
  ResponsiveContainer,
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import { Button } from "@/components/ui/button";
import { FileDown } from "lucide-react";

interface CuttingLog {
  id: string;
  equipment:   { id: string; name: string; type: string };
  startAt:     string;
  endAt:       string | null;
  qty:         number | null;
  steelWeight: number | null;
  pauseMs:     number;
  pauses:      { reason: string; pausedAt: string; resumedAt: string | null }[];
}

// PauseReason enum 라벨 매핑 (schema.prisma)
const REASON_LABEL: Record<string, string> = {
  EQUIPMENT_FAILURE: "장비고장",
  DRAWING_CHANGE:    "도면변경",
  CONSUMABLE:        "소모품교체",
  WORK_EXTENSION:    "퇴근/야간이월",
  OTHER:             "기타",
};

const REASON_ORDER = ["EQUIPMENT_FAILURE", "DRAWING_CHANGE", "CONSUMABLE", "WORK_EXTENSION", "OTHER"];

// 원인별 고정 색상
const REASON_COLOR: Record<string, string> = {
  EQUIPMENT_FAILURE: "#ef4444", // red
  DRAWING_CHANGE:    "#f59e0b", // amber
  CONSUMABLE:        "#3b82f6", // blue
  WORK_EXTENSION:    "#8b5cf6", // violet
  OTHER:             "#6b7280", // gray
};

// 장비 색상 팔레트 (라인 차트용)
const EQ_PALETTE = [
  "#2563eb", "#dc2626", "#16a34a", "#9333ea", "#ea580c",
  "#0891b2", "#db2777", "#65a30d", "#7c3aed", "#0d9488",
];

function eqShort(name: string): string {
  const p = name.match(/플라즈마\s*(\d+)호기/);
  if (p) return `P${p[1]}`;
  const g = name.match(/가스\s*절단기\s*(\d+)호기/);
  if (g) return `G${g[1]}`;
  return name;
}

function dateOnly(iso: string): string {
  return iso.slice(0, 10);
}

export default function ReportsStatsTab({
  logs,
  fromStr,
  toStr,
}: {
  logs: CuttingLog[];
  fromStr: string;
  toStr: string;
}) {
  const targetRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);

  // 장비 목록 (정렬)
  const equipments = useMemo(() => {
    const set = new Set(logs.map(l => eqShort(l.equipment.name)));
    return [...set].sort();
  }, [logs]);

  // 일자 목록 (정렬)
  const dates = useMemo(() => {
    const set = new Set(logs.filter(l => l.endAt).map(l => dateOnly(l.startAt)));
    return [...set].sort();
  }, [logs]);

  // 1. 일자별 장비별 절단 중량
  const weightData = useMemo(() => {
    return dates.map(date => {
      const row: Record<string, string | number> = { date };
      for (const eq of equipments) row[eq] = 0;
      for (const l of logs) {
        if (!l.endAt) continue;
        if (dateOnly(l.startAt) !== date) continue;
        const eq = eqShort(l.equipment.name);
        row[eq] = (row[eq] as number) + (l.steelWeight ?? 0);
      }
      return row;
    });
  }, [logs, dates, equipments]);

  // 2. 일자별 장비별 절단 장수 (1 row = 1 매)
  const qtyData = useMemo(() => {
    return dates.map(date => {
      const row: Record<string, string | number> = { date };
      for (const eq of equipments) row[eq] = 0;
      for (const l of logs) {
        if (!l.endAt) continue;
        if (dateOnly(l.startAt) !== date) continue;
        const eq = eqShort(l.equipment.name);
        row[eq] = (row[eq] as number) + 1; // 1 log = 1 sheet
      }
      return row;
    });
  }, [logs, dates, equipments]);

  // 3. 장비별 원인별 미가동시간(분)
  const pauseData = useMemo(() => {
    return equipments.map(eq => {
      const row: Record<string, string | number> = { equipment: eq };
      for (const r of REASON_ORDER) row[REASON_LABEL[r]] = 0;
      for (const l of logs) {
        if (eqShort(l.equipment.name) !== eq) continue;
        for (const p of l.pauses) {
          if (!p.resumedAt) continue;
          const dur = (new Date(p.resumedAt).getTime() - new Date(p.pausedAt).getTime()) / 60000;
          const label = REASON_LABEL[p.reason] ?? p.reason;
          row[label] = ((row[label] as number) ?? 0) + dur;
        }
      }
      return row;
    });
  }, [logs, equipments]);

  // PDF 다운로드 — A4 가로
  const downloadPDF = async () => {
    if (!targetRef.current) return;
    setDownloading(true);
    try {
      const html2canvas = (await import("html2canvas")).default;
      const { default: jsPDF } = await import("jspdf");

      const canvas = await html2canvas(targetRef.current, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
      });

      const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const pageW   = pdf.internal.pageSize.getWidth();   // 297 mm
      const pageH   = pdf.internal.pageSize.getHeight();  // 210 mm
      const marginX = 10;
      const marginY = 10;
      const imgW = pageW - 2 * marginX;
      const imgH = (canvas.height * imgW) / canvas.width;

      const imgData = canvas.toDataURL("image/png");

      if (imgH <= pageH - 2 * marginY) {
        pdf.addImage(imgData, "PNG", marginX, marginY, imgW, imgH);
      } else {
        // 여러 페이지 분할
        let position = marginY;
        let remaining = imgH;
        while (remaining > 0) {
          pdf.addImage(imgData, "PNG", marginX, position, imgW, imgH);
          remaining -= pageH - 2 * marginY;
          if (remaining > 0) {
            pdf.addPage();
            position = marginY - (imgH - remaining);
          }
        }
      }
      pdf.save(`절단통계_${fromStr}_${toStr}.pdf`);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-base font-semibold text-gray-800">
          통계 — <span className="text-gray-500 font-normal">{fromStr} ~ {toStr}</span>
        </h3>
        <Button
          onClick={downloadPDF}
          disabled={downloading || logs.length === 0}
          className="flex items-center gap-2"
        >
          <FileDown size={15} /> {downloading ? "생성 중..." : "PDF 다운로드 (A4 가로)"}
        </Button>
      </div>

      {logs.length === 0 ? (
        <div className="bg-white border rounded-xl p-12 text-center text-gray-400 text-sm">
          조회 기간에 절단완료 기록이 없습니다.
        </div>
      ) : (
        <div ref={targetRef} className="bg-white p-4 space-y-6">
          {/* PDF 헤더 */}
          <div className="border-b pb-3 text-center">
            <h2 className="text-lg font-bold">절단 작업 통계</h2>
            <p className="text-xs text-gray-600 mt-1">
              기간: {fromStr} ~ {toStr} · 총 {logs.length}건
            </p>
          </div>

          {/* 차트 1: 장비별 절단 중량 */}
          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-2">
              장비별 절단 중량 (kg) — 일자별
            </h4>
            <div style={{ width: "100%", height: 260 }}>
              <ResponsiveContainer>
                <LineChart data={weightData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="date" fontSize={11} />
                  <YAxis fontSize={11} />
                  <Tooltip formatter={(v) => `${Number(v).toLocaleString(undefined, { maximumFractionDigits: 1 })} kg`} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {equipments.map((eq, i) => (
                    <Line
                      key={eq}
                      type="monotone"
                      dataKey={eq}
                      stroke={EQ_PALETTE[i % EQ_PALETTE.length]}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 차트 2: 장비별 절단 장수 */}
          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-2">
              장비별 절단 장수 (매) — 일자별
            </h4>
            <div style={{ width: "100%", height: 260 }}>
              <ResponsiveContainer>
                <LineChart data={qtyData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="date" fontSize={11} />
                  <YAxis fontSize={11} allowDecimals={false} />
                  <Tooltip formatter={(v) => `${Number(v)}매`} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {equipments.map((eq, i) => (
                    <Line
                      key={eq}
                      type="monotone"
                      dataKey={eq}
                      stroke={EQ_PALETTE[i % EQ_PALETTE.length]}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 차트 3: 장비별 원인별 미가동시간 */}
          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-2">
              장비별 원인별 미가동시간 (분) — 누적
            </h4>
            <div style={{ width: "100%", height: 260 }}>
              <ResponsiveContainer>
                <BarChart data={pauseData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="equipment" fontSize={11} />
                  <YAxis fontSize={11} />
                  <Tooltip formatter={(v) => `${Math.round(Number(v))}분`} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {REASON_ORDER.map(reason => (
                    <Bar
                      key={reason}
                      dataKey={REASON_LABEL[reason]}
                      stackId="pauses"
                      fill={REASON_COLOR[reason]}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

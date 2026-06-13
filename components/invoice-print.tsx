"use client";

/**
 * 거래명세표 인쇄 페이지 — 사용자 양식 그대로 (docs/강재 출고증양식.xlsx 기반)
 *
 * 동작:
 *   - 자동 채워진 칸: 호선/블록/제품번호/재질/규격/수량/중량/면적/합계/차량번호/운전자 등
 *   - 빈칸 (사용자 직접 입력 — inline-edit):
 *       발행일자, 작성자/연락처, 인수자
 *       절단예정일, 선급, 도면번호, 절단장비, 선별지시번호
 *   - 인쇄: window.print() — A4 가로 레이아웃 (CSS @media print)
 */

import { useEffect, useState } from "react";
import { Printer, Save, Check } from "lucide-react";

export interface SupplierSnapshot {
  bizNo?:        string | null;
  name?:         string | null;
  ceo?:          string | null;
  address?:      string | null;
  bizType?:      string | null;
  bizItem?:      string | null;
  phone?:        string | null;
  fax?:          string | null;
}

export interface InvoiceItem {
  id:                string;
  vesselCode:        string;
  material:          string;
  thickness:         number;
  width:             number;
  length:            number;
  weight:            number;
  block?:            string | null;
  heatNo?:           string | null;
  cutScheduledDate?: string | null;
  classSociety?:     string | null;
  drawingNo?:        string | null;
  cuttingEquipment?: string | null;
  selectionOrderNo?: string | null;
}

export interface InvoiceVehicle {
  id:               string;
  shipmentId:       string;
  sequence:         number;
  vehicleNo:        string;
  driverName?:      string | null;
  driverPhone?:     string | null;
  invoiceNo?:       string | null;
  issueDate?:       string | null;
  writerName?:      string | null;
  writerPhone?:     string | null;
  receiverName?:    string | null;
  supplierSnapshot?: SupplierSnapshot | null;
  deliverySnapshot?: SupplierSnapshot | null;
  items:            InvoiceItem[];
}

interface Props {
  vehicle: InvoiceVehicle;
  onUpdate?: (next: InvoiceVehicle) => void;
}

const fmtDate = (iso?: string | null) =>
  iso ? iso.slice(0, 10).replace(/-/g, ".") : "";
const toYMD = (iso?: string | null) => iso ? iso.slice(0, 10) : "";

const fmtNum = (n: number, digits = 0) =>
  isFinite(n) ? n.toLocaleString("ko-KR", { minimumFractionDigits: digits, maximumFractionDigits: digits }) : "";

const area_m2 = (w: number, l: number) => (w * l) / 1_000_000;

const TOTAL_ROWS = 20;

export default function InvoicePrint({ vehicle, onUpdate }: Props) {
  const [v, setV] = useState(vehicle);
  useEffect(() => setV(vehicle), [vehicle]);

  const [savedMark, setSavedMark] = useState(false);

  // 디바운스 PATCH (단순 setTimeout)
  useEffect(() => {
    if (!onUpdate) return;
    if (JSON.stringify(v) === JSON.stringify(vehicle)) return;
    const t = setTimeout(async () => {
      await flushVehiclePatch(v);
      for (const it of v.items) {
        await flushItemPatch(v.shipmentId, v.id, it);
      }
      onUpdate(v);
      setSavedMark(true);
      setTimeout(() => setSavedMark(false), 1500);
    }, 600);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v]);

  const setVehicleField = <K extends keyof InvoiceVehicle>(k: K, val: InvoiceVehicle[K]) =>
    setV(prev => ({ ...prev, [k]: val }));

  const setItem = (idx: number, patch: Partial<InvoiceItem>) =>
    setV(prev => ({ ...prev, items: prev.items.map((it, i) => i === idx ? { ...it, ...patch } : it) }));

  const totalQty    = v.items.length;
  const totalWeight = v.items.reduce((s, it) => s + (it.weight || 0), 0);
  const totalArea   = v.items.reduce((s, it) => s + area_m2(it.width, it.length), 0);

  const S = v.supplierSnapshot ?? {};
  const D = v.deliverySnapshot ?? {};

  return (
    <>
      {/* 인쇄용 / 화면 공통 스타일 */}
      <style jsx global>{`
        @media print {
          @page { size: A4 landscape; margin: 5mm; }
          html, body { background: white !important; margin: 0 !important; padding: 0 !important; }
          /* 페이지 안에서 invoice-sheet 외 모두 숨김 — 사이드바/헤더 등 */
          body * { visibility: hidden !important; }
          .invoice-sheet, .invoice-sheet * { visibility: visible !important; }
          .invoice-sheet {
            position: absolute !important;
            left: 0; top: 0;
            width: 100% !important;
            min-height: auto !important;
            padding: 0 !important;
            margin: 0 !important;
            box-shadow: none !important;
            page-break-after: avoid;
            page-break-inside: avoid;
          }
          .invoice-sheet input { border: none !important; background: transparent !important; }
          .invoice-sheet h1 { font-size: 22px !important; margin: 0 0 4px 0 !important; }
        }
        .invoice-sheet table { border-collapse: collapse; width: 100%; font-size: 10.5px; }
        .invoice-sheet td, .invoice-sheet th { border: 1px solid #555; padding: 1px 3px; vertical-align: middle; line-height: 1.25; }
        .invoice-sheet tbody tr { height: 18px; }
        .invoice-sheet input.cell {
          width: 100%; border: 0; outline: 0; background: transparent;
          font-size: 10.5px; padding: 0;
        }
        .invoice-sheet input.cell:focus { background: #fffbcd; }
      `}</style>

      <div className="no-print flex items-center justify-between mb-3 print:hidden">
        <div className="text-sm text-gray-600">
          빈칸을 클릭해서 입력 — 1초 후 자동 저장됨
          {savedMark && <span className="ml-2 inline-flex items-center gap-1 text-emerald-600 text-xs"><Check size={12} /> 저장됨</span>}
        </div>
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Printer size={14} /> 인쇄
        </button>
      </div>

      <div className="invoice-sheet bg-white mx-auto" style={{ width: "287mm", padding: "4mm", boxSizing: "border-box" }}>
        {/* 제목 */}
        <h1 className="text-center text-2xl font-extrabold tracking-[0.3em] mb-1">거 래 명 세 표</h1>

        {/* 상단 발행일자 / 송장번호 / 출고증 */}
        <div className="flex items-center justify-between text-[11px] mb-1 px-1">
          <div className="flex items-center gap-1">
            <span className="font-semibold">발 행 일 자 :</span>
            <input
              type="date"
              value={toYMD(v.issueDate)}
              onChange={e => setVehicleField("issueDate", e.target.value ? new Date(e.target.value + "T00:00:00").toISOString() : null)}
              className="cell border-b border-gray-400 px-1 w-32"
              style={{ borderBottom: "1px solid #777" }}
            />
          </div>
          <div>송 장 등 록 번 호 : <strong className="font-mono">{v.invoiceNo}</strong></div>
          <div className="font-semibold">( 출 고 증 )</div>
        </div>

        {/* 공급자 / 공급받는자 */}
        <table className="mb-1">
          <colgroup>
            <col style={{ width: "20px" }} />
            <col style={{ width: "60px" }} />
            <col />
            <col style={{ width: "60px" }} />
            <col style={{ width: "120px" }} />
            <col style={{ width: "20px" }} />
            <col style={{ width: "60px" }} />
            <col />
            <col style={{ width: "60px" }} />
            <col style={{ width: "120px" }} />
          </colgroup>
          <tbody>
            <tr>
              <td rowSpan={5} className="text-center font-bold bg-gray-50">공<br/>급<br/>자</td>
              <td className="bg-gray-50 text-center">등록번호</td>
              <td colSpan={3}>{S.bizNo ?? ""}</td>
              <td rowSpan={5} className="text-center font-bold bg-gray-50">공<br/>급<br/>받<br/>는<br/>자</td>
              <td className="bg-gray-50 text-center">등록번호</td>
              <td colSpan={3}>{D.bizNo ?? ""}</td>
            </tr>
            <tr>
              <td className="bg-gray-50 text-center">상  호</td><td>{S.name ?? ""}</td>
              <td className="bg-gray-50 text-center">대표자</td><td>{S.ceo ?? ""}</td>
              <td className="bg-gray-50 text-center">상  호</td><td>{D.name ?? ""}</td>
              <td className="bg-gray-50 text-center">대표자</td><td>{D.ceo ?? ""}</td>
            </tr>
            <tr>
              <td className="bg-gray-50 text-center">주  소</td><td colSpan={3}>{S.address ?? ""}</td>
              <td className="bg-gray-50 text-center">주  소</td><td colSpan={3}>{D.address ?? ""}</td>
            </tr>
            <tr>
              <td className="bg-gray-50 text-center">업  태</td><td>{S.bizType ?? ""}</td>
              <td className="bg-gray-50 text-center">종 목</td><td>{S.bizItem ?? ""}</td>
              <td className="bg-gray-50 text-center">업  태</td><td>{D.bizType ?? ""}</td>
              <td className="bg-gray-50 text-center">종  목</td><td>{D.bizItem ?? ""}</td>
            </tr>
            <tr>
              <td className="bg-gray-50 text-center">전화번호</td><td>{S.phone ?? ""}</td>
              <td className="bg-gray-50 text-center">팩 스</td><td>{S.fax ?? ""}</td>
              <td className="bg-gray-50 text-center">전화번호</td><td>{D.phone ?? ""}</td>
              <td className="bg-gray-50 text-center">팩 스</td><td>{D.fax ?? ""}</td>
            </tr>
          </tbody>
        </table>

        {/* 본문 자재 테이블 */}
        <table>
          <thead>
            <tr className="bg-gray-100 text-center font-bold">
              <td rowSpan={2} style={{ width: "26px" }}>NO</td>
              <td rowSpan={2} style={{ width: "60px" }}>절단<br/>예정일</td>
              <td rowSpan={2} style={{ width: "55px" }}>호 선</td>
              <td rowSpan={2} style={{ width: "55px" }}>블 록</td>
              <td rowSpan={2} style={{ width: "70px" }}>제품번호</td>
              <td rowSpan={2} style={{ width: "50px" }}>선 급</td>
              <td rowSpan={2} style={{ width: "90px" }}>도면번호</td>
              <td rowSpan={2} style={{ width: "60px" }}>재 질</td>
              <td colSpan={3}>규 격</td>
              <td rowSpan={2} style={{ width: "45px" }}>수 량<br/>(SH)</td>
              <td rowSpan={2} style={{ width: "55px" }}>중 량<br/>(KG)</td>
              <td rowSpan={2} style={{ width: "55px" }}>면 적<br/>(m²)</td>
              <td rowSpan={2} style={{ width: "55px" }}>절단<br/>장비</td>
              <td rowSpan={2} style={{ width: "75px" }}>선별지시번호</td>
            </tr>
            <tr className="bg-gray-100 text-center font-bold">
              <td style={{ width: "40px" }}>두 께</td>
              <td style={{ width: "55px" }}>폭</td>
              <td style={{ width: "55px" }}>길 이</td>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: TOTAL_ROWS }, (_, i) => {
              const it = v.items[i];
              if (!it) {
                return (
                  <tr key={`empty-${i}`} className="text-center">
                    <td>{i + 1}</td>
                    {Array.from({ length: 15 }, (_, j) => <td key={j}>&nbsp;</td>)}
                  </tr>
                );
              }
              return (
                <tr key={it.id} className="text-center">
                  <td>{i + 1}</td>
                  <td>
                    <input type="date" className="cell" value={toYMD(it.cutScheduledDate)}
                      onChange={e => setItem(i, { cutScheduledDate: e.target.value ? new Date(e.target.value + "T00:00:00").toISOString() : null })} />
                  </td>
                  <td>{it.vesselCode}</td>
                  <td>{it.block ?? ""}</td>
                  <td className="font-mono">{it.heatNo ?? ""}</td>
                  <td><input className="cell text-center" value={it.classSociety ?? ""} onChange={e => setItem(i, { classSociety: e.target.value })} /></td>
                  <td><input className="cell text-center font-mono text-[10px]" value={it.drawingNo ?? ""} onChange={e => setItem(i, { drawingNo: e.target.value })} /></td>
                  <td>{it.material}</td>
                  <td className="text-right">{it.thickness}</td>
                  <td className="text-right">{fmtNum(it.width)}</td>
                  <td className="text-right">{fmtNum(it.length)}</td>
                  <td className="text-right">1</td>
                  <td className="text-right">{fmtNum(it.weight, 1)}</td>
                  <td className="text-right">{fmtNum(area_m2(it.width, it.length), 3)}</td>
                  <td><input className="cell text-center" value={it.cuttingEquipment ?? ""} onChange={e => setItem(i, { cuttingEquipment: e.target.value })} /></td>
                  <td><input className="cell text-center font-mono text-[10px]" value={it.selectionOrderNo ?? ""} onChange={e => setItem(i, { selectionOrderNo: e.target.value })} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* 하단 작성/합계 행 */}
        <table className="mt-0">
          <colgroup>
            <col style={{ width: "90px" }} />     {/* 작성(출고)자 라벨 */}
            <col />                                {/* 작성자 값 */}
            <col style={{ width: "90px" }} />     {/* 작성자 연락처 라벨 */}
            <col />                                {/* 작성자 연락처 값 */}
            <col style={{ width: "55px" }} />     {/* 합계 라벨 */}
            <col style={{ width: "55px" }} />     {/* 합계 수량 */}
            <col style={{ width: "70px" }} />     {/* 합계 중량 */}
            <col style={{ width: "70px" }} />     {/* 합계 면적 */}
          </colgroup>
          <tbody>
            <tr>
              <td className="bg-gray-50 text-center font-bold">작성(출고)자</td>
              <td>
                <input className="cell" value={v.writerName ?? ""} onChange={e => setVehicleField("writerName", e.target.value)} />
              </td>
              <td className="bg-gray-50 text-center font-bold">작성자 연락처</td>
              <td>
                <input className="cell font-mono" value={v.writerPhone ?? ""} onChange={e => setVehicleField("writerPhone", e.target.value)} />
              </td>
              <td className="bg-gray-50 text-center font-bold">합  계</td>
              <td className="text-right font-bold">{totalQty}</td>
              <td className="text-right font-bold">{fmtNum(totalWeight, 1)}</td>
              <td className="text-right font-bold">{fmtNum(totalArea, 3)}</td>
            </tr>
          </tbody>
        </table>

        {/* 하단 인수/차량/운전자 행 — 별도 테이블, 라벨 좁고 값 넓게 */}
        <table className="mt-0">
          <colgroup>
            <col style={{ width: "90px" }} />     {/* 인수(입고)자 라벨 */}
            <col />                                {/* 인수자 값 */}
            <col style={{ width: "70px" }} />     {/* 차량번호 라벨 */}
            <col />                                {/* 차량번호 값 */}
            <col style={{ width: "80px" }} />     {/* 운전자 성명 라벨 */}
            <col />                                {/* 운전자 성명 값 */}
            <col style={{ width: "90px" }} />     {/* 운전자 연락처 라벨 */}
            <col />                                {/* 운전자 연락처 값 */}
          </colgroup>
          <tbody>
            <tr>
              <td className="bg-gray-50 text-center font-bold">인수(입고)자</td>
              <td><input className="cell" value={v.receiverName ?? ""} onChange={e => setVehicleField("receiverName", e.target.value)} /></td>
              <td className="bg-gray-50 text-center font-bold">차량번호</td>
              <td className="font-mono">{v.vehicleNo}</td>
              <td className="bg-gray-50 text-center font-bold">운전자 성명</td>
              <td>{v.driverName ?? ""}</td>
              <td className="bg-gray-50 text-center font-bold">운전자 연락처</td>
              <td className="font-mono">{v.driverPhone ?? ""}</td>
            </tr>
          </tbody>
        </table>

        {/* 우측 하단 회사 표시 */}
        <div className="text-right mt-3 text-lg font-extrabold tracking-[0.3em]">
          한 국 테 크 ㈜ 진 교 공 장
        </div>
      </div>
    </>
  );
}

// PATCH 호출
async function flushVehiclePatch(v: InvoiceVehicle) {
  try {
    await fetch(`/api/shipments/${v.shipmentId}/vehicles/${v.id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        issueDate:    v.issueDate,
        writerName:   v.writerName,
        writerPhone:  v.writerPhone,
        receiverName: v.receiverName,
      }),
    });
  } catch { /* 다음 디바운스에 재시도됨 */ }
}
async function flushItemPatch(shipmentId: string, vid: string, it: InvoiceItem) {
  try {
    await fetch(`/api/shipments/${shipmentId}/vehicles/${vid}/items/${it.id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        block:            it.block,
        cutScheduledDate: it.cutScheduledDate,
        classSociety:     it.classSociety,
        drawingNo:        it.drawingNo,
        cuttingEquipment: it.cuttingEquipment,
        selectionOrderNo: it.selectionOrderNo,
      }),
    });
  } catch { /* 무시 */ }
}

"use client";

import { BILLING_SUPPLIER, CATEGORY_LABEL, fmtWon } from "@/lib/billing";

export interface StmtItem {
  category: string; itemDate?: string | null; hoNo?: string | null; description: string;
  qty?: number | null; weight?: number | null; unitPrice?: number | null; amount: number; vatAmount: number;
}
export interface StmtClient { name: string; bizNo?: string | null; ceo?: string | null; address?: string | null; }
export interface Stmt {
  ym: string; title?: string | null; client: StmtClient; items: StmtItem[];
  supplyAmount: number; vat: number; total: number;
  writer?: string | null; senderDate?: string | null; bomCount?: number;
}

// 표지(기성요청서) 시트를 ExcelJS 로 직접 구성 (docs/표지.xlsx 배치 재현)
function buildCoverSheet(ws: import("exceljs").Worksheet, s: Stmt) {
  ws.columns = Array.from({ length: 10 }, () => ({ width: 9 }));
  const topHo = topHoOf(s.items);
  const title = topHo ? `${s.client.name} ${topHo}호선 외` : `${s.client.name} 기성`;
  const thin = { style: "thin" as const, color: { argb: "FF000000" } };
  const box = { top: thin, left: thin, bottom: thin, right: thin };
  const M = (range: string, value: string, opts: Partial<{ bold: boolean; size: number; align: "left" | "center" }> = {}) => {
    ws.mergeCells(range);
    const c = ws.getCell(range.split(":")[0]);
    c.value = value;
    c.font = { bold: !!opts.bold, size: opts.size ?? 11 };
    c.alignment = { horizontal: opts.align ?? "left", vertical: "middle", wrapText: true };
  };

  M("A1:J1", "한국테크주식회사", { bold: true, size: 16, align: "center" }); ws.getRow(1).height = 24;
  M("A2:J2", "경남 하동군진교면 신안길 2-10 / TEL (055) 884-0785 / FAX (055) 884-0786", { size: 9, align: "center" });

  // 결재 박스 (G4:J6)
  M("G4:G6", "결 재", { align: "center" });
  ws.getCell("H4").value = "작 성"; ws.getCell("I4").value = "검 토"; ws.getCell("J4").value = "승 인";
  ["H4", "I4", "J4"].forEach(a => { ws.getCell(a).alignment = { horizontal: "center", vertical: "middle" }; });
  ws.mergeCells("H5:H6"); ws.mergeCells("I5:I6"); ws.mergeCells("J5:J6");
  for (let rr = 4; rr <= 6; rr++) for (let cc = 7; cc <= 10; cc++) ws.getCell(rr, cc).border = box;

  // 정보
  M("A5:B5", "●  문서번호 :"); M("C5:E5", "HT-관-022A");
  M("A7:B7", "●  발신일자  :"); M("C7:E7", s.senderDate ? fmtSenderDate(s.senderDate) : "");
  M("A9:B9", "●  작 성 자   :"); M("C9:E9", s.writer || "");
  M("A11:B11", "●  수     신   :"); M("C11:E11", s.client.name);
  M("A13:B13", "●  제     목   :"); M("C13:F13", title);

  // 본문
  M("A18:J18", "1. 귀사의 무궁한 발전을 기원 합니다.");
  M("A21:J21", `2. 표제의 건과 같이 ${title} 시공분의 정산 관련하여,`);
  M("A22:J22", "기성을 아래와 같은 내용으로 요청하오니 검토 후 업무 참조 바랍니다.");
  M("A25:J25", "--   아              래   --", { align: "center" });
  M("A29:J29", "1) 기성 요청 월   :  한국테크(주)  정기 기성일 기준.");
  M("A32:J32", `2) 기성 요청내용 : ${title}`);
  M("A35:J35", "3) 첨             부 :   ( 1 ) 표 지 - 1부");
  M("A36:J36", "( 2 ) 거래명세서 - 1부");
  M("A37:J37", "( 3 ) 추가절단내역 - 1부");
  M("A38:J38", `( 4 ) 상세내역 - ${Math.max(1, s.bomCount ?? 0)}부`);
  M("A39:J39", "한국테크 주식회사", { align: "center", bold: true });
}

// 라인이 제일 많은 호선 (표지 제목용)
function topHoOf(items: StmtItem[]): string {
  const m = new Map<string, number>();
  for (const it of items) if (it.category === "MAIN" && it.hoNo) m.set(it.hoNo, (m.get(it.hoNo) ?? 0) + 1);
  let best = "", n = -1;
  for (const [ho, c] of m) if (c > n) { best = ho; n = c; }
  return best;
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;
// 발신일자 "YYYY-MM-DD" → "YYYY. M. D"
function fmtSenderDate(v: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  return m ? `${m[1]}. ${Number(m[2])}. ${Number(m[3])}` : v;
}
const safe = (v: string) => v.replace(/[\\/:*?"<>|]/g, "_").slice(0, 60);
const MONEY = "#,##0";

// MAIN + 호선 있는 라인 → 호선별 그룹(첫 등장 순), 그 외(호선없음·추가절단·운송비·기타) → others
function groupByHo(items: StmtItem[]) {
  const groups: [string, StmtItem[]][] = [];
  const idx = new Map<string, StmtItem[]>();
  const others: StmtItem[] = [];
  for (const it of items) {
    if (it.category === "MAIN" && it.hoNo) {
      let arr = idx.get(it.hoNo);
      if (!arr) { arr = []; idx.set(it.hoNo, arr); groups.push([it.hoNo, arr]); }
      arr.push(it);
    } else others.push(it);
  }
  return { groups, others };
}
function sumG(arr: StmtItem[]) {
  return arr.reduce((a, it) => ({
    qty: round3(a.qty + (it.qty ?? 0)), weight: round3(a.weight + (it.weight ?? 0)),
    amount: a.amount + it.amount, vat: a.vat + it.vatAmount,
  }), { qty: 0, weight: 0, amount: 0, vat: 0 });
}

/** 테두리·정렬·인쇄영역이 잡힌 XLSX. 호선별 묶음 + 호선 소계 + 전체 소계 + 부가세 포함. */
export async function downloadStatementXlsx(s: Stmt) {
  const ExcelJS = (await import("exceljs")).default;
  const sup = BILLING_SUPPLIER;
  const { groups, others } = groupByHo(s.items);
  const grand = sumG(s.items);

  const wb = new ExcelJS.Workbook();

  // 표지(기성요청서) — 첫 시트로 ExcelJS 로 직접 생성 (템플릿 load→save 는 파일 손상 유발)
  buildCoverSheet(
    wb.addWorksheet("기성요청서", {
      pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.2, footer: 0.2 } },
    }),
    s,
  );

  const ws = wb.addWorksheet("기성청구서", {
    pageSetup: {
      paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      horizontalCentered: true, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
    },
  });
  ws.columns = [{ width: 8 }, { width: 10 }, { width: 32 }, { width: 8 }, { width: 11 }, { width: 12 }, { width: 15 }, { width: 13 }];

  const thin = { style: "thin" as const, color: { argb: "FF000000" } };
  const box = { top: thin, left: thin, bottom: thin, right: thin };
  const mergeText = (row: number, text: string, opts: Partial<{ bold: boolean; size: number; align: "left" | "center"; color: string }> = {}) => {
    ws.mergeCells(row, 1, row, 8);
    const c = ws.getCell(row, 1);
    c.value = text; c.font = { bold: !!opts.bold, size: opts.size ?? 11, color: opts.color ? { argb: opts.color } : undefined };
    c.alignment = { horizontal: opts.align ?? "left", vertical: "middle" };
  };

  let r = 1;
  mergeText(r, s.title || "기성청구서", { bold: true, size: 18, align: "center" }); ws.getRow(r).height = 30; r++;
  mergeText(r, `청구월  ${s.ym}`, { align: "center", color: "FF666666" }); r++;
  r++;
  mergeText(r, `공급받는자   ${s.client.name} 귀하`, { bold: true }); r++;
  mergeText(r, `공급자   ${sup.name} (${sup.bizNo}) · 대표 ${sup.ceo} · ${sup.address} · ${sup.bizType}/${sup.bizItem}`, { size: 9, color: "FF666666" }); r++;
  r++;

  const tableTop = r;
  // 헤더
  const headers = ["월일", "구분", "품목", "수량", "중량", "단가", "공급가액", "세액"];
  const hr = ws.getRow(r);
  headers.forEach((h, i) => {
    const c = hr.getCell(i + 1);
    c.value = h; c.font = { bold: true }; c.alignment = { horizontal: "center", vertical: "middle" };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEDEDED" } };
  });
  hr.height = 20; r++;

  const emitLine = (it: StmtItem) => {
    const row = ws.getRow(r);
    const vals: (string | number)[] = [
      it.itemDate || "", CATEGORY_LABEL[it.category] || it.category, it.description,
      it.qty ?? "", it.weight ?? "", it.unitPrice ?? "", it.amount, it.vatAmount,
    ];
    vals.forEach((v, i) => {
      const c = row.getCell(i + 1);
      c.value = v as string | number;
      c.alignment = { horizontal: i === 2 ? "left" : i >= 3 ? "right" : "center", vertical: "middle" };
      if (i >= 5) c.numFmt = MONEY;
    });
    r++;
  };
  const emitSummary = (label: string, sum: { qty: number; weight: number; amount: number; vat: number }, fill: string) => {
    const row = ws.getRow(r);
    row.getCell(3).value = label; row.getCell(3).alignment = { horizontal: "left" };
    row.getCell(4).value = sum.qty; row.getCell(4).alignment = { horizontal: "right" };
    row.getCell(5).value = sum.weight; row.getCell(5).alignment = { horizontal: "right" };
    row.getCell(7).value = Math.round(sum.amount); row.getCell(7).numFmt = MONEY; row.getCell(7).alignment = { horizontal: "right" };
    row.getCell(8).value = Math.round(sum.vat); row.getCell(8).numFmt = MONEY; row.getCell(8).alignment = { horizontal: "right" };
    for (let c = 1; c <= 8; c++) { row.getCell(c).font = { bold: true }; row.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } }; }
    r++;
  };

  // 호선별 묶음 + 호선 소계
  for (const [ho, arr] of groups) {
    for (const it of arr) emitLine(it);
    emitSummary(`${ho}호선 소계`, sumG(arr), "FFF6F6F6");
  }
  // 그 외(추가절단/운송비/기타/호선없음)
  for (const it of others) emitLine(it);

  // 전체 소계
  emitSummary("전체 소계", grand, "FFE9EFF7");

  // 부가세 포함 가격
  {
    ws.mergeCells(r, 1, r, 6); const lc = ws.getCell(r, 1);
    lc.value = "부가세 포함 가격 (공급가액 + 부가세)"; lc.font = { bold: true }; lc.alignment = { horizontal: "center" };
    ws.mergeCells(r, 7, r, 8); const vc = ws.getCell(r, 7);
    vc.value = s.total; vc.numFmt = MONEY; vc.font = { bold: true, size: 12 }; vc.alignment = { horizontal: "right" };
    r++;
  }
  const tableBottom = r - 1;

  for (let rr = tableTop; rr <= tableBottom; rr++)
    for (let cc = 1; cc <= 8; cc++) ws.getCell(rr, cc).border = box;

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `기성청구_${safe(s.client.name)}_${s.ym}.xlsx`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** 브라우저 인쇄 (새 창) — XLSX와 동일 구성 */
export function printStatement(s: Stmt) {
  const sup = BILLING_SUPPLIER;
  const { groups, others } = groupByHo(s.items);
  const grand = sumG(s.items);
  const line = (it: StmtItem) => `
    <tr>
      <td>${it.itemDate || ""}</td>
      <td>${CATEGORY_LABEL[it.category] || it.category}</td>
      <td style="text-align:left">${it.description}</td>
      <td style="text-align:right">${it.qty ?? ""}</td>
      <td style="text-align:right">${it.weight ?? ""}</td>
      <td style="text-align:right">${it.unitPrice != null ? fmtWon(it.unitPrice) : ""}</td>
      <td style="text-align:right">${fmtWon(it.amount)}</td>
      <td style="text-align:right">${fmtWon(it.vatAmount)}</td>
    </tr>`;
  const summary = (label: string, sum: { qty: number; weight: number; amount: number; vat: number }, cls: string) => `
    <tr class="${cls}">
      <td colspan="3" style="text-align:left">${label}</td>
      <td style="text-align:right">${sum.qty.toLocaleString()}</td>
      <td style="text-align:right">${sum.weight.toLocaleString()}</td>
      <td></td>
      <td style="text-align:right">${fmtWon(Math.round(sum.amount))}</td>
      <td style="text-align:right">${fmtWon(Math.round(sum.vat))}</td>
    </tr>`;
  let body = "";
  for (const [ho, arr] of groups) { body += arr.map(line).join(""); body += summary(`${ho}호선 소계`, sumG(arr), "grp"); }
  body += others.map(line).join("");

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${s.title || "기성청구서"}</title>
  <style>
    body{font-family:'Malgun Gothic',sans-serif;font-size:12px;padding:24px;color:#111}
    h1{text-align:center;font-size:22px;margin:0 0 4px}
    .sub{text-align:center;color:#666;margin-bottom:10px}
    .info{display:flex;justify-content:space-between;font-size:11px;margin-bottom:8px}
    table{width:100%;border-collapse:collapse;margin-top:8px}
    th,td{border:1px solid #333;padding:4px 6px;text-align:center}
    th{background:#eee}
    .grp td{background:#f6f6f6;font-weight:bold}
    .tot td{background:#e9eff7;font-weight:bold}
    .incl td{font-weight:bold;font-size:13px}
  </style></head><body>
    <h1>${s.title || "기성청구서"}</h1>
    <div class="sub">청구월 ${s.ym}</div>
    <div class="info">
      <div><b>공급받는자:</b> ${s.client.name} 귀하</div>
      <div><b>공급자:</b> ${sup.name} (${sup.bizNo}) · ${sup.ceo}</div>
    </div>
    <table>
      <thead><tr><th>월일</th><th>구분</th><th>품목</th><th>수량</th><th>중량</th><th>단가</th><th>공급가액</th><th>세액</th></tr></thead>
      <tbody>${body}</tbody>
      <tfoot>
        ${summary("전체 소계", grand, "tot")}
        <tr class="incl"><td colspan="6">부가세 포함 가격 (공급가액 + 부가세)</td><td colspan="2" style="text-align:right">${fmtWon(s.total)}</td></tr>
      </tfoot>
    </table>
  </body></html>`;
  const w = window.open("", "_blank", "width=900,height=700");
  if (!w) { alert("팝업이 차단되었습니다. 팝업 허용 후 다시 시도하세요."); return; }
  w.document.write(html); w.document.close(); w.focus();
  setTimeout(() => w.print(), 300);
}

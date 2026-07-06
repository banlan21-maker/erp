"use client";

import { BILLING_SUPPLIER, CATEGORY_LABEL, fmtWon } from "@/lib/billing";

export interface StmtItem {
  category: string; itemDate?: string | null; hoNo?: string | null; description: string;
  qty?: number | null; weight?: number | null; unitPrice?: number | null; amount: number; vatAmount: number;
}
export interface StmtClient { name: string; bizNo?: string | null; ceo?: string | null; address?: string | null; }
export interface Stmt {
  ym: string; title?: string | null; client: StmtClient; items: StmtItem[];
  supplyAmount: number; vat: number; total: number; prevBalance: number; deposit: number; balance: number;
}

// 호선별 소계 (MAIN + 호선 있는 라인)
function hoSubtotals(items: StmtItem[]): [string, { w: number; a: number; n: number }][] {
  const m = new Map<string, { w: number; a: number; n: number }>();
  for (const it of items) {
    if (it.category !== "MAIN" || !it.hoNo) continue;
    const c = m.get(it.hoNo) ?? { w: 0, a: 0, n: 0 };
    c.w = Math.round((c.w + (it.weight ?? 0)) * 1000) / 1000; c.a += it.amount; c.n += 1;
    m.set(it.hoNo, c);
  }
  return [...m.entries()];
}

const safe = (v: string) => v.replace(/[\\/:*?"<>|]/g, "_").slice(0, 60);
const MONEY = "#,##0";

/** 테두리·정렬·인쇄영역이 잡힌 XLSX (열면 바로 인쇄 가능). 업체별 1파일. */
export async function downloadStatementXlsx(s: Stmt) {
  const ExcelJS = (await import("exceljs")).default;
  const sup = BILLING_SUPPLIER;
  const wb = new ExcelJS.Workbook();
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
    c.value = text;
    c.font = { bold: !!opts.bold, size: opts.size ?? 11, color: opts.color ? { argb: opts.color } : undefined };
    c.alignment = { horizontal: opts.align ?? "left", vertical: "middle" };
  };

  let r = 1;
  mergeText(r, s.title || "기성청구서", { bold: true, size: 18, align: "center" }); ws.getRow(r).height = 30; r++;
  mergeText(r, `청구월  ${s.ym}`, { align: "center", color: "FF666666" }); r++;
  r++;
  mergeText(r, `공급받는자   ${s.client.name} 귀하`, { bold: true }); r++;
  mergeText(r, `공급자   ${sup.name} (${sup.bizNo}) · 대표 ${sup.ceo} · ${sup.address} · ${sup.bizType}/${sup.bizItem}`, { size: 9, color: "FF666666" }); r++;
  r++;

  // 표 시작 (헤더)
  const tableTop = r;
  const headers = ["월일", "구분", "품목", "수량", "중량", "단가", "공급가액", "세액"];
  const hr = ws.getRow(r);
  headers.forEach((h, i) => {
    const c = hr.getCell(i + 1);
    c.value = h; c.font = { bold: true }; c.alignment = { horizontal: "center", vertical: "middle" };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEDEDED" } };
  });
  hr.height = 20; r++;

  // 라인
  for (const it of s.items) {
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
  }

  // 호선별 소계
  const subs = hoSubtotals(s.items);
  if (subs.length) {
    mergeText(r, "호선별 소계", { bold: true });
    ws.getCell(r, 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF6F6F6" } };
    r++;
    for (const [ho, v] of subs) {
      const row = ws.getRow(r);
      row.getCell(1).value = `${ho}호선`;
      row.getCell(3).value = `${v.n}블록`;
      row.getCell(5).value = v.w; row.getCell(5).numFmt = MONEY;
      row.getCell(7).value = Math.round(v.a); row.getCell(7).numFmt = MONEY;
      for (let c = 4; c <= 8; c++) row.getCell(c).alignment = { horizontal: "right" };
      r++;
    }
  }

  // 합계 블록
  const totalRow = (label: string, col7: number, col8?: number) => {
    const row = ws.getRow(r);
    const lc = row.getCell(6); lc.value = label; lc.font = { bold: true }; lc.alignment = { horizontal: "center" };
    row.getCell(7).value = col7; row.getCell(7).numFmt = MONEY; row.getCell(7).alignment = { horizontal: "right" }; row.getCell(7).font = { bold: true };
    if (col8 !== undefined) { row.getCell(8).value = col8; row.getCell(8).numFmt = MONEY; row.getCell(8).alignment = { horizontal: "right" }; row.getCell(8).font = { bold: true }; }
    r++;
  };
  totalRow("계", s.supplyAmount, s.vat);
  totalRow("합계금액", s.total);
  totalRow("전잔금", s.prevBalance);
  totalRow("입금", s.deposit);
  totalRow("잔금", s.balance);
  const tableBottom = r - 1;

  // 표 전체 테두리
  for (let rr = tableTop; rr <= tableBottom; rr++)
    for (let cc = 1; cc <= 8; cc++) ws.getCell(rr, cc).border = box;

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `기성청구_${safe(s.client.name)}_${s.ym}.xlsx`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** 브라우저 인쇄 (새 창) */
export function printStatement(s: Stmt) {
  const sup = BILLING_SUPPLIER;
  const rowsHtml = s.items.map(it => `
    <tr>
      <td>${it.itemDate || ""}</td>
      <td>${CATEGORY_LABEL[it.category] || it.category}</td>
      <td style="text-align:left">${it.description}</td>
      <td style="text-align:right">${it.qty ?? ""}</td>
      <td style="text-align:right">${it.weight ?? ""}</td>
      <td style="text-align:right">${it.unitPrice != null ? fmtWon(it.unitPrice) : ""}</td>
      <td style="text-align:right">${fmtWon(it.amount)}</td>
      <td style="text-align:right">${fmtWon(it.vatAmount)}</td>
    </tr>`).join("");
  const subs = hoSubtotals(s.items);
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${s.title || "기성청구서"}</title>
  <style>
    body{font-family:'Malgun Gothic',sans-serif;font-size:12px;padding:24px;color:#111}
    h1{text-align:center;font-size:22px;margin:0 0 4px}
    .sub{text-align:center;color:#666;margin-bottom:10px}
    .info{display:flex;justify-content:space-between;font-size:11px;margin-bottom:8px}
    table{width:100%;border-collapse:collapse;margin-top:8px}
    th,td{border:1px solid #333;padding:4px 6px;text-align:center}
    th{background:#eee}
    tfoot td{text-align:right;font-weight:bold}
    .grp td{background:#f6f6f6;font-weight:bold;text-align:left}
  </style></head><body>
    <h1>${s.title || "기성청구서"}</h1>
    <div class="sub">청구월 ${s.ym}</div>
    <div class="info">
      <div><b>공급받는자:</b> ${s.client.name} 귀하</div>
      <div><b>공급자:</b> ${sup.name} (${sup.bizNo}) · ${sup.ceo}</div>
    </div>
    <table>
      <thead><tr><th>월일</th><th>구분</th><th>품목</th><th>수량</th><th>중량</th><th>단가</th><th>공급가액</th><th>세액</th></tr></thead>
      <tbody>${rowsHtml}</tbody>
      ${subs.length ? `<tbody><tr class="grp"><td colspan="8">호선별 소계</td></tr>${subs.map(([ho, v]) => `<tr><td colspan="2">${ho}호선</td><td>${v.n}블록</td><td colspan="2"></td><td style="text-align:right">중량 ${v.w.toLocaleString()}</td><td style="text-align:right">${fmtWon(Math.round(v.a))}</td><td></td></tr>`).join("")}</tbody>` : ""}
      <tfoot>
        <tr><td colspan="6">계</td><td>${fmtWon(s.supplyAmount)}</td><td>${fmtWon(s.vat)}</td></tr>
        <tr><td colspan="6">합계금액</td><td colspan="2">${fmtWon(s.total)}</td></tr>
        <tr><td colspan="6">전잔금 · 입금 · 잔금</td><td colspan="2">${fmtWon(s.prevBalance)} · ${fmtWon(s.deposit)} · ${fmtWon(s.balance)}</td></tr>
      </tfoot>
    </table>
  </body></html>`;
  const w = window.open("", "_blank", "width=900,height=700");
  if (!w) { alert("팝업이 차단되었습니다. 팝업 허용 후 다시 시도하세요."); return; }
  w.document.write(html); w.document.close(); w.focus();
  setTimeout(() => w.print(), 300);
}

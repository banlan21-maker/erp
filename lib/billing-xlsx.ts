"use client";

import * as XLSX from "xlsx";
import { BILLING_SUPPLIER, CATEGORY_LABEL, fmtWon } from "@/lib/billing";

export interface StmtItem {
  category: string; itemDate?: string | null; description: string;
  qty?: number | null; weight?: number | null; unitPrice?: number | null; amount: number; vatAmount: number;
}
export interface StmtClient { name: string; bizNo?: string | null; ceo?: string | null; address?: string | null; }
export interface Stmt {
  ym: string; title?: string | null; client: StmtClient; items: StmtItem[];
  supplyAmount: number; vat: number; total: number; prevBalance: number; deposit: number; balance: number;
}

// 세금계산서형 기성청구서를 2차원 배열(aoa)로 구성
function toAoa(s: Stmt): (string | number)[][] {
  const sup = BILLING_SUPPLIER;
  const rows: (string | number)[][] = [];
  rows.push([s.title || "기성청구서"]);
  rows.push([`청구월: ${s.ym}`]);
  rows.push([]);
  rows.push(["[공급자]", sup.name, `등록번호 ${sup.bizNo}`, `대표 ${sup.ceo}`]);
  rows.push(["", sup.address, `${sup.bizType} / ${sup.bizItem}`]);
  rows.push(["[공급받는자]", `${s.client.name} 귀하`, s.client.bizNo ? `등록번호 ${s.client.bizNo}` : ""]);
  rows.push([]);
  rows.push(["월일", "구분", "품목", "수량", "중량", "단가", "공급가액", "세액"]);
  for (const it of s.items) {
    rows.push([
      it.itemDate || "", CATEGORY_LABEL[it.category] || it.category, it.description,
      it.qty ?? "", it.weight ?? "", it.unitPrice ?? "", it.amount, it.vatAmount,
    ]);
  }
  rows.push([]);
  rows.push(["", "", "", "", "", "계", s.supplyAmount, s.vat]);
  rows.push(["", "", "", "", "", "합계금액", s.total]);
  rows.push(["", "", "", "", "", "전잔금", s.prevBalance]);
  rows.push(["", "", "", "", "", "입금", s.deposit]);
  rows.push(["", "", "", "", "", "잔금", s.balance]);
  return rows;
}

const safe = (v: string) => v.replace(/[\\/:*?"<>|]/g, "_").slice(0, 60);

/** 업체별 1파일 XLSX 다운로드 */
export function downloadStatementXlsx(s: Stmt) {
  const ws = XLSX.utils.aoa_to_sheet(toAoa(s));
  ws["!cols"] = [{ wch: 8 }, { wch: 10 }, { wch: 28 }, { wch: 8 }, { wch: 10 }, { wch: 12 }, { wch: 14 }, { wch: 12 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "기성청구서");
  XLSX.writeFile(wb, `기성청구_${safe(s.client.name)}_${s.ym}.xlsx`);
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
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${s.title || "기성청구서"}</title>
  <style>
    body{font-family:'Malgun Gothic',sans-serif;font-size:12px;padding:24px;color:#111}
    h1{text-align:center;font-size:20px;margin:0 0 12px}
    .info{display:flex;justify-content:space-between;font-size:11px;margin-bottom:8px}
    table{width:100%;border-collapse:collapse;margin-top:8px}
    th,td{border:1px solid #333;padding:4px 6px;text-align:center}
    th{background:#f0f0f0}
    .tot td{font-weight:bold}
    tfoot td{text-align:right;font-weight:bold}
  </style></head><body>
    <h1>${s.title || "기성청구서"}</h1>
    <div class="info">
      <div><b>공급받는자:</b> ${s.client.name} 귀하 &nbsp; <b>청구월:</b> ${s.ym}</div>
      <div><b>공급자:</b> ${sup.name} (${sup.bizNo}) · ${sup.ceo}</div>
    </div>
    <table>
      <thead><tr><th>월일</th><th>구분</th><th>품목</th><th>수량</th><th>중량</th><th>단가</th><th>공급가액</th><th>세액</th></tr></thead>
      <tbody>${rowsHtml}</tbody>
      <tfoot>
        <tr class="tot"><td colspan="6">계</td><td>${fmtWon(s.supplyAmount)}</td><td>${fmtWon(s.vat)}</td></tr>
        <tr class="tot"><td colspan="6">합계금액</td><td colspan="2">${fmtWon(s.total)}</td></tr>
        <tr><td colspan="6">전잔금 ${fmtWon(s.prevBalance)} · 입금 ${fmtWon(s.deposit)} · 잔금 ${fmtWon(s.balance)}</td><td colspan="2"></td></tr>
      </tfoot>
    </table>
  </body></html>`;
  const w = window.open("", "_blank", "width=900,height=700");
  if (!w) { alert("팝업이 차단되었습니다. 팝업 허용 후 다시 시도하세요."); return; }
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 300);
}

/**
 * 선별지시서 · 미입고 강재 출력 (2026-10-02)
 *
 * 사무실이 강재매칭 결과를 매일 엑셀(「선별 지시서용.xlsx」, 6/11~10/1 78장)로 옮겨 적던 두 양식을
 * ERP 데이터로 바로 찍는다. 양식은 그 엑셀 그대로:
 *   선별지시서 — "선 별 지 시 서 (10/01)" / 호선·블록·착지·재질·두께·폭·길이·보관위치·입고일,
 *                보관위치 순(야적장을 위치 순서대로 돌며 꺼낸다), 맑은 고딕 20pt · 가로 · 1~2행 반복.
 *                중량은 원본처럼 인쇄 범위 밖 J열 수식(차량 적재 계산용).
 *   미입고 강재 — "미입고 강재 (07/03)" / 번호·호선·블록·재질·두께·폭·길이·비고, 세로.
 * 인쇄는 새 창 HTML, 엑셀은 exceljs(브라우저 빌드, 쓸 때만 불러옴).
 */

export type SheetRow = {
  vesselCode: string; block: string; dest: string; material: string;
  thickness: number; width: number; length: number;
  location: string; receivedAt: string; // "26.05.13"
};
export type UnreceivedRow = { vesselCode: string; block: string; material: string; thickness: number; width: number; length: number; note: string };

const t1 = (v: number) => parseFloat(v.toFixed(1));
const l0 = (v: number) => Math.round(v);
export const plateKg = (t: number, w: number, l: number) => (t * w * l * 7.85) / 1_000_000;

/** "26.05.13" — 원본 입고일 표기 */
export const ymdDot = (iso: string | null | undefined) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const k = new Date(d.getTime() + 9 * 3600_000); // KST
  return `${String(k.getUTCFullYear()).slice(2)}.${String(k.getUTCMonth() + 1).padStart(2, "0")}.${String(k.getUTCDate()).padStart(2, "0")}`;
};
/** 오늘 "10/02" */
export const todayMd = () => {
  const k = new Date(Date.now() + 9 * 3600_000);
  return `${String(k.getUTCMonth() + 1).padStart(2, "0")}/${String(k.getUTCDate()).padStart(2, "0")}`;
};

const cmp = (a: string, b: string) => a.localeCompare(b, "ko", { numeric: true });
/** 야적장 칸(5B · A0~F0) → 이름으로 된 장소(절단샵 등) → 위치 없음. ko 정렬은 한글을 영문보다 앞에 둬서 따로 나눈다 */
const locRank = (loc: string) => (!loc ? 2 : /^[0-9A-Za-z]/.test(loc) ? 0 : 1);
/** 보관위치 → 블록 → 두께 → 폭 → 길이 */
export function sortSheetRows(rows: SheetRow[]): SheetRow[] {
  return [...rows].sort((a, b) =>
    locRank(a.location) - locRank(b.location) || cmp(a.location, b.location) || cmp(a.block, b.block) ||
    a.thickness - b.thickness || a.width - b.width || a.length - b.length);
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function writeDoc(win: Window, title: string, landscape: boolean, head: string[], body: string[][], foot: string) {
  const th = head.map(h => `<th>${esc(h)}</th>`).join("");
  const trs = body.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join("")}</tr>`).join("");
  win.document.write(`<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"/><title>${esc(title)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: "Malgun Gothic", "맑은 고딕", sans-serif; color: #000; padding: 4mm; }
  table { width: 100%; border-collapse: collapse; }
  thead { display: table-header-group; }
  caption { font-size: 22pt; padding: 2mm 0 3mm; letter-spacing: 1px; }
  th, td { border: 1px solid #000; text-align: center; vertical-align: middle; font-size: 15pt; padding: 1px 4px; line-height: 1.25; white-space: nowrap; font-weight: normal; }
  th { background: #f0f0f0; }
  tbody tr:nth-child(even) td { background: #fafafa; }
  .foot { margin-top: 2mm; font-size: 10pt; color: #444; text-align: right; }
  tr { page-break-inside: avoid; }
  @media print { body { padding: 0; } @page { margin: 8mm; size: A4 ${landscape ? "landscape" : "portrait"}; } }
</style></head><body>
<table><caption>${esc(title)}</caption><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table>
<p class="foot">${esc(foot)}</p>
<script>window.onload = () => { window.print(); }<\/script>
</body></html>`);
  win.document.close();
}

export const sheetTitle = (md: string, suffix = "") => `선 별 지 시 서 (${md})${suffix ? ` ${suffix}` : ""}`;
export const unreceivedTitle = (md: string, suffix = "") => `미입고 강재 (${md})${suffix ? ` ${suffix}` : ""}`;

const SHEET_HEAD = ["호선", "블록", "착지", "재질", "두께", "폭", "길이", "보관위치", "입고일"];
const sheetCells = (r: SheetRow) => [r.vesselCode, r.block, r.dest, r.material, String(t1(r.thickness)), String(l0(r.width)), String(l0(r.length)), r.location, r.receivedAt];

export function printSelectionSheet(win: Window, title: string, rows: SheetRow[]) {
  const sorted = sortSheetRows(rows);
  const kg = sorted.reduce((s, r) => s + plateKg(r.thickness, r.width, r.length), 0);
  writeDoc(win, title, true, SHEET_HEAD, sorted.map(sheetCells), `총 ${sorted.length}장 · ${Math.round(kg).toLocaleString()} kg`);
}

const UNRCV_HEAD = ["번호", "호선", "블록", "재질", "두께", "폭", "길이", "비고"];
export function printUnreceived(win: Window, title: string, rows: UnreceivedRow[]) {
  writeDoc(win, title, false, UNRCV_HEAD,
    rows.map((r, i) => [String(i + 1), r.vesselCode, r.block, r.material, String(t1(r.thickness)), String(l0(r.width)), String(l0(r.length)), r.note]),
    `총 ${rows.length}장`);
}

/* ── 엑셀 ─────────────────────────────────────────────────────────────────── */
type XWs = import("exceljs").Worksheet;
const thin = { style: "thin" as const };
const box = { top: thin, left: thin, bottom: thin, right: thin };

async function newBook() {
  const ExcelJS = (await import("exceljs")).default;
  return new ExcelJS.Workbook();
}
function styleGrid(ws: XWs, fromRow: number, toRow: number, cols: number, size: number) {
  for (let r = fromRow; r <= toRow; r++) {
    const row = ws.getRow(r);
    for (let c = 1; c <= cols; c++) {
      const cell = row.getCell(c);
      cell.font = { name: "맑은 고딕", size };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border = box;
    }
  }
}
async function save(wb: import("exceljs").Workbook, name: string) {
  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
const fileMd = (md: string) => md.replace("/", "");

export async function downloadSelectionSheet(md: string, title: string, rows: SheetRow[]) {
  const sorted = sortSheetRows(rows);
  const wb = await newBook();
  const ws = wb.addWorksheet(`선별지시서(${fileMd(md)})`, {
    pageSetup: { orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: "1:2", horizontalCentered: true },
  });
  ws.columns = [17.4, 17.9, 26.4, 9.3, 14.3, 8.4, 14, 12.8, 23.9, 12].map(width => ({ width }));
  ws.mergeCells("A1:I1");
  ws.getCell("A1").value = title;
  ws.getRow(2).values = SHEET_HEAD;
  sorted.forEach((r, i) => {
    const n = i + 3;
    ws.getRow(n).values = [r.vesselCode, r.block, r.dest, r.material, t1(r.thickness), l0(r.width), l0(r.length), r.location, r.receivedAt];
    ws.getCell(`J${n}`).value = { formula: `F${n}*G${n}*E${n}*(7.85)/1000000`, result: plateKg(r.thickness, r.width, r.length) };
  });
  const last = sorted.length + 2;
  styleGrid(ws, 1, last, 9, 20);
  ws.getCell("A1").font = { name: "맑은 고딕", size: 24 };
  ws.getRow(1).height = 38.25;
  for (let r = 2; r <= last; r++) ws.getRow(r).height = 31.5;
  for (let r = 3; r <= last; r++) ws.getCell(`J${r}`).numFmt = "#,##0.0";
  ws.pageSetup.printArea = `A1:I${last}`;
  await save(wb, `선별지시서_${fileMd(md)}.xlsx`);
}

export async function downloadUnreceived(md: string, title: string, rows: UnreceivedRow[]) {
  const wb = await newBook();
  const ws = wb.addWorksheet(`미입고강재(${fileMd(md)})`, {
    pageSetup: { orientation: "portrait", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: "1:2", horizontalCentered: true },
  });
  ws.columns = [11.6, 23.7, 16.6, 12, 12.6, 16.6, 18.8, 22].map(width => ({ width }));
  ws.mergeCells("A1:H1");
  ws.getCell("A1").value = title;
  ws.getRow(2).values = UNRCV_HEAD;
  rows.forEach((r, i) => { ws.getRow(i + 3).values = [i + 1, r.vesselCode, r.block, r.material, t1(r.thickness), l0(r.width), l0(r.length), r.note]; });
  const last = rows.length + 2;
  styleGrid(ws, 1, last, 8, 28);
  ws.getCell("A1").font = { name: "맑은 고딕", size: 24 };
  ws.getRow(1).height = 38.25;
  for (let r = 2; r <= last; r++) ws.getRow(r).height = 41.25;
  await save(wb, `미입고강재_${fileMd(md)}.xlsx`);
}

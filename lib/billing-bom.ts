"use client";

import * as XLSX from "xlsx";

export interface BomConfig { startRow: number; colHo: string; colBlock: string; colQty: string; colWeight: string; }
export interface BomLine { hoNo: string; block: string; qty: number; weight: number; }

const colIdx = (letter: string) => XLSX.utils.decode_col(String(letter || "A").trim().toUpperCase());
const round3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * BOM 엑셀 → 호선·블록별 집계 (부재수량 합, 부재중량 합).
 *  - startRow(1-based)부터, 원청별 열 매핑 사용.
 *  - 호선·블록 둘 다 있는 행만. 마지막 합계/소계 행(합계·계·total 키워드 or 호선/블록 빈칸)은 자동 제외.
 */
export async function parseBomFile(file: File, cfg: BomConfig): Promise<BomLine[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(new Uint8Array(buf), { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return [];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false });

  const iHo = colIdx(cfg.colHo), iBlock = colIdx(cfg.colBlock), iQty = colIdx(cfg.colQty), iWt = colIdx(cfg.colWeight);
  const start = Math.max(0, (cfg.startRow || 1) - 1);

  const map = new Map<string, BomLine>();
  const order: string[] = [];
  for (let r = start; r < rows.length; r++) {
    const row = rows[r]; if (!Array.isArray(row)) continue;
    const ho = String(row[iHo] ?? "").trim();
    const block = String(row[iBlock] ?? "").trim();
    if (!ho || !block) continue;                                  // 빈칸/합계행 제외
    if (/합\s*계|소\s*계|total|총\s*계/i.test(`${ho} ${block}`)) continue; // 합계행 키워드 제외
    const qty = Number(String(row[iQty] ?? "").toString().replace(/,/g, "")) || 0;
    const weight = Number(String(row[iWt] ?? "").toString().replace(/,/g, "")) || 0;
    if (!qty && !weight) continue;
    const key = `${ho}||${block}`;
    let cur = map.get(key);
    if (!cur) { cur = { hoNo: ho, block, qty: 0, weight: 0 }; map.set(key, cur); order.push(key); }
    cur.qty += qty; cur.weight += weight;
  }
  return order.map(k => { const l = map.get(k)!; return { ...l, qty: round3(l.qty), weight: round3(l.weight) }; });
}

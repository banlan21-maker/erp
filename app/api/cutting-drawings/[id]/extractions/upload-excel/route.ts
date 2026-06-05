/**
 * 절단도면 추출 결과 엑셀 일괄 업로드 (Phase B-4)
 *
 * POST /api/cutting-drawings/[id]/extractions/upload-excel
 *   multipart: file (xlsx/xls), action ("preview" | "save")
 *
 * 엑셀 컬럼 (헤더 이름으로 자동 매핑 — 한글/영문 혼용 가능):
 *   페이지 / page | 도면번호 / drawing | 부재중량 / weight | 마킹길이 / marking | 절단길이 / cutting
 *
 * 흐름:
 *   1) xlsx 파싱 → 첫 시트 → header 자동 매핑
 *   2) 각 행 검증 (pageNumber 필수)
 *   3) action="preview" → 처음 50행 반환
 *   4) action="save"    → (pdfId, pageNumber) 기준 upsert (method="EXCEL")
 *
 * PC 변환 스크립트 (Phase B-5, Python + PaddleOCR/MinerU) 가 만드는 엑셀 형식과 일치.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import * as XLSX from "xlsx";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface ParsedRow {
  pageNumber: number;
  drawingNo:  string | null;
  partWeight: number | null;
  markingLen: number | null;
  cuttingLen: number | null;
  rowIndex:   number; // 엑셀 시트 row (1-indexed, 헤더 포함)
}

function toStr(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}

function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[^\d.\-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

// 헤더 이름으로 컬럼 인덱스 찾기 (소문자 포함 매칭)
function findColumn(headers: string[], candidates: string[]): number {
  for (let i = 0; i < headers.length; i++) {
    const h = (headers[i] ?? "").toString().toLowerCase().replace(/\s+/g, "");
    for (const c of candidates) {
      if (h.includes(c.toLowerCase().replace(/\s+/g, ""))) return i;
    }
  }
  return -1;
}

function parseExcel(buffer: Buffer): { rows: ParsedRow[]; warnings: string[] } {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return { rows: [], warnings: ["엑셀에 시트가 없습니다."] };

  const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null });
  if (raw.length < 2) return { rows: [], warnings: ["헤더 행 + 데이터 행이 필요합니다."] };

  // 첫 행이 헤더라고 가정
  const headers = (raw[0] as unknown[]).map(v => v ?? "") as string[];
  const pageCol    = findColumn(headers, ["페이지", "page"]);
  const drawingCol = findColumn(headers, ["도면번호", "도면", "drawing"]);
  const weightCol  = findColumn(headers, ["부재중량", "part weight", "weight"]);
  const markingCol = findColumn(headers, ["마킹길이", "마킹", "marking"]);
  const cuttingCol = findColumn(headers, ["절단길이", "절단", "cutting"]);

  const warnings: string[] = [];
  if (pageCol < 0)    warnings.push("'페이지' 컬럼이 없어 행을 식별할 수 없습니다.");
  if (drawingCol < 0) warnings.push("'도면번호' 컬럼이 없습니다 (선택).");
  if (weightCol < 0)  warnings.push("'부재중량' 컬럼이 없습니다.");
  if (markingCol < 0) warnings.push("'마킹길이' 컬럼이 없습니다.");
  if (cuttingCol < 0) warnings.push("'절단길이' 컬럼이 없습니다.");

  const rows: ParsedRow[] = [];
  for (let i = 1; i < raw.length; i++) {
    const r = raw[i] as unknown[];
    if (!r || r.every(c => c === null || c === "")) continue; // 빈 행 skip
    const pageNumber = pageCol >= 0 ? toNum(r[pageCol]) : null;
    if (!pageNumber || pageNumber < 1) continue; // 페이지 없으면 skip
    rows.push({
      pageNumber: Math.floor(pageNumber),
      drawingNo:  drawingCol >= 0 ? toStr(r[drawingCol]) : null,
      partWeight: weightCol  >= 0 ? toNum(r[weightCol])  : null,
      markingLen: markingCol >= 0 ? toNum(r[markingCol]) : null,
      cuttingLen: cuttingCol >= 0 ? toNum(r[cuttingCol]) : null,
      rowIndex:   i + 1,
    });
  }
  return { rows, warnings };
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const pdf = await prisma.cuttingDrawingPdf.findUnique({ where: { id }, select: { id: true, filename: true, pageCount: true } });
    if (!pdf) return NextResponse.json({ success: false, error: "PDF not found" }, { status: 404 });

    const form = await req.formData();
    const file   = form.get("file");
    const action = form.get("action");
    if (!(file instanceof File)) return NextResponse.json({ success: false, error: "file 필수" }, { status: 400 });
    if (action !== "preview" && action !== "save") {
      return NextResponse.json({ success: false, error: "action 은 'preview' 또는 'save'" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const { rows, warnings } = parseExcel(buffer);

    if (action === "preview") {
      return NextResponse.json({
        success: true,
        pdf: { id: pdf.id, filename: pdf.filename, pageCount: pdf.pageCount },
        warnings,
        total: rows.length,
        rows:  rows.slice(0, 50),
      });
    }

    // save — upsert (pdfId, pageNumber)
    let saved = 0;
    for (const r of rows) {
      // 4개 다 비어있으면 skip (의미 없는 행)
      if (!r.drawingNo && r.partWeight === null && r.markingLen === null && r.cuttingLen === null) continue;
      await prisma.cuttingDrawingExtraction.upsert({
        where:  { pdfId_pageNumber: { pdfId: id, pageNumber: r.pageNumber } },
        create: {
          pdfId: id,
          pageNumber: r.pageNumber,
          drawingNo:  r.drawingNo,
          partWeight: r.partWeight,
          markingLen: r.markingLen,
          cuttingLen: r.cuttingLen,
          method:     "EXCEL",
        },
        update: {
          drawingNo:  r.drawingNo,
          partWeight: r.partWeight,
          markingLen: r.markingLen,
          cuttingLen: r.cuttingLen,
          method:     "EXCEL",
          presetId:   null,
        },
      });
      saved++;
    }

    return NextResponse.json({ success: true, saved, total: rows.length, warnings });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "엑셀 업로드 실패";
    console.error("[POST upload-excel]", err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

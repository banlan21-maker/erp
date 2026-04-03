export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import * as XLSX from "xlsx";

// Excel serial number → ISO date string (날짜만, 시간 제거)
function excelDateToISO(value: unknown): string | null {
  if (value == null || value === "") return null;

  // Date 객체 (cellDates: true 옵션 시)
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return null;
    return value.toISOString().slice(0, 10);
  }

  // 숫자 (Excel serial number)
  if (typeof value === "number") {
    const d = XLSX.SSF.parse_date_code(value);
    if (!d) return null;
    const mm = String(d.m).padStart(2, "0");
    const dd = String(d.d).padStart(2, "0");
    return `${d.y}-${mm}-${dd}`;
  }

  // 문자열 (예: "2026-05-20", "2026-05-20 12:00:00")
  if (typeof value === "string") {
    const trimmed = value.trim().slice(0, 10);
    const parsed = new Date(trimmed);
    if (isNaN(parsed.getTime())) return null;
    return trimmed;
  }

  return null;
}

// A열이 숫자(호선번호)인지 확인 — 헤더/빈 행 제외
function isVesselCode(v: unknown): boolean {
  if (v == null || v === "") return false;
  // 숫자 또는 숫자 문자열 (4506, "4506" 등)
  return !isNaN(Number(String(v).trim()));
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "파일이 없습니다." }, { status: 400 });
    }

    const dataStartRowRaw = formData.get("dataStartRow");
    const dataStartRow = dataStartRowRaw ? Math.max(1, Number(dataStartRowRaw)) : 6;

    const buffer = Buffer.from(await file.arrayBuffer());

    // 서버사이드 파싱: cellDates 로 날짜 객체 변환 시도
    const wb = XLSX.read(buffer, { cellDates: true, dense: false });

    // 시트 선택: "LB{월}{일}" 패턴 우선, 없으면 첫 번째 시트
    const sheetName =
      wb.SheetNames.find(n => /^LB\d{2}월\d{2}일/.test(n)) ??
      wb.SheetNames[0];

    if (!sheetName) {
      return NextResponse.json({ error: "시트를 찾을 수 없습니다." }, { status: 400 });
    }

    const ws = wb.Sheets[sheetName];

    // header:1 → 2차원 배열로 읽기
    const rawRows: unknown[][] = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      raw: true,       // 원시값 (숫자 serial 등) 유지
      defval: null,
    });

    // 헤더 건너뜀: dataStartRow 행부터 데이터 (1-indexed → 0-indexed: slice(dataStartRow - 1))
    const dataRows = rawRows.slice(dataStartRow - 1);

    const rows = dataRows
      .filter(r => isVesselCode(r[0]))   // A열 숫자 행만
      .map((r, idx) => ({
        // A~U 컬럼 매핑
        vesselCode:   String(r[0]).trim(),
        blk:          r[1] != null ? String(r[1]).trim() : "",
        no:           r[2] != null ? Number(r[2]) : null,
        weeklyQty:    r[3] != null ? Number(r[3]) : null,
        erectionDate: excelDateToISO(r[4]),
        pnd:          excelDateToISO(r[5]),
        assemblyStart: excelDateToISO(r[6]),
        cutS:         excelDateToISO(r[7]),
        cutF:         excelDateToISO(r[8]),
        smallS:       excelDateToISO(r[9]),
        smallF:       excelDateToISO(r[10]),
        midS:         excelDateToISO(r[11]),
        midF:         excelDateToISO(r[12]),
        largeS:       excelDateToISO(r[13]),
        largeF:       excelDateToISO(r[14]),
        hullInspDate: excelDateToISO(r[15]),
        paintStart:   excelDateToISO(r[16]),
        paintEnd:     excelDateToISO(r[17]),
        peStart:      excelDateToISO(r[18]),
        peEnd:        excelDateToISO(r[19]),
        delayDays:    r[20] != null && !isNaN(Number(r[20])) ? Number(r[20]) : null,
        _rowIdx: idx, // 디버그용
      }))
      .filter(r => r.blk); // BLK 비어있는 행 제외

    return NextResponse.json({
      sheetName,
      totalRows: rows.length,
      rows,
    });
  } catch (err) {
    console.error("[lb-import] parse error:", err);
    return NextResponse.json({ error: "파일 파싱 중 오류가 발생했습니다." }, { status: 500 });
  }
}

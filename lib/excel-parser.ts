import * as XLSX from "xlsx";

export interface PresetConfig {
  dataStartRow: number;
  colBlock: number | null;
  colDrawingNo: number | null;
  colHeatNo: number | null;
  colMaterial: number | null;
  colThickness: number | null;
  colWidth: number | null;
  colLength: number | null;
  colQty: number | null;
  colSteelWeight: number | null;
  colUseWeight: number | null;
}

export interface DrawingListRow {
  block: string | null;
  drawingNo: string | null;
  heatNo: string | null;
  material: string;
  thickness: number;
  width: number;
  length: number;
  qty: number;
  steelWeight: number | null;
  useWeight: number | null;
}

export interface ParseResult {
  success: boolean;
  rows: DrawingListRow[];
  errors: string[];
  totalRows: number;
}

// 숫자 변환 (문자열·숫자 모두 처리, 천단위 쉼표·단위 문자 허용)
// "1800/1000" 형식은 '/' 앞 첫 번째 값만 사용 (등록잔재 복합 치수 표기)
function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return isNaN(value) ? null : value;
  let str = String(value).trim();
  // '/' 가 있으면 앞 부분만 사용
  if (str.includes("/")) str = str.split("/")[0].trim();
  // 쉼표(천단위) 제거
  const cleaned = str.replace(/,/g, "").trim();
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return isNaN(n) ? null : n;
}

// 문자열 변환
function toStr(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  return String(value).trim();
}

// 헤더 정규화 (공백·대소문자 무시)
function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[\s_\-\.]/g, "");
}

// 컬럼 매핑 후보 (강재리스트 Excel 다양한 형식 대응)
const COLUMN_MAP: Record<string, string[]> = {
  block: ["block", "블록", "블록코드"],
  drawingNo: ["drawingno", "nestname", "도면번호", "nest", "nestingno", "도면no"],
  heatNo: ["heatno", "heatno.", "porno", "por", "자재관리번호", "heatnumber", "heat"],
  material: ["material", "재질", "강종", "mat"],
  thickness: ["thickness", "두께", "t", "thk"],
  width: ["width", "폭", "w", "너비"],
  length: ["length", "길이", "l", "len"],
  qty: ["qty", "수량", "ea", "매수", "q"],
  steelWeight: ["steelweight", "강재중량", "자재중량", "중량", "weight", "wt", "강중"],
  useWeight: ["useweight", "사용중량", "부재중량", "사용중", "usewt"],
};

function findColumnIndex(
  headers: string[],
  fieldKey: string
): number {
  const candidates = COLUMN_MAP[fieldKey] ?? [];
  for (let i = 0; i < headers.length; i++) {
    const normalized = normalizeKey(headers[i]);
    if (candidates.includes(normalized)) return i;
  }
  return -1;
}

export function parseExcelBuffer(buffer: Buffer, fileName: string): ParseResult {
  const errors: string[] = [];
  const rows: DrawingListRow[] = [];

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: "buffer" });
  } catch {
    return { success: false, rows: [], errors: ["Excel 파일을 읽을 수 없습니다."], totalRows: 0 };
  }

  // 첫 번째 시트 사용
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return { success: false, rows: [], errors: ["시트를 찾을 수 없습니다."], totalRows: 0 };
  }

  const sheet = workbook.Sheets[sheetName];
  const rawData = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: "" });

  if (rawData.length < 2) {
    return { success: false, rows: [], errors: ["데이터가 없습니다. (헤더 포함 최소 2행 필요)"], totalRows: 0 };
  }

  // 헤더 행 탐색 (material/재질 컬럼이 있는 첫 행)
  let headerRowIndex = 0;
  for (let i = 0; i < Math.min(10, rawData.length); i++) {
    const row = rawData[i].map((v) => normalizeKey(String(v)));
    if (row.some((v) => COLUMN_MAP["material"].includes(v))) {
      headerRowIndex = i;
      break;
    }
  }

  const headers = rawData[headerRowIndex].map((v) => String(v));

  // 컬럼 인덱스 매핑
  const colIdx: Record<string, number> = {};
  for (const field of Object.keys(COLUMN_MAP)) {
    colIdx[field] = findColumnIndex(headers, field);
  }

  // 필수 컬럼 체크
  const requiredFields = ["material", "thickness", "width", "length", "qty"];
  for (const f of requiredFields) {
    if (colIdx[f] === -1) {
      errors.push(`필수 컬럼 '${f}'을 찾을 수 없습니다. 헤더를 확인하세요.`);
    }
  }
  if (errors.length > 0) {
    return { success: false, rows: [], errors, totalRows: 0 };
  }

  // 데이터 행 파싱
  let parsedCount = 0;
  for (let i = headerRowIndex + 1; i < rawData.length; i++) {
    const row = rawData[i];

    // 빈 행 스킵
    if (row.every((v) => v === "" || v === null || v === undefined)) continue;

    const material = toStr(row[colIdx["material"]]);
    const thickness = toNumber(row[colIdx["thickness"]]);
    const width = toNumber(row[colIdx["width"]]);
    const length = toNumber(row[colIdx["length"]]);
    const qty = toNumber(row[colIdx["qty"]]);

    // 필수값 유효성 검사
    if (!material) {
      errors.push(`${i + 1}행: 재질(material)이 비어 있습니다.`);
      continue;
    }
    if (thickness === null || thickness <= 0) {
      errors.push(`${i + 1}행: 두께(thickness) 값이 유효하지 않습니다.`);
      continue;
    }
    if (width === null || width <= 0) {
      errors.push(`${i + 1}행: 폭(width) 값이 유효하지 않습니다.`);
      continue;
    }
    if (length === null || length <= 0) {
      errors.push(`${i + 1}행: 길이(length) 값이 유효하지 않습니다.`);
      continue;
    }
    if (qty === null || qty <= 0) {
      errors.push(`${i + 1}행: 수량(qty) 값이 유효하지 않습니다.`);
      continue;
    }

    rows.push({
      block: colIdx["block"] !== -1 ? toStr(row[colIdx["block"]]) : null,
      drawingNo: colIdx["drawingNo"] !== -1 ? toStr(row[colIdx["drawingNo"]]) : null,
      heatNo: colIdx["heatNo"] !== -1 ? toStr(row[colIdx["heatNo"]]) : null,
      material,
      thickness,
      width,
      length,
      qty: Math.round(qty),
      steelWeight: colIdx["steelWeight"] !== -1 ? toNumber(row[colIdx["steelWeight"]]) : null,
      useWeight: colIdx["useWeight"] !== -1 ? toNumber(row[colIdx["useWeight"]]) : null,
    });
    parsedCount++;
  }

  return {
    success: rows.length > 0,
    rows,
    errors,
    totalRows: parsedCount,
  };
}

export function parseExcelBufferWithPreset(
  buffer: Buffer,
  fileName: string,
  preset: PresetConfig
): ParseResult {
  const errors: string[] = [];
  const rows: DrawingListRow[] = [];

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: "buffer" });
  } catch {
    return { success: false, rows: [], errors: ["Excel 파일을 읽을 수 없습니다."], totalRows: 0 };
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return { success: false, rows: [], errors: ["시트를 찾을 수 없습니다."], totalRows: 0 };
  }

  const sheet = workbook.Sheets[sheetName];
  const rawData = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: "" });

  // dataStartRow is 1-indexed; convert to 0-indexed
  const startIndex = preset.dataStartRow - 1;

  if (rawData.length <= startIndex) {
    return { success: false, rows: [], errors: [`데이터가 없습니다. (${preset.dataStartRow}행부터 시작 설정)`], totalRows: 0 };
  }

  // Helper to get value from a row using a 1-indexed column number
  const getCol = (row: unknown[], colNum: number | null): unknown => {
    if (colNum === null || colNum === undefined || colNum < 1) return "";
    const val = row[colNum - 1];
    return val === null || val === undefined ? "" : val;
  };

  let parsedCount = 0;
  for (let i = startIndex; i < rawData.length; i++) {
    const row = rawData[i];

    // 빈 행 스킵
    if (row.every((v) => v === "" || v === null || v === undefined)) continue;

    const material = preset.colMaterial != null ? toStr(getCol(row, preset.colMaterial)) : null;
    const thickness = preset.colThickness != null ? toNumber(getCol(row, preset.colThickness)) : null;
    const width = preset.colWidth != null ? toNumber(getCol(row, preset.colWidth)) : null;
    const length = preset.colLength != null ? toNumber(getCol(row, preset.colLength)) : null;
    const qty = preset.colQty != null ? toNumber(getCol(row, preset.colQty)) : null;

    // 필수값 유효성 검사 (col이 설정된 경우만)
    if (preset.colMaterial != null && !material) {
      errors.push(`${i + 1}행: 재질(material)이 비어 있습니다.`);
      continue;
    }
    if (preset.colThickness != null && (thickness === null || thickness <= 0)) {
      errors.push(`${i + 1}행: 두께(thickness) 값이 유효하지 않습니다.`);
      continue;
    }
    if (preset.colWidth != null && (width === null || width <= 0)) {
      errors.push(`${i + 1}행: 폭(width) 값이 유효하지 않습니다.`);
      continue;
    }
    if (preset.colLength != null && (length === null || length <= 0)) {
      errors.push(`${i + 1}행: 길이(length) 값이 유효하지 않습니다.`);
      continue;
    }
    if (preset.colQty != null && (qty === null || qty <= 0)) {
      errors.push(`${i + 1}행: 수량(qty) 값이 유효하지 않습니다.`);
      continue;
    }

    rows.push({
      block: preset.colBlock != null ? toStr(getCol(row, preset.colBlock)) : null,
      drawingNo: preset.colDrawingNo != null ? toStr(getCol(row, preset.colDrawingNo)) : null,
      heatNo: preset.colHeatNo != null ? toStr(getCol(row, preset.colHeatNo)) : null,
      material: material ?? "",
      thickness: thickness ?? 0,
      width: width ?? 0,
      length: length ?? 0,
      qty: qty != null ? Math.round(qty) : 0,
      steelWeight: preset.colSteelWeight != null ? toNumber(getCol(row, preset.colSteelWeight)) : null,
      useWeight: preset.colUseWeight != null ? toNumber(getCol(row, preset.colUseWeight)) : null,
    });
    parsedCount++;
  }

  return {
    success: rows.length > 0,
    rows,
    errors,
    totalRows: parsedCount,
  };
}

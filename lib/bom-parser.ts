/**
 * BOM 파싱 엔진
 * Python app.py의 extract_data() / _parse_dim() 로직을 TypeScript로 포팅
 *
 * 출력 필드: 호선, 블록, 파트명, 두께, 사이즈, 재질, 가공, 수량, 중량(kg), NEST NO
 *
 * 필드 타입:
 *   direct        — 단일 열 값 그대로
 *   sum           — 여러 열 합산 (수량은 정수, 중량은 소수3자리)
 *   join          — 여러 열 이어붙이기 (sep 구분자)
 *   dim_thickness — "WxLxT" 에서 두께 추출 (구버전, sep=*, pos=last)
 *   dim_size      — "WxLxT" 에서 사이즈 추출 (구버전, sep=*, pos=last)
 *   dim_parse     — 설정 가능한 DIMENSION 파싱 (dim_sep, dim_pos, dim_extract)
 */

import * as XLSX from "xlsx";

// ── 출력 필드 ──────────────────────────────────────────────────

export const OUTPUT_FIELDS = [
  "호선", "블록", "파트명", "두께", "사이즈", "재질", "가공", "수량", "중량(kg)", "NEST NO",
] as const;
export type OutputField = (typeof OUTPUT_FIELDS)[number];
export type BomRow = Record<OutputField, string | number | null>;

// ── 프리셋 타입 ────────────────────────────────────────────────

export interface FieldConfig {
  type: "direct" | "sum" | "join" | "dim_thickness" | "dim_size" | "dim_parse";
  col?: number;           // 단일 열 (1-indexed)
  cols?: number[];        // 복수 열 (sum / join)
  sep?: string;           // join 구분자
  dim_sep?: string;       // dim_parse 구분자
  dim_pos?: "first" | "last"; // dim_parse 두께 위치
  dim_extract?: "thickness" | "size"; // dim_parse 추출 대상
}

export interface FilterConfig {
  col: number;
  not_empty?: boolean;
  startswith?: string;
  equals?: string;
  contains?: string;
}

export interface BomVendorPreset {
  _desc?: string;
  header_row: number;                          // 데이터 시작 행 (1-indexed)
  project_cell?: { row: number; col: number }; // 호선 고정 셀
  block_cell?:   { row: number; col: number }; // 블록 고정 셀
  filter?: FilterConfig | FilterConfig[];      // 행 필터 조건
  fields:  Record<string, FieldConfig>;        // 출력 필드 매핑
  sum_cols?: string[];                         // 합계 표시 컬럼
  field_labels?: Record<string, string>;       // 출력 항목명 재정의
}

// ── 내부 유틸 ──────────────────────────────────────────────────

function getVal(row: unknown[], col: number): unknown {
  return row[col - 1] ?? null;
}

/**
 * DIMENSION 파싱 (Python _parse_dim 동일 로직)
 * 예) "450*450*12.0" sep=* pos=last → 두께:"12.0" 사이즈:"450*450"
 *     "12.0x450x900" sep=x pos=first → 두께:"12.0" 사이즈:"450x900"
 */
function parseDim(
  raw: string,
  sep: string = "*",
  thicknessPos: "first" | "last" = "last",
  extract: "thickness" | "size" = "thickness",
): string {
  if (!raw) return "";
  raw = raw.replace(/\s*\(.*?\)/g, "").trim();

  const sepRe =
    sep === "x" || sep === "X"
      ? /[xX]/
      : new RegExp(sep.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

  const parts = raw.split(sepRe).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return extract === "thickness" ? raw : "";

  if (thicknessPos === "first") {
    return extract === "thickness" ? parts[0] : parts.slice(1).join(sep);
  } else {
    return extract === "thickness"
      ? parts[parts.length - 1]
      : parts.slice(0, -1).join(sep);
  }
}

// ── 메인 추출 함수 ─────────────────────────────────────────────

export function extractBomData(fileBuffer: Buffer, preset: BomVendorPreset): BomRow[] {
  const wb = XLSX.read(fileBuffer, { type: "buffer" });
  const results: BomRow[] = [];

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const allRows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
      header: 1,
      defval: null,
    });

    // 고정 셀에서 호선/블록 읽기
    const pc = preset.project_cell;
    const bc = preset.block_cell;
    const project = pc ? String(allRows[pc.row - 1]?.[pc.col - 1] ?? "") : "";
    const block   = bc ? String(allRows[bc.row - 1]?.[bc.col - 1] ?? "") : "";

    // 필터 목록 정규화
    const filters: FilterConfig[] = Array.isArray(preset.filter)
      ? preset.filter
      : preset.filter
        ? [preset.filter]
        : [];

    const dataRows = allRows.slice((preset.header_row ?? 2) - 1);

    for (const rawRow of dataRows) {
      if (!Array.isArray(rawRow)) continue;

      // 행 필터 적용
      let skip = false;
      for (const f of filters) {
        const fv = getVal(rawRow, f.col);
        if (f.not_empty  && !fv)                                          { skip = true; break; }
        if (f.startswith && (!fv || !String(fv).startsWith(f.startswith))){ skip = true; break; }
        if (f.equals     && String(fv) !== String(f.equals))              { skip = true; break; }
        if (f.contains   && (!fv || !String(fv).includes(f.contains)))    { skip = true; break; }
      }
      if (skip) continue;

      // 필드 매핑
      const record: Partial<BomRow> = { "호선": project, "블록": block };

      for (const [field, fc] of Object.entries(preset.fields)) {
        const f = field as OutputField;
        switch (fc.type) {
          case "direct":
            record[f] = (getVal(rawRow, fc.col!) ?? null) as string | null;
            break;

          case "sum": {
            const vals = (fc.cols ?? []).map((c) => Number(getVal(rawRow, c) ?? 0));
            const total = vals.reduce((a, b) => a + b, 0);
            record[f] = f === "수량"
              ? Math.round(total)
              : Math.round(total * 1000) / 1000;
            break;
          }

          case "join": {
            const parts = (fc.cols ?? [])
              .map((c) => getVal(rawRow, c))
              .filter(Boolean)
              .map(String);
            record[f] = parts.join(fc.sep ?? "-");
            break;
          }

          case "dim_thickness":
            record[f] = parseDim(String(getVal(rawRow, fc.col!) ?? ""), "*", "last", "thickness");
            break;

          case "dim_size":
            record[f] = parseDim(String(getVal(rawRow, fc.col!) ?? ""), "*", "last", "size");
            break;

          case "dim_parse":
            record[f] = parseDim(
              String(getVal(rawRow, fc.col!) ?? ""),
              fc.dim_sep ?? "*",
              fc.dim_pos ?? "last",
              fc.dim_extract ?? "thickness",
            );
            break;
        }
      }

      // 파트명 없으면 스킵 (Python과 동일)
      if (!record["파트명"]) continue;

      results.push({
        "호선":    record["호선"]    ?? project,
        "블록":    record["블록"]    ?? block,
        "파트명":  record["파트명"]  ?? "",
        "두께":    record["두께"]    ?? null,
        "사이즈":  record["사이즈"]  ?? null,
        "재질":    record["재질"]    ?? null,
        "가공":    record["가공"]    ?? null,
        "수량":    record["수량"]    ?? null,
        "중량(kg)":record["중량(kg)"] ?? null,
        "NEST NO": record["NEST NO"] ?? null,
      });
    }
  }

  return results;
}

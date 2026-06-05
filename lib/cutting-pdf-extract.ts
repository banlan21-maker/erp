/**
 * 절단도면 PDF 페이지에서 4개 필드 추출 (Phase B)
 *
 * 입력: textItems (pdfjs textContent 또는 Tesseract.js 결과를 동일 포맷으로 변환)
 * 출력: { drawingNo, partWeight, markingLen, cuttingLen }
 *
 * 알고리즘 (라벨 검색 — 좌표 기반):
 *   1) 라벨 텍스트가 정확히 일치하거나 포함된 textItem 찾기
 *   2) 라벨과 같은 x 컬럼 (±25px) 에서 y < 라벨.y && y > 라벨.y - 60 범위의 후보들
 *   3) y 차이 가장 작은 textItem 우선
 *   4) valuePattern 정규식 매칭
 *   5) 실패 시 fallback: 라벨과 같은 y 행 (±5) 우측 (x > 라벨.x) 에서 매칭
 *   6) 그래도 실패면 fullText 의 라벨 직후 100자 내에서 매칭
 */

export interface TextItem {
  x:   number; // 페이지 좌표 (좌하단 기준)
  y:   number;
  w?:  number;
  str: string;
}

export interface FieldRule {
  label:        string;
  valuePattern: string; // 정규식
}

export interface PresetRules {
  detectKeywords?: string[];
  drawingNo:  FieldRule;
  partWeight: FieldRule;
  markingLen: FieldRule;
  cuttingLen: FieldRule;
}

export interface PageExtraction {
  drawingNo:  string | null;
  partWeight: number | null;
  markingLen: number | null;
  cuttingLen: number | null;
  rawText:    string;
  matched: {
    drawingNo:  boolean;
    partWeight: boolean;
    markingLen: boolean;
    cuttingLen: boolean;
  };
}

const X_TOLERANCE = 25;
const Y_BELOW_MIN = 5;
const Y_BELOW_MAX = 60;
const Y_SAME_TOL  = 6;

// 라벨 텍스트에 일치하는 첫 아이템 찾기 — 정확 일치 우선, 포함 차선
function findLabelItem(items: TextItem[], label: string): TextItem | null {
  const exact = items.find(it => it.str.trim() === label);
  if (exact) return exact;
  const contains = items.find(it => it.str.includes(label));
  return contains ?? null;
}

function extractField(items: TextItem[], rule: FieldRule, fullText: string): string | null {
  const re = new RegExp(rule.valuePattern);
  const label = findLabelItem(items, rule.label);

  if (label) {
    // 1) 같은 컬럼, 아래쪽 (라벨이 헤더, 값이 바로 아래)
    const below = items
      .filter(it => it !== label
        && Math.abs(it.x - label.x) <= X_TOLERANCE
        && it.y < label.y
        && it.y >= label.y - Y_BELOW_MAX
        && (label.y - it.y) >= Y_BELOW_MIN)
      .map(it => ({ it, dy: label.y - it.y }))
      .sort((a, b) => a.dy - b.dy);
    for (const { it } of below) {
      const m = it.str.match(re);
      if (m) return m[0];
    }

    // 2) 같은 행, 우측 (라벨 : 값 형태)
    const right = items
      .filter(it => it !== label
        && Math.abs(it.y - label.y) <= Y_SAME_TOL
        && it.x > label.x + (label.w ?? 0) - 4)
      .map(it => ({ it, dx: it.x - label.x }))
      .sort((a, b) => a.dx - b.dx);
    for (const { it } of right) {
      const m = it.str.match(re);
      if (m) return m[0];
    }
  }

  // 3) fullText fallback — 라벨 직후 100자 내
  const idx = fullText.indexOf(rule.label);
  if (idx >= 0) {
    const slice = fullText.slice(idx + rule.label.length, idx + rule.label.length + 100);
    const m = slice.match(re);
    if (m) return m[0];
  }

  return null;
}

function toNumber(s: string | null): number | null {
  if (!s) return null;
  const cleaned = s.replace(/[^\d.\-]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function extractPage(items: TextItem[], rules: PresetRules): PageExtraction {
  const fullText = items.map(it => it.str).join(" ");
  const drawingNoStr  = extractField(items, rules.drawingNo,  fullText);
  const partWeightStr = extractField(items, rules.partWeight, fullText);
  const markingLenStr = extractField(items, rules.markingLen, fullText);
  const cuttingLenStr = extractField(items, rules.cuttingLen, fullText);

  return {
    drawingNo:  drawingNoStr,
    partWeight: toNumber(partWeightStr),
    markingLen: toNumber(markingLenStr),
    cuttingLen: toNumber(cuttingLenStr),
    rawText:    fullText.slice(0, 2000),
    matched: {
      drawingNo:  drawingNoStr  !== null,
      partWeight: partWeightStr !== null,
      markingLen: markingLenStr !== null,
      cuttingLen: cuttingLenStr !== null,
    },
  };
}

// 자동 매칭: 페이지 fullText 에 가장 많은 detectKeyword 가 나오는 프리셋
export function detectPreset(
  fullText: string,
  presets: Array<{ id: string; rules: PresetRules }>,
): string | null {
  const upper = fullText.toUpperCase();
  let bestId: string | null = null;
  let bestScore = 0;
  for (const p of presets) {
    const kws = p.rules.detectKeywords ?? [];
    let score = 0;
    for (const kw of kws) if (upper.includes(kw.toUpperCase())) score++;
    if (score > bestScore) { bestScore = score; bestId = p.id; }
  }
  return bestScore > 0 ? bestId : null;
}

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
  transform?:   { type: "tail"; length: number }; // 추출된 값에서 끝 N자리만 유지 (예: KY1037-B16C-CNX01 → CNX01)
  searchRange?: number; // fullText fallback 시 라벨 직후 검색 범위 (기본 100). 짧을수록 라벨 가까운 값만 — 단위 깨졌을 때 유용
}

export interface PresetRules {
  detectKeywords?:  string[]; // 페이지에 1개라도 있으면 이 프리셋 후보
  negativeKeywords?: string[]; // 페이지에 1개라도 있으면 이 프리셋 제외 (예: 양식3의 PART WEIGHT 가 양식2 TOTAL PART WEIGHT 도 매칭하는 것 방지)
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

// 공백 정규화 + 대문자 + OCR 자주 혼동되는 글자 통일 (0↔O, 1↔I)
// label 매칭 전용 — value 매칭(숫자)에는 사용 안 함
function normalize(s: string): string {
  return s.replace(/\s+/g, " ").trim().toUpperCase()
    .replace(/0/g, "O")
    .replace(/1/g, "I");
}

// 라벨 텍스트에 일치하는 첫 아이템 찾기 — 정규화 후 정확 일치 우선, 포함 차선
function findLabelItem(items: TextItem[], label: string): TextItem | null {
  const normLabel = normalize(label);
  const exact = items.find(it => normalize(it.str) === normLabel);
  if (exact) return exact;
  return items.find(it => normalize(it.str).includes(normLabel)) ?? null;
}

// 정규식 매칭 결과에서 그룹 1 이 있으면 그것을, 없으면 전체 매치를 반환 (값만 캡처용)
function pickMatch(m: RegExpMatchArray): string {
  return m[1] ?? m[0];
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
      if (m) return pickMatch(m);
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
      if (m) return pickMatch(m);
    }
  }

  // 3) fullText fallback — normalize(공백/대소문자/O0I1) 후 라벨 직후 N자 내 (기본 100, rule.searchRange 로 조정)
  // 단 값 매칭은 정규화 안 된 원본에서 — 숫자가 영문으로 변환되면 안 되니까
  const normText  = normalize(fullText);
  const normLabel = normalize(rule.label);
  const normIdx = normText.indexOf(normLabel);
  const range = rule.searchRange ?? 100;
  if (normIdx >= 0) {
    const slice = fullText.slice(normIdx + normLabel.length, normIdx + normLabel.length + range);
    const m = slice.match(re);
    if (m) return pickMatch(m);
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

function applyTransform(value: string | null, rule: FieldRule): string | null {
  if (!value || !rule.transform) return value;
  if (rule.transform.type === "tail") {
    return value.slice(-rule.transform.length);
  }
  return value;
}

export function extractPage(items: TextItem[], rules: PresetRules): PageExtraction {
  const fullText = items.map(it => it.str).join(" ");
  const drawingNoRaw  = extractField(items, rules.drawingNo,  fullText);
  const partWeightStr = extractField(items, rules.partWeight, fullText);
  const markingLenStr = extractField(items, rules.markingLen, fullText);
  const cuttingLenStr = extractField(items, rules.cuttingLen, fullText);

  // 도면번호 transform (끝 N자리 등) 적용
  const drawingNo = applyTransform(drawingNoRaw, rules.drawingNo);

  return {
    drawingNo,
    partWeight: toNumber(partWeightStr),
    markingLen: toNumber(markingLenStr),
    cuttingLen: toNumber(cuttingLenStr),
    rawText:    fullText.slice(0, 2000),
    matched: {
      drawingNo:  drawingNo  !== null,
      partWeight: partWeightStr !== null,
      markingLen: markingLenStr !== null,
      cuttingLen: cuttingLenStr !== null,
    },
  };
}

// 자동 매칭: 페이지 fullText 에 가장 많은 detectKeyword 가 나오는 프리셋
// + negativeKeywords 매칭되면 그 프리셋 제외 (양식2 TOTAL PART WEIGHT 있는데 양식3 PART WEIGHT 도 매칭되는 케이스 방지)
export function detectPreset(
  fullText: string,
  presets: Array<{ id: string; rules: PresetRules }>,
): string | null {
  const upper = fullText.toUpperCase();
  let bestId: string | null = null;
  let bestScore = 0;
  for (const p of presets) {
    const negKws = (p.rules.negativeKeywords ?? []).map(k => k.toUpperCase());
    if (negKws.some(k => upper.includes(k))) continue; // negative 매칭 — 제외
    const kws = (p.rules.detectKeywords ?? []).map(k => k.toUpperCase());
    let score = 0;
    for (const kw of kws) if (upper.includes(kw)) score++;
    if (score > bestScore) { bestScore = score; bestId = p.id; }
  }
  return bestScore > 0 ? bestId : null;
}

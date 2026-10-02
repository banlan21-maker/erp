/**
 * 강재매칭 이름(선별 라벨) → 거래명세표 블록 칸 기본값.
 *
 * 현장 건의(2026-09-11): 한 차에 여러 블록이 섞여 나가면서 명세서 블록을 기억에 기대
 * 손으로 치다 틀리는 일이 생긴다. 담을 때 카드에 보이던 매칭이름에서 블록을 가져온다.
 *
 * 규칙 (현장 확인): **알파벳 + 숫자 + 알파벳 = 블록번호.**
 *   S24P · B21C · W11P · F21C ...  출고 표기는 PS 를 P 로 줄여 쓴다(W11PS → W11P).
 *   뒤 글자를 하나만 취하면 PS 는 자연히 P 가 된다.
 *
 * 숫자는 2자리로 고정한다. 매칭이름엔 호선번호(1022, KY1037 등 4자리)가 같이 들어 있어
 * 자릿수를 풀면 그게 블록으로 잡힐 수 있다. 1·3자리 블록은 못 잡지만 그 경우 틀린 값이
 * 들어가는 게 아니라 사람이 다듬는 쪽(아래 폴백)으로 넘어갈 뿐이다.
 *
 * 실측(173종): 블록 1개 166 · 여러 개 1 · 없음 6. 잘못 잡힌 것 0건.
 *
 * 매칭이름은 사람이 짓는 자유 텍스트(기본값 = 업로드한 엑셀 파일명)라 이 값은
 * 어디까지나 **기본값**이다 — 출고장 만들기 화면에서 작업자가 보고 고칠 수 있다.
 */

/** 괄호 안은 업체·메모·개정차수뿐이다 — (월드-SK) (14장 잔량) (REV.0). 블록이 든 적 없음(153종 확인) */
const PARENS = /\([^)]*\)/g;

/** 원청 Steellist 파일명 머리 — 140종이 정확히 이 모양 */
const STEELLIST_HEAD = /^steellist-/i;

const BLOCK = /[A-Z]\d{2}[A-Z]/g;

/** 라벨 안의 블록번호들 (중복 제거, 등장 순) */
export function blocksInLabel(label: string | null | undefined): string[] {
  if (!label) return [];
  const body = label.replace(PARENS, " ").toUpperCase();
  return [...new Set(body.match(BLOCK) ?? [])];
}

/** 블록을 못 골랐을 때 사람이 다듬기 좋게 — 확실한 장식(Steellist- 머리, 괄호)만 뗀 라벨 */
export function trimLabel(label: string | null | undefined): string {
  if (!label) return "";
  return label.replace(STEELLIST_HEAD, "").replace(PARENS, "").replace(/\s{2,}/g, " ").trim();
}

/**
 * 선별지시서 블록 칸 — 명세서와 달리 PS 를 그대로 쓴다(사무실 선별지시서 엑셀: B60PS · S70PS · H40P).
 *   두 글자 꼬리는 PS/CS/SS 뒤에 글자가 더 붙지 않을 때만(F21CNCP50 → F21C).
 *   못 고르거나 여러 개면 장식만 뗀 라벨 — 화면에서 고친다.
 */
const SHEET_BLOCK = /[A-Z]\d{2}(?:(?:PS|CS|SS)(?![A-Z])|[A-Z])/g;
export function sheetBlockFromLabel(label: string | null | undefined): string {
  if (!label) return "";
  const found = [...new Set(label.replace(PARENS, " ").toUpperCase().match(SHEET_BLOCK) ?? [])];
  if (found.length === 1) return found[0];
  return trimLabel(label);
}

/**
 * 매칭이름 괄호 → 선별지시서 착지 기본값 — Steellist-1023-H40P(월드-덕광) → "월드-덕광".
 * 괄호가 여럿이면 마지막 것. 개정차수·잔량 메모(REV.0 · 개정1장 · 14장 잔량 · 추가강재)는 착지가 아니므로 뺀다.
 * 운송사가 출하 직전에 바뀌는 일이 있어(월드 → 세림) 이 값도 화면에서 고친다.
 */
export function destFromLabel(label: string | null | undefined): string {
  if (!label) return "";
  const inner = [...label.matchAll(/\(([^)]*)\)/g)].map(m => m[1].trim()).filter(s => s && !/rev|개정|잔량|추가|긴급|^\d+\s*장/i.test(s));
  return inner.at(-1) ?? "";
}

/**
 * 명세서 블록 칸 기본값.
 *   블록이 딱 하나면 그 블록, 없거나 여러 개면 장식만 뗀 라벨(사람이 다듬는다), 라벨이 없으면 "".
 */
export function defaultBlockFromLabel(label: string | null | undefined): string {
  const found = blocksInLabel(label);
  if (found.length === 1) return found[0];
  return trimLabel(label);
}

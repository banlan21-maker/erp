/**
 * 업무일지 줄 단위 상태 — 같은 텍스트 필드(todayWork/tomorrowPlan)에 줄머리 토큰으로 저장.
 *
 * 토큰: 완료 `[x] ` / 진행중 `[~] ` / 중요 `[!] ` / 없음(토큰 없음).
 * - 줄 맨 앞에만 붙으므로 @멘션 파싱(본문의 @)·기존 평문 데이터와 호환.
 * - DB 스키마 변경 없음.
 */

export type LineStatus = "none" | "done" | "doing" | "important";

const PARSE_RE = /^\[([x~!])\] ?/;
const CODE: Record<string, LineStatus> = { x: "done", "~": "doing", "!": "important" };
const TOKEN: Record<LineStatus, string> = { none: "", done: "[x] ", doing: "[~] ", important: "[!] " };

// 사용자가 "[x] 도면확인" 처럼 대괄호로 시작하는 평문을 직접 입력하면, 저장 후 다시 읽을 때
// 상태 토큰으로 오해석되어 글자가 사라지고 취소선이 붙는다. 상태가 '없음'인데 텍스트가
// 토큰 모양이면 앞에 폭 없는 공백(ZWSP)을 붙여 이스케이프한다(화면상 차이 없음).
const ESC = "\u200B";

/** 한 줄(raw)에서 상태 토큰을 떼어 { status, text } 로 분리. 토큰 없으면 none. */
export function parseLine(raw: string): { status: LineStatus; text: string } {
  if (raw.startsWith(ESC)) return { status: "none", text: raw.slice(ESC.length) }; // 이스케이프된 평문
  const m = raw.match(PARSE_RE);
  if (m) return { status: CODE[m[1]], text: raw.slice(m[0].length) };
  return { status: "none", text: raw };
}

/** 상태 + 텍스트 → 저장용 줄 문자열. */
export function serializeLine(status: LineStatus, text: string): string {
  if (status === "none") return PARSE_RE.test(text) || text.startsWith(ESC) ? ESC + text : text;
  return TOKEN[status] + text;
}

/** 표시 메타 — 상태별 라벨/점 색/텍스트 스타일. */
export const STATUS_META: Record<LineStatus, { label: string; dot: string; textClass: string }> = {
  none:      { label: "없음",   dot: "border border-gray-300 bg-white",  textClass: "" },
  done:      { label: "완료",   dot: "bg-gray-400",                       textClass: "line-through text-gray-400" },
  doing:     { label: "진행중", dot: "bg-blue-500",                       textClass: "text-blue-700" },
  important: { label: "중요",   dot: "bg-red-500",                        textClass: "text-red-600 font-semibold" },
};

/** 미니 팝업 순서. */
export const STATUS_ORDER: LineStatus[] = ["none", "done", "doing", "important"];

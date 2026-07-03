/**
 * 이름/코드 입력 검증 — 필터(콤마 구분)·경로(슬래시)·CSV·개행을 깨뜨리는 문자를 차단한다.
 *
 * 호선코드(vesselCode) 같은 식별자에 콤마가 들어가면, 필터 파라미터가 콤마로 분해되어
 * 조회가 아예 안 되는 문제가 있었다(예: "잉여재,러그"). 이런 오류를 입력 시점에 막는다.
 *
 * 서버(API)에서 강제하고, 프론트 폼에서도 같은 규칙으로 즉시 안내하는 것을 권장.
 */

// 허용 문자: 한글, 영문 대소문자, 숫자, 하이픈(-) 언더바(_) 마침표(.) 괄호() 공백
const ALLOWED_CHAR = /[가-힣A-Za-z0-9\-_.() ]/;

export const ALLOWED_HINT =
  "사용 가능: 한글·영문·숫자와 하이픈(-) 언더바(_) 마침표(.) 괄호() 공백. 쉼표(,)·슬래시(/)·따옴표 등은 사용할 수 없습니다.";

/**
 * 유효하면 null, 사용 불가 문자가 있으면 사용자 안내 메시지를 반환한다.
 * (빈값 허용 여부는 호출측에서 별도 검사)
 */
export function validateName(value: string | null | undefined, label = "이름"): string | null {
  const v = (value ?? "").trim();
  if (!v) return null;
  const bad = [...v].filter((ch) => !ALLOWED_CHAR.test(ch));
  if (bad.length) {
    const uniq = [...new Set(bad)].map((c) => (c.trim() === "" ? "특수공백" : c));
    return `사용할 수 없는 문자(${uniq.join(" ")})가 ${label}에 포함되어 있습니다. ${ALLOWED_HINT}`;
  }
  return null;
}

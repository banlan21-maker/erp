import { NextRequest, NextResponse } from "next/server";

/**
 * 1단계: 사무실 앱 전체 로그인 필수화. (Next 16 — middleware → proxy 규약)
 *  - 세션 쿠키(erp_session)가 없으면 /login 으로 리다이렉트.
 *  - 엣지 런타임이라 DB 조회 불가 → 쿠키 "존재"만 확인(유효성 검증은 각 API/관리자 페이지에서).
 *  - 제외: /login, /field(현장 모바일 — 로그인 없이 사용), /api, _next, 정적파일.
 */
const COOKIE = "erp_session";

export function proxy(req: NextRequest) {
  if (req.cookies.get(COOKIE)?.value) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.redirect(url);
}

export const config = {
  // api·_next·정적파일(.확장자)·login·field 는 게이트 제외
  matcher: ["/((?!api|_next|login|field|.*\\.).*)"],
};

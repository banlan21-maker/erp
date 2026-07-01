export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ymdToDate, isYmd } from "@/lib/work-date";

/**
 * 업무일지 댓글 — 대시보드 팀원 카드별(대상 팀원 + 날짜) 스레드.
 *
 * GET  /api/work/log-comments?date=YYYY-MM-DD
 *   그 날짜의 모든 팀원 댓글 (대시보드에서 targetUserId 로 그룹핑)
 * POST /api/work/log-comments  { targetUserId, authorId, date, content }
 */
const authorInclude = { author: { select: { id: true, name: true, color: true } } } as const;

export async function GET(req: NextRequest) {
  try {
    const date = new URL(req.url).searchParams.get("date");
    if (!isYmd(date)) return NextResponse.json({ success: false, error: "date(YYYY-MM-DD) 가 필요합니다." }, { status: 400 });

    const comments = await prisma.workLogComment.findMany({
      where: { date: ymdToDate(date) },
      include: authorInclude,
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json({ success: true, data: comments });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const targetUserId = String(body?.targetUserId ?? "");
    const authorId     = String(body?.authorId ?? "");
    const date         = body?.date;
    const content      = String(body?.content ?? "").trim();

    if (!targetUserId) return NextResponse.json({ success: false, error: "대상 팀원이 필요합니다." }, { status: 400 });
    if (!authorId)     return NextResponse.json({ success: false, error: "작성자를 선택하세요." }, { status: 400 });
    if (!isYmd(date))  return NextResponse.json({ success: false, error: "날짜 형식 오류" }, { status: 400 });
    if (!content)      return NextResponse.json({ success: false, error: "내용을 입력하세요." }, { status: 400 });

    const [target, author] = await Promise.all([
      prisma.workUser.findUnique({ where: { id: targetUserId }, select: { id: true } }),
      prisma.workUser.findUnique({ where: { id: authorId },     select: { id: true } }),
    ]);
    if (!target) return NextResponse.json({ success: false, error: "대상 팀원을 찾을 수 없습니다." }, { status: 400 });
    if (!author) return NextResponse.json({ success: false, error: "작성자를 찾을 수 없습니다." }, { status: 400 });

    const comment = await prisma.workLogComment.create({
      data: { targetUserId, authorId, date: ymdToDate(date), content },
      include: authorInclude,
    });
    return NextResponse.json({ success: true, data: comment }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

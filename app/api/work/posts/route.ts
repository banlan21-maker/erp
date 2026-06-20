export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseMentions } from "@/lib/work-mentions";

const postInclude = {
  author:   { select: { id: true, name: true, color: true } },
  mentions: { include: { user: { select: { id: true, name: true, color: true } } } },
} as const;

/**
 * GET /api/work/posts
 *   ?important=true        → 중요 메모만 (상단 고정용)
 *   ?mentionUserId=X       → X 가 쓴 글 + X 가 멘션된 글 (그 사용자 일지 집계)
 *   (없음)                  → 전체 피드 (최신순)
 *
 * POST /api/work/posts  { authorId, content, important? }  → @멘션 파싱 + 저장
 */
export async function GET(req: NextRequest) {
  try {
    const sp = new URL(req.url).searchParams;
    const important = sp.get("important") === "true";
    const mentionUserId = sp.get("mentionUserId");
    const take = Math.min(500, Number(sp.get("take") ?? 200) || 200);

    const where: Record<string, unknown> = {};
    if (important) where.important = true;
    if (mentionUserId) {
      where.OR = [{ authorId: mentionUserId }, { mentions: { some: { userId: mentionUserId } } }];
    }

    const posts = await prisma.workPost.findMany({
      where,
      include: postInclude,
      orderBy: [{ important: "desc" }, { createdAt: "desc" }],
      take,
    });
    return NextResponse.json({ success: true, data: posts });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const authorId = String(body?.authorId ?? "");
    const content = String(body?.content ?? "").trim();
    const important = !!body?.important;
    if (!authorId) return NextResponse.json({ success: false, error: "작성자를 선택하세요." }, { status: 400 });
    if (!content)  return NextResponse.json({ success: false, error: "내용을 입력하세요." }, { status: 400 });

    const author = await prisma.workUser.findUnique({ where: { id: authorId } });
    if (!author) return NextResponse.json({ success: false, error: "작성자를 찾을 수 없습니다." }, { status: 400 });

    const users = await prisma.workUser.findMany({ select: { id: true, name: true } });
    // 자기 자신 멘션은 제외 (이미 author 글이므로 일지에 중복 안 됨)
    const mentionIds = parseMentions(content, users).filter(id => id !== authorId);

    const post = await prisma.workPost.create({
      data: {
        authorId, content, important,
        mentions: { create: mentionIds.map(userId => ({ userId })) },
      },
      include: postInclude,
    });
    return NextResponse.json({ success: true, data: post }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

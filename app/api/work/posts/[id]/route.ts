export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseMentions } from "@/lib/work-mentions";

const postInclude = {
  author:   { select: { id: true, name: true, color: true } },
  mentions: { include: { user: { select: { id: true, name: true, color: true } } } },
} as const;

// PATCH /api/work/posts/[id] — { content?, important?, authorId? }  (내용 변경 시 멘션 재계산)
//   authorId 를 보내면 본인 글만 수정 가능 (중요메모 '보관' 버튼용 — 삭제와 동일 정책)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const existing = await prisma.workPost.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ success: false, error: "글을 찾을 수 없습니다." }, { status: 404 });
    if (body?.authorId !== undefined && existing.authorId !== String(body.authorId)) {
      return NextResponse.json({ success: false, error: "본인이 작성한 메모만 변경할 수 있습니다." }, { status: 403 });
    }

    const data: { content?: string; important?: boolean } = {};
    let recomputeMentions = false;
    let newContent = existing.content;
    if (body.content !== undefined) {
      const c = String(body.content).trim();
      if (!c) return NextResponse.json({ success: false, error: "내용을 입력하세요." }, { status: 400 });
      data.content = c; newContent = c; recomputeMentions = true;
    }
    if (body.important !== undefined) data.important = !!body.important;

    const post = await prisma.$transaction(async (tx) => {
      await tx.workPost.update({ where: { id }, data });
      if (recomputeMentions) {
        const users = await tx.workUser.findMany({ select: { id: true, name: true } });
        const mentionIds = parseMentions(newContent, users).filter(uid => uid !== existing.authorId);
        await tx.workPostMention.deleteMany({ where: { postId: id } });
        if (mentionIds.length) {
          await tx.workPostMention.createMany({ data: mentionIds.map(userId => ({ postId: id, userId })) });
        }
      }
      return tx.workPost.findUnique({ where: { id }, include: postInclude });
    });
    return NextResponse.json({ success: true, data: post });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

// DELETE /api/work/posts/[id]?authorId=  — 본인이 쓴 메모만 삭제 (댓글 삭제와 동일 정책)
//   ※ 로그인 게이트 적용 전이라 authorId 는 자기신고 값 → 보안 통제가 아니라 '오삭제 방지 가드'.
//     로그인 도입 시 세션 사용자로 교체할 것.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const authorId = new URL(req.url).searchParams.get("authorId") ?? "";
    const post = await prisma.workPost.findUnique({ where: { id }, select: { authorId: true } });
    if (!post) return NextResponse.json({ success: true }); // 이미 삭제됨 — 멱등 처리(중복 클릭 시 500 방지)
    if (!authorId || post.authorId !== authorId) {
      return NextResponse.json({ success: false, error: "본인이 작성한 메모만 삭제할 수 있습니다." }, { status: 403 });
    }
    await prisma.workPost.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

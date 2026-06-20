export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseMentions } from "@/lib/work-mentions";

const postInclude = {
  author:   { select: { id: true, name: true, color: true } },
  mentions: { include: { user: { select: { id: true, name: true, color: true } } } },
} as const;

// PATCH /api/work/posts/[id] — { content?, important? }  (내용 변경 시 멘션 재계산)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const existing = await prisma.workPost.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ success: false, error: "글을 찾을 수 없습니다." }, { status: 404 });

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

// DELETE /api/work/posts/[id]
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await prisma.workPost.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

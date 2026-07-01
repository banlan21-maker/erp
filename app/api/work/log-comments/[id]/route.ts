export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * DELETE /api/work/log-comments/[id]?authorId=XXX
 *   본인(author) 댓글만 삭제 가능. 로그인이 없어 authorId 로 소유 확인.
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const authorId = new URL(req.url).searchParams.get("authorId") ?? "";

    const c = await prisma.workLogComment.findUnique({ where: { id }, select: { authorId: true } });
    if (!c) return NextResponse.json({ success: true }); // 이미 삭제됨 — 멱등 처리
    if (!authorId || c.authorId !== authorId) {
      return NextResponse.json({ success: false, error: "본인 댓글만 삭제할 수 있습니다." }, { status: 403 });
    }
    await prisma.workLogComment.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

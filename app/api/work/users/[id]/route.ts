export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// PATCH /api/work/users/[id] — { name?, dept?, color?, active? }
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const data: { name?: string; dept?: string | null; color?: string | null; active?: boolean } = {};
    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (!name) return NextResponse.json({ success: false, error: "이름을 입력하세요." }, { status: 400 });
      const dup = await prisma.workUser.findFirst({ where: { name, NOT: { id } } });
      if (dup) return NextResponse.json({ success: false, error: `'${name}' 사용자가 이미 있습니다.` }, { status: 409 });
      data.name = name;
    }
    if (body.dept  !== undefined) data.dept  = body.dept  ? String(body.dept).trim()  || null : null;
    if (body.color !== undefined) data.color = body.color ? String(body.color).trim() || null : null;
    if (body.active !== undefined) data.active = !!body.active;
    const user = await prisma.workUser.update({ where: { id }, data });
    return NextResponse.json({ success: true, data: user });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      return NextResponse.json({ success: false, error: "동일한 이름의 사용자가 이미 있습니다." }, { status: 409 });
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

/**
 * DELETE /api/work/users/[id]        → 연결 데이터가 있으면 409 + 영향 건수 반환(삭제 안 함)
 * DELETE /api/work/users/[id]?force=1 → 강제 삭제 (cascade)
 *
 * 하드삭제는 cascade 로 **그 사람이 남의 일지에 남긴 댓글까지** 지운다.
 * 팀장 계정 하나 지우면 전 기간 지시 댓글이 사라지므로, 기본은 차단하고 '비활성' 을 권한다.
 * (2026-08-12 — 확인 없이 삭제되던 문제)
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const force = new URL(req.url).searchParams.get("force") === "1";

    const user = await prisma.workUser.findUnique({ where: { id }, select: { id: true, name: true } });
    if (!user) return NextResponse.json({ success: true }); // 이미 삭제됨 — 멱등

    const [logs, posts, mentions, authored, received] = await Promise.all([
      prisma.workLog.count({ where: { userId: id } }),
      prisma.workPost.count({ where: { authorId: id } }),
      prisma.workPostMention.count({ where: { userId: id } }),
      prisma.workLogComment.count({ where: { authorId: id } }),      // 남의 일지에 남긴 댓글
      prisma.workLogComment.count({ where: { targetUserId: id } }),  // 내 일지에 달린 댓글
    ]);
    const total = logs + posts + mentions + authored + received;

    if (total > 0 && !force) {
      return NextResponse.json({
        success: false,
        needsForce: true,
        impact: { logs, posts, mentions, authoredComments: authored, receivedComments: received },
        error:
          `[${user.name}] 님에게 연결된 데이터가 ${total}건 있습니다.\n` +
          `· 업무일지 ${logs}건 · 중요메모 ${posts}건 · 멘션 ${mentions}건\n` +
          `· 남의 일지에 남긴 댓글 ${authored}건 (삭제 시 팀 전체 일지에서 사라짐)\n` +
          `· 본인 일지에 달린 댓글 ${received}건\n\n` +
          `기록을 남기려면 삭제 대신 '비활성' 을 사용하세요.`,
      }, { status: 409 });
    }

    await prisma.workUser.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

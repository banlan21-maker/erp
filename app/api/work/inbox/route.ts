export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseMentions } from "@/lib/work-mentions";
import { dateToYmd } from "@/lib/work-date";
import { parseLine } from "@/lib/work-line-status";

/**
 * GET /api/work/inbox?userId=&days=7
 *   나에게 온 것들을 한 곳에 모아 최신순으로 반환 (상단 알림 벨).
 *     · comment — 내 일지에 달린 댓글
 *     · post    — 중요메모에서 나를 @소환
 *     · mention — 다른 사람 일지에서 나를 @소환한 줄
 *
 * '읽음' 은 서버에 저장하지 않는다(스키마 변경 없이 도입). 클라이언트가 마지막 확인 시각을
 * localStorage 에 두고 at > lastSeen 인 항목을 미확인으로 센다.
 * 일지 멘션은 줄 단위 시각이 없으므로 그 일지의 updatedAt 을 시각으로 쓴다(수정 시 다시 뜸).
 */
export interface InboxItem {
  kind: "comment" | "post" | "mention";
  id: string;
  at: string;               // ISO
  authorName: string;
  authorColor: string | null;
  text: string;
  date?: string;            // 관련 일지 날짜 (YYYY-MM-DD)
}

const MAX_DAYS = 30;

export async function GET(req: NextRequest) {
  try {
    const sp = new URL(req.url).searchParams;
    const userId = sp.get("userId") ?? "";
    if (!userId) return NextResponse.json({ success: false, error: "userId 가 필요합니다." }, { status: 400 });
    const days = Math.min(MAX_DAYS, Math.max(1, Number(sp.get("days") ?? 7) || 7));
    const since = new Date(Date.now() - days * 86400000);

    const me = await prisma.workUser.findUnique({ where: { id: userId }, select: { id: true, name: true } });
    if (!me) return NextResponse.json({ success: false, error: "사용자를 찾을 수 없습니다." }, { status: 400 });

    const [comments, mentions, users] = await Promise.all([
      // 내 일지에 달린 댓글 (내가 쓴 건 제외)
      prisma.workLogComment.findMany({
        where: { targetUserId: userId, createdAt: { gte: since }, NOT: { authorId: userId } },
        include: { author: { select: { name: true, color: true } } },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      // 중요메모 @소환
      prisma.workPostMention.findMany({
        where: { userId, post: { createdAt: { gte: since } } },
        include: { post: { include: { author: { select: { name: true, color: true } } } } },
        take: 100,
      }),
      prisma.workUser.findMany({ select: { id: true, name: true } }),
    ]);

    // 남의 일지에서 나를 @소환한 줄 — 이름이 들어간 일지만 훑어 줄 단위로 정확히 판정
    const logs = me.name
      ? await prisma.workLog.findMany({
          where: {
            updatedAt: { gte: since },
            NOT: { userId },
            OR: [
              { todayWork:    { contains: `@${me.name}` } },
              { tomorrowPlan: { contains: `@${me.name}` } },
            ],
          },
          include: { user: { select: { name: true, color: true } } },
          orderBy: { updatedAt: "desc" },
          take: 100,
        })
      : [];

    const items: InboxItem[] = [];

    for (const c of comments) {
      items.push({
        kind: "comment", id: `c-${c.id}`, at: c.createdAt.toISOString(),
        authorName: c.author.name, authorColor: c.author.color,
        text: c.content, date: dateToYmd(c.date),
      });
    }
    for (const m of mentions) {
      if (m.post.authorId === userId) continue; // 자기 글은 제외
      items.push({
        kind: "post", id: `p-${m.post.id}`, at: m.post.createdAt.toISOString(),
        authorName: m.post.author.name, authorColor: m.post.author.color,
        text: m.post.content,
      });
    }
    for (const lg of logs) {
      const ymd = dateToYmd(lg.date);
      const lines = `${lg.todayWork ?? ""}\n${lg.tomorrowPlan ?? ""}`.split("\n");
      lines.forEach((raw, i) => {
        const line = raw.trim();
        if (!line.includes("@")) return;
        if (!parseMentions(line, users).includes(userId)) return;
        items.push({
          kind: "mention", id: `m-${lg.id}-${i}`, at: lg.updatedAt.toISOString(),
          authorName: lg.user.name, authorColor: lg.user.color,
          text: parseLine(line).text, date: ymd,
        });
      });
    }

    items.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
    return NextResponse.json({ success: true, data: items.slice(0, 100) });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

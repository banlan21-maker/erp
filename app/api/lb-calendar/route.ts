export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET: 연도별 비작업일 목록
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const year = searchParams.get("year");

  const where = year ? { year: Number(year) } : {};
  const days = await prisma.lbCalendarDay.findMany({
    where,
    orderBy: [{ date: "asc" }],
  });
  return NextResponse.json(days);
}

// POST: 비작업일 단건 또는 배치 등록 (중복은 무시)
export async function POST(req: Request) {
  const body = await req.json();
  const items: Array<{ date: string; type: string; label: string; year: number }> =
    Array.isArray(body) ? body : [body];

  const results = await Promise.allSettled(
    items.map(item =>
      prisma.lbCalendarDay.upsert({
        where: { date_type: { date: item.date, type: item.type as never } },
        update: { label: item.label, year: item.year },
        create: {
          date: item.date,
          type: item.type as never,
          label: item.label,
          year: item.year,
        },
      })
    )
  );

  const saved = results.filter(r => r.status === "fulfilled").length;
  return NextResponse.json({ saved });
}

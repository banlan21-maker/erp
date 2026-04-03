export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// 한국 고정 법정공휴일 (음력 제외 — 사용자가 별도 추가)
const FIXED_HOLIDAYS = [
  { mm: "01", dd: "01", label: "신정" },
  { mm: "03", dd: "01", label: "삼일절" },
  { mm: "05", dd: "05", label: "어린이날" },
  { mm: "06", dd: "06", label: "현충일" },
  { mm: "08", dd: "15", label: "광복절" },
  { mm: "10", dd: "03", label: "개천절" },
  { mm: "10", dd: "09", label: "한글날" },
  { mm: "12", dd: "25", label: "크리스마스" },
];

// POST: 지정 연도의 고정 법정공휴일 자동 생성
export async function POST(req: Request) {
  const { year } = await req.json();
  if (!year) return NextResponse.json({ error: "year 필요" }, { status: 400 });

  const y = Number(year);
  const items = FIXED_HOLIDAYS.map(h => ({
    date: `${y}-${h.mm}-${h.dd}`,
    type: "LEGAL" as const,
    label: h.label,
    year: y,
  }));

  const results = await Promise.allSettled(
    items.map(item =>
      prisma.lbCalendarDay.upsert({
        where: { date_type: { date: item.date, type: item.type } },
        update: { label: item.label, year: item.year },
        create: item,
      })
    )
  );

  const saved = results.filter(r => r.status === "fulfilled").length;
  return NextResponse.json({ saved, year: y });
}

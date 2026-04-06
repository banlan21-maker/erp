export const dynamic = "force-dynamic";

// POST /api/steel-plan/receive
// 입고 처리: vesselCode + material + thickness + width + length 가 일치하는
// REGISTERED 상태 항목을 qty 만큼 RECEIVED 로 업데이트한다.
// 매칭 건수를 반환한다.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const { vesselCode, material, thickness, width, length, qty } = await req.json();

  if (!vesselCode || !material || !thickness || !width || !length) {
    return NextResponse.json({ error: "필수 항목 누락" }, { status: 400 });
  }

  // 동일 조건의 REGISTERED 항목 검색
  const targets = await prisma.steelPlan.findMany({
    where: {
      vesselCode,
      material,
      thickness: Number(thickness),
      width: Number(width),
      length: Number(length),
      status: "REGISTERED",
    },
    orderBy: { createdAt: "asc" },
    take: qty ?? 9999,
  });

  if (targets.length === 0) {
    return NextResponse.json({ matched: 0 });
  }

  const ids = targets.map((t) => t.id);
  const { count } = await prisma.steelPlan.updateMany({
    where: { id: { in: ids } },
    data: { status: "RECEIVED" },
  });

  return NextResponse.json({ matched: count });
}

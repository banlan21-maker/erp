export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET: 호선+블록별 실제 절단 최초 착수일 (CuttingLog 기반)
// 작업일보 테이블 구조 불변 — 조회만
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const vesselCode = searchParams.get("vesselCode");
  const year = searchParams.get("year");

  const where: Record<string, unknown> = {};
  if (vesselCode && vesselCode !== "ALL") {
    where.project = { projectCode: vesselCode };
  }
  if (year) {
    const y = Number(year);
    where.startAt = { gte: new Date(`${y}-01-01`), lt: new Date(`${y + 1}-01-01`) };
  }

  // 호선+블록 기준으로 최초 착수일 그룹핑
  const logs = await prisma.cuttingLog.findMany({
    where,
    select: {
      startAt: true,
      drawingList: { select: { block: true } },
      project: { select: { projectCode: true } },
    },
    orderBy: { startAt: "asc" },
  });

  // 호선+블록 기준 최초 착수일 맵
  const map = new Map<string, string>();
  for (const log of logs) {
    const vc = log.project?.projectCode;
    const blk = log.drawingList?.block;
    if (!vc || !blk) continue;
    const key = `${vc}|${blk}`;
    if (!map.has(key)) {
      map.set(key, log.startAt.toISOString());
    }
  }

  const result = Array.from(map.entries()).map(([key, actualCutStart]) => {
    const [vesselCode, blk] = key.split("|");
    return { vesselCode, blk, actualCutStart };
  });

  return NextResponse.json(result);
}

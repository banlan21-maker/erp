export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET: 버전 목록 (최신순)
export async function GET() {
  const versions = await prisma.lbPlanVersion.findMany({
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(versions);
}

// POST: 새 버전 저장 (현재 rows를 스냅샷)
export async function POST(req: Request) {
  const { name, rows } = await req.json() as {
    name: string;
    rows: Array<{
      vesselCode: string; blk: string; no: number | null; weeklyQty: number | null;
      erectionDate: string | null; assemblyStart: string | null;
      pnd: string | null; cutS: string | null; cutF: string | null;
      smallS: string | null; smallF: string | null;
      midS: string | null; midF: string | null;
      largeS: string | null; largeF: string | null;
      hullInspDate: string | null; paintStart: string | null; paintEnd: string | null;
      peStart: string | null; peEnd: string | null; delayDays: number | null;
    }>;
  };

  if (!name?.trim()) return NextResponse.json({ error: "버전명 필요" }, { status: 400 });
  if (!rows?.length) return NextResponse.json({ error: "저장할 행이 없습니다." }, { status: 400 });

  const toDate = (v: string | null | undefined) => (v ? new Date(v) : null);

  const version = await prisma.lbPlanVersion.create({
    data: {
      name: name.trim(),
      blockCount: rows.length,
      plans: {
        create: rows.map(r => ({
          vesselCode: r.vesselCode,
          blk: r.blk,
          no: r.no ?? null,
          weeklyQty: r.weeklyQty ?? null,
          erectionDate: toDate(r.erectionDate),
          assemblyStart: toDate(r.assemblyStart),
          pnd: toDate(r.pnd),
          cutS: toDate(r.cutS), cutF: toDate(r.cutF),
          smallS: toDate(r.smallS), smallF: toDate(r.smallF),
          midS: toDate(r.midS), midF: toDate(r.midF),
          largeS: toDate(r.largeS), largeF: toDate(r.largeF),
          hullInspDate: toDate(r.hullInspDate),
          paintStart: toDate(r.paintStart), paintEnd: toDate(r.paintEnd),
          peStart: toDate(r.peStart), peEnd: toDate(r.peEnd),
          delayDays: r.delayDays ?? null,
        })),
      },
    },
  });

  return NextResponse.json(version, { status: 201 });
}

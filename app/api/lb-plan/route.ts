export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET: LB 생산계획 목록 (vesselCode, year 필터 가능)
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const vesselCode = searchParams.get("vesselCode");
  const year = searchParams.get("year");

  const where: Record<string, unknown> = {};
  if (vesselCode && vesselCode !== "ALL") where.vesselCode = vesselCode;
  if (year) {
    const y = Number(year);
    where.erectionDate = {
      gte: new Date(`${y}-01-01`),
      lt:  new Date(`${y + 1}-01-01`),
    };
  }

  const plans = await prisma.lbPlan.findMany({
    where,
    orderBy: [{ vesselCode: "asc" }, { no: "asc" }, { blk: "asc" }],
  });
  return NextResponse.json(plans);
}

// POST: 신규 행 추가
export async function POST(req: Request) {
  const body = await req.json();
  const {
    vesselCode, blk, no, weeklyQty,
    erectionDate, assemblyStart,
    pnd, cutS, cutF,
    smallS, smallF, midS, midF, largeS, largeF,
    hullInspDate, paintStart, paintEnd, peStart, peEnd, delayDays,
    createdBy,
  } = body;

  if (!vesselCode?.trim() || !blk?.trim()) {
    return NextResponse.json({ error: "호선번호와 BLK는 필수입니다." }, { status: 400 });
  }

  const toDate = (v: unknown) => (v ? new Date(v as string) : null);

  try {
    const plan = await prisma.lbPlan.create({
      data: {
        vesselCode: vesselCode.trim(),
        blk: blk.trim(),
        no: no != null ? Number(no) : null,
        weeklyQty: weeklyQty != null ? Number(weeklyQty) : null,
        erectionDate: toDate(erectionDate),
        assemblyStart: toDate(assemblyStart),
        pnd: toDate(pnd),
        cutS: toDate(cutS), cutF: toDate(cutF),
        smallS: toDate(smallS), smallF: toDate(smallF),
        midS: toDate(midS), midF: toDate(midF),
        largeS: toDate(largeS), largeF: toDate(largeF),
        hullInspDate: toDate(hullInspDate),
        paintStart: toDate(paintStart), paintEnd: toDate(paintEnd),
        peStart: toDate(peStart), peEnd: toDate(peEnd),
        delayDays: delayDays != null ? Number(delayDays) : null,
        createdBy: createdBy ?? null,
      },
    });
    return NextResponse.json(plan, { status: 201 });
  } catch (e: unknown) {
    if ((e as { code?: string }).code === "P2002") {
      return NextResponse.json({ error: "동일한 호선+BLK 조합이 이미 존재합니다." }, { status: 409 });
    }
    throw e;
  }
}

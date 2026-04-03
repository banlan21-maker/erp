export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

const toDate = (v: unknown) => (v ? new Date(v as string) : null);

// PATCH: 행 수정
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const {
    vesselCode, blk, no, weeklyQty,
    erectionDate, assemblyStart,
    pnd, cutS, cutF,
    smallS, smallF, midS, midF, largeS, largeF,
    hullInspDate, paintStart, paintEnd, peStart, peEnd, delayDays,
    manualFields,
  } = body;

  const plan = await prisma.lbPlan.update({
    where: { id },
    data: {
      vesselCode: vesselCode?.trim(),
      blk: blk?.trim(),
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
      manualFields: manualFields ? (manualFields as Prisma.InputJsonValue) : Prisma.JsonNull,
    },
  });
  return NextResponse.json(plan);
}

// DELETE: 행 삭제
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.lbPlan.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

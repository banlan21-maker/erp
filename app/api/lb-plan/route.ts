export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET: LB 생산계획 목록
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const versionId = searchParams.get("versionId");
  const deployed = searchParams.get("deployed");
  const vesselCode = searchParams.get("vesselCode");
  const year = searchParams.get("year");

  let resolvedVersionId: string | null = versionId;

  // deployed=true 이면 배포된 버전의 ID를 먼저 조회
  if (deployed === "true") {
    const deployedVersion = await prisma.lbPlanVersion.findFirst({ where: { isDeployed: true } });
    if (!deployedVersion) return NextResponse.json([]);
    resolvedVersionId = deployedVersion.id;
  }

  const where: Record<string, unknown> = {};
  if (resolvedVersionId) where.versionId = resolvedVersionId;
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

// POST: 신규 행 추가 (draft용, versionId 없음)
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
}

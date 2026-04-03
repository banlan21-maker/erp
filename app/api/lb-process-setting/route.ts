export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET: 전체 공정 설정 목록
export async function GET() {
  const settings = await prisma.lbProcessSetting.findMany({
    orderBy: [{ isDefault: "desc" }, { vesselCode: "asc" }],
  });
  return NextResponse.json(settings);
}

// POST: 신규 호선 공정 설정 생성
export async function POST(req: Request) {
  const body = await req.json();
  const {
    vesselCode, isDefault,
    cutLeadDays, cutDuration,
    assemblySmallDays, assemblyMidDays, assemblyLargeDays,
    hullInspLeadDays, paintLeadDays, paintDuration,
    peLeadDays, peDuration,
  } = body;

  if (!vesselCode?.trim()) {
    return NextResponse.json({ error: "호선번호 필수" }, { status: 400 });
  }

  const setting = await prisma.lbProcessSetting.upsert({
    where: { vesselCode: vesselCode.trim() },
    update: {
      isDefault: isDefault ?? false,
      cutLeadDays: Number(cutLeadDays),
      cutDuration: Number(cutDuration),
      assemblySmallDays: Number(assemblySmallDays),
      assemblyMidDays: Number(assemblyMidDays),
      assemblyLargeDays: Number(assemblyLargeDays),
      hullInspLeadDays: Number(hullInspLeadDays),
      paintLeadDays: Number(paintLeadDays),
      paintDuration: Number(paintDuration),
      peLeadDays: Number(peLeadDays),
      peDuration: Number(peDuration),
    },
    create: {
      vesselCode: vesselCode.trim(),
      isDefault: isDefault ?? false,
      cutLeadDays: Number(cutLeadDays),
      cutDuration: Number(cutDuration),
      assemblySmallDays: Number(assemblySmallDays),
      assemblyMidDays: Number(assemblyMidDays),
      assemblyLargeDays: Number(assemblyLargeDays),
      hullInspLeadDays: Number(hullInspLeadDays),
      paintLeadDays: Number(paintLeadDays),
      paintDuration: Number(paintDuration),
      peLeadDays: Number(peLeadDays),
      peDuration: Number(peDuration),
    },
  });
  return NextResponse.json(setting);
}

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

// POST: 신규 호선 공정 설정 생성/갱신
export async function POST(req: Request) {
  const body = await req.json();
  const {
    vesselCode, isDefault,
    cutLeadDays, cutDuration,
    assemblySmallDays, assemblyMidDays, assemblyLargeDays,
    hullInspLeadDays, hullInspIntervalDays, hullInspBlocksPerSession,
    paintLeadDays, paintDuration,
    peLeadDays, peDuration,
  } = body;

  if (!vesselCode?.trim()) {
    return NextResponse.json({ error: "호선번호 필수" }, { status: 400 });
  }

  const data = {
    isDefault: isDefault ?? false,
    cutLeadDays: Number(cutLeadDays),
    cutDuration: Number(cutDuration),
    assemblySmallDays: Number(assemblySmallDays),
    assemblyMidDays: Number(assemblyMidDays),
    assemblyLargeDays: Number(assemblyLargeDays),
    hullInspLeadDays: Number(hullInspLeadDays),
    hullInspIntervalDays: Number(hullInspIntervalDays ?? 7),
    hullInspBlocksPerSession: Number(hullInspBlocksPerSession ?? 2),
    paintLeadDays: Number(paintLeadDays),
    paintDuration: Number(paintDuration),
    peLeadDays: Number(peLeadDays),
    peDuration: Number(peDuration),
  };

  const setting = await prisma.lbProcessSetting.upsert({
    where: { vesselCode: vesselCode.trim() },
    update: data,
    create: { vesselCode: vesselCode.trim(), ...data },
  });
  return NextResponse.json(setting);
}

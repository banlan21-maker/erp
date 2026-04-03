export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// PUT: 호선 공정 설정 수정
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ vesselCode: string }> }
) {
  const { vesselCode } = await params;
  const body = await req.json();
  const {
    isDefault,
    cutLeadDays, cutDuration,
    assemblySmallDays, assemblyMidDays, assemblyLargeDays,
    hullInspLeadDays, paintLeadDays, paintDuration,
    peLeadDays, peDuration,
  } = body;

  const setting = await prisma.lbProcessSetting.update({
    where: { vesselCode },
    data: {
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

// DELETE: 호선 공정 설정 삭제
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ vesselCode: string }> }
) {
  const { vesselCode } = await params;
  await prisma.lbProcessSetting.delete({ where: { vesselCode } });
  return NextResponse.json({ ok: true });
}

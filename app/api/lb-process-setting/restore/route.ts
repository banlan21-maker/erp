export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// POST: 설정 일괄 복원 (버전 불러올 때 사용)
export async function POST(req: Request) {
  const settings = await req.json() as Array<{
    vesselCode: string; isDefault: boolean;
    cutLeadDays: number; cutDuration: number;
    assemblySmallDays: number; assemblyMidDays: number; assemblyLargeDays: number;
    hullInspLeadDays: number; hullInspIntervalDays: number; hullInspBlocksPerSession: number;
    paintLeadDays: number; paintDuration: number;
    peLeadDays: number; peDuration: number;
  }>;

  if (!Array.isArray(settings)) {
    return NextResponse.json({ error: "배열 필요" }, { status: 400 });
  }

  const results = await Promise.allSettled(
    settings.map(s =>
      prisma.lbProcessSetting.upsert({
        where: { vesselCode: s.vesselCode },
        update: {
          isDefault: s.isDefault,
          cutLeadDays: s.cutLeadDays, cutDuration: s.cutDuration,
          assemblySmallDays: s.assemblySmallDays, assemblyMidDays: s.assemblyMidDays,
          assemblyLargeDays: s.assemblyLargeDays,
          hullInspLeadDays: s.hullInspLeadDays,
          hullInspIntervalDays: s.hullInspIntervalDays,
          hullInspBlocksPerSession: s.hullInspBlocksPerSession,
          paintLeadDays: s.paintLeadDays, paintDuration: s.paintDuration,
          peLeadDays: s.peLeadDays, peDuration: s.peDuration,
        },
        create: {
          vesselCode: s.vesselCode, isDefault: s.isDefault,
          cutLeadDays: s.cutLeadDays, cutDuration: s.cutDuration,
          assemblySmallDays: s.assemblySmallDays, assemblyMidDays: s.assemblyMidDays,
          assemblyLargeDays: s.assemblyLargeDays,
          hullInspLeadDays: s.hullInspLeadDays,
          hullInspIntervalDays: s.hullInspIntervalDays,
          hullInspBlocksPerSession: s.hullInspBlocksPerSession,
          paintLeadDays: s.paintLeadDays, paintDuration: s.paintDuration,
          peLeadDays: s.peLeadDays, peDuration: s.peDuration,
        },
      })
    )
  );

  const saved = results.filter(r => r.status === "fulfilled").length;
  return NextResponse.json({ saved });
}

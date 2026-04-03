export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// POST: 해당 버전 배포 (기존 배포 해제 후 이 버전 배포)
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  await prisma.$transaction([
    prisma.lbPlanVersion.updateMany({ data: { isDeployed: false } }),
    prisma.lbPlanVersion.update({ where: { id }, data: { isDeployed: true } }),
  ]);

  const version = await prisma.lbPlanVersion.findUnique({ where: { id } });
  return NextResponse.json(version);
}

export const dynamic = "force-dynamic";

// GET /api/steel-plan/heat-options?vesselCode=&material=&thickness=&width=&length=&q=
// 조건에 맞는 판번호(heatNo) 목록 반환 — SteelPlanHeat 테이블 조회

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const vesselCode = searchParams.get("vesselCode") || undefined;
  const material   = searchParams.get("material")   || undefined;
  const thickness  = searchParams.get("thickness")  ? Number(searchParams.get("thickness"))  : undefined;
  const width      = searchParams.get("width")      ? Number(searchParams.get("width"))      : undefined;
  const length     = searchParams.get("length")     ? Number(searchParams.get("length"))     : undefined;
  const q          = searchParams.get("q")          || undefined;

  const rows = await prisma.steelPlanHeat.findMany({
    where: {
      ...(vesselCode ? { vesselCode } : {}),
      ...(material   ? { material: { equals: material, mode: "insensitive" } } : {}),
      ...(thickness  ? { thickness } : {}),
      ...(width      ? { width }     : {}),
      ...(length     ? { length }    : {}),
      status: "WAITING",
      ...(q ? { heatNo: { contains: q, mode: "insensitive" } } : {}),
    },
    select: { id: true, heatNo: true, vesselCode: true, material: true, thickness: true, width: true, length: true, status: true },
    orderBy: { heatNo: "asc" },
  });

  return NextResponse.json(rows);
}

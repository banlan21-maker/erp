export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/steel-plan/heat?vesselCode=&status=&search=
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const vesselCode = searchParams.get("vesselCode") || undefined;
  const status     = searchParams.get("status")     || undefined;
  const search     = searchParams.get("search")     || undefined;

  const rows = await prisma.steelPlanHeat.findMany({
    where: {
      ...(vesselCode ? { vesselCode } : {}),
      ...(status ? { status: status as "WAITING" | "CUT" } : {}),
      ...(search
        ? {
            OR: [
              { vesselCode: { contains: search, mode: "insensitive" } },
              { material:   { contains: search, mode: "insensitive" } },
              { heatNo:     { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: [{ vesselCode: "asc" }, { createdAt: "asc" }],
  });

  return NextResponse.json(rows);
}

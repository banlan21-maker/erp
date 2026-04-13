export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const PAGE_SIZE = 50;

// GET /api/steel-plan/heat?vesselCode=&status=&search=&page=
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const vesselCode = searchParams.get("vesselCode") || undefined;
  const status     = searchParams.get("status")     || undefined;
  const search     = searchParams.get("search")     || undefined;
  const page       = Math.max(1, parseInt(searchParams.get("page") || "1"));

  const where: Parameters<typeof prisma.steelPlanHeat.findMany>[0]["where"] = {
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
  };

  const [total, rows, allVessels] = await Promise.all([
    prisma.steelPlanHeat.count({ where }),
    prisma.steelPlanHeat.findMany({
      where,
      orderBy: [{ vesselCode: "asc" }, { createdAt: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.steelPlanHeat.findMany({
      select:   { vesselCode: true },
      distinct: ["vesselCode"],
      orderBy:  { vesselCode: "asc" },
    }),
  ]);

  return NextResponse.json({
    data:        rows,
    total,
    page,
    totalPages:  Math.ceil(total / PAGE_SIZE),
    vesselCodes: allVessels.map((v) => v.vesselCode),
  });
}

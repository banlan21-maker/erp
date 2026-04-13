export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const PAGE_SIZE = 50;

const parseList = (v: string | null) => v?.split(",").filter(Boolean) ?? [];

export async function GET(req: NextRequest) {
  const sp = new URL(req.url).searchParams;

  const search    = sp.get("search") || undefined;
  const page      = Math.max(1, parseInt(sp.get("page") || "1"));

  const vesselCodes  = parseList(sp.get("vesselCodes"));
  const materials    = parseList(sp.get("materials"));
  const thicknesses  = parseList(sp.get("thicknesses")).map(Number).filter((n) => !isNaN(n));
  const widths       = parseList(sp.get("widths")).map(Number).filter((n) => !isNaN(n));
  const lengths      = parseList(sp.get("lengths")).map(Number).filter((n) => !isNaN(n));
  const heatNos      = parseList(sp.get("heatNos"));
  const statuses     = parseList(sp.get("statuses")) as ("WAITING" | "CUT")[];

  const where = {
    ...(search
      ? { OR: [
          { vesselCode: { contains: search, mode: "insensitive" as const } },
          { material:   { contains: search, mode: "insensitive" as const } },
          { heatNo:     { contains: search, mode: "insensitive" as const } },
        ]}
      : {}),
    ...(vesselCodes.length ? { vesselCode: { in: vesselCodes } } : {}),
    ...(materials.length   ? { material:   { in: materials } }   : {}),
    ...(thicknesses.length ? { thickness:  { in: thicknesses } } : {}),
    ...(widths.length      ? { width:      { in: widths } }      : {}),
    ...(lengths.length     ? { length:     { in: lengths } }     : {}),
    ...(heatNos.length     ? { heatNo:     { in: heatNos } }     : {}),
    ...(statuses.length    ? { status:     { in: statuses } }    : {}),
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

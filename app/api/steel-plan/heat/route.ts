export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const PAGE_SIZE = 50;

const parseList = (v: string | null) => v?.split(",").filter(Boolean) ?? [];

export async function GET(req: NextRequest) {
  const sp = new URL(req.url).searchParams;

  const search    = sp.get("search") || undefined;
  const all       = sp.get("all")    === "true";
  const page      = Math.max(1, parseInt(sp.get("page") || "1"));

  const vesselCodes    = parseList(sp.get("vesselCodes"));
  const materials      = parseList(sp.get("materials"));
  const thicknesses    = parseList(sp.get("thicknesses")).map(Number).filter((n) => !isNaN(n));
  const widths         = parseList(sp.get("widths")).map(Number).filter((n) => !isNaN(n));
  const lengths        = parseList(sp.get("lengths")).map(Number).filter((n) => !isNaN(n));
  const heatNos        = parseList(sp.get("heatNos"));
  const statuses       = parseList(sp.get("statuses")) as ("WAITING" | "CUT")[];
  const uploadBatchNos = parseList(sp.get("uploadBatchNos"));
  const ids            = parseList(sp.get("ids"));

  const nullableIn = (values: string[], field: string) => {
    if (!values.length) return {};
    const hasNull = values.includes("__NULL__");
    const nonNull = values.filter((v) => v !== "__NULL__");
    if (hasNull && nonNull.length) return { OR: [{ [field]: null }, { [field]: { in: nonNull } }] };
    if (hasNull) return { [field]: null };
    return { [field]: { in: nonNull } };
  };

  const where = {
    ...(ids.length ? { id: { in: ids } } : {}),
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
    ...nullableIn(uploadBatchNos, "uploadBatchNo"),
  };

  const [total, rows, allVessels] = await Promise.all([
    prisma.steelPlanHeat.count({ where }),
    prisma.steelPlanHeat.findMany({
      where,
      orderBy: [{ vesselCode: "asc" }, { createdAt: "asc" }],
      ...(all ? {} : { skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
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

// DELETE /api/steel-plan/heat
// body: { ids: string[] } — 선택된 판번호 일괄 삭제
export async function DELETE(req: NextRequest) {
  const body = await req.json();
  if (!Array.isArray(body.ids) || body.ids.length === 0) {
    return NextResponse.json({ error: "ids 필요" }, { status: 400 });
  }
  const { count } = await prisma.steelPlanHeat.deleteMany({ where: { id: { in: body.ids } } });
  return NextResponse.json({ count });
}

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const PAGE_SIZE = 50;

const parseList = (v: string | null) => v?.split(",").filter(Boolean) ?? [];

/** null 포함 가능한 IN 필터 조건 빌드 */
function nullableIn(values: string[], field: string) {
  if (!values.length) return {};
  const hasNull  = values.includes("__NULL__");
  const nonNull  = values.filter((v) => v !== "__NULL__");
  if (hasNull && nonNull.length) return { OR: [{ [field]: null }, { [field]: { in: nonNull } }] };
  if (hasNull)  return { [field]: null };
  return { [field]: { in: nonNull } };
}

/** 날짜 배열 → receivedAt OR 조건 */
function buildDateFilter(dates: string[]) {
  if (!dates.length) return {};
  const hasNull   = dates.includes("__NULL__");
  const dateParts = dates.filter((d) => d !== "__NULL__");
  const ranges = dateParts.map((d) => ({
    receivedAt: {
      gte: new Date(`${d}T00:00:00.000Z`),
      lt:  new Date(new Date(`${d}T00:00:00.000Z`).getTime() + 86_400_000),
    },
  }));
  const conditions: object[] = [
    ...(hasNull ? [{ receivedAt: null }] : []),
    ...ranges,
  ];
  if (!conditions.length) return {};
  if (conditions.length === 1) return conditions[0];
  return { OR: conditions };
}

// GET /api/steel-plan
export async function GET(req: NextRequest) {
  const sp = new URL(req.url).searchParams;

  const search          = sp.get("search")          || undefined;
  const all             = sp.get("all")             === "true";
  const page            = Math.max(1, parseInt(sp.get("page") || "1"));

  // Column IN filters
  const vesselCodes     = parseList(sp.get("vesselCodes"));
  const materials       = parseList(sp.get("materials"));
  const thicknesses     = parseList(sp.get("thicknesses")).map(Number).filter((n) => !isNaN(n));
  const widths          = parseList(sp.get("widths")).map(Number).filter((n) => !isNaN(n));
  const lengths         = parseList(sp.get("lengths")).map(Number).filter((n) => !isNaN(n));
  const statuses        = parseList(sp.get("statuses")) as ("REGISTERED" | "RECEIVED" | "COMPLETED")[];
  const receivedDates   = parseList(sp.get("receivedDates"));
  const storageLocations = parseList(sp.get("storageLocations"));
  const reservedFors    = parseList(sp.get("reservedFors"));

  const where = {
    ...(search
      ? { OR: [
          { vesselCode: { contains: search, mode: "insensitive" as const } },
          { material:   { contains: search, mode: "insensitive" as const } },
        ]}
      : {}),
    ...(vesselCodes.length  ? { vesselCode: { in: vesselCodes } }  : {}),
    ...(materials.length    ? { material:   { in: materials } }    : {}),
    ...(thicknesses.length  ? { thickness:  { in: thicknesses } }  : {}),
    ...(widths.length       ? { width:      { in: widths } }       : {}),
    ...(lengths.length      ? { length:     { in: lengths } }      : {}),
    ...(statuses.length     ? { status:     { in: statuses } }     : {}),
    ...buildDateFilter(receivedDates),
    ...nullableIn(storageLocations, "storageLocation"),
    ...nullableIn(reservedFors,     "reservedFor"),
  };

  const [total, rows, allVessels] = await Promise.all([
    prisma.steelPlan.count({ where }),
    prisma.steelPlan.findMany({
      where,
      orderBy: [{ vesselCode: "asc" }, { createdAt: "asc" }],
      ...(all ? {} : { skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    }),
    prisma.steelPlan.findMany({
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

// POST /api/steel-plan
export async function POST(req: NextRequest) {
  const body = await req.json();
  const items: {
    vesselCode: string; material: string; thickness: number;
    width: number; length: number; heatNo?: string | null;
    memo?: string | null; sourceFile?: string | null;
  }[] = Array.isArray(body) ? body : [body];

  const planData = items.map((item) => ({
    vesselCode: item.vesselCode, material: item.material,
    thickness: item.thickness,  width: item.width, length: item.length,
    memo: item.memo ?? null,    sourceFile: item.sourceFile ?? null,
  }));

  const created = await prisma.steelPlan.createMany({ data: planData });

  const heatData = items
    .filter((item) => item.heatNo?.trim())
    .map((item) => ({
      vesselCode: item.vesselCode, material: item.material,
      thickness: item.thickness,  width: item.width, length: item.length,
      heatNo: item.heatNo!.trim(), sourceFile: item.sourceFile ?? null,
    }));

  if (heatData.length > 0) await prisma.steelPlanHeat.createMany({ data: heatData });

  return NextResponse.json({ count: created.count }, { status: 201 });
}

// DELETE /api/steel-plan
export async function DELETE(req: NextRequest) {
  const body = await req.json();
  if (body.vesselCode) {
    const [plan, heat] = await Promise.all([
      prisma.steelPlan.deleteMany({ where: { vesselCode: body.vesselCode } }),
      prisma.steelPlanHeat.deleteMany({ where: { vesselCode: body.vesselCode } }),
    ]);
    return NextResponse.json({ planCount: plan.count, heatCount: heat.count });
  }
  return NextResponse.json({ error: "vesselCode required" }, { status: 400 });
}

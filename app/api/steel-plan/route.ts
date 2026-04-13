export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const PAGE_SIZE = 50;

// GET /api/steel-plan?vesselCode=&status=&search=&receivedFrom=&receivedTo=&storageLocation=&reservedFor=&page=
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const vesselCode      = searchParams.get("vesselCode")      || undefined;
  const status          = searchParams.get("status")          || undefined;
  const search          = searchParams.get("search")          || undefined;
  const receivedFrom    = searchParams.get("receivedFrom")    || undefined;
  const receivedTo      = searchParams.get("receivedTo")      || undefined;
  const storageLocation = searchParams.get("storageLocation") || undefined;
  const reservedFor     = searchParams.get("reservedFor")     || undefined; // "ALL" | "CONFIRMED" | "NONE"
  const all             = searchParams.get("all") === "true";
  const page            = Math.max(1, parseInt(searchParams.get("page") || "1"));

  const where = {
    ...(vesselCode ? { vesselCode } : {}),
    ...(status ? { status: status as "REGISTERED" | "RECEIVED" | "COMPLETED" } : {}),
    ...(search
      ? {
          OR: [
            { vesselCode: { contains: search, mode: "insensitive" as const } },
            { material:   { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
    ...((receivedFrom || receivedTo)
      ? {
          receivedAt: {
            ...(receivedFrom ? { gte: new Date(receivedFrom) } : {}),
            ...(receivedTo   ? { lte: new Date(`${receivedTo}T23:59:59`) } : {}),
          },
        }
      : {}),
    ...(storageLocation
      ? { storageLocation: { contains: storageLocation, mode: "insensitive" as const } }
      : {}),
    ...(reservedFor === "CONFIRMED"
      ? { reservedFor: { not: null } }
      : reservedFor === "NONE"
      ? { reservedFor: null }
      : {}),
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

// POST /api/steel-plan — 단건 또는 배열 등록
export async function POST(req: NextRequest) {
  const body = await req.json();
  const items: {
    vesselCode: string;
    material: string;
    thickness: number;
    width: number;
    length: number;
    heatNo?: string | null;
    memo?: string | null;
    sourceFile?: string | null;
  }[] = Array.isArray(body) ? body : [body];

  const planData = items.map((item) => ({
    vesselCode: item.vesselCode,
    material:   item.material,
    thickness:  item.thickness,
    width:      item.width,
    length:     item.length,
    memo:       item.memo ?? null,
    sourceFile: item.sourceFile ?? null,
  }));

  const created = await prisma.steelPlan.createMany({ data: planData });

  const heatData = items
    .filter((item) => item.heatNo && item.heatNo.trim() !== "")
    .map((item) => ({
      vesselCode: item.vesselCode,
      material:   item.material,
      thickness:  item.thickness,
      width:      item.width,
      length:     item.length,
      heatNo:     item.heatNo!.trim(),
      sourceFile: item.sourceFile ?? null,
    }));

  if (heatData.length > 0) {
    await prisma.steelPlanHeat.createMany({ data: heatData });
  }

  return NextResponse.json({ count: created.count }, { status: 201 });
}

// DELETE /api/steel-plan — 호선 단위 삭제
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

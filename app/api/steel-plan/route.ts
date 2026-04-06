export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/steel-plan?vesselCode=&status=&search=
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const vesselCode = searchParams.get("vesselCode") || undefined;
  const status = searchParams.get("status") || undefined;
  const search = searchParams.get("search") || undefined;

  const rows = await prisma.steelPlan.findMany({
    where: {
      ...(vesselCode ? { vesselCode } : {}),
      ...(status ? { status: status as "REGISTERED" | "RECEIVED" } : {}),
      ...(search
        ? {
            OR: [
              { vesselCode: { contains: search, mode: "insensitive" } },
              { material: { contains: search, mode: "insensitive" } },
              { heatNo: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: [{ vesselCode: "asc" }, { createdAt: "asc" }],
  });

  return NextResponse.json(rows);
}

// POST /api/steel-plan  — 단건 또는 배열 등록
export async function POST(req: NextRequest) {
  const body = await req.json();
  const items: {
    vesselCode: string;
    material: string;
    thickness: number;
    width: number;
    length: number;
    qty: number;
    heatNo?: string;
    memo?: string;
    sourceFile?: string;
  }[] = Array.isArray(body) ? body : [body];

  const created = await prisma.steelPlan.createMany({ data: items });

  return NextResponse.json({ count: created.count }, { status: 201 });
}

// DELETE /api/steel-plan  — 배열 ids 일괄 삭제
export async function DELETE(req: NextRequest) {
  const { ids } = await req.json();
  if (!Array.isArray(ids) || ids.length === 0)
    return NextResponse.json({ error: "ids required" }, { status: 400 });

  const { count } = await prisma.steelPlan.deleteMany({
    where: { id: { in: ids } },
  });

  return NextResponse.json({ count });
}

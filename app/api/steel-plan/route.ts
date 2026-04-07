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
      ...(status ? { status: status as "REGISTERED" | "RECEIVED" | "COMPLETED" } : {}),
      ...(search
        ? {
            OR: [
              { vesselCode: { contains: search, mode: "insensitive" } },
              { material: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: [{ vesselCode: "asc" }, { createdAt: "asc" }],
  });

  return NextResponse.json(rows);
}

// POST /api/steel-plan — 단건 또는 배열 등록
// 엑셀 1행 = SteelPlan 1행 + SteelPlanHeat 1행 동시 생성
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

  // SteelPlan 생성 (판번호 제외한 규격만)
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

  // SteelPlanHeat 생성 (판번호 있는 항목만)
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

// DELETE /api/steel-plan — 배열 ids 일괄 삭제
export async function DELETE(req: NextRequest) {
  const { ids } = await req.json();
  if (!Array.isArray(ids) || ids.length === 0)
    return NextResponse.json({ error: "ids required" }, { status: 400 });

  const { count } = await prisma.steelPlan.deleteMany({
    where: { id: { in: ids } },
  });

  return NextResponse.json({ count });
}

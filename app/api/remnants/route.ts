import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// 잔재번호 자동채번: REM-YYYY-NNN
async function generateRemnantNo(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `REM-${year}-`;
  const last = await prisma.remnant.findFirst({
    where: { remnantNo: { startsWith: prefix } },
    orderBy: { remnantNo: "desc" },
  });
  const seq = last ? parseInt(last.remnantNo.split("-")[2], 10) + 1 : 1;
  return `${prefix}${String(seq).padStart(3, "0")}`;
}

// GET /api/remnants
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status    = searchParams.get("status");
    const type      = searchParams.get("type");
    const shape     = searchParams.get("shape");
    const material  = searchParams.get("material");
    const projectId = searchParams.get("projectId");

    const where: any = {};
    if (status)    where.status          = status;
    if (type)      where.type            = type;
    if (shape)     where.shape           = shape;
    if (material)  where.material        = { contains: material, mode: "insensitive" };
    if (projectId) where.sourceProjectId = projectId;

    const remnants = await prisma.remnant.findMany({
      where,
      include: {
        sourceProject: { select: { id: true, projectCode: true, projectName: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, data: remnants });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// POST /api/remnants
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      remnantNo: customNo,
      type, shape, material, thickness, weight,
      width1, length1, width2, length2,
      sourceProjectId, sourceVesselName, sourceBlock,
      location, registeredBy, memo,
    } = body;

    if (!type || !shape || !material || thickness == null || weight == null || !registeredBy) {
      return NextResponse.json({ success: false, error: "필수 항목이 누락됐습니다." }, { status: 400 });
    }

    // 잔재번호: 사용자 입력 우선, 없으면 자동채번
    let remnantNo: string;
    if (customNo?.trim()) {
      const exists = await prisma.remnant.findUnique({ where: { remnantNo: customNo.trim() } });
      if (exists) return NextResponse.json({ success: false, error: `잔재번호 '${customNo.trim()}'이 이미 사용 중입니다.` }, { status: 409 });
      remnantNo = customNo.trim();
    } else {
      remnantNo = await generateRemnantNo();
    }

    const remnant = await prisma.remnant.create({
      data: {
        remnantNo,
        type,
        shape,
        material: material.trim(),
        thickness: Number(thickness),
        weight:    Number(weight),
        width1:    width1    != null ? Number(width1)  : null,
        length1:   length1   != null ? Number(length1) : null,
        width2:    width2    != null ? Number(width2)  : null,
        length2:   length2   != null ? Number(length2) : null,
        sourceProjectId: sourceProjectId || null,
        sourceVesselName: sourceVesselName?.trim() || null,
        sourceBlock: sourceBlock?.trim() || null,
        location:  location?.trim() || null,
        registeredBy: registeredBy.trim(),
        memo: memo?.trim() || null,
      },
      include: {
        sourceProject: { select: { id: true, projectCode: true, projectName: true } },
      },
    });

    return NextResponse.json({ success: true, data: remnant });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

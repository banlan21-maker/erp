import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { EquipmentType } from "@prisma/client";

// GET /api/equipment - 장비 목록
export async function GET() {
  try {
    const equipment = await prisma.equipment.findMany({
      where: { status: { not: "INACTIVE" } },
      orderBy: { name: "asc" },
    });
    return NextResponse.json({ success: true, data: equipment });
  } catch (error) {
    console.error("[GET /api/equipment]", error);
    return NextResponse.json(
      { success: false, error: "장비 목록 조회 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

// POST /api/equipment - 장비 등록
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, type, memo } = body;

    if (!name || !type) {
      return NextResponse.json(
        { success: false, error: "장비명과 유형을 입력하세요." },
        { status: 400 }
      );
    }

    const equipment = await prisma.equipment.create({
      data: { name: name.trim(), type: type as EquipmentType, memo: memo?.trim() || null },
    });

    return NextResponse.json({ success: true, data: equipment }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/equipment]", error);
    return NextResponse.json(
      { success: false, error: "장비 등록 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/mgmt-equipment-kind — 전체 목록 (sortOrder 오름차순)
export async function GET() {
  try {
    const kinds = await prisma.mgmtEquipmentKindPreset.findMany({
      orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
    });
    return NextResponse.json({ success: true, data: kinds });
  } catch (error) {
    console.error("[GET /api/mgmt-equipment-kind]", error);
    return NextResponse.json({ success: false, error: "조회 오류" }, { status: 500 });
  }
}

// POST /api/mgmt-equipment-kind — 새 종류 추가
export async function POST(request: NextRequest) {
  try {
    const { label } = await request.json();
    if (!label?.trim()) {
      return NextResponse.json({ success: false, error: "종류명을 입력하세요." }, { status: 400 });
    }

    const count = await prisma.mgmtEquipmentKindPreset.count();
    const preset = await prisma.mgmtEquipmentKindPreset.create({
      data: { label: label.trim(), sortOrder: count },
    });
    return NextResponse.json({ success: true, data: preset }, { status: 201 });
  } catch (error: unknown) {
    // Unique constraint — 이미 존재하는 종류
    if (error && typeof error === "object" && "code" in error && (error as { code: string }).code === "P2002") {
      return NextResponse.json({ success: false, error: "이미 존재하는 종류명입니다." }, { status: 409 });
    }
    console.error("[POST /api/mgmt-equipment-kind]", error);
    return NextResponse.json({ success: false, error: "추가 오류" }, { status: 500 });
  }
}

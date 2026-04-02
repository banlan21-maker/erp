import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/emergency-group — 그룹 + 항목 전체 조회
export async function GET() {
  try {
    const groups = await prisma.emergencyGroup.findMany({
      orderBy: { sortOrder: "asc" },
      include: {
        contacts: { orderBy: { sortOrder: "asc" } },
      },
    });
    return NextResponse.json({ success: true, data: groups });
  } catch (error) {
    console.error("[GET /api/emergency-group]", error);
    return NextResponse.json({ success: false, error: "조회 오류" }, { status: 500 });
  }
}

// POST /api/emergency-group — 그룹 생성
export async function POST(request: NextRequest) {
  try {
    const { name } = await request.json();
    if (!name?.trim()) {
      return NextResponse.json({ success: false, error: "그룹명은 필수입니다." }, { status: 400 });
    }
    const count = await prisma.emergencyGroup.count();
    const group = await prisma.emergencyGroup.create({
      data: { name: name.trim(), sortOrder: count },
      include: { contacts: true },
    });
    return NextResponse.json({ success: true, data: group }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/emergency-group]", error);
    return NextResponse.json({ success: false, error: "생성 오류" }, { status: 500 });
  }
}

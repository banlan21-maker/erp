import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/workers
export async function GET() {
  try {
    const workers = await prisma.worker.findMany({
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json({ success: true, data: workers });
  } catch (error) {
    console.error("[GET /api/workers]", error);
    return NextResponse.json({ success: false, error: "조회 오류" }, { status: 500 });
  }
}

// POST /api/workers
export async function POST(request: NextRequest) {
  try {
    const { name, nationality, birthDate, phone } = await request.json();

    if (!name?.trim()) {
      return NextResponse.json({ success: false, error: "이름은 필수입니다." }, { status: 400 });
    }

    const worker = await prisma.worker.create({
      data: {
        name: name.trim(),
        nationality: nationality?.trim() || null,
        birthDate: birthDate ? new Date(birthDate) : null,
        phone: phone?.trim() || null,
      },
    });

    return NextResponse.json({ success: true, data: worker }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/workers]", error);
    return NextResponse.json({ success: false, error: "등록 오류" }, { status: 500 });
  }
}

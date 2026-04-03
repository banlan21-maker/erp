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
    const { name, nationality, birthDate, phone, role, position, worksite, joinDate, bloodType, shoeSize, winterTop, winterBottom, summerTop, summerBottom, nickname, englishName, visaType, foreignIdNo, passportNo, visaExpiry, isCncOp } = await request.json();

    if (!name?.trim()) {
      return NextResponse.json({ success: false, error: "이름은 필수입니다." }, { status: 400 });
    }

    const isForeigner = nationality && nationality !== "한국";

    const worker = await prisma.worker.create({
      data: {
        name: name.trim(),
        nationality: nationality?.trim() || null,
        birthDate: birthDate ? new Date(birthDate) : null,
        phone: phone?.trim() || null,
        role: role?.trim() || null,
        position: position?.trim() || null,
        worksite: worksite?.trim() || null,
        joinDate: joinDate ? new Date(joinDate) : null,
        bloodType: bloodType?.trim() || null,
        shoeSize: shoeSize?.toString().trim() || null,
        winterTop: winterTop?.trim() || null,
        winterBottom: winterBottom?.trim() || null,
        summerTop: summerTop?.trim() || null,
        summerBottom: summerBottom?.trim() || null,
        isCncOp: isCncOp === true,
        nickname: isForeigner ? nickname?.trim() || null : null,
        englishName: isForeigner ? englishName?.trim() || null : null,
        visaType: isForeigner ? visaType?.trim() || null : null,
        foreignIdNo: isForeigner ? foreignIdNo?.trim() || null : null,
        passportNo: isForeigner ? passportNo?.trim() || null : null,
        visaExpiry: isForeigner && visaExpiry ? new Date(visaExpiry) : null,
      },
    });

    return NextResponse.json({ success: true, data: worker }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/workers]", error);
    return NextResponse.json({ success: false, error: "등록 오류" }, { status: 500 });
  }
}

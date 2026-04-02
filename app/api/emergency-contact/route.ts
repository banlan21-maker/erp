import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// POST /api/emergency-contact — 항목 추가
export async function POST(request: NextRequest) {
  try {
    const { groupId, workerId, directName, directPhone } = await request.json();
    if (!groupId) {
      return NextResponse.json({ success: false, error: "그룹 ID는 필수입니다." }, { status: 400 });
    }
    if (!workerId && !directName?.trim()) {
      return NextResponse.json({ success: false, error: "인원 선택 또는 이름 직접 입력이 필요합니다." }, { status: 400 });
    }
    const count = await prisma.emergencyContact.count({ where: { groupId } });
    const contact = await prisma.emergencyContact.create({
      data: {
        groupId,
        workerId: workerId || null,
        directName: directName?.trim() || null,
        directPhone: directPhone?.trim() || null,
        sortOrder: count,
      },
    });
    return NextResponse.json({ success: true, data: contact }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/emergency-contact]", error);
    return NextResponse.json({ success: false, error: "추가 오류" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/driving-location — 위치 프리셋 목록 (출발·도착 공용)
export async function GET() {
  try {
    const data = await prisma.drivingLocation.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[GET /api/driving-location]", error);
    return NextResponse.json({ success: false, error: "조회 오류" }, { status: 500 });
  }
}

// POST /api/driving-location — 위치 추가  body: { name }
export async function POST(request: NextRequest) {
  try {
    const { name } = await request.json();
    const nm = String(name ?? "").trim();
    if (!nm) return NextResponse.json({ success: false, error: "위치명을 입력하세요." }, { status: 400 });
    const exists = await prisma.drivingLocation.findUnique({ where: { name: nm } });
    if (exists) return NextResponse.json({ success: false, error: `'${nm}'는 이미 등록되어 있습니다.` }, { status: 409 });
    const max = await prisma.drivingLocation.findFirst({ orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
    const loc = await prisma.drivingLocation.create({ data: { name: nm, sortOrder: (max?.sortOrder ?? 0) + 1 } });
    return NextResponse.json({ success: true, data: loc });
  } catch (error) {
    console.error("[POST /api/driving-location]", error);
    return NextResponse.json({ success: false, error: "저장 오류" }, { status: 500 });
  }
}

// DELETE /api/driving-location?id=xxx
export async function DELETE(request: NextRequest) {
  try {
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return NextResponse.json({ success: false, error: "id 필요" }, { status: 400 });
    await prisma.drivingLocation.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/driving-location]", error);
    return NextResponse.json({ success: false, error: "삭제 오류" }, { status: 500 });
  }
}

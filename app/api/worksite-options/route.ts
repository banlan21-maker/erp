import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const DEFAULTS = ["진동", "진교"];

export async function GET() {
  try {
    let options = await prisma.worksiteOption.findMany({ orderBy: { createdAt: "asc" } });
    if (options.length === 0) {
      await prisma.worksiteOption.createMany({
        data: DEFAULTS.map((name) => ({ name })),
        skipDuplicates: true,
      });
      options = await prisma.worksiteOption.findMany({ orderBy: { createdAt: "asc" } });
    }
    return NextResponse.json({ success: true, data: options });
  } catch (error) {
    console.error("[GET /api/worksite-options]", error);
    return NextResponse.json({ success: false, error: "조회 오류" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { name } = await request.json();
    if (!name?.trim()) {
      return NextResponse.json({ success: false, error: "근무지명을 입력하세요." }, { status: 400 });
    }
    const option = await prisma.worksiteOption.create({ data: { name: name.trim() } });
    return NextResponse.json({ success: true, data: option }, { status: 201 });
  } catch (error: unknown) {
    if ((error as { code?: string })?.code === "P2002") {
      return NextResponse.json({ success: false, error: "이미 존재하는 근무지입니다." }, { status: 409 });
    }
    console.error("[POST /api/worksite-options]", error);
    return NextResponse.json({ success: false, error: "등록 오류" }, { status: 500 });
  }
}

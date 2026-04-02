import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/notice?category=NOTICE|MANAGEMENT
export async function GET(request: NextRequest) {
  try {
    const category = request.nextUrl.searchParams.get("category");
    const notices = await prisma.notice.findMany({
      where: category ? { category: category as "NOTICE" | "MANAGEMENT" } : undefined,
      orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
    });
    return NextResponse.json({ success: true, data: notices });
  } catch (error) {
    console.error("[GET /api/notice]", error);
    return NextResponse.json({ success: false, error: "조회 오류" }, { status: 500 });
  }
}

// POST /api/notice
export async function POST(request: NextRequest) {
  try {
    const { category, title, content, author, isPinned } = await request.json();
    if (!title?.trim()) {
      return NextResponse.json({ success: false, error: "제목은 필수입니다." }, { status: 400 });
    }
    if (!author?.trim()) {
      return NextResponse.json({ success: false, error: "작성자는 필수입니다." }, { status: 400 });
    }
    if (!category) {
      return NextResponse.json({ success: false, error: "카테고리는 필수입니다." }, { status: 400 });
    }
    const notice = await prisma.notice.create({
      data: {
        category,
        title: title.trim(),
        content: content?.trim() || "",
        author: author.trim(),
        isPinned: isPinned ?? false,
      },
    });
    return NextResponse.json({ success: true, data: notice }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/notice]", error);
    return NextResponse.json({ success: false, error: "등록 오류" }, { status: 500 });
  }
}

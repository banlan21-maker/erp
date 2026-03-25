import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search");

    const whereClause: any = {};
    if (search) {
      whereClause.OR = [
        { name: { contains: search } },
        { contact: { contains: search } }
      ];
    }

    const vendors = await prisma.vendor.findMany({
      where: whereClause,
      orderBy: { name: "asc" }
    });

    return NextResponse.json({ success: true, data: vendors });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || "서버 통신 오류" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, contact, phone, email, businessNumber, category, memo } = body;

    if (!name?.trim()) {
      return NextResponse.json({ success: false, error: "업체명은 필수입니다." }, { status: 400 });
    }

    const newVendor = await prisma.vendor.create({
      data: { name, contact, phone, email, businessNumber, category, memo }
    });

    return NextResponse.json({ success: true, data: newVendor });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || "등록 중 오류가 발생했습니다." }, { status: 500 });
  }
}

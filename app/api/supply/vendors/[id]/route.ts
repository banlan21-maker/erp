import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const month = searchParams.get("month"); // 'YYYY-MM' 형식

    const vendorId = Number(id);
    if (!vendorId) return NextResponse.json({ success: false, error: "잘못된 ID입니다." }, { status: 400 });

    const vendor = await prisma.vendor.findUnique({
      where: { id: vendorId }
    });

    if (!vendor) return NextResponse.json({ success: false, error: "거래처를 찾을 수 없습니다." }, { status: 404 });

    // 연관된 입고 이력 필터링 (월 선택 여부에 따름)
    let inboundsWhere: any = { vendorId };
    
    // YYYY-MM 형태일 때 해당 월의 1일 시작 ~ 다음달 1일 미만까지 검색
    if (month && /^\d{4}-\d{2}$/.test(month)) {
      const [y, m] = month.split("-");
      const start = new Date(Number(y), Number(m) - 1, 1);
      const end = new Date(Number(y), Number(m), 1);
      inboundsWhere.receivedAt = { gte: start, lt: end };
    }

    const inbounds = await prisma.supplyInbound.findMany({
      where: inboundsWhere,
      orderBy: { receivedAt: "desc" },
      include: { item: true }
    });

    return NextResponse.json({ success: true, data: { ...vendor, inbounds } });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || "조회 중 오류가 발생했습니다." }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const vendorId = Number(id);

    // 즐겨찾기 토글만 요청하는 경우
    if ("isFavorite" in body && Object.keys(body).length === 1) {
      const updatedVendor = await prisma.vendor.update({
        where: { id: vendorId },
        data: { isFavorite: Boolean(body.isFavorite) },
      });
      return NextResponse.json({ success: true, data: updatedVendor });
    }

    const { name, contact, phone, email, businessNumber, category, memo } = body;

    if (!name?.trim()) {
      return NextResponse.json({ success: false, error: "업체명은 필수입니다." }, { status: 400 });
    }

    const updatedVendor = await prisma.vendor.update({
      where: { id: vendorId },
      data: { name, contact, phone, email, businessNumber, category, memo }
    });

    return NextResponse.json({ success: true, data: updatedVendor });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || "수정 중 오류가 발생했습니다." }, { status: 500 });
  }
}

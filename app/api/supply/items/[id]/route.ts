import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const item = await prisma.supplyItem.findUnique({
      where: { id: Number(params.id) },
    });
    if (!item) return NextResponse.json({ success: false, error: "품목을 찾을 수 없습니다." }, { status: 404 });
    return NextResponse.json({ success: true, data: item });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const body = await request.json();
    // stockQty는 직접 수정 불가능하도록 PATCH 데이터에서 제외합니다. 
    // 수량 변경은 반드시 입출고 트랜잭션 API를 통해서만 반영되어야 합니다.
    const { name, subCategory, unit, reorderPoint, location, memo } = body;

    if (!name || !unit) {
      return NextResponse.json({ success: false, error: "품명, 단위는 필수입니다." }, { status: 400 });
    }

    const updatedItem = await prisma.supplyItem.update({
      where: { id: Number(params.id) },
      data: {
        name,
        subCategory,
        unit,
        reorderPoint: reorderPoint ? Number(reorderPoint) : null,
        location,
        memo
      }
    });

    return NextResponse.json({ success: true, data: updatedItem });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

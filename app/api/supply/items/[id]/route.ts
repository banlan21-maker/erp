import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const item = await prisma.supplyItem.findUnique({
      where: { id: Number(id) },
    });
    if (!item) return NextResponse.json({ success: false, error: "품목을 찾을 수 없습니다." }, { status: 404 });
    return NextResponse.json({ success: true, data: item });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, department, subCategory, unit, reorderPoint, location, memo } = body;

    if (!name || !unit) {
      return NextResponse.json({ success: false, error: "품명, 단위는 필수입니다." }, { status: 400 });
    }

    const updatedItem = await prisma.supplyItem.update({
      where: { id: Number(id) },
      data: {
        name,
        ...(department && { department }),
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

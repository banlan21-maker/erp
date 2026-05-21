import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const b = await request.json();
    const data: Record<string, unknown> = {};
    if (b.usedDate  !== undefined) data.usedDate = b.usedDate;
    if (b.cardNo    !== undefined) data.cardNo = String(b.cardNo).trim();
    if (b.category  !== undefined) data.category = b.category?.trim() || null;
    if (b.detail    !== undefined) data.detail = b.detail?.trim() || "";
    if (b.amount    !== undefined) data.amount = Math.round(Number(b.amount) || 0);
    if (b.userName  !== undefined) data.userName = b.userName?.trim() || null;
    if (b.confirmed !== undefined) data.confirmed = !!b.confirmed;
    if (b.memo      !== undefined) data.memo = b.memo?.trim() || null;
    const rec = await prisma.cardUsage.update({ where: { id }, data });
    return NextResponse.json({ success: true, data: rec });
  } catch (error) {
    console.error("[PATCH /api/card-usage/[id]]", error);
    return NextResponse.json({ success: false, error: "수정 오류" }, { status: 500 });
  }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await prisma.cardUsage.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/card-usage/[id]]", error);
    return NextResponse.json({ success: false, error: "삭제 오류" }, { status: 500 });
  }
}

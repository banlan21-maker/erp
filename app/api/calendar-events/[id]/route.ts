import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const data: Record<string, unknown> = {};
    if (typeof body?.registrar === "string") {
      const v = body.registrar.trim();
      if (!v) return NextResponse.json({ success: false, error: "등록자는 비울 수 없습니다." }, { status: 400 });
      data.registrar = v;
    }
    if (typeof body?.content === "string") {
      const v = body.content.trim();
      if (!v) return NextResponse.json({ success: false, error: "일정 내용은 비울 수 없습니다." }, { status: 400 });
      data.content = v;
    }
    if (typeof body?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
      const [y, m, d] = body.date.split("-").map(Number);
      data.date = new Date(Date.UTC(y, m - 1, d));
    }
    const updated = await prisma.calendarEvent.update({ where: { id }, data });
    return NextResponse.json({
      success: true,
      data: {
        ...updated,
        date: updated.date.toISOString().split("T")[0],
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "수정 실패";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.calendarEvent.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "삭제 실패";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// PATCH /api/work/users/[id] — { name?, dept?, color?, active? }
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const data: { name?: string; dept?: string | null; color?: string | null; active?: boolean } = {};
    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (!name) return NextResponse.json({ success: false, error: "이름을 입력하세요." }, { status: 400 });
      const dup = await prisma.workUser.findFirst({ where: { name, NOT: { id } } });
      if (dup) return NextResponse.json({ success: false, error: `'${name}' 사용자가 이미 있습니다.` }, { status: 409 });
      data.name = name;
    }
    if (body.dept  !== undefined) data.dept  = body.dept  ? String(body.dept).trim()  || null : null;
    if (body.color !== undefined) data.color = body.color ? String(body.color).trim() || null : null;
    if (body.active !== undefined) data.active = !!body.active;
    const user = await prisma.workUser.update({ where: { id }, data });
    return NextResponse.json({ success: true, data: user });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      return NextResponse.json({ success: false, error: "동일한 이름의 사용자가 이미 있습니다." }, { status: 409 });
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

// DELETE /api/work/users/[id] — 사용자 삭제 (일지·글·멘션 cascade)
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await prisma.workUser.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

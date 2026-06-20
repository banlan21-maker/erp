export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// GET /api/work/users — 사용자 목록 (활성 우선, 이름순)
export async function GET() {
  try {
    const users = await prisma.workUser.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }] });
    return NextResponse.json({ success: true, data: users });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

// POST /api/work/users — 사용자 등록 { name, dept?, color? }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const name = String(body?.name ?? "").trim();
    if (!name) return NextResponse.json({ success: false, error: "이름을 입력하세요." }, { status: 400 });
    const dept  = body?.dept  ? String(body.dept).trim()  || null : null;
    const color = body?.color ? String(body.color).trim() || null : null;
    const exists = await prisma.workUser.findUnique({ where: { name } });
    if (exists) return NextResponse.json({ success: false, error: `'${name}' 사용자가 이미 있습니다.` }, { status: 409 });
    const user = await prisma.workUser.create({ data: { name, dept, color } });
    return NextResponse.json({ success: true, data: user }, { status: 201 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      return NextResponse.json({ success: false, error: "동일한 이름의 사용자가 이미 있습니다." }, { status: 409 });
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

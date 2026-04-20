export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/** GET /api/bom-vendors — 업체 전체 목록 */
export async function GET() {
  const vendors = await prisma.bomVendor.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, desc: true, preset: true, createdAt: true },
  });
  return NextResponse.json(vendors);
}

/** POST /api/bom-vendors — 업체 생성 */
export async function POST(req: NextRequest) {
  const { name, desc, preset } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: "업체명 필수" }, { status: 400 });

  const vendor = await prisma.bomVendor.create({
    data: { name: name.trim(), desc: desc ?? null, preset },
  });
  return NextResponse.json(vendor);
}

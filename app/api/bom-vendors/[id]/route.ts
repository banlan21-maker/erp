export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/** PATCH /api/bom-vendors/[id] — 업체 수정 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { name, desc, preset } = await req.json();
  const vendor = await prisma.bomVendor.update({
    where: { id },
    data: { name: name?.trim(), desc: desc ?? null, preset },
  });
  return NextResponse.json(vendor);
}

/** DELETE /api/bom-vendors/[id] — 업체 삭제 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.bomVendor.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

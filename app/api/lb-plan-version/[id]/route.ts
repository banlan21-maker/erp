export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// PATCH: 버전명 수정
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { name } = await req.json();
  const version = await prisma.lbPlanVersion.update({
    where: { id },
    data: { name: name.trim() },
  });
  return NextResponse.json(version);
}

// DELETE: 버전 삭제 (배포 중이면 불가)
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const version = await prisma.lbPlanVersion.findUnique({ where: { id } });
  if (!version) return NextResponse.json({ error: "버전 없음" }, { status: 404 });
  if (version.isDeployed) return NextResponse.json({ error: "배포 중인 버전은 삭제할 수 없습니다." }, { status: 409 });
  await prisma.lbPlanVersion.delete({ where: { id } }); // cascade deletes plans
  return NextResponse.json({ ok: true });
}

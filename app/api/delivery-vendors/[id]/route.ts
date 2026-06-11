/**
 * 납품처 개별 — 조회/수정/삭제
 *
 * GET    /api/delivery-vendors/[id]
 * PATCH  /api/delivery-vendors/[id]
 * DELETE /api/delivery-vendors/[id]
 *   — 사업자등록증 파일이 있으면 디스크에서도 제거
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { unlink, rm } from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";

const norm = (v: unknown): string | null | undefined => {
  if (v === undefined) return undefined;
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const v = await prisma.deliveryVendor.findUnique({ where: { id } });
  if (!v) return NextResponse.json({ success: false, error: "존재하지 않습니다." }, { status: 404 });
  return NextResponse.json({
    success: true,
    data: { ...v, createdAt: v.createdAt.toISOString(), updatedAt: v.updatedAt.toISOString() },
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();

    const data: Record<string, unknown> = {};
    if (body.name !== undefined) {
      const n = norm(body.name);
      if (!n) return NextResponse.json({ success: false, error: "상호(이름)는 비울 수 없습니다." }, { status: 400 });
      data.name = n;
    }
    for (const k of ["bizNo","ceo","address","bizType","bizItem","phone","fax","contactName","contactPhone","memo"] as const) {
      if (body[k] !== undefined) data[k] = norm(body[k]);
    }
    if (body.isActive !== undefined) data.isActive = !!body.isActive;

    const updated = await prisma.deliveryVendor.update({ where: { id }, data });
    return NextResponse.json({
      success: true,
      data: { ...updated, createdAt: updated.createdAt.toISOString(), updatedAt: updated.updatedAt.toISOString() },
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
    // 파일이 있으면 디스크에서도 제거
    const v = await prisma.deliveryVendor.findUnique({ where: { id } });
    if (!v) return NextResponse.json({ success: false, error: "존재하지 않습니다." }, { status: 404 });
    const vendorDir = path.join(process.cwd(), "public", "uploads", "delivery-vendors", id);
    if (v.bizCertStoredName) {
      try {
        // path.basename 으로 경로 탈출 방어 (DB 오염 대비 defense-in-depth)
        const safeName = path.basename(v.bizCertStoredName);
        await unlink(path.join(vendorDir, safeName));
      } catch { /* 파일 없으면 무시 */ }
    }
    // 빈 디렉터리도 제거
    try { await rm(vendorDir, { recursive: true, force: true }); } catch { /* 무시 */ }
    await prisma.deliveryVendor.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "삭제 실패";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

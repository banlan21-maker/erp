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

    // 현재 vendor 의 type 확인 (vendorType 자체는 PATCH 로 변경 불가 — UI 가정 보호)
    const current = await prisma.deliveryVendor.findUnique({ where: { id }, select: { vendorType: true } });
    if (!current) return NextResponse.json({ success: false, error: "존재하지 않습니다." }, { status: 404 });
    if (body.vendorType !== undefined && body.vendorType !== current.vendorType) {
      return NextResponse.json({ success: false, error: "거래처 종류(공급처/납품처)는 변경할 수 없습니다. 새로 등록해 주세요." }, { status: 400 });
    }
    const isSupplier = current.vendorType === "SUPPLIER";

    const data: Record<string, unknown> = {};
    if (body.name !== undefined) {
      const n = norm(body.name);
      if (!n) return NextResponse.json({ success: false, error: "상호(이름)는 비울 수 없습니다." }, { status: 400 });
      data.name = n;
    }
    for (const k of ["bizNo","ceo","address","bizType","bizItem","phone","fax","memo"] as const) {
      if (body[k] !== undefined) data[k] = norm(body[k]);
    }
    // 공급처는 거래처 측 담당자가 의미 없음 — 들어와도 null 유지
    if (body.contactName  !== undefined) data.contactName  = isSupplier ? null : norm(body.contactName);
    if (body.contactPhone !== undefined) data.contactPhone = isSupplier ? null : norm(body.contactPhone);
    if (body.isActive     !== undefined) data.isActive     = !!body.isActive;

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

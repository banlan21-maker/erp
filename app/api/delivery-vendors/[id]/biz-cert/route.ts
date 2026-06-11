/**
 * 납품처 사업자등록증 파일 — 업로드/삭제
 *
 * POST   /api/delivery-vendors/[id]/biz-cert    multipart: file (PDF | image/*)
 *   → 기존 파일이 있으면 디스크에서 폐기 후 새 파일 저장 (1업체 1파일 정책)
 *   → 저장: /public/uploads/delivery-vendors/{id}/{cuid}.{ext}
 * DELETE /api/delivery-vendors/[id]/biz-cert    파일 + DB 컬럼 비움
 *
 * 파일 서빙은 ./file/route.ts 분리.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { mkdir, writeFile, unlink } from "fs/promises";
import { randomUUID } from "crypto";
import path from "path";

export const dynamic = "force-dynamic";

const MAX_BYTES = 10 * 1024 * 1024; // 10MB
const ALLOWED   = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/heic",
]);

function extFromMime(mime: string, fallback: string): string {
  switch (mime) {
    case "application/pdf": return "pdf";
    case "image/png":       return "png";
    case "image/jpeg":      return "jpg";
    case "image/webp":      return "webp";
    case "image/heic":      return "heic";
    default:
      // 원본 파일명에서 확장자 추출 (PDF/이미지 화이트리스트만)
      const m = fallback.toLowerCase().match(/\.([a-z0-9]{2,4})$/);
      return m ? m[1] : "bin";
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const vendor = await prisma.deliveryVendor.findUnique({ where: { id } });
    if (!vendor) return NextResponse.json({ success: false, error: "납품처를 찾을 수 없습니다." }, { status: 404 });
    if (vendor.vendorType !== "DELIVERY") {
      return NextResponse.json({ success: false, error: "공급처는 사업자등록증을 등록할 수 없습니다." }, { status: 400 });
    }

    const fd = await req.formData();
    const file = fd.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, error: "file 필드가 필요합니다." }, { status: 400 });
    }
    if (!ALLOWED.has(file.type)) {
      return NextResponse.json({
        success: false, error: "PDF 또는 이미지(PNG/JPG/WEBP/HEIC) 파일만 업로드 가능합니다.",
      }, { status: 415 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({
        success: false, error: `파일이 너무 큽니다 (최대 ${MAX_BYTES / 1024 / 1024}MB)`,
      }, { status: 413 });
    }

    const dir = path.join(process.cwd(), "public", "uploads", "delivery-vendors", id);
    await mkdir(dir, { recursive: true });

    // 기존 파일 폐기 (있으면) — DB 오염 대비 path.basename 으로 sanitize
    if (vendor.bizCertStoredName) {
      try { await unlink(path.join(dir, path.basename(vendor.bizCertStoredName))); }
      catch { /* 없으면 무시 */ }
    }

    const ext = extFromMime(file.type, file.name);
    const storedName = `${randomUUID()}.${ext}`;
    const newPath = path.join(dir, storedName);
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(newPath, buffer);

    // DB 업데이트 실패 시 방금 쓴 파일 정리 (orphan 방지)
    let updated;
    try {
      updated = await prisma.deliveryVendor.update({
        where: { id },
        data: {
          bizCertStoredName:   storedName,
          bizCertOriginalName: file.name,
          bizCertMimeType:     file.type,
          bizCertSize:         file.size,
        },
      });
    } catch (dbErr) {
      try { await unlink(newPath); } catch { /* 무시 */ }
      throw dbErr;
    }

    return NextResponse.json({
      success: true,
      data: { ...updated, createdAt: updated.createdAt.toISOString(), updatedAt: updated.updatedAt.toISOString() },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "업로드 실패";
    console.error("[POST /api/delivery-vendors/[id]/biz-cert]", err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const vendor = await prisma.deliveryVendor.findUnique({ where: { id } });
    if (!vendor) return NextResponse.json({ success: false, error: "납품처를 찾을 수 없습니다." }, { status: 404 });
    if (vendor.vendorType !== "DELIVERY") {
      return NextResponse.json({ success: false, error: "공급처는 사업자등록증을 관리하지 않습니다." }, { status: 400 });
    }

    // DB 먼저 비우고 파일을 나중에 삭제 — 파일 삭제 실패해도 orphan 만 남고 UI 는 정합
    const updated = await prisma.deliveryVendor.update({
      where: { id },
      data: {
        bizCertStoredName:   null,
        bizCertOriginalName: null,
        bizCertMimeType:     null,
        bizCertSize:         null,
      },
    });
    if (vendor.bizCertStoredName) {
      try {
        await unlink(path.join(
          process.cwd(), "public", "uploads", "delivery-vendors", id,
          path.basename(vendor.bizCertStoredName),
        ));
      } catch { /* 무시 */ }
    }
    return NextResponse.json({
      success: true,
      data: { ...updated, createdAt: updated.createdAt.toISOString(), updatedAt: updated.updatedAt.toISOString() },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "삭제 실패";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

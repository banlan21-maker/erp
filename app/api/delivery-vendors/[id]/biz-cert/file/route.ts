/**
 * 납품처 사업자등록증 — 동적 파일 서빙
 * GET /api/delivery-vendors/[id]/biz-cert/file              → inline
 * GET /api/delivery-vendors/[id]/biz-cert/file?download=1   → attachment
 *
 * standalone 모드의 public 정적 서빙 이슈 우회 (cutting-drawings file 라우트 동일 패턴)
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readFile, stat } from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const vendor = await prisma.deliveryVendor.findUnique({ where: { id } });
  if (!vendor || !vendor.bizCertStoredName) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // 방어: storedName 은 cuid 로만 생성하지만 만에 하나 DB 가 오염되어도 디렉토리 탈출 차단
  const safeName = path.basename(vendor.bizCertStoredName);
  const filepath = path.join(
    process.cwd(), "public", "uploads", "delivery-vendors", id, safeName,
  );
  try { await stat(filepath); }
  catch { return NextResponse.json({ error: "File missing on disk" }, { status: 404 }); }

  const buf = await readFile(filepath);
  const download = req.nextUrl.searchParams.get("download");

  const headers: Record<string, string> = {
    "Content-Type":  vendor.bizCertMimeType ?? "application/octet-stream",
    // 파일 교체 시 같은 URL 로 이전 응답을 캐싱하면 안 됨 → 매번 검증
    "Cache-Control": "private, no-cache, max-age=0, must-revalidate",
  };
  if (download === "1" && vendor.bizCertOriginalName) {
    const encoded = encodeURIComponent(vendor.bizCertOriginalName);
    headers["Content-Disposition"] = `attachment; filename*=UTF-8''${encoded}`;
  }

  return new NextResponse(new Uint8Array(buf), { status: 200, headers });
}

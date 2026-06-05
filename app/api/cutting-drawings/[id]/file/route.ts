/**
 * 절단도면 PDF 파일 동적 서빙 — Phase A
 *
 * GET /api/cutting-drawings/[id]/file              → inline (브라우저 미리보기)
 * GET /api/cutting-drawings/[id]/file?download=1   → attachment (다운로드)
 *
 * standalone 모드의 public 정적 서빙 이슈를 우회 — 디스크에서 직접 readFile 후 응답.
 * (장비 사진 /api/mgmt-equipment/[id]/photo/[slot] 패턴과 동일)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readFile, stat } from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";

function sanitizeSegment(s: string): string {
  return s.replace(/[\\/:*?"<>|]/g, "_").trim() || "unassigned";
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const pdf = await prisma.cuttingDrawingPdf.findUnique({ where: { id } });
  if (!pdf) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const blockSeg = sanitizeSegment(pdf.block ?? "unassigned");
  const filepath = path.join(process.cwd(), "public", "uploads", "drawings", pdf.projectId, blockSeg, pdf.storedName);
  try {
    await stat(filepath);
  } catch {
    return NextResponse.json({ error: "File missing on disk" }, { status: 404 });
  }

  const buf = await readFile(filepath);
  const download = req.nextUrl.searchParams.get("download");

  const headers: Record<string, string> = {
    "Content-Type":  "application/pdf",
    "Cache-Control": "private, max-age=3600",
  };
  if (download === "1") {
    // 한글 파일명 안전 인코딩
    const encoded = encodeURIComponent(pdf.filename);
    headers["Content-Disposition"] = `attachment; filename*=UTF-8''${encoded}`;
  }

  return new NextResponse(buf, { status: 200, headers });
}

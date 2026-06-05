/**
 * 절단도면 PDF 업로드 + 목록 — Phase A
 *
 * POST  /api/cutting-drawings           (multipart: projectId, block?, file)
 *   → 저장: /public/uploads/drawings/{projectId}/{block|"unassigned"}/{cuid}.pdf
 *   → pageCount 즉시 산출 (pdfjs-dist legacy build)
 *
 * GET   /api/cutting-drawings?projectId=xxx&block=yyy
 *   → 메타 목록 (file 자체는 /api/cutting-drawings/[id]/file 로 별도 서빙)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";

const MAX_BYTES = 30 * 1024 * 1024; // 30MB

function sanitizeSegment(s: string): string {
  return s.replace(/[\\/:*?"<>|]/g, "_").trim() || "unassigned";
}

// pdfjs-dist legacy build 로 페이지 수 계산 — 서버측 가벼움
async function getPdfPageCount(buffer: Buffer): Promise<number> {
  try {
    const { getServerPdfjs } = await import("@/lib/pdfjs-server");
    const pdfjs = await getServerPdfjs();
    const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buffer) });
    const doc = await loadingTask.promise;
    const n = doc.numPages;
    return n;
  } catch {
    return 1; // 실패해도 업로드는 진행
  }
}

export async function GET(req: NextRequest) {
  try {
    const sp = new URL(req.url).searchParams;
    const projectId = sp.get("projectId");
    const block     = sp.get("block");
    if (!projectId) {
      return NextResponse.json({ success: false, error: "projectId 가 필요합니다." }, { status: 400 });
    }
    const where: { projectId: string; block?: string | null } = { projectId };
    if (block !== null) where.block = block;
    const list = await prisma.cuttingDrawingPdf.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ success: true, data: list });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "조회 실패";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const projectId = formData.get("projectId");
    const blockRaw  = formData.get("block");
    const file      = formData.get("file");
    const uploadedBy = formData.get("uploadedBy");

    if (typeof projectId !== "string" || !projectId) {
      return NextResponse.json({ success: false, error: "projectId 가 필요합니다." }, { status: 400 });
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, error: "file 필드가 필요합니다." }, { status: 400 });
    }
    if (file.type !== "application/pdf") {
      return NextResponse.json({ success: false, error: "PDF 파일만 업로드 가능합니다." }, { status: 415 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ success: false, error: `파일이 너무 큽니다 (최대 ${MAX_BYTES / 1024 / 1024}MB)` }, { status: 413 });
    }

    const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
    if (!project) {
      return NextResponse.json({ success: false, error: "프로젝트를 찾을 수 없습니다." }, { status: 404 });
    }

    const block = typeof blockRaw === "string" && blockRaw.trim() ? blockRaw.trim() : null;
    const blockSeg = sanitizeSegment(block ?? "unassigned");

    const dir = path.join(process.cwd(), "public", "uploads", "drawings", projectId, blockSeg);
    await mkdir(dir, { recursive: true });

    const storedName = `${randomUUID()}.pdf`;
    const filepath = path.join(dir, storedName);
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(filepath, buffer);

    const pageCount = await getPdfPageCount(buffer);

    const created = await prisma.cuttingDrawingPdf.create({
      data: {
        projectId,
        block,
        filename:   file.name,
        storedName,
        pageCount,
        fileSize:   file.size,
        uploadedBy: typeof uploadedBy === "string" ? uploadedBy.trim() || null : null,
      },
    });

    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "업로드 실패";
    console.error("[POST /api/cutting-drawings]", err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

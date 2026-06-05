/**
 * 호선/블록(=프로젝트) 단위 추출 결과 전체 조회 (Phase B-1)
 *
 * GET /api/cutting-drawings/extractions?projectId=X
 *   → 그 프로젝트에 속한 모든 PDF 의 모든 페이지 추출 결과
 *   → 컬럼: 호선/블록/도면번호/부재중량/마킹길이/절단길이
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const sp = new URL(req.url).searchParams;
    const projectId = sp.get("projectId");
    if (!projectId) {
      return NextResponse.json({ success: false, error: "projectId 가 필요합니다." }, { status: 400 });
    }

    const list = await prisma.cuttingDrawingExtraction.findMany({
      where: { pdf: { projectId } },
      include: {
        pdf: { select: {
          id: true, filename: true, block: true,
          project: { select: { projectCode: true, projectName: true } },
        } },
      },
      orderBy: [
        { pdf: { filename: "asc" } },
        { pageNumber: "asc" },
      ],
    });

    const rows = list.map(e => ({
      id:           e.id,
      pdfId:        e.pdfId,
      pdfFilename:  e.pdf.filename,
      hosin:        e.pdf.project.projectCode,
      block:        e.pdf.project.projectName, // 호선/블록 단위 = projectName 이 블록
      pageNumber:   e.pageNumber,
      drawingNo:    e.drawingNo,
      partWeight:   e.partWeight,
      markingLen:   e.markingLen,
      cuttingLen:   e.cuttingLen,
      method:       e.method,
      confidence:   e.confidence,
      notes:        e.notes,
      createdAt:    e.createdAt,
      updatedAt:    e.updatedAt,
    }));

    return NextResponse.json({ success: true, data: rows });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "조회 실패";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/projects/blocks?projectId=xxx
// 해당 프로젝트의 DrawingList에 등록된 고유 블록 목록 반환
export async function GET(request: NextRequest) {
  try {
    const projectId = new URL(request.url).searchParams.get("projectId");
    if (!projectId) {
      return NextResponse.json({ success: false, error: "projectId 필요" }, { status: 400 });
    }

    const rows = await prisma.drawingList.findMany({
      where: { projectId, block: { not: null } },
      select: { block: true },
      distinct: ["block"],
      orderBy: { block: "asc" },
    });

    const blocks = rows.map(r => r.block as string);
    return NextResponse.json({ success: true, data: blocks });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

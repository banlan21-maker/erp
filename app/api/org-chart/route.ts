import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/org-chart — 조직도 노드 전체 조회
export async function GET() {
  try {
    const nodes = await prisma.orgChartNode.findMany();
    return NextResponse.json({ success: true, data: nodes });
  } catch (error) {
    console.error("[GET /api/org-chart]", error);
    return NextResponse.json({ success: false, error: "조회 오류" }, { status: 500 });
  }
}

// POST /api/org-chart — 조직도 레이아웃 저장 (upsert)
// body: { nodes: Array<{ workerId, x, y, parentId, visible }> }
export async function POST(request: NextRequest) {
  try {
    const { nodes } = await request.json();

    if (!Array.isArray(nodes)) {
      return NextResponse.json({ success: false, error: "잘못된 요청" }, { status: 400 });
    }

    await prisma.$transaction(
      nodes.map((n: { workerId: string; x: number; y: number; parentId: string | null; visible: boolean }) =>
        prisma.orgChartNode.upsert({
          where: { workerId: n.workerId },
          update: {
            x: n.x,
            y: n.y,
            parentId: n.parentId ?? null,
            visible: n.visible ?? true,
          },
          create: {
            workerId: n.workerId,
            x: n.x,
            y: n.y,
            parentId: n.parentId ?? null,
            visible: n.visible ?? true,
          },
        })
      )
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[POST /api/org-chart]", error);
    return NextResponse.json({ success: false, error: "저장 오류" }, { status: 500 });
  }
}

// DELETE /api/org-chart?workerId=xxx — 노드 제거 (조직도에서 제외)
export async function DELETE(request: NextRequest) {
  try {
    const workerId = request.nextUrl.searchParams.get("workerId");
    if (!workerId) {
      return NextResponse.json({ success: false, error: "workerId 필수" }, { status: 400 });
    }
    await prisma.orgChartNode.deleteMany({ where: { workerId } });
    // 해당 노드를 부모로 가진 노드들의 parentId도 null로 초기화
    await prisma.orgChartNode.updateMany({ where: { parentId: workerId }, data: { parentId: null } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/org-chart]", error);
    return NextResponse.json({ success: false, error: "삭제 오류" }, { status: 500 });
  }
}

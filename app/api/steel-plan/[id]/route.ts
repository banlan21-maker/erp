export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// DrawingList 상태 동기화 헬퍼
// SteelPlan 입고완료 → DrawingList WAITING(입고)
// SteelPlan 입고되돌리기 → DrawingList REGISTERED(미입고)
async function syncDrawingListBySpec(
  vesselCode: string,
  material: string,
  thickness: number,
  width: number,
  length: number,
  targetStatus: "REGISTERED" | "WAITING"
) {
  const projects = await prisma.project.findMany({
    where: { projectCode: vesselCode },
    select: { id: true },
  });
  if (projects.length === 0) return;

  await prisma.drawingList.updateMany({
    where: {
      projectId: { in: projects.map((p) => p.id) },
      material,
      thickness,
      width,
      length,
      NOT: { status: { in: ["CAUTION", "CUT"] } },
    },
    data: { status: targetStatus },
  });
}

// PATCH /api/steel-plan/[id]
// body: { status: "RECEIVED" }  — 입고 처리
// body: { memo, vesselCode, ... } — 일반 수정
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();

  const updated = await prisma.steelPlan.update({
    where: { id },
    data: {
      ...(body.vesselCode  !== undefined ? { vesselCode:  body.vesselCode }              : {}),
      ...(body.material    !== undefined ? { material:    body.material }                : {}),
      ...(body.thickness   !== undefined ? { thickness:   Number(body.thickness) }       : {}),
      ...(body.width       !== undefined ? { width:       Number(body.width) }           : {}),
      ...(body.length      !== undefined ? { length:      Number(body.length) }          : {}),
      ...(body.status      !== undefined ? { status:      body.status }                  : {}),
      ...(body.receivedAt  !== undefined ? { receivedAt:  body.receivedAt ? new Date(body.receivedAt) : null } : {}),
      ...(body.memo        !== undefined ? { memo:        body.memo }                    : {}),
      ...(body.actualHeatNo     !== undefined ? { actualHeatNo:     body.actualHeatNo }     : {}),
      ...(body.actualVesselCode !== undefined ? { actualVesselCode: body.actualVesselCode } : {}),
      ...(body.actualDrawingNo  !== undefined ? { actualDrawingNo:  body.actualDrawingNo }  : {}),
      ...(body.storageLocation  !== undefined ? { storageLocation:  body.storageLocation }  : {}),
    },
  });

  // 입고 상태 변경 시 DrawingList 자동 동기화
  if (body.status === "RECEIVED") {
    await syncDrawingListBySpec(
      updated.vesselCode, updated.material,
      updated.thickness, updated.width, updated.length,
      "WAITING"
    );
  } else if (body.status === "REGISTERED") {
    await syncDrawingListBySpec(
      updated.vesselCode, updated.material,
      updated.thickness, updated.width, updated.length,
      "REGISTERED"
    );
  }

  return NextResponse.json(updated);
}

// DELETE /api/steel-plan/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.steelPlan.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

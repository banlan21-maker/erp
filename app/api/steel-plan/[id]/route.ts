export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// DrawingList 상태 동기화 헬퍼
// 확정(reservedFor)된 블록만 WAITING, 미확정 블록은 REGISTERED
async function syncDrawingListBySpec(
  vesselCode: string,
  material: string,
  thickness: number,
  width: number,
  length: number,
) {
  const projects = await prisma.project.findMany({
    where: { projectCode: vesselCode },
    select: { id: true },
  });
  if (projects.length === 0) return;

  const rows = await prisma.drawingList.findMany({
    where: {
      projectId: { in: projects.map((p) => p.id) },
      material, thickness, width, length,
      NOT: { status: { in: ["CAUTION", "CUT"] } },
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, block: true },
  });

  const byBlock = new Map<string, string[]>();
  for (const row of rows) {
    const blockCode = row.block ?? "UNKNOWN";
    if (!byBlock.has(blockCode)) byBlock.set(blockCode, []);
    byBlock.get(blockCode)!.push(row.id);
  }

  const toWaiting: string[] = [];
  const toRegistered: string[] = [];

  for (const [blockCode, ids] of byBlock) {
    const confirmedCount = await prisma.steelPlan.count({
      where: { vesselCode, material, thickness, width, length, status: "RECEIVED", reservedFor: blockCode },
    });
    toWaiting.push(...ids.slice(0, confirmedCount));
    toRegistered.push(...ids.slice(confirmedCount));
  }

  if (toWaiting.length > 0)
    await prisma.drawingList.updateMany({ where: { id: { in: toWaiting } }, data: { status: "WAITING" } });
  if (toRegistered.length > 0)
    await prisma.drawingList.updateMany({ where: { id: { in: toRegistered } }, data: { status: "REGISTERED" } });
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
      // 입고 취소(REGISTERED로 되돌리기) 시 확정 블록 초기화
      ...(body.status === "REGISTERED"  ? { reservedFor: null }                         : {}),
      ...(body.receivedAt  !== undefined ? { receivedAt:  body.receivedAt ? new Date(body.receivedAt) : null } : {}),
      ...(body.memo        !== undefined ? { memo:        body.memo }                    : {}),
      ...(body.actualHeatNo     !== undefined ? { actualHeatNo:     body.actualHeatNo }     : {}),
      ...(body.actualVesselCode !== undefined ? { actualVesselCode: body.actualVesselCode } : {}),
      ...(body.actualDrawingNo  !== undefined ? { actualDrawingNo:  body.actualDrawingNo }  : {}),
      ...(body.storageLocation  !== undefined ? { storageLocation:  body.storageLocation }  : {}),
    },
  });

  // 입고 상태 변경 시 DrawingList 자동 동기화
  if (body.status === "RECEIVED" || body.status === "REGISTERED") {
    await syncDrawingListBySpec(
      updated.vesselCode, updated.material,
      updated.thickness, updated.width, updated.length,
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

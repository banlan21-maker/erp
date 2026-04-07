export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// DrawingList 상태 동기화 헬퍼
// 해당 스펙의 RECEIVED SteelPlan 수만큼만 DrawingList를 입고(WAITING)로,
// 나머지는 미입고(REGISTERED)로 유지
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

  // 현재 해당 스펙의 입고완료 수량
  const receivedCount = await prisma.steelPlan.count({
    where: { vesselCode, material, thickness, width, length, status: "RECEIVED" },
  });

  // 경고·절단 제외한 DrawingList 행을 등록순으로 조회
  const rows = await prisma.drawingList.findMany({
    where: {
      projectId: { in: projects.map((p) => p.id) },
      material, thickness, width, length,
      NOT: { status: { in: ["CAUTION", "CUT"] } },
    },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  // 앞에서 receivedCount 개 → 입고, 나머지 → 미입고
  const toWaiting    = rows.slice(0, receivedCount).map((r) => r.id);
  const toRegistered = rows.slice(receivedCount).map((r) => r.id);

  if (toWaiting.length > 0) {
    await prisma.drawingList.updateMany({
      where: { id: { in: toWaiting } },
      data: { status: "WAITING" },
    });
  }
  if (toRegistered.length > 0) {
    await prisma.drawingList.updateMany({
      where: { id: { in: toRegistered } },
      data: { status: "REGISTERED" },
    });
  }
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

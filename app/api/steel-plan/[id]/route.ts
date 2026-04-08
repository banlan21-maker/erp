export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncDrawingListBySpec } from "@/lib/sync-drawing-spec";

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

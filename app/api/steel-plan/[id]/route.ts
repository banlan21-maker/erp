export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncDrawingListBySpec } from "@/lib/sync-drawing-spec";

// PATCH /api/steel-plan/[id]
// body: { status: "RECEIVED" }           — 입고 처리
// body: { status: "REGISTERED" }         — 입고 취소
// body: { status: "ISSUED" }             — 출고 처리 (절단장 투입)
// body: { status: "RECEIVED", issuedAt: null } — 출고 취소 (적치장 복귀)
// body: { memo, vesselCode, ... }        — 일반 수정
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();

  const updated = await prisma.steelPlan.update({
    where: { id },
    data: {
      ...(body.vesselCode !== undefined ? { vesselCode: body.vesselCode }          : {}),
      ...(body.material   !== undefined ? { material:   body.material }            : {}),
      ...(body.thickness  !== undefined ? { thickness:  Number(body.thickness) }   : {}),
      ...(body.width      !== undefined ? { width:      Number(body.width) }       : {}),
      ...(body.length     !== undefined ? { length:     Number(body.length) }      : {}),
      ...(body.status     !== undefined ? { status:     body.status }              : {}),
      // 입고 취소(REGISTERED로 되돌리기) 시 확정 블록 초기화
      ...(body.status === "REGISTERED" ? { reservedFor: null, receivedAt: null, issuedAt: null } : {}),
      // 입고 처리 시 receivedAt 자동 기록
      ...(body.status === "RECEIVED" && body.receivedAt === undefined ? { receivedAt: new Date() } : {}),
      // 출고 처리 시 issuedAt 자동 기록
      ...(body.status === "ISSUED" ? { issuedAt: new Date() } : {}),
      // 출고 취소(RECEIVED로 되돌리기) 시 issuedAt 초기화
      ...(body.status === "RECEIVED" && body.cancelIssue ? { issuedAt: null } : {}),
      ...(body.receivedAt !== undefined ? { receivedAt: body.receivedAt ? new Date(body.receivedAt) : null } : {}),
      ...(body.memo              !== undefined ? { memo:            body.memo }            : {}),
      ...(body.storageLocation   !== undefined ? { storageLocation: body.storageLocation } : {}),
    },
  });

  // 입고/입고취소 시 DrawingList 자동 동기화
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

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncDrawingListBySpecs } from "@/lib/sync-drawing-spec";

// PATCH /api/steel-plan/[id]
// body: { status: "RECEIVED" }           — 입고 처리
// body: { status: "REGISTERED" }         — 입고 취소
// body: { status: "ISSUED" }             — 출고 처리 (절단장 투입)
// body: { status: "RECEIVED", cancelIssue: true } — 출고 취소 (적치장 복귀)
// body: { memo, vesselCode, material, thickness, ... } — 일반 수정
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();

  // 출고 처리 시 블록 확정 여부 체크
  if (body.status === "ISSUED") {
    const plan = await prisma.steelPlan.findUnique({ where: { id }, select: { reservedFor: true } });
    if (!plan?.reservedFor) {
      return NextResponse.json(
        { error: "블록 미확정 철판입니다. 블록강재리스트에서 확정 후 출고하세요." },
        { status: 409 }
      );
    }
  }

  // 변경 전 spec 보존 (spec 변경 시 옛 spec 도 sync 필요)
  const before = await prisma.steelPlan.findUnique({
    where: { id },
    select: { vesselCode: true, material: true, thickness: true, width: true, length: true },
  });

  const updated = await prisma.steelPlan.update({
    where: { id },
    data: {
      ...(body.vesselCode !== undefined ? { vesselCode: body.vesselCode }          : {}),
      ...(body.material   !== undefined ? { material:   String(body.material).trim().toUpperCase() } : {}),
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

  // ── DrawingList 자동 동기화 ──────────────────────────────────────────
  // 영향받는 spec: 변경 전(spec/vesselCode 가 바뀌었으면) + 변경 후
  // status 변경(REGISTERED/RECEIVED/ISSUED 어떤 전환이든)도 매칭 영향
  // ISSUED 출고 후에도 reservedFor 매칭이 그 블록 도면을 WAITING 유지하므로 영향 X
  // 단, RECEIVED→ISSUED 전이는 ISSUED 도 RECEIVED 풀에 포함되므로 결과 동일 — 호출은 안전
  const specsToSync = [{
    vesselCode: updated.vesselCode, material: updated.material,
    thickness:  updated.thickness,  width:    updated.width, length: updated.length,
  }];
  if (before && (
    before.vesselCode !== updated.vesselCode ||
    before.material   !== updated.material   ||
    before.thickness  !== updated.thickness  ||
    before.width      !== updated.width      ||
    before.length     !== updated.length
  )) {
    specsToSync.push(before);
  }
  await syncDrawingListBySpecs(specsToSync);

  return NextResponse.json(updated);
}

// DELETE /api/steel-plan/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  // 삭제 전 spec 보존
  const plan = await prisma.steelPlan.findUnique({
    where: { id },
    select: { vesselCode: true, material: true, thickness: true, width: true, length: true },
  });
  await prisma.steelPlan.delete({ where: { id } });

  // DrawingList 자동 동기화 — 강재가 사라졌으므로 매칭 카운트 변동
  if (plan) {
    await syncDrawingListBySpecs([plan]);
  }
  return NextResponse.json({ ok: true });
}

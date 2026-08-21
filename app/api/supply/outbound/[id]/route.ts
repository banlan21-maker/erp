import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { recomputeStockHistory } from "@/lib/recalc-supply-stock";

export const dynamic = "force-dynamic";

/**
 * 출고 이력 수정·삭제. 입고 쪽(app/api/supply/inbound/[id])과 같은 규약.
 *
 * 잘못 입력한 출고를 고칠 수 없어 '재고 조정' 으로 덮던 것이 통계 오염의 뿌리였다.
 * 수량·일자가 바뀌면 그 품목 이력을 시간순으로 다시 계산하고,
 * 어느 시점에서든 재고가 음수가 되면 거절한다.
 */

async function assertNoNegative(tx: Parameters<typeof recomputeStockHistory>[0], itemId: number) {
  const [ins, outs] = await Promise.all([
    tx.supplyInbound.findMany({ where: { itemId }, select: { qty: true, receivedAt: true, createdAt: true } }),
    tx.supplyOutbound.findMany({ where: { itemId }, select: { qty: true, usedAt: true, createdAt: true } }),
  ]);
  const ev = [
    ...ins.map(r => ({ d: r.qty, t: r.receivedAt, c: r.createdAt })),
    ...outs.map(r => ({ d: -r.qty, t: r.usedAt, c: r.createdAt })),
  ].sort((a, b) => a.t.getTime() - b.t.getTime() || a.c.getTime() - b.c.getTime());
  let run = 0;
  for (const e of ev) {
    run += e.d;
    if (run < 0) {
      throw new Error(`그렇게 고치면 ${e.t.toISOString().slice(0, 10)} 시점 재고가 ${run} 이 됩니다. 실물 재고는 음수일 수 없습니다.`);
    }
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const b = await req.json();
    const rowId = Number(id);

    const row = await prisma.supplyOutbound.findUnique({ where: { id: rowId } });
    if (!row) return NextResponse.json({ success: false, error: "출고 이력을 찾을 수 없습니다." }, { status: 404 });

    const data: Record<string, unknown> = {};
    if (b.qty !== undefined) {
      const n = Number(b.qty);
      if (!Number.isInteger(n) || n <= 0) {
        return NextResponse.json({ success: false, error: "수량은 1 이상의 정수여야 합니다." }, { status: 400 });
      }
      data.qty = n;
    }
    if (b.usedBy !== undefined) {
      const v = String(b.usedBy).trim();
      if (!v) return NextResponse.json({ success: false, error: "사용자는 필수입니다." }, { status: 400 });
      data.usedBy = v;
    }
    if (b.memo !== undefined) data.memo = b.memo?.trim() || null;
    if (b.usedAt !== undefined) data.usedAt = new Date(b.usedAt);

    const result = await prisma.$transaction(async (tx) => {
      await tx.supplyOutbound.update({ where: { id: rowId }, data });
      await assertNoNegative(tx, row.itemId);
      return recomputeStockHistory(tx, row.itemId);
    }, { maxWait: 5000, timeout: 20000 });

    return NextResponse.json({ success: true, data: { stockQty: result } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "수정 오류";
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const rowId = Number(id);
    const row = await prisma.supplyOutbound.findUnique({ where: { id: rowId } });
    if (!row) return NextResponse.json({ success: false, error: "출고 이력을 찾을 수 없습니다." }, { status: 404 });

    const result = await prisma.$transaction(async (tx) => {
      await tx.supplyOutbound.delete({ where: { id: rowId } });
      await assertNoNegative(tx, row.itemId);
      return recomputeStockHistory(tx, row.itemId);
    }, { maxWait: 5000, timeout: 20000 });

    return NextResponse.json({ success: true, data: { stockQty: result } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "삭제 오류";
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}

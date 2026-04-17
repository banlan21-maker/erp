/**
 * SupplyItem 재고/이력 시간순 재계산.
 *
 * 백데이트(과거 시점) 입출고가 등록되면 해당 시점 이후의 모든
 * stockQtyAfter 스냅샷이 어긋난다. 이 헬퍼는 모든 입출고 이력을
 * 시간순으로 walkthrough하여 각 레코드의 stockQtyAfter를 재계산하고,
 * SupplyItem.stockQty를 최종 running total로 동기화한다.
 *
 * 호출 위치:
 *   - POST /api/supply/inbound  (insert 후)
 *   - POST /api/supply/outbound (insert 후)
 *   - 재고 수동조정 PATCH      (insert 후)
 *
 * 주의: 동일 타임스탬프 이벤트는 createdAt을 2차 정렬키로 사용 (삽입 순서 보존).
 */

import type { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

export async function recomputeStockHistory(tx: Tx, itemId: number): Promise<number> {
  const [inbounds, outbounds] = await Promise.all([
    tx.supplyInbound.findMany({
      where: { itemId },
      select: { id: true, qty: true, receivedAt: true, createdAt: true },
    }),
    tx.supplyOutbound.findMany({
      where: { itemId },
      select: { id: true, qty: true, usedAt: true, createdAt: true },
    }),
  ]);

  type Event =
    | { kind: "in";  id: number; qty: number; time: Date; createdAt: Date }
    | { kind: "out"; id: number; qty: number; time: Date; createdAt: Date };

  const events: Event[] = [
    ...inbounds.map((r): Event => ({
      kind: "in", id: r.id, qty: r.qty, time: r.receivedAt, createdAt: r.createdAt,
    })),
    ...outbounds.map((r): Event => ({
      kind: "out", id: r.id, qty: r.qty, time: r.usedAt, createdAt: r.createdAt,
    })),
  ];

  // 시간순 정렬 (동일 시각이면 createdAt 보조키)
  events.sort((a, b) => {
    const dt = a.time.getTime() - b.time.getTime();
    if (dt !== 0) return dt;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });

  let running = 0;
  for (const e of events) {
    running += e.kind === "in" ? e.qty : -e.qty;
    if (e.kind === "in") {
      await tx.supplyInbound.update({
        where: { id: e.id },
        data:  { stockQtyAfter: running },
      });
    } else {
      await tx.supplyOutbound.update({
        where: { id: e.id },
        data:  { stockQtyAfter: running },
      });
    }
  }

  // SupplyItem.stockQty를 재계산된 final running total로 동기화
  await tx.supplyItem.update({
    where: { id: itemId },
    data:  { stockQty: running },
  });

  return running;
}

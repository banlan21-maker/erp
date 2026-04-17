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
 * Legacy 데이터 자동 보정:
 *   품목 등록 시 초기재고가 history에 기록되지 않은 과거 품목은
 *   Σ(inbound) - Σ(outbound) < stockQty 형태로 드리프트가 존재.
 *   첫 recompute 실행 시 이 드리프트를 감지하여 "자동 생성" 보정
 *   레코드(초기재고)를 이력의 맨 앞에 삽입해 invariant를 복구.
 *   이후 수동조정·입출고가 항상 정합하게 동작.
 *
 * 주의: 동일 타임스탬프 이벤트는 createdAt을 2차 정렬키로 사용 (삽입 순서 보존).
 */

import type { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

export async function recomputeStockHistory(tx: Tx, itemId: number): Promise<number> {
  const item = await tx.supplyItem.findUnique({ where: { id: itemId } });
  if (!item) throw new Error("품목을 찾을 수 없습니다.");

  let [inbounds, outbounds] = await Promise.all([
    tx.supplyInbound.findMany({
      where: { itemId },
      select: { id: true, qty: true, receivedAt: true, createdAt: true },
    }),
    tx.supplyOutbound.findMany({
      where: { itemId },
      select: { id: true, qty: true, usedAt: true, createdAt: true },
    }),
  ]);

  // ── Legacy 드리프트 자동 보정 ──────────────────────────────────────────
  // 기존 이력의 net total과 item.stockQty가 불일치하면 초기재고 보정 레코드 삽입
  const recordSum =
    inbounds.reduce((s, r) => s + r.qty, 0) -
    outbounds.reduce((s, r) => s + r.qty, 0);
  const drift = item.stockQty - recordSum;

  if (drift !== 0) {
    // 기존 이력의 최초 시점 직전을 보정 레코드 일시로 사용
    const allTimes = [
      ...inbounds.map((r) => r.receivedAt.getTime()),
      ...outbounds.map((r) => r.usedAt.getTime()),
    ];
    const earliest = allTimes.length > 0
      ? new Date(Math.min(...allTimes) - 1000)
      : item.createdAt;

    if (drift > 0) {
      const created = await tx.supplyInbound.create({
        data: {
          itemId,
          qty:           drift,
          stockQtyAfter: 0,
          receivedBy:    "초기재고",
          memo:          "자동 보정 — 기존 품목 초기재고 누락분",
          receivedAt:    earliest,
        },
        select: { id: true, qty: true, receivedAt: true, createdAt: true },
      });
      inbounds = [...inbounds, created];
    } else {
      const created = await tx.supplyOutbound.create({
        data: {
          itemId,
          qty:           Math.abs(drift),
          stockQtyAfter: 0,
          usedBy:        "초기재고보정",
          memo:          "자동 보정 — 기존 품목 초기재고 차이분(음수)",
          usedAt:        earliest,
        },
        select: { id: true, qty: true, usedAt: true, createdAt: true },
      });
      outbounds = [...outbounds, created];
    }
  }

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

  // 최종 running은 item.stockQty와 일치해야 함 (보정 덕분에)
  // 만약 여전히 차이가 있으면 안전하게 sync
  if (running !== item.stockQty) {
    await tx.supplyItem.update({
      where: { id: itemId },
      data:  { stockQty: running },
    });
  }

  return running;
}

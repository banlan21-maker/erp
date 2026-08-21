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
 * 재고 컬럼과 이력이 어긋나면:
 *   이력을 진실로 보고 stockQty 를 맞춘다. 보정 레코드를 만들지 않는다.
 *   (2026-08-21 이전에는 차액만큼 '초기재고 / 자동 보정' 이력을 자동 생성했는데,
 *    그것이 월별 매입·사용 통계에 섞이고 재고가 틀어진 원인을 덮었다.)
 *   차이가 있으면 console.warn 으로 남긴다 — 조용히 덮지 않는다.
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

  // ── 재고 컬럼과 이력의 차이(drift) ────────────────────────────────────
  //   전에는 차이를 발견하면 그만큼 '초기재고 / 자동 보정' 입고·출고 레코드를 이력 맨 앞에
  //   자동으로 만들어 넣었다. 그 레코드가 실제 매입·사용과 구분 없이 월별 통계에 합산됐고,
  //   무엇보다 **재고가 왜 틀어졌는지가 영구히 덮여** 재발해도 알 수 없었다.
  //   (실측 2026-08-21: 그렇게 만들어진 보정 7건이 남아 있었다)
  //
  //   이제 만들지 않는다. 아래 walkthrough 가 이력 기준으로 stockQty 를 다시 맞추고,
  //   차이가 있었다는 사실은 로그로 남긴다 — 조용히 덮는 것보다 알리는 편이 낫다.
  const recordSum =
    inbounds.reduce((s, r) => s + r.qty, 0) -
    outbounds.reduce((s, r) => s + r.qty, 0);
  const drift = item.stockQty - recordSum;
  if (drift !== 0) {
    console.warn(
      `[supply] 재고 불일치 — 품목 #${itemId} ${item.name}: ` +
      `재고컬럼 ${item.stockQty} vs 이력합계 ${recordSum} (차이 ${drift}). ` +
      `이력 기준으로 재고를 맞춥니다. 원인 확인 필요.`,
    );
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

  // 이력 기준 최종 잔고로 재고 컬럼을 맞춘다 — 이력이 진실
  if (running !== item.stockQty) {
    await tx.supplyItem.update({
      where: { id: itemId },
      data:  { stockQty: running },
    });
  }

  return running;
}

/**
 * 출고장·거래명세서 번호 자동발번 유틸
 *   shipmentNo = SO-YYYYMMDD-NNNN  (당일 시퀀스)
 *   invoiceNo  = INV-YYYYMMDD-NNNN (당일 시퀀스, 차분당 1개)
 */
import type { Prisma } from "@prisma/client";

const pad = (n: number, w: number) => String(n).padStart(w, "0");
const ymd = (d: Date) => `${d.getFullYear()}${pad(d.getMonth() + 1, 2)}${pad(d.getDate(), 2)}`;

// 접미 시퀀스의 최댓값을 '숫자'로 계산 — 문자열 desc 정렬은 99 vs 100 에서 역전되므로 사용 금지.
const maxSeq = (nos: (string | null)[]): number => {
  let max = 0;
  for (const no of nos) {
    const m = (no ?? "").match(/-(\d+)$/);
    if (m) { const n = parseInt(m[1], 10); if (Number.isFinite(n) && n > max) max = n; }
  }
  return max;
};

/** 당일 SO-XXX 다음 번호 — 트랜잭션 클라이언트 받아서 사용 */
export async function nextShipmentNo(tx: Prisma.TransactionClient, baseDate: Date): Promise<string> {
  const prefix = `SO-${ymd(baseDate)}-`;
  const rows = await tx.shipment.findMany({
    where: { shipmentNo: { startsWith: prefix } },
    select: { shipmentNo: true },
  });
  return `${prefix}${pad(maxSeq(rows.map(r => r.shipmentNo)) + 1, 4)}`;
}

/** 거래명세서 양식의 송장등록번호 — `YYYYMMDD-NN` (사용자 양식 그대로) */
export async function nextInvoiceNo(tx: Prisma.TransactionClient, baseDate: Date): Promise<string> {
  const prefix = `${ymd(baseDate)}-`;
  const rows = await tx.shipmentVehicle.findMany({
    where: { invoiceNo: { startsWith: prefix } },
    select: { invoiceNo: true },
  });
  // pad 2 유지(양식 표기용)하되, 100 이상이면 자연히 3자리로 늘어남 — 숫자 max 라 정렬 역전 없음.
  return `${prefix}${pad(maxSeq(rows.map(r => r.invoiceNo)) + 1, 2)}`;
}

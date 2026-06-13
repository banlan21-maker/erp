/**
 * 출고장·거래명세서 번호 자동발번 유틸
 *   shipmentNo = SO-YYYYMMDD-NNNN  (당일 시퀀스)
 *   invoiceNo  = INV-YYYYMMDD-NNNN (당일 시퀀스, 차분당 1개)
 */
import type { Prisma } from "@prisma/client";

const pad = (n: number, w: number) => String(n).padStart(w, "0");
const ymd = (d: Date) => `${d.getFullYear()}${pad(d.getMonth() + 1, 2)}${pad(d.getDate(), 2)}`;

/** 당일 SO-XXX 다음 번호 — 트랜잭션 클라이언트 받아서 사용 */
export async function nextShipmentNo(tx: Prisma.TransactionClient, baseDate: Date): Promise<string> {
  const prefix = `SO-${ymd(baseDate)}-`;
  const last = await tx.shipment.findMany({
    where: { shipmentNo: { startsWith: prefix } },
    orderBy: { shipmentNo: "desc" },
    take: 1,
    select: { shipmentNo: true },
  });
  let seq = 1;
  if (last[0]) {
    const m = last[0].shipmentNo.match(/-(\d+)$/);
    if (m) seq = parseInt(m[1], 10) + 1;
  }
  return `${prefix}${pad(seq, 4)}`;
}

export async function nextInvoiceNo(tx: Prisma.TransactionClient, baseDate: Date): Promise<string> {
  const prefix = `INV-${ymd(baseDate)}-`;
  const last = await tx.shipmentVehicle.findMany({
    where: { invoiceNo: { startsWith: prefix } },
    orderBy: { invoiceNo: "desc" },
    take: 1,
    select: { invoiceNo: true },
  });
  let seq = 1;
  if (last[0]?.invoiceNo) {
    const m = last[0].invoiceNo.match(/-(\d+)$/);
    if (m) seq = parseInt(m[1], 10) + 1;
  }
  return `${prefix}${pad(seq, 4)}`;
}

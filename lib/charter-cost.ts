import type { PrismaClient, Prisma } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * 용차비용 자동계산 — 기본단가(납품처별) + 할증(실은 철판 최대 폭).
 *
 * 왜 이렇게 계산하나 (2026-08-20, 과거 대장 352건 역산):
 *   · 기본단가는 지역이 아니라 **납품처**마다 굳어져 있다. 같은 밀양이어도 표의 구간과
 *     안 맞고, 주소로 지역을 추정하면 틀린다 → CharterRate 에 납품처별로 둔다.
 *   · 할증은 표에 폭·길이가 나란히 적혀 있지만 실제로는 **폭으로만** 발동했다.
 *     길이 15,000 초과 2건이 모두 할증 0원이었다. 폭 기준 정확도 95%(132/139).
 *   · 남은 5%는 "폭은 기준을 넘는데 청구는 0원" — 가변기로 실었거나 청구에서 뺀 경우다.
 *     그래서 자동계산은 '초안'이고 대장에서 사람이 고칠 수 있어야 한다.
 *   · 가변기·슬라이드(150,000)와 합짐(동지역 50,000 / 타지역 30,000)은 실린 자재만으로
 *     판정할 수 없어 자동계산에 넣지 않는다. 필요하면 대장에서 더한다.
 */

export type CharterCostResult = {
  cost: number | null;        // 계산된 금액 (단가를 모르면 null)
  baseCost: number | null;
  surcharge: number;
  maxWidth: number;
  rateFound: boolean;
  note: string;               // 계산 근거 한 줄 — 대장 비고에 남긴다
};

export async function computeCharterCost(
  db: Db,
  deliveryName: string | null | undefined,
  widths: (number | null | undefined)[],
): Promise<CharterCostResult> {
  const maxWidth = widths.reduce<number>((m, w) => (w != null && w > m ? w : m), 0);

  const name = (deliveryName ?? "").trim();
  const rate = name ? await db.charterRate.findUnique({ where: { deliveryName: name } }) : null;

  // 폭 구간 — 넓은 쪽부터 보고 첫 번째로 걸리는 것을 쓴다
  const bands = await db.charterSurcharge.findMany({ orderBy: { minWidth: "desc" } });
  const band = bands.find(b => maxWidth >= b.minWidth && (b.maxWidth == null || maxWidth <= b.maxWidth));
  const surcharge = band?.amount ?? 0;

  if (!rate) {
    return {
      cost: null, baseCost: null, surcharge, maxWidth, rateFound: false,
      note: `단가 미등록(${name || "납품처 없음"})${surcharge ? ` · 폭 ${maxWidth} 할증 ${surcharge.toLocaleString()}` : ""}`,
    };
  }
  return {
    cost: rate.baseCost + surcharge,
    baseCost: rate.baseCost,
    surcharge,
    maxWidth,
    rateFound: true,
    note: surcharge
      ? `기본 ${rate.baseCost.toLocaleString()} + 폭 ${maxWidth} 할증 ${surcharge.toLocaleString()}`
      : `기본 ${rate.baseCost.toLocaleString()}`,
  };
}

/** 출발지 판정 — 공급자 스냅샷 상호에 '진교' 가 들어가면 진교 출발. */
export function departureOf(supplierSnapshot: unknown): string | null {
  if (!supplierSnapshot || typeof supplierSnapshot !== "object") return null;
  const name = (supplierSnapshot as { name?: unknown }).name;
  if (typeof name !== "string") return null;
  return name.includes("진교") ? "진교" : name;
}

/** 출고품목 요약 — 대장의 '출고품목' 칸에 넣는다. */
export function itemsSummary(items: { vesselCode: string | null; block?: string | null; weight: number | null; remnantNo?: string | null }[]): string {
  const vessels = [...new Set(items.map(i => (i.vesselCode ?? "").trim()).filter(Boolean))];
  const blocks = [...new Set(items.map(i => (i.block ?? "").trim()).filter(Boolean))];
  const weight = items.reduce((s, i) => s + (i.weight ?? 0), 0);
  const hasRemnant = items.some(i => i.remnantNo);
  const head = [vessels.join(","), blocks.join(",")].filter(Boolean).join(" ");
  return `${head}${head ? " · " : ""}${items.length}건 ${Math.round(weight).toLocaleString()}kg${hasRemnant ? " (잔재포함)" : ""}`;
}

/** 호선 목록 — 목록 화면 표시용. 1개 이상이면 쉼표로. */
export function vesselsOf(items: { vesselCode: string | null }[]): string {
  return [...new Set(items.map(i => (i.vesselCode ?? "").trim()).filter(Boolean))].join(", ");
}

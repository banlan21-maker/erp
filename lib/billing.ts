/**
 * 기성관리 공용 상수/헬퍼 (순수 모듈, 클라이언트·서버 공용).
 */

// 공급자(우리 회사) 고정 정보 — LB_기성청구서.xlsx 기준. 차후 설정화 가능.
export const BILLING_SUPPLIER = {
  bizNo:   "608-81-35087",
  name:    "한국테크 주식회사",
  ceo:     "우영진",
  address: "경남 하동군 진교면 신안길 2-10",
  bizType: "제조업",
  bizItem: "선박부품",
} as const;

export const VAT_RATE = 0.1;

export const CATEGORY_LABEL: Record<string, string> = {
  MAIN:      "메인 기성",
  ADDON:     "추가절단",
  TRANSPORT: "운송비",
  ETC:       "기타",
};

export const UNIT_LABEL: Record<string, string> = { TON: "TON", KG: "KG" };
export const RATE_MODE_LABEL: Record<string, string> = { BLOCK: "블록별 단가표", FLAT: "단일 요율" };

export const round0 = (n: number) => Math.round(n);

/** 라인 공급가액 = (중량 × 단가) 우선, 없으면 수량 × 단가. 직접 입력 amount 있으면 그대로. */
export function calcLineAmount(it: { weight?: number | null; qty?: number | null; unitPrice?: number | null; amount?: number | null }): number {
  if (it.amount != null && it.amount !== 0 && (it.unitPrice == null || it.unitPrice === 0)) return round0(it.amount);
  const price = it.unitPrice ?? 0;
  const base = (it.weight != null && it.weight !== 0) ? it.weight : (it.qty ?? 0);
  if (price && base) return round0(base * price);
  return round0(it.amount ?? 0);
}

/** 공급가액 → 부가세(10%) */
export function calcVat(amount: number): number {
  return round0(amount * VAT_RATE);
}

export const fmtWon = (n: number) => (n ?? 0).toLocaleString("ko-KR");

/** 청구월(YYYY-MM) → 그 달 마지막 날 "MM DD" (예: 2025-05 → "05 31") */
export function lastDayOfYm(ym: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(ym ?? "");
  if (!m) return "";
  const y = Number(m[1]), mo = Number(m[2]);
  const d = new Date(Date.UTC(y, mo, 0)).getUTCDate(); // 다음달 0일 = 이번달 말일
  return `${String(mo).padStart(2, "0")} ${String(d).padStart(2, "0")}`;
}

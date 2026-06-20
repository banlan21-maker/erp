/**
 * 업무관리 날짜 유틸
 * 달력일(KST 기준 사용자가 보는 날짜)을 UTC 자정으로 정규화해 저장한다.
 * 클라이언트가 "YYYY-MM-DD" 문자열을 보내면 서버는 그 달력일의 UTC 자정 Date 로 변환.
 */

export const ymdToDate = (ymd: string): Date => new Date(`${ymd}T00:00:00.000Z`);
export const dateToYmd = (d: Date): string => d.toISOString().slice(0, 10);

/** ymd 에서 days 만큼 이동한 ymd ("2026-06-20", -1 → "2026-06-19") */
export const shiftYmd = (ymd: string, days: number): string => {
  const d = new Date(`${ymd}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** "YYYY-MM" → [start, end) UTC 범위 (해당 월 전체) */
export const monthRange = (month: string): { start: Date; end: Date } => {
  const [y, m] = month.split("-").map(Number);
  return { start: new Date(Date.UTC(y, m - 1, 1)), end: new Date(Date.UTC(y, m, 1)) };
};

/** YYYY-MM-DD 형식 + 실제 달력일 검증 (2026-02-30 롤오버·Invalid Date 거부) */
export const isYmd = (s: unknown): s is string => {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00.000Z`);
  // 라운드트립 일치해야 실제 존재하는 날짜 (월말 초과는 자동 롤오버되어 불일치 → 거부)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};

/** YYYY-MM 형식 검증 (01~12) */
export const isYearMonth = (s: unknown): s is string =>
  typeof s === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);

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

/* ─── KST 달력일 ↔ 시각(timestamp) 구간 ──────────────────────────────────
 *
 * 위 ymdToDate 계열은 "날짜만" 저장하는 컬럼용(UTC 자정 정규화)이다.
 * 아래 둘은 다르다 — CuttingLog.startAt 처럼 **실제 시각**이 든 컬럼을
 * "사람이 말하는 그 날 하루"로 자를 때 쓴다.
 *
 * `new Date(ymd)` + `setHours(0,0,0,0)` 는 실행 환경 시간대에 따라 결과가 달라진다.
 * Docker 컨테이너가 UTC 면 아침 8시(KST) 작업이 전날로 잡히고,
 * TZ=Asia/Seoul 이면 또 다르게 잡힌다 — 같은 코드가 배포 시점에 따라 다르게 동작한다.
 * KST 는 서머타임이 없어 항상 +09:00 이므로 오프셋을 문자열에 박아 고정한다.
 */

/** KST 달력일 "YYYY-MM-DD" → 그 하루의 시각 구간 [start, end] (양끝 포함) */
export const kstDayRange = (ymd: string): { start: Date; end: Date } => ({
  start: new Date(`${ymd}T00:00:00.000+09:00`),
  end:   new Date(`${ymd}T23:59:59.999+09:00`),
});

/** 지금 이 순간의 KST 달력일 "YYYY-MM-DD" — 서버·브라우저 시간대와 무관 */
export const kstTodayYmd = (): string =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());

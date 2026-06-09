/**
 * 절단 작업 시간 계산 헬퍼 — 단일 진실의 원천.
 *
 * 시간 구분 (작업일보관리·보고서·통계 모두 동일):
 *  - 총가동시간(totalMs)   = (endAt - startAt) - 야간이월시간
 *  - 중단시간(pauseMs)     = 일반 중단(장비고장/도면변경/소모품교체/기타) 합
 *  - 실가동시간(activeMs)  = 총가동시간 - 중단시간
 *
 * 야간이월(WORK_EXTENSION):
 *  - 사용자 의미: "오늘 한 장 다 못 자르고 퇴근 → 다음날 출근해서 이어서 절단".
 *  - 사유 enum 의 라벨은 "퇴근/야간이월" 로 표시됨 (legacy 이름 WORK_EXTENSION 유지).
 *  - 이 시간은 총가동시간·중단시간 어디에도 포함되지 않음 — 사용자가 "퇴근한 시간은 작업과 무관" 으로 정의했기 때문.
 *  - 예: 14:00~17:00 절단(3h) → 18:00 야간이월(중단) → 익일 09:00 재개 ~ 11:00 종료(2h)
 *        총가동 = 5h, 중단 = 0h, 실가동 = 5h. (퇴근 16h는 모든 합에서 빠짐)
 */

export const NIGHT_OFF_REASONS = new Set<string>(["WORK_EXTENSION"]);

export type PauseLike = {
  reason: string;
  pausedAt: Date | string;
  resumedAt: Date | string | null;
};

/** 닫힌(resumedAt 있음) pause 1건의 ms 길이 */
function pauseSpanMs(p: PauseLike): number {
  if (!p.resumedAt) return 0;
  return new Date(p.resumedAt).getTime() - new Date(p.pausedAt).getTime();
}

/** 일반 중단 합 (야간이월 제외) */
export function calcPauseMs(pauses?: PauseLike[] | null): number {
  if (!pauses?.length) return 0;
  return pauses.reduce((s, p) => {
    if (NIGHT_OFF_REASONS.has(p.reason)) return s;
    return s + pauseSpanMs(p);
  }, 0);
}

/** 야간이월(퇴근) 시간 합 — 총가동시간 계산에서 빼낼 용도 */
export function calcNightOffMs(pauses?: PauseLike[] | null): number {
  if (!pauses?.length) return 0;
  return pauses.reduce((s, p) => {
    if (!NIGHT_OFF_REASONS.has(p.reason)) return s;
    return s + pauseSpanMs(p);
  }, 0);
}

/** 총가동시간 = (endAt - startAt) - 야간이월시간 */
export function calcTotalMs(
  startAt: Date | string,
  endAt: Date | string | null,
  pauses?: PauseLike[] | null,
): number {
  if (!endAt) return 0;
  const span = new Date(endAt).getTime() - new Date(startAt).getTime();
  return Math.max(0, span - calcNightOffMs(pauses));
}

/** 실가동시간 = 총가동시간 - 일반중단시간 */
export function calcActiveMs(
  startAt: Date | string,
  endAt: Date | string | null,
  pauses?: PauseLike[] | null,
): number {
  return Math.max(0, calcTotalMs(startAt, endAt, pauses) - calcPauseMs(pauses));
}
